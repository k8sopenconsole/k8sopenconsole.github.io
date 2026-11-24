---
title: "k3d'de deneyin"
description: "OpenConsole'un kurulu olduğu, pod'ların bilinen her şekilde hata verdiği yerel bir Kubernetes cluster'ı; yaklaşık on dakikada."
---

# k3d'de deneyin

Sonra silinecek bir [k3d](https://k3d.io) cluster'ı (Docker içinde k3s). OpenConsole burada production'daki gibi
kurulur; yanında da bilerek hata veren iş yüklerinden oluşan bir namespace bulunur: bellek yetersizliği, crash
loop'lar, hatalı bir imaj, hata veren bir init container, schedule edilemeyen bir pod. Yaklaşık on dakika sürer;
çoğu imajların indirilmesiyle geçer.

Docker, [k3d](https://k3d.io/stable/#installation) ve `kubectl` gerekir. Aşağıdaki her `kubectl` komutu cluster'ın
context'ini açıkça belirtir; böylece diğer cluster'larınıza hiç dokunulmaz.

## 1. Cluster'ı oluşturun {#1-create-the-cluster}

```bash
k3d cluster create openconsole-demo --kubeconfig-switch-context=false --wait
kubectl --context k3d-openconsole-demo get nodes
```

k3s, metrics-server ile birlikte gelir; CPU ve bellek bir dakika sonra görünür.

## 2. OpenConsole'u kurun {#2-install-openconsole}

```bash
kubectl --context k3d-openconsole-demo apply -k \
  'https://github.com/vurulkan/kubernetes-openconsole//deploy?ref=v2.25.0'
kubectl --context k3d-openconsole-demo -n kubernetes-openconsole \
  rollout status deploy/kubernetes-openconsole --timeout=5m
```

Bu komut `kubernetes-openconsole` namespace'ini (uygulama, volume'u ve Service'iyle) ve
`openconsole-reader` ServiceAccount'unu oluşturur. OpenConsole cluster'ı okumak için bu ServiceAccount'un token'ını
kullanacak. Manifest'ler en yeni sürüm olan `:latest` imajını çalıştırır.
[Kubernetes'e kurulum](/installation/kubernetes) her parçayı ve sürümün nasıl sabitleneceğini anlatır; demo
dışındaki her kurulumda sürümü sabitlemelisiniz.

## 3. Hata veren iş yüklerini ekleyin {#3-add-the-failing-workloads}

```bash
kubectl --context k3d-openconsole-demo apply -f \
  https://raw.githubusercontent.com/vurulkan/kubernetes-openconsole/v2.25.0/hack/k3d/crashlab.yaml
```

`crashlab` namespace'i: sağlıklı Deployment'lar, StatefulSet'ler ve bir DaemonSet; yanlarında OOMKilled olan, crash
loop'a giren, liveness probe'u başarısız olan, `ImagePullBackOff`'ta takılan, ConfigMap'i eksik olan, init
container'ı hata veren ya da schedule edilemeyen pod'lar. Bunu asla gerçek bir cluster'a uygulamayın.

## 4. Arayüzü açın {#4-open-the-ui}

```bash
kubectl --context k3d-openconsole-demo -n kubernetes-openconsole \
  port-forward svc/kubernetes-openconsole 8080:80
```

http://localhost:8080 adresini açın, `admin` / `admin` ile giriş yapın ve yeni bir parola seçin.

## 5. Cluster'ı bağlayın {#5-connect-the-cluster}

ServiceAccount'un token'ını ve CA sertifikasını okuyun (ikinci bir terminalde):

```bash
NS=kubernetes-openconsole
kubectl --context k3d-openconsole-demo -n $NS get secret openconsole-reader-token \
  -o jsonpath='{.data.token}' | base64 -d; echo
kubectl --context k3d-openconsole-demo -n $NS get secret openconsole-reader-token \
  -o jsonpath='{.data.ca\.crt}'; echo
```

**Yönetim → Cluster'lar → Cluster Ekle** ekranında:

| Alan | Değer |
|---|---|
| Ad | `demo` |
| Yöntem | `ServiceAccount Token` |
| API Server | `https://kubernetes.default.svc` (OpenConsole'un çalıştığı cluster) |
| Token | yukarıda yazdırılan ilk satır |
| CA Sertifikası (base64) | ikinci satır, olduğu gibi |

**Cluster'ı kaydet**, ardından **Varsayılan yap**.

## 6. Etrafa bakın {#6-look-around}

| Nerede | Neye bakmalı |
|---|---|
| **Genel bakış** (yöneticiler buraya gelir) | ilgi bekleyen pod'lar, restart'lar, allocatable'a karşı CPU / bellek, node şeridi |
| **Panel → `crashlab` → Pod'lar** | `kubectl`'ın yazdığı gibi durum sütunu, restart sayısının yanında son exit kodu (`137 OOMKilled`), Container'lar kareleri |
| crash eden bir pod | ayrıntı paneli: container'lar, açıklamalı exit kodları, olaylar; **Loglar** → *Son restart öncesi* |
| sağlıklı bir pod | **Shell** (kaydedilir: Yönetim → Kayıtlar'dan tekrar oynatılır) |
| **Deployment'lar** | restart, ölçekleme, revizyonlar, dry-run ve diff ile YAML düzenleme |
| **Node'lar** | node, üzerindeki pod'lar, kullanım |
| **Yönetim → Denetim Logları** | az önce yaptığınız her şey, her biri tek bir olay |
| **Yönetim → Roller / Gruplar / Kullanıcılar** | yalnızca `crashlab`'ı okuyabilen bir role sahip bir kullanıcı oluşturun, gizli pencerede onunla giriş yapın |

Restart geçmişi ve kullanım grafikleri sonraki dakikalarda dolar.

## 7. Silin {#7-delete-it}

```bash
k3d cluster delete openconsole-demo
```

Bu, veritabanı dahil her şeyi kaldırır.
