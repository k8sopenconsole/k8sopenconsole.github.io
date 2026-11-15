---
title: "Kubernetes'e kurulum"
description: "OpenConsole'u kustomize ile kurun: sabitlenmiş sürüm, tek replica, volume, Service, TLS'li Ingress."
---

# Kubernetes'e kurulum

OpenConsole; tek pod'lu bir Deployment, 5 GiB'lık bir volume ve bir ClusterIP Service'ten oluşur. Manifest'ler kod
deposunun [`deploy/`](https://github.com/vurulkan/kubernetes-openconsole/tree/main/deploy) klasöründedir; bunları
`kubectl`'ın içinde gelen kustomize ile uygularsınız.

## 1. Bir kustomization yazın {#1-write-a-kustomization}

Bir klasör oluşturun (Git'te tutun) ve içine şu `kustomization.yaml` dosyasını koyun:

```yaml title="kustomization.yaml"
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  # the manifests of one release
  - https://github.com/vurulkan/kubernetes-openconsole//deploy?ref=v2.23.0
images:
  # the image of the same release
  - name: ghcr.io/vurulkan/kubernetes-openconsole
    newTag: "2.23.0"
patches:
  - patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: kubernetes-openconsole
        namespace: kubernetes-openconsole
      spec:
        # Stop the old pod before the new one starts: SQLite must never be
        # opened by two pods at once (upgrades, rollout restart).
        strategy:
          type: Recreate
          rollingUpdate: null
        template:
          spec:
            containers:
              - name: dashboard
                imagePullPolicy: IfNotPresent
                env:
                  # the time zone of audit timestamps in the UI (the manifest says Europe/Istanbul)
                  - name: TIMEZONE
                    value: UTC
```

- `?ref=` kaynağı `git` ile çekilir; bu yüzden `kubectl`'ı çalıştıran makinede `git` ve GitHub erişimi olmalıdır.
- **Sürümü iki yerde de sabitleyin** (`ref=v2.23.0` ve `newTag`). `images:` override'ı olmadan manifest `:latest`
  çalıştırır; o zaman bir pod restart'ı sizi haber vermeden yeni sürüme yükseltebilir.
- **`Recreate`** önemlidir. Varsayılan rolling update'te yeni pod, eskisi veritabanını hâlâ tutarken başlar;
  2.23.0'da bu durum, iki pod'un çakıştığı andan sonra bir sonraki restart'a kadar yapılan yazmaların kaybolmasına
  yol açabilir. Bunun bedeli, sürüm yükseltmelerinde ve `rollout restart`'ta yeni pod başlarken birkaç saniyelik
  kesintidir. 2.23.1'den itibaren
  manifest'in kendisi `Recreate` kullanır; yama o zaman bir şey değiştirmez.
- Diğer değişkenleri aynı `env:` listesine ekleyin (bkz. [aşağısı](#settings-you-may-want-to-change)).

## 2. Uygulayın {#2-apply-it}

```bash
kubectl apply -k .
kubectl -n kubernetes-openconsole rollout status deploy/kubernetes-openconsole --timeout=5m
```

Oluşturulanlar, hepsi `kubernetes-openconsole` namespace'inde (`deploy/elk/` isteğe bağlıdır ve kustomize ile
uygulanmaz; bkz. [Elastic](/operations/elastic)):

| Nesne | Ne |
|---|---|
| Namespace `kubernetes-openconsole` | |
| Deployment `kubernetes-openconsole` | 1 replica, root olmayan kullanıcı (uid 65532), `seccompProfile: RuntimeDefault`, tüm capability'ler kaldırılmış, **ServiceAccount token'ı mount edilmez**: uygulama pod'un kendi kimliğini hiç kullanmaz. `/livez` ve `/readyz` üzerinde probe'lar |
| PersistentVolumeClaim `kubernetes-openconsole-data` | 5 GiB, ReadWriteOnce, cluster'ın varsayılan StorageClass'ı, `/data`'ya mount edilir: SQLite veritabanı `app.db` ve shell kayıtları |
| Service `kubernetes-openconsole` | ClusterIP, port 80 → container port 8080 |
| ServiceAccount `openconsole-reader`, Secret `openconsole-reader-token` | OpenConsole'un bu cluster'ı okurken kullandığı kimlik: token'ını arayüze siz yapıştırırsınız ([Cluster bağlama](/installation/connect-cluster)) |
| ClusterRole `openconsole-readonly` + ClusterRoleBinding | bu kimliğin neler yapabileceği (adına rağmen yazma verb'lerini de içerir; bkz. [Cluster bağlama](/installation/connect-cluster#what-each-clusterrole-rule-is-for)) |

ServiceAccount ve ClusterRole olmadan kurmak için (her cluster'ı kendi kubeconfig'inizle bağlarsınız) klasör yerine
dosyaları tek tek listeleyin:

```yaml
resources:
  - https://raw.githubusercontent.com/vurulkan/kubernetes-openconsole/v2.23.0/deploy/namespace.yaml
  - https://raw.githubusercontent.com/vurulkan/kubernetes-openconsole/v2.23.0/deploy/pvc.yaml
  - https://raw.githubusercontent.com/vurulkan/kubernetes-openconsole/v2.23.0/deploy/service.yaml
  - https://raw.githubusercontent.com/vurulkan/kubernetes-openconsole/v2.23.0/deploy/deployment.yaml
```

[Salt okuma](/installation/connect-cluster#full-or-read-only) bir konsol için dosyaları aynı şekilde listeleyin ve
`https://raw.githubusercontent.com/vurulkan/kubernetes-openconsole/v2.23.0/deploy/rbac-readonly.yaml` satırını ekleyin.
Klasörle kurulursa her `kubectl apply -k` tam `rbac.yaml`'ı geri getirir.

## Neden tam olarak bir replica {#why-exactly-one-replica}

Veritabanı, ReadWriteOnce bir volume üzerindeki bir SQLite dosyasıdır. İkinci bir pod ya hiç başlamaz (volume başka
bir node'a bağlıdır) ya da aynı dosyayı ilk pod'la birlikte açar; bu da yazmaların kaybolmasına ya da bozulmasına
yol açar. Deployment'ı ölçeklemeyin, HPA eklemeyin. Tek pod büyük bir ekibe yeter: listeler API server'dan değil,
bellekteki önbellekten gelir.

## Kaynaklar {#resources}

Manifest `300m` CPU ve `384Mi` bellek request eder; limitler `1` CPU ve `1Gi`'dir. OpenConsole bağlı
cluster'lardaki pod'ları, Deployment'ları, Service'leri, … bellekte tuttuğu için bellek kullanımı bunların sayısıyla
artar; buna 24 saatlik kullanım örnekleri için pod başına yaklaşık 10 KB eklenir. Cache, OpenConsole'un ondan hiç
okumadığı şeyleri tutmaz (`managedFields` ve `last-applied-configuration` annotation'ı; çoğu zaman bir nesnenin
yarısı), ama ConfigMap'ler verileriyle birlikte tutulur. Birkaç büyük cluster bağladıktan sonra pod'un belleğini
izleyin (`kubectl top pod`); pod OOMKilled olursa önce bellek limitini artırın.

Volume; veritabanını (küçüktür: kullanıcılar, roller, `LOG_RETENTION_DAYS` süresince audit log), `/data/backups`
içinde onun en fazla 7 kopyasını ([Yedekleme ve geri yükleme](/installation/backup-restore)) ve shell kayıtlarını
tutar. Kayıtlar varsayılan olarak 2 GiB ile sınırlıdır (Yönetim → Kayıtlar). Çoğu kurulum için 5 GiB yeterlidir;
audit log büyükse veritabanı boyutunun 8 katını hesaba katın.

## Değiştirmek isteyebileceğiniz ayarlar {#settings-you-may-want-to-change}

Geri kalan her şey arayüzden yapılandırılır ve veritabanında saklanır. Aşağıdakiler açılışta ortam değişkenlerinden
okunur:

| Değişken | Varsayılan | Anlamı |
|---|---|---|
| `TIMEZONE` | `UTC` (manifest `Europe/Istanbul` ayarlar) | arayüzdeki audit zaman damgalarının saat dilimi; saklanan zamanlar UTC'dir |
| `LOG_RETENTION_DAYS` | `30` | audit olaylarının veritabanında tutulduğu gün sayısı; `0` hiç silmez (2.23.1'den önce 30 demekti) |
| `BACKUP_ALLOW_DOWNLOAD` | `false` | `true`, adminlerin Yönetim → Yedekler'deki yedekleri indirmesine izin verir |
| `BACKUP_INTERVAL` / `BACKUP_KEEP` | `24h` / `7` | veritabanının ne sıklıkla `/data/backups`'a kopyalandığı (`0` = zamanlanmış kopya yok) ve kaç kopyanın tutulduğu ([Yedekleme ve geri yükleme](/installation/backup-restore)) |
| `ENCRYPTION_KEY_FILE` | boş (anahtar veritabanında) | saklanan kimlik bilgilerini şifreleyen anahtarın dosyası, bir Secret'tan ([Şifreleme anahtarını veritabanının dışında tutun](/installation/backup-restore)) |
| `RESTART_HISTORY_RETENTION_DAYS` | `30` | restart geçmişi için tutulan container çıkışları |
| `API_KEY_READ_RETENTION_DAYS` | `7` | bir API anahtarıyla yapılan başarılı okumalar |
| `APP_ENV` | (manifest `prod` ayarlar) | her log satırında ve trace'te yer alan ortam etiketi |
| `LOG_FORMAT` | `text` (manifest `ecs` ayarlar) | Elastic için `ecs`, `json` ya da `text` |
| `DATA_PATH` | `/data/app.db` | veritabanı dosyası; volume üzerinde olmalıdır |
| `ALLOWED_ORIGINS` | boş | sayfaları API'yi tarayıcıdan çağırabilecek başka siteler (CORS), örn. `https://tools.example.com`; konsolun kendisi için bir şey gerekmez |
| `WS_ORIGIN_CHECK` | `warn` | başka bir sitenin sayfasından açılan WebSocket: `warn` `ws.origin_mismatch` loglar, `enforce` reddeder |
| `TRUSTED_PROXIES` | boş (manifest `10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7` ayarlar) | `X-Forwarded-For`'u audit, oturumlar ve giriş kilidi için istemci adresini veren proxy'ler; Ingress controller'ınızın pod ağına daraltın |

Özellik bayrakları ve limitler dahil tam liste: [Ortam değişkenleri](/reference/environment-variables).

## TLS'li Ingress {#ingress-with-tls}

Service ClusterIP'dir; önüne kendi Ingress'inizi ya da Gateway'inizi koyun. OpenConsole'un ondan WebSocket desteği
(loglar, shell, canlı olaylar) dışında özel bir beklentisi yoktur; yaygın controller'ların hepsi WebSocket'leri
geçirir. Bir Secret'taki sertifika için örnek (ya da sertifikayı cert-manager'a oluşturtun):

```yaml title="ingress.yaml"
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: kubernetes-openconsole
  namespace: kubernetes-openconsole
spec:
  ingressClassName: nginx            # your Ingress class
  tls:
    - hosts: [openconsole.example.com]
      secretName: openconsole-tls    # kubernetes.io/tls Secret in this namespace
  rules:
    - host: openconsole.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: kubernetes-openconsole
                port:
                  name: http
```

```bash
kubectl -n kubernetes-openconsole create secret tls openconsole-tls --cert=tls.crt --key=tls.key
kubectl apply -f ingress.yaml
```

**ingress-nginx boşta kalan WebSocket'leri 60 saniye sonra kapatır**; bu da girdi bekleyen bir pod shell'ini ve
sessiz bir container'ın log akışını sonlandırır. Bu Ingress'te zaman aşımlarını artırın:

```yaml
metadata:
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
```

Diğer proxy'lerde de aynı türden bir boşta kalma zaman aşımı vardır (ör. Ingress'in önündeki bir Azure Application
Gateway ya da AWS load balancer); bunu shell'in boşta kalma zaman aşımının, `EXEC_IDLE_TIMEOUT` (5 dakika), üstüne
ayarlayın.

`/metrics`'i dışarıya açmayın: kimlik doğrulaması yoktur, cluster içindeki Prometheus'unuz içindir
([Metrikler](/operations/metrics)).

## Sonraki adımlar {#next}

1. [Cluster bağlayın](/installation/connect-cluster): bu cluster'ı (ServiceAccount zaten hazır) ve diğerlerini.
2. [İlk giriş](/getting-started/first-login): admin şifresini değiştirin, kullanıcıları ve rolleri kurun.
3. İlk [sürüm yükseltmenizden](/installation/upgrading) önce volume'u [yedekleyin](/installation/backup-restore).
