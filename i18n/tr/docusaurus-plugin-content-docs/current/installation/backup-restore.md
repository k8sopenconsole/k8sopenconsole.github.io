---
title: "Yedekleme ve geri yükleme"
description: "SQLite volume'ünün yedeğini alın, yedeği güvende tutun; aynı yere ya da yeni bir namespace'e geri yükleyin."
---

# Yedekleme ve geri yükleme

OpenConsole'un sakladığı her şey `/data`'ya mount edilen tek bir volume'dedir:

| Yol | İçerik |
|---|---|
| `/data/app.db` | SQLite veritabanı: kullanıcılar, gruplar, roller, cluster'lar ve kimlik bilgileri, ayarlar, oturumlar, API anahtarları (hash'lenmiş), kayıtlı görünümler, restart geçmişi, audit logu |
| `/data/backups/` | OpenConsole'un kendi aldığı veritabanı kopyaları ([aşağıda](#automatic-backups)) |
| `/data/recordings/` | pod shell kayıtları (`.cast` dosyaları) |

:::danger Yedeğe bir secret gibi davranın
Bir yedek; kullanıcıları, audit logunu ve şifreli olarak cluster token'larını, LDAP ve Prometheus parolalarını ve
Azure AD client secret'ını içerir. [Şifreleme anahtarını veritabanının dışında tutmadığınız](#keep-the-encryption-key-out-of-the-database)
sürece anahtar da aynı dosyadadır; kopyaya sahip olan herkes bunları okuyabilir. Kayıtlarda da birinin shell'de
ekrana bastığı her şey bulunabilir. Yedekleri şifreli saklayın; erişimi en az cluster'ların kendisi kadar sıkı tutun.
:::

## Otomatik yedekler {#automatic-backups}

OpenConsole veritabanını SQLite'ın `VACUUM INTO`'su ile, yani çalışmaya devam ederken alınan tutarlı bir kopyayla
`/data/backups`'a kopyalar ([backup.go](https://github.com/vurulkan/kubernetes-openconsole/blob/dev/backend/internal/backup/backup.go)):

- her `BACKUP_INTERVAL`'de (varsayılan `24h`; `0` zamanlamayı kapatır), en yeni kopyadan itibaren sayılarak; böylece
  bir restart bir kopyayı ne atlar ne tekrarlar;
- yeni bir sürüm veritabanını değiştirmeden önce, `app-<zaman>-pre-upgrade.db` olarak;
- bir admin **Yönetim → Yedekler**'de **Şimdi yedekle**'ye tıkladığında.

En yeni `BACKUP_KEEP` kopya (varsayılan `7`, hepsi birlikte sayılır) tutulur; dosyalar `app-<UTC zaman>[-etiket].db`
adını taşır ve yalnızca sunucunun kullanıcısı okuyabilir. Kayıtlar bunlara dahil değildir. Zamanlanmışlar dahil her
kopya bir `backup.create` audit olayıdır. **Yönetim → Yedekler** kopyaları boyutları ve zamanlarıyla listeler;
anahtar veritabanındayken uyarı gösterir.

Bu kopyalar aynı volume'dadır: kötü bir yükseltmeden ya da bir hatadan sonra işe yararlar, volume kaybolduğunda
değil. Onları başka bir yere de kopyalayın.

### Yedekleri indirme {#downloading-backups}

İndirme varsayılan olarak kapalıdır. Arayüzden değil, Deployment'ta `BACKUP_ALLOW_DOWNLOAD=true` ile açılır; böylece
bir admin hesabı tek başına (ya da çalınmış bir admin oturumu) onu açamaz: Deployment'ı değiştirebilen biri volume'ü
zaten okuyabilir. Ayarlamak pod'u yeniden başlatır:

```bash
kubectl -n kubernetes-openconsole set env deploy/kubernetes-openconsole BACKUP_ALLOW_DOWNLOAD=true   # off again: BACKUP_ALLOW_DOWNLOAD-
```

Açıkken her admin, eskiler dahil her kopyayı indirebilir. Her indirme bir `backup.download` audit olayıdır;
reddedilen de öyle (`denied`, `backup_download_disabled`). Bir API anahtarı hiçbir zaman yedek indiremez.

## Bir yedeği volume'un dışına kopyalama {#copy-a-backup-off-the-volume}

- **Tarayıcıda**: `BACKUP_ALLOW_DOWNLOAD=true` iken Yönetim → Yedekler → indirme ikonu.
- **kubectl ile, konsolu durdurmadan.** İmajda shell yoktur; bu yüzden pod'un process'lerini paylaşan kısa ömürlü bir
  debug container bağlayın ve dosyayı uygulamanın kendi dosya sistemi (`/proc/1/root`) üzerinden okuyun:

```bash
NS=kubernetes-openconsole
POD=$(kubectl -n $NS get pod -l app=kubernetes-openconsole -o jsonpath='{.items[0].metadata.name}')
kubectl -n $NS debug -q -i $POD --image=busybox:1.36 --target=dashboard -- ls -l /proc/1/root/data/backups
kubectl -n $NS debug -q -i $POD --image=busybox:1.36 --target=dashboard -- \
  cat /proc/1/root/data/backups/app-20261115-020000.db > app-20261115-020000.db
sqlite3 app-20261115-020000.db 'PRAGMA integrity_check'   # ok
```

  Her çağrı pod'a bir ephemeral container ekler; pod değişene kadar listede kalırlar. Namespace'te
  `pods/ephemeralcontainers` yetkisi gerekir. kubectl, pod'un root olmayan bir kullanıcıyla çalıştığı uyarısını
  verir; kopya yine de çalışır. `sqlite3` pod'da değil, sizin makinenizde çalışır.
- Depolamanız destekliyorsa PVC'nin bir **volume snapshot**'ı (CSI `VolumeSnapshot`).

## Bütün volume'ün yedeği {#back-up}

Kayıtlar dahil her şeyi kopyalamak için uygulamayı kısa bir süre durdurun ve volume'ü kısa ömürlü bir yardımcı
pod'dan okuyun. Konsol yaklaşık bir dakika erişilemez.

```bash
NS=kubernetes-openconsole
kubectl -n $NS scale deploy/kubernetes-openconsole --replicas=0
kubectl -n $NS wait --for=delete pod -l app=kubernetes-openconsole --timeout=120s

kubectl -n $NS run oc-backup --restart=Never --image=alpine:3.20 \
  --overrides='{"spec":{"securityContext":{"runAsNonRoot":true,"runAsUser":65532,"runAsGroup":65532,"fsGroup":65532,"seccompProfile":{"type":"RuntimeDefault"}},"containers":[{"name":"oc-backup","image":"alpine:3.20","command":["sleep","3600"],"securityContext":{"allowPrivilegeEscalation":false,"capabilities":{"drop":["ALL"]}},"volumeMounts":[{"name":"data","mountPath":"/data"}]}],"volumes":[{"name":"data","persistentVolumeClaim":{"claimName":"kubernetes-openconsole-data"}}]}}'
kubectl -n $NS wait --for=condition=Ready pod/oc-backup --timeout=120s

kubectl -n $NS exec oc-backup -- tar czf - -C /data . > openconsole-backup-$(date +%Y%m%d-%H%M).tgz

kubectl -n $NS delete pod oc-backup --wait=false
kubectl -n $NS scale deploy/kubernetes-openconsole --replicas=1
```

- Yardımcı pod, uygulamayla aynı root olmayan kullanıcıyla çalışır; bu sayede `restricted` Pod Security
  seviyesinden geçer.
- Kayıtları (gigabaytlarca olabilir) dışarıda bırakmak için
  `tar czf - -C /data --exclude=./recordings .` kullanın.
- Arşivi kontrol edin: `tar tzvf openconsole-backup-*.tgz`, `./app.db` ve `./recordings/`'ı listeler.

Storage'ınız destekliyorsa PVC'nin volume snapshot'ı (CSI `VolumeSnapshot`) bir alternatiftir; snapshot'ı da
yukarıdaki gibi Deployment 0'a ölçeklenmişken alın.

## Geri yükleme {#restore}

Geri yükleme, volume'deki her şeyi yedekteki içerikle değiştirir. Aynı kuruluma (kaybolan ya da bozulan volume) ya
da yeni bir kuruluma (başka bir namespace ya da cluster) yapılabilir.

1. **Geri yükleyeceğiniz bir kurulum hazır olsun.** Aynı namespace için mevcut kurulum. Yeni bir kurulum için önce
   OpenConsole'u kurun ([Kubernetes'e kurulum](/installation/kubernetes)); **aynı** cluster'ın başka bir
   namespace'ine kuruyorsanız `rbac.yaml`'ı dışarıda bırakın (orada gösterildiği gibi dosyaları tek tek listeleyin):
   ServiceAccount ve ClusterRole cluster genelindedir ve geri yüklenen veritabanında orijinal token zaten var.
2. **Yedeği volume'üne kopyalayın** (`NS`'i geri yüklediğiniz namespace'e ayarlayın):

```bash
NS=kubernetes-openconsole
BACKUP=openconsole-backup-20261113-2327.tgz

kubectl -n $NS scale deploy/kubernetes-openconsole --replicas=0
kubectl -n $NS wait --for=delete pod -l app=kubernetes-openconsole --timeout=120s

kubectl -n $NS run oc-backup --restart=Never --image=alpine:3.20 \
  --overrides='{"spec":{"securityContext":{"runAsNonRoot":true,"runAsUser":65532,"runAsGroup":65532,"fsGroup":65532,"seccompProfile":{"type":"RuntimeDefault"}},"containers":[{"name":"oc-backup","image":"alpine:3.20","command":["sleep","3600"],"securityContext":{"allowPrivilegeEscalation":false,"capabilities":{"drop":["ALL"]}},"volumeMounts":[{"name":"data","mountPath":"/data"}]}],"volumes":[{"name":"data","persistentVolumeClaim":{"claimName":"kubernetes-openconsole-data"}}]}}'
kubectl -n $NS wait --for=condition=Ready pod/oc-backup --timeout=120s

kubectl -n $NS exec oc-backup -- sh -c 'rm -rf /data/*'
kubectl -n $NS exec -i oc-backup -- tar xzf - -C /data < "$BACKUP"
kubectl -n $NS exec oc-backup -- ls -la /data

kubectl -n $NS delete pod oc-backup --wait=false
kubectl -n $NS scale deploy/kubernetes-openconsole --replicas=1
kubectl -n $NS rollout status deploy/kubernetes-openconsole --timeout=5m
```

3. **Yedekteki bir hesapla giriş yapın** (parolalar yedeğin alındığı andaki parolalardır). Cluster'lar, kullanıcılar,
   roller ve audit logu geri gelir.

Eski bir sürümün yedeği daha yeni bir sürüme geri yüklenebilir: yeni sürüm açılışta veritabanını yükseltir
(denendi: 2.21.0 yedeği 2.22.0'a geri yüklendi). Tersi desteklenmez ([Sürüm yükseltme](/installation/upgrading#what-happens-to-the-database)).

Geri yüklenen kurulum cluster'lara yedekten sonra [yenilenmiş](/installation/connect-cluster#rotate-the-token)
token'larla bağlanıyorsa, bu token'ları Yönetim → Cluster'lar'da değiştirin.

### Tek bir veritabanı kopyasını geri yükleme {#restore-one-database-copy}

`/data/backups`'taki bir kopya (örneğin yükseltme öncesi olan) ya da dışarı kopyaladığınız bir kopya yalnızca
veritabanının yerine geçer; kayıtlar olduğu gibi kalır:

```bash
NS=kubernetes-openconsole
COPY=app-20261115-020000.db

kubectl -n $NS scale deploy/kubernetes-openconsole --replicas=0
kubectl -n $NS wait --for=delete pod -l app=kubernetes-openconsole --timeout=120s

kubectl -n $NS run oc-backup --restart=Never --image=alpine:3.20 \
  --overrides='{"spec":{"securityContext":{"runAsNonRoot":true,"runAsUser":65532,"runAsGroup":65532,"fsGroup":65532,"seccompProfile":{"type":"RuntimeDefault"}},"containers":[{"name":"oc-backup","image":"alpine:3.20","command":["sleep","3600"],"securityContext":{"allowPrivilegeEscalation":false,"capabilities":{"drop":["ALL"]}},"volumeMounts":[{"name":"data","mountPath":"/data"}]}],"volumes":[{"name":"data","persistentVolumeClaim":{"claimName":"kubernetes-openconsole-data"}}]}}'
kubectl -n $NS wait --for=condition=Ready pod/oc-backup --timeout=120s

# a copy still on the volume (e.g. the pre-upgrade one):
kubectl -n $NS exec oc-backup -- cp /data/backups/$COPY /data/app.db
# or one from your machine:
#   kubectl -n $NS cp $COPY oc-backup:/data/app.db
kubectl -n $NS exec oc-backup -- rm -f /data/app.db-wal /data/app.db-shm

kubectl -n $NS delete pod oc-backup --wait=false
kubectl -n $NS scale deploy/kubernetes-openconsole --replicas=1
kubectl -n $NS rollout status deploy/kubernetes-openconsole --timeout=5m
```

Anahtar veritabanının dışına taşındıktan sonra alınmış bir kopya aynı `ENCRYPTION_KEY_FILE`'ı ister.

## Şifreleme anahtarını veritabanının dışında tutun {#keep-the-encryption-key-out-of-the-database}

Varsayılan olarak saklanan kimlik bilgilerini şifreleyen anahtar veritabanının içindedir. Bunun yerine onu bir
Kubernetes Secret'ında tutun; böylece veritabanının bir kopyası (bir yedek, bir snapshot) kimlik bilgilerini tek
başına açığa çıkarmaz ([keys.go](https://github.com/vurulkan/kubernetes-openconsole/blob/dev/backend/internal/store/keys.go)).

1. **Anahtarı ve Secret'ı oluşturun.** `openconsole.key`'i cluster'ın dışında da güvenli bir yerde saklayın: o
   olmadan saklanan kimlik bilgileri kaybolur.

```bash
openssl rand -base64 32 > openconsole.key
kubectl -n kubernetes-openconsole create secret generic openconsole-encryption-key --from-file=key=openconsole.key
```

2. **Mount edin ve `ENCRYPTION_KEY_FILE`'ı ayarlayın**; `kustomization.yaml`'ınıza bir yamayla
   ([Kubernetes'e kurulum](/installation/kubernetes#1-write-a-kustomization)):

```yaml title="kustomization.yaml (add to patches:)"
  - target: {kind: Deployment, name: kubernetes-openconsole}
    patch: |-
      - op: add
        path: /spec/template/spec/volumes/-
        value: {name: encryption-key, secret: {secretName: openconsole-encryption-key, defaultMode: 0440}}
      - op: add
        path: /spec/template/spec/containers/0/volumeMounts/-
        value: {name: encryption-key, mountPath: /etc/openconsole/key, readOnly: true}
      - op: add
        path: /spec/template/spec/containers/0/env/-
        value: {name: ENCRYPTION_KEY_FILE, value: /etc/openconsole/key/key}
```

3. **Uygulayın.** Bir sonraki açılış saklanan her değeri tek bir transaction içinde yeni anahtarla yeniden şifreler,
   anahtarı veritabanından siler ve dosyayı yeniden yazar; oturumları yeni anahtardan türetilen bir anahtarla
   imzalar, bu yüzden herkes bir kez daha giriş yapar:

```bash
kubectl apply -k .
kubectl -n kubernetes-openconsole logs deploy/kubernetes-openconsole | grep 'moved to the encryption key'
```

Daha önce alınan kopyalar, yükseltme öncesi olan dahil, eski anahtarı hâlâ içerir ve kimlik bilgilerini açar;
`BACKUP_KEEP` yeni kopyadan sonra yerlerini yenileri alır. Bir değer çözülemezse açılış hatayı loga yazarak durur ve
hiçbir şey değişmez ([Sorun giderme](/operations/troubleshooting)).

### Anahtarı değiştirme {#rotate-the-key}

Yeni anahtarı ve eskisini Secret'a koyun, `ENCRYPTION_KEY_PREVIOUS_FILE` ile bir kez başlatın, sonra kaldırın. Herkes
yeniden giriş yapar.

```bash
openssl rand -base64 32 > openconsole-new.key
kubectl -n kubernetes-openconsole create secret generic openconsole-encryption-key \
  --from-file=key=openconsole-new.key --from-file=previous=openconsole.key --dry-run=client -o yaml | kubectl apply -f -
kubectl -n kubernetes-openconsole set env deploy/kubernetes-openconsole ENCRYPTION_KEY_PREVIOUS_FILE=/etc/openconsole/key/previous
kubectl -n kubernetes-openconsole rollout status deploy/kubernetes-openconsole --timeout=5m
kubectl -n kubernetes-openconsole set env deploy/kubernetes-openconsole ENCRYPTION_KEY_PREVIOUS_FILE-
```

### Anahtar kaybolursa {#if-the-key-is-lost}

Onunla şifrelenmiş değerler geri getirilemez. Yukarıdaki gibi yeni bir anahtar ve Secret oluşturun ve
`ENCRYPTION_KEY_LOST=true` ile bir kez başlatın (`kubectl -n kubernetes-openconsole set env
deploy/kubernetes-openconsole ENCRYPTION_KEY_LOST=true`): çözülemeyen değerler boşaltılır, her biri loga yazılır.
Değişkeni yeniden kaldırın (`ENCRYPTION_KEY_LOST-`), sonra cluster kimlik bilgilerini (Yönetim → Cluster'lar →
Düzenle), LDAP bind parolasını ve Azure AD client secret'ını yeniden girin.
