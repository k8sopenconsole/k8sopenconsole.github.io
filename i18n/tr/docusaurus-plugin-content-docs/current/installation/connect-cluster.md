---
title: "Cluster bağlama"
description: "ServiceAccount ve ClusterRole, token ya da kubeconfig, her kuralın ne işe yaradığı, token yenileme, Prometheus."
---

# Cluster bağlama

OpenConsole her cluster'a tek bir kimlikle (genellikle bir ServiceAccount) bağlanır; kullanıcı bazındaki erişimi
kendisi uygular (Kullanıcılar → Gruplar → Roller). Bu kimliğin RBAC'ı tavandır: rolü ne derse desin, hiçbir
kullanıcı onun izin verdiğinden fazlasını yapamaz.

Cluster'lar **yalnızca arayüzden** eklenir (Yönetim → Cluster'lar). Ortam değişkenlerinden ya da pod'un kendi
ServiceAccount'undan eklenmez; OpenConsole'un çalıştığı cluster da buna dahil. İki yöntem var:

| Yöntem | Yapıştırdığınız | Ne zaman |
|---|---|---|
| **ServiceAccount Token** | API server URL'i + token + CA sertifikası | olağan durum: OpenConsole için açılmış bir ServiceAccount (aşağıdaki 1–3. adımlar) |
| **Kubeconfig** | bir kubeconfig dosyası | OpenConsole'a ayrılmış bir kimlik için statik token ya da istemci sertifikası kullanan bir kubeconfig'iniz zaten var |

Kimlik bilgileri kaydedilmeden önce API server'a karşı denenir (gerçek bir namespace listesi alınır; yanlış server,
token ya da CA reddedilir) ve veritabanında şifreli saklanır. Uygulama açılırken her cluster'a bağlanır.

## 1. ServiceAccount'u oluşturun {#1-create-the-serviceaccount}

Kimliğini zaten kendiniz yönettiğiniz bir kubeconfig kullanıyorsanız bu adımı atlayın; o durumda kimliğin RBAC'ı
OpenConsole'un yapması gereken her şeyi kapsamalı ([aşağıdaki tablo](#what-each-clusterrole-rule-is-for)).

OpenConsole'un çalıştığı cluster'da [kurulum](/installation/kubernetes) bunu zaten oluşturdu. Diğer her cluster'da:

```bash
kubectl --context <cluster> create namespace kubernetes-openconsole
kubectl --context <cluster> apply -f \
  https://raw.githubusercontent.com/vurulkan/kubernetes-openconsole/v2.23.0/deploy/rbac.yaml
```

Bu komut şunları oluşturur:

- `kubernetes-openconsole` namespace'inde `openconsole-reader` ServiceAccount'u
- `openconsole-reader-token` Secret'ı: süresi dolmayan bir token; `token` ve `ca.crt` alanlarını Kubernetes doldurur
- `openconsole-readonly` ClusterRole'ü ve onu ServiceAccount'a bağlayan bir ClusterRoleBinding

OpenConsole pod'u bu ServiceAccount ile **çalışmaz** (Deployment'ı token mount etmez). ServiceAccount yalnızca
arayüze yapıştıracağınız token'ı üretmek için vardır.

### Tam ya da salt okuma {#full-or-read-only}

| Dosya | ClusterRole | Ne çalışır | Kubernetes neyi reddeder (403) |
|---|---|---|---|
| [`rbac.yaml`](https://github.com/vurulkan/kubernetes-openconsole/blob/main/deploy/rbac.yaml) | okumalar + OpenConsole'un kullandığı yazma verb'leri | her şey | — |
| [`rbac-readonly.yaml`](https://github.com/vurulkan/kubernetes-openconsole/blob/main/deploy/rbac-readonly.yaml) | yalnızca `get` / `list` / `watch` | Panel'in tüm sekmeleri, Canlı olaylar, loglar, Genel bakış, Node'lar, CPU / memory | restart, ölçekleme, YAML uygulama, pod shell'i. **Secret'lar hiç dahil değil** |

İki dosya da aynı adları kullanır; birini uygulamak diğerinin yerine geçer, arayüzde hiçbir şey değişmez.
`rbac-readonly.yaml` kullanıyorsanız OpenConsole rollerinizden yazma aksiyonlarını da çıkarın; kullanıcılar
yalnızca hata veren butonlar görmesin. Loglar dahildir; salt okuma "log da yok" anlamına gelsin istiyorsanız
`pods/log` kuralını silin.

Secret'lar salt okuma dosyasına bilerek konmadı: Kubernetes seviyesinde Secret'larda `get`, değerlerini okumak
demektir; tek koruma OpenConsole'daki `secrets:reveal` izni olurdu. Secret'lar sekmesine yalnızca metadata için
ihtiyacınız varsa kuralın yorumunu kaldırın ve yalnızca `secrets:list` / `secrets:get` verin.

### Yazma yalnızca bazı namespace'lerde {#writes-in-some-namespaces-only}

`rbac.yaml`, OpenConsole'un `kube-system` dahil her namespace'te Secret okumasına, shell açmasına ve workload'ları
değiştirmesine izin verir. Bunu yalnızca seçtiğiniz namespace'lerle sınırlamak için okumaları cluster genelinde
bırakın (OpenConsole pod'ları, Deployment'ları, … cluster genelinde izler) ve yazma haklarını
[`deploy/optional/rbac-namespaced-writes.yaml`](https://github.com/vurulkan/kubernetes-openconsole/blob/dev/deploy/optional/rbac-namespaced-writes.yaml) ile namespace
başına bağlayın:

```bash
kubectl apply -f https://raw.githubusercontent.com/vurulkan/kubernetes-openconsole/dev/deploy/rbac-readonly.yaml
curl -sL https://raw.githubusercontent.com/vurulkan/kubernetes-openconsole/dev/deploy/optional/rbac-namespaced-writes.yaml \
  | sed 's/namespace: team-a/namespace: payments/' | kubectl apply -f -
```

İkinci komutu her namespace için, o namespace'in adıyla bir kez çalıştırın. Diğer namespace'lerde Kubernetes
reddeder: Secrets sekmesi `the OpenConsole ServiceAccount is not allowed to read secrets here (check the ClusterRole)`
cevabını verir, bir shell ya da komut başarısız olur (`exec_failed`), restart, ölçekleme ve YAML apply API server'ın
mesajıyla başarısız olur. OpenConsole rollerini buna uygun tutun ki kullanıcılar yalnızca hata veren butonlar
görmesin. `deploy/` klasörüyle kuruyorsanız dosyaları tek tek listeleyin
([Kubernetes'e kurulum](/installation/kubernetes#2-apply-it)), yoksa her `kubectl apply -k` `rbac.yaml`'ı geri koyar.

### ClusterRole kuralları ne işe yarar {#what-each-clusterrole-rule-is-for}

Hiç vermeyeceğiniz izinlerin kurallarını silin (dosyanın bir kopyasında).

| Kural (`rbac.yaml`) | Ne için gerekli | Olmazsa |
|---|---|---|
| `namespaces, pods, services, configmaps, events`: get / list / watch | Panel'in tüm sekmeleri, Canlı olaylar | OpenConsole hiçbir şeyi listeleyemez |
| `secrets`: get / list | `secrets:list`, `secrets:get`, `secrets:reveal` | Secret'lar sekmesi *"ServiceAccount is not allowed to read secrets"* der |
| `secrets`: update | `secrets:edit` | bir Secret'ın YAML'ını uygulamak 403 ile başarısız olur |
| `pods/log`: get | pod / deployment / job logları (`pods:logs`) | loglar 403 ile başarısız olur |
| `pods/exec`: create | pod shell'i ve tek komutluk exec (`pods:exec`) | shell 403 ile başarısız olur |
| `pods, services, configmaps`: update | YAML uygulama (`{resource}:edit`) | uygulama 403 ile başarısız olur |
| `deployments, daemonsets, statefulsets`: get / list / watch / update | kendi sekmeleri, YAML uygulama | sekmeler hata gösterir; uygulama 403 ile başarısız olur |
| `deployments`: patch | `deployments:restart` | restart 403 ile başarısız olur |
| `deployments/scale, statefulsets/scale`: get / update | `deployments:scale`, `statefulsets:scale` | ölçekleme 403 ile başarısız olur |
| `horizontalpodautoscalers, ingresses, cronjobs, jobs`: get / list / watch / update | kendi sekmeleri, YAML uygulama | sekmeler hata gösterir; uygulama 403 ile başarısız olur |
| `replicasets`: get / list | bir Deployment'ın ayrıntı panelindeki revizyonları | revizyon görünmez |
| `metrics.k8s.io` `pods`: get / list | pod ve iş yüklerinin CPU / memory'si (metrics-server gerekir) | CPU / memory yok; Pod'lar sekmesi nedenini söyler |
| `nodes`: get / list / watch, `metrics.k8s.io` `nodes`: get / list | Genel bakış (node sayısı, allocatable yüzdesi, node şeridi) ve Node'lar | Genel bakış CPU / memory'yi mutlak değer olarak gösterir, node şeridi olmaz; Node'lar ekranı token'ın node'ları listeleyemediğini söyler. `watch` yoksa node'lar her istekte yeniden listelenir |
| `services/proxy`: Prometheus Service'inizde get (yorum satırı halinde) | Prometheus'un "Cluster içinden" modu | Prometheus testi ilk adımda başarısız olur |

## 2. Token'ı ve CA'yı okuyun {#2-read-the-token-and-ca}

Bunu eklediğiniz cluster'a karşı çalıştırın (`CTX` onun kubectl context'i):

```bash
CTX=<cluster>
NS=kubernetes-openconsole
TOKEN=$(kubectl --context $CTX -n $NS get secret openconsole-reader-token -o jsonpath='{.data.token}' | base64 -d)
CA=$(kubectl --context $CTX -n $NS get secret openconsole-reader-token -o jsonpath='{.data.ca\.crt}')   # already base64, use as is
SERVER=$(kubectl config view --context $CTX --minify -o jsonpath='{.clusters[0].cluster.server}')
echo "$SERVER"; echo "$TOKEN"; echo "$CA"
```

`SERVER` adresine **OpenConsole pod'undan** erişilebilmeli (network policy'ler, private endpoint'ler). OpenConsole'un
çalıştığı cluster için bunun yerine `https://kubernetes.default.svc` kullanın.

## 3. Arayüzden ekleyin {#3-add-it-in-the-ui}

### ServiceAccount Token yöntemi {#serviceaccount-token-method}

**Yönetim → Cluster'lar → Cluster Ekle**:

| Alan | Değer |
|---|---|
| Ad | istediğiniz bir ad, ör. `prod-west`; cluster seçicide ve her audit olayında görünür |
| Açıklama | opsiyonel |
| Yöntem | `ServiceAccount Token` (form Kubeconfig seçili açılır) |
| API Server | `$SERVER`; OpenConsole'un çalıştığı cluster için `https://kubernetes.default.svc` |
| Token | `$TOKEN` |
| CA Sertifikası (base64) | `$CA`. Yalnızca API server'ın sertifikası public bir CA tarafından imzalanmışsa boş bırakın |

**Cluster'ı kaydet** bağlantıyı dener. İlk cluster'da **Varsayılan yap**'a tıklayın: cluster seçmemiş kullanıcılar
varsayılan cluster'da çalışır; herkes izinlerinin kapsadığı başka bir cluster'a geçebilir.

### Kubeconfig yöntemi {#kubeconfig-method}

**Yöntem: Kubeconfig → Kubeconfig yükle** altında, kimliği statik token ya da istemci sertifikası kullanan bir
kubeconfig yükleyin. Yukarıdaki ServiceAccount'tan bir tane oluşturmak için:

```bash
cat > openconsole-prod-west.kubeconfig <<EOF
apiVersion: v1
kind: Config
clusters:
- name: target
  cluster:
    server: ${SERVER}
    certificate-authority-data: ${CA}
users:
- name: openconsole-reader
  user:
    token: ${TOKEN}
contexts:
- name: openconsole
  context:
    cluster: target
    user: openconsole-reader
current-context: openconsole
EOF
```

:::warning Kişisel kubeconfig'iniz değil
Bir kubeconfig kimlik bilgilerini yalnızca **satır içi** taşıyabilir: `token`, `client-certificate-data` /
`client-key-data`, `certificate-authority-data`. Exec plugin ile giriş yapan (`kubelogin`, `aws eks get-token`,
`gke-gcloud-auth-plugin`), `auth-provider` kullanan ya da bir dosya okuyan (`tokenFile`, `client-certificate`,
`client-key`, `certificate-authority`) kubeconfig `kubeconfig_unsupported: …` ile reddedilir: OpenConsole pod'unun
içinde bir program çalıştırır ya da dosya okurdu. Kişisel bir kubeconfig ayrıca OpenConsole'un ayrı bir kimlikle değil,
sizin adınıza işlem yapmasına yol açar.
:::

## Token'ı yenileme {#rotate-the-token}

`openconsole-reader-token` token'ının süresi hiç dolmaz. Değiştirmek için yalnızca Secret'ı değil,
**ServiceAccount'u** silin ve dosyayı yeniden uygulayın:

```bash
CTX=<cluster>
NS=kubernetes-openconsole
kubectl --context $CTX -n $NS delete serviceaccount openconsole-reader          # its token Secret goes with it
kubectl --context $CTX -n $NS wait --for=delete secret/openconsole-reader-token --timeout=60s
kubectl --context $CTX apply -f \
  https://raw.githubusercontent.com/vurulkan/kubernetes-openconsole/v2.23.0/deploy/rbac.yaml
```

Yalnızca Secret'ı silip yeniden oluşturursanız **aynı token'ı yeniden alırsınız**: Kubernetes ServiceAccount
token'ını ServiceAccount'tan ve Secret'ın adından türetir; "yeni" token aynısıdır ve eskisi çalışmaya devam eder.
Yeni bir ServiceAccount ise yeni bir kimlik alır ve eski token hemen reddedilir. (`rbac.yaml`'daki yorum 2.23.0'a
kadar yalnızca Secret'ı silme yolunu anlatıyordu; bu yanlıştı.)

Ardından yeni token'ı ve CA'yı okuyun (2. adım), **Yönetim → Cluster'lar** ekranında cluster'ın **Düzenle**
butonuna tıklayın, **Credential'ları değiştir** kutusunu işaretleyin ve yeni token'ı **ve CA'yı da yeniden**
yapıştırın: *Credential'ları değiştir* seçiliyken iki alan da boş gelir ve CA olmadan kaydetmek başarısız olur
(`x509: certificate signed by unknown authority`). Kubeconfig ile eklenmiş bir cluster için yeni dosyayı yükleyin.

Bunu yapana kadar eski token'ı kullanan her cluster kaydı (token ve kubeconfig fark etmez) erişimini kaybetmiştir.
Listeler OpenConsole'un cache'inde kalanı göstermeye devam edebilir ve Cluster'lar sayfası hata göstermez; pod
logunda `Failed to watch … Unauthorized` satırları olur.

Bunun yerine süresi kendiliğinden dolan bir token isterseniz:
`kubectl -n kubernetes-openconsole create token openconsole-reader --duration=8760h`. Süresi dolmadan arayüzde
değiştirin.

## Prometheus (opsiyonel) {#prometheus-optional}

Prometheus olmadan CPU ve memory grafikleri son 24 saati kapsar; veriler OpenConsole'un belleğinde tutulur
(restart'ta kaybolur). 7 güne kadar geçmiş için cluster'ın Prometheus'unu **Yönetim → Cluster'lar → Prometheus**
altında ayarlayın; bkz. [Prometheus](/administration/prometheus). "Cluster içinden" modu, yukarıdaki tablodaki
`services/proxy` kuralını ister.

## Sorun giderme {#troubleshooting}

- **Kaydetme başarısız oluyor**: API server'a pod'dan erişilemiyor (network policy, private endpoint, kubeconfig'te
  `127.0.0.1`) ya da CA eşleşmiyor.
- **Bir kullanıcı için sekme boş ya da 403**: önce o kullanıcının rol izinlerine, sonra yukarıdaki ClusterRole
  kuralına bakın.
- **CPU / memory yok**: cluster'da metrics-server yok (`kubectl get apiservices v1beta1.metrics.k8s.io`) ya da
  ClusterRole'de `metrics.k8s.io` `pods` eksik. Hangisi olduğunu Pod'lar sekmesi söyler.
- **Prometheus testi başarısız**: test, başarısız olan adımı söyler; bkz. [Prometheus](/administration/prometheus).
