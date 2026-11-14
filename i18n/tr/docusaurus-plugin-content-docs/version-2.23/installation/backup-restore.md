---
title: "Yedekleme ve geri yükleme"
description: "SQLite volume'ünün yedeğini alın, yedeği güvende tutun; aynı yere ya da yeni bir namespace'e geri yükleyin."
---

# Yedekleme ve geri yükleme

OpenConsole'un sakladığı her şey `/data`'ya mount edilen tek bir volume'dedir:

| Yol | İçerik |
|---|---|
| `/data/app.db` | SQLite veritabanı: kullanıcılar, gruplar, roller, cluster'lar ve kimlik bilgileri, ayarlar, oturumlar, API anahtarları (hash'lenmiş), kayıtlı görünümler, restart geçmişi, audit logu |
| `/data/recordings/` | pod shell kayıtları (`.cast` dosyaları) |

:::danger Yedeğe bir secret gibi davranın
Cluster token'ları, LDAP ve Prometheus şifreleri ve Azure AD client secret'ı veritabanında şifreli durur, ama
**şifreleme anahtarı da aynı veritabanındadır**. `app.db`'nin bir kopyasına sahip olan herkes bunları okuyabilir.
Kayıtlarda da birinin shell'de ekrana bastığı her şey bulunabilir. Yedekleri şifreli saklayın; erişimi en az
cluster'ların kendisi kadar sıkı tutun.
:::

## Yedek alma {#back-up}

İmajda `sqlite3` yok ve uygulama yazarken veritabanı kopyalanmamalı. Bu yüzden uygulamayı kısa bir süre durdurun,
volume'ü kısa ömürlü bir yardımcı pod'dan okuyun ve uygulamayı yeniden başlatın. Konsol yaklaşık bir dakika
erişilemez.

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

3. **Yedekteki bir hesapla giriş yapın** (şifreler yedeğin alındığı andaki şifrelerdir). Cluster'lar, kullanıcılar,
   roller ve audit logu geri gelir.

Eski bir sürümün yedeği daha yeni bir sürüme geri yüklenebilir: yeni sürüm açılışta veritabanını yükseltir
(denendi: 2.21.0 yedeği 2.22.0'a geri yüklendi). Tersi desteklenmez ([Sürüm yükseltme](/installation/upgrading#what-happens-to-the-database)).

Geri yüklenen kurulum cluster'lara yedekten sonra [yenilenmiş](/installation/connect-cluster#rotate-the-token)
token'larla bağlanıyorsa, bu token'ları Yönetim → Cluster'lar'da değiştirin.
