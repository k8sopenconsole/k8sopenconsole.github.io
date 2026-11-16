---
title: "Sürüm yükseltme"
description: "Yeni bir sürüme nasıl geçilir, veritabanına ne olur ve nasıl geri dönülür."
---

# Sürüm yükseltme

## Başlamadan önce {#before-you-start}

1. **Mevcut sürümünüzle yeni sürüm arasındaki her sürümün notlarını okuyun** ([Sürüm notları](/release-notes)).
   Sürüme özel adımlar [aşağıda](#version-notes) da var. Sürümünüzü öğrenmek için sol menünün altındaki GitHub
   ikonunun üzerine gelin ya da pod'un ilk log satırına bakın (`"version":"…"`).
2. **Volume'ün yedeğini alın** ([Yedekleme ve geri yükleme](/installation/backup-restore)). Yükseltmeden önceki
   duruma birebir dönmenin tek yolu bu. 2.23.1'den itibaren OpenConsole, yeni bir sürüm veritabanını değiştirmeden
   önce onu `/data/backups/app-<zaman>-pre-upgrade.db`'ye de kopyalar, ama bu kopya aynı volume'dadır.
3. Deployment'ın `strategy: Recreate` kullandığından emin olun ([Kubernetes'e kurulum](/installation/kubernetes)).
   Varsayılan rolling update'te yeni pod, eskisi hâlâ çalışırken veritabanını açar; 2.23.0'da bu, bir sonraki
   restart'a kadar yazılanların kaybolmasına yol açabilir.

Sürüm atlayabilirsiniz: 2.21.0'dan 2.22.0'a ya da 2.16'dan 2.22'ye geçiş tek adımdır. Her sürüm kendi veritabanı
değişikliklerini beraberinde getirir ve açılışta eksik olanları uygular.

## Yükseltme {#upgrade}

`kustomization.yaml` dosyanızda sürümü iki yerde de değiştirin ve uygulayın:

```yaml title="kustomization.yaml"
resources:
  - https://github.com/vurulkan/kubernetes-openconsole//deploy?ref=v2.23.1   # was v2.23.0
images:
  - name: ghcr.io/vurulkan/kubernetes-openconsole
    newTag: "2.23.1"                                                         # was 2.23.0
```

```bash
kubectl diff -k .      # the image tag, plus whatever the release changed in deploy/
kubectl apply -k .
kubectl -n kubernetes-openconsole rollout status deploy/kubernetes-openconsole --timeout=5m
kubectl -n kubernetes-openconsole logs deploy/kubernetes-openconsole | head -3   # "version":"2.23.1"
```

Oturumlar geçerli kalır; giriş yapmış kullanıcılar sayfayı yenileyip kaldıkları yerden devam eder. `Recreate` ile
konsol, yeni pod'un açılması için gereken birkaç saniye boyunca erişilemez.

**Manifest'leri sürüm sabitlemeden kullanıyorsanız** (`deploy/`'daki gibi `imagePullPolicy: Always` ile `:latest`),
`kubectl -n kubernetes-openconsole rollout restart deploy/kubernetes-openconsole` en yeni sürümü çeker. Manifest'lerin
kendisi (ClusterRole kuralları, yeni değişkenler) ancak yeni `deploy/`'u tekrar uyguladığınızda güncellenir.

**ClusterRole'e** bir sürümde yeni kurallar eklenebilir (ör. 2.20'de `nodes` için `watch`). OpenConsole'un çalıştığı
cluster'da `deploy/` ile birlikte gelir; bağlı diğer her cluster'da yeni `rbac.yaml`'ı kendiniz uygulayın
([Cluster bağlama](/installation/connect-cluster#1-create-the-serviceaccount)).

## Veritabanına ne olur {#what-happens-to-the-database}

- Migration'lar yeni sürümün ilk açılışında otomatik çalışır: tablo ve sütun eklerler; bazı sürümler mevcut
  satırları bir kez yeniden yazar (2.17, eski audit satırlarına yeni aksiyon / sonuç alanlarını ekledi). Elle
  çalıştırılacak bir adım yok.
- 2.23.1'den itibaren migration tek bir transaction içinde çalışır: başarısız olursa (dolu disk, bozuk dosya) pod
  hatayı loguna yazarak durur ve veritabanı olduğu gibi kalır.
- Geri migration yok. Eski bir sürüme dönmek desteklenmez. Pratikte değişiklikler yalnızca ekleme yaptığı için eski
  sürüm yeni veritabanıyla genellikle açılır (denendi: 2.22.0 veritabanında 2.21.0), ama yeni sürümün yazdığı
  veriler yok sayılabilir ya da yanlış okunabilir.

## Geri dönme {#going-back}

1. `kustomization.yaml`'da önceki sürümü yazın ve `kubectl apply -k .` çalıştırın.
2. Eski sürüm yeni veritabanıyla düzgün çalışmazsa yükseltmeden önce aldığınız
   [yedeği geri yükleyin](/installation/backup-restore#restore). Yedekten sonraki her şey (audit olayları,
   kullanıcılar, ayarlar) kaybolur.

## Sürüme özel notlar {#version-notes}

### 2.23.1'e yükseltme {#upgrading-to-2231}

- **Kendi manifest'iniz**: imaj artık distroless ve `deploy/deployment.yaml`, `/tmp`'de bir `emptyDir` ile
  `readOnlyRootFilesystem: true` ayarlar. Bu ayarları kopyalıyorsanız `/tmp` volume'unu da ekleyin: sunucunun `/data`
  dışında geçici dosya yazabileceği tek yer orasıdır.
- **İmajda shell yok**: OpenConsole pod'una `kubectl exec` artık çalışmaz;
  `kubectl debug -it <pod> --image=busybox:1.36 --target=dashboard` kullanın.
- **Siteler arası istekler**: API artık hiçbir origin'e CORS cevabı vermez; sayfaları API'yi çağıran başka siteler
  varsa onları `ALLOWED_ORIGINS`'e yazın. Başka bir siteden gelen WebSocket'ler `ws.origin_mismatch` olarak loglanır
  (varsayılan `WS_ORIGIN_CHECK=warn` ile hâlâ kabul edilir).
- **YAML editörü** imajla gelir; tarayıcı onu artık `cdn.jsdelivr.net`'ten yüklemez.
- **Kendi manifest'iniz**: `deploy/` gibi `strategy: Recreate` ve `terminationGracePeriodSeconds: 30` kullanın.
  Kapanışta açık shell'ler 1012 koduyla (*server restarting*) kapanır; bitişleri ve kayıtları audit'e yazılır.
- **Veritabanı**: ilk açılış onu `/data/backups/app-<zaman>-pre-upgrade.db`'ye kopyalar. Grup üyelikleri ve rol
  izinleri foreign key alır: daha önce silinmiş kullanıcı, grup ve rollerden kalan satırlar atılır; olmayan bir id
  saklanmak yerine reddedilir (`400` / `404`).
- **Yedekler**: her gün veritabanının bir kopyası; en yeni 7 tanesi `/data/backups`'ta tutulur (Yönetim → Yedekler).
  Volume'daki boş alana bakın: veritabanı boyutunun yaklaşık 7 katı.
- **`LOG_RETENTION_DAYS=0`** artık audit olaylarını hiç silmez (eskiden 30 demekti); temizlik açılışta da çalışır.
- **Denetim Logları**: bir sayfada en fazla 500 satır olur; **CSV olarak dışa aktar** artık filtreye uyan bütün
  satırları, en fazla 50 000, içerir (eskiden 1 000'de duruyordu).
- **API hata cevapları**: her hata artık problem details'tır (`application/problem+json`): `{"type", "title",
  "status", "error", "detail"}`. `error` her zaman bir neden kodudur; eskiden `error`'un tamamı olan bir mesaj (örneğin
  `cluster "nope" is unknown or not yours to use`) artık `invalid_input` gibi bir kodun altında, `detail`'dedir.
  `401` ve `429`'un da gövdesi var (`unauthorized`, `api_key_expired`, `api_key_revoked`, `Retry-After: 1` ile
  `rate_limited`); parolasını değiştirmesi gereken bir hesabın API anahtarı sayfası `password_change_required` döner.
  `error`'u İngilizce bir cümleyle karşılaştıran bir script koda geçmelidir ([Hatalar](/api/quick-start#errors)).
- **Bilinmeyen API yolları**: bilinmeyen bir `/api/…` ya da `/ws/…` yolu `404` `not_found` döner (eskiden web
  arayüzünün sayfasıyla `200` dönüyordu), yanlış metot `Allow` ile `405`. `GET` / `POST` / `PUT /api/admin/cluster` ve
  `POST /api/admin/cluster/validate` kaldırıldı: `/api/admin/clusters`'ı kullanın.
- **Audit hacmi**: kullanıcılar, gruplar, roller ve giriş, oturum ve logo ayarlarındaki her yönetici değişikliği, retler
  ve hatalar dahil her cevapta audit'e yazılır; her YAML görüntüleme bir `<kind>.get` okumasıdır
  ([Denetim logu](/administration/audit-log)).
- **Loglar**: WebSocket istek satırları `status=101` der; tracing açıkken `tracing enabled` `LOG_FORMAT`'a uyar;
  başarısız bir LDAP girişi dizinin mesajıyla `ldap sign-in failed` yazar ([Loglama](/operations/logging)).
- **Kubeconfig ile eklenen cluster'lar**: bir program çalıştıran (`exec`, örn. kubelogin), `auth-provider` kullanan ya
  da bir dosya okuyan kubeconfig reddedilir (`kubeconfig_unsupported`) ve böyle bir kubeconfig ile kaydedilmiş cluster
  artık bağlanmaz. Yükseltmeden önce Yönetim → Cluster'lar'a bakın ve böyle bir kubeconfig'i token'lı ya da inline
  olanla değiştirin ([Kubeconfig yöntemi](/installation/connect-cluster#kubeconfig-method)).
- **Kendi manifest'iniz**: `TRUSTED_PROXIES`'i konsolun önündeki proxy'lerin ağına ayarlayın (`deploy/deployment.yaml`
  özel ağları yazar). Ayarlanmazsa hiçbir `X-Forwarded-For`'a güvenilmez: audit log, Yönetim → Oturumlar ve giriş
  kilidi kullanıcının değil ingress pod'unun adresini görür ([Kubernetes'e kurulum](/installation/kubernetes)).
- **LDAP**: parolası tutmayan bir local hesap (yerleşik `admin` dahil) artık dizinde denenmez. *Kullanıcı base
  DN'leri* her satıra bir DN alır: birden çok DN'i virgülle ayıran bir değer tek DN olarak okunur, her birini ayrı
  satıra yazın. StartTLS dizinin sertifikasını doğrular; CA'nızı **CA sertifikası (PEM)** alanına yapıştırın
  ([LDAP](/administration/ldap)).
- **Oturum süresi**: Yönetim → Oturum'daki dakika artık hareketsiz geçen süredir ve oturum girişten en geç 12 saat
  sonra biter; sabit bir ömür olarak düşünülmüş uzun bir değeri gözden geçirin ([Oturumlar](/administration/sessions)).
- **`openconsole_cluster_connected`**, kimlik bilgileri reddedilen ya da ulaşılamayan bir cluster için artık `0`'dır;
  buna bağlı bir alarm yükseltmeden sonra tetiklenebilir: o cluster'ın kimlik bilgilerini düzeltin
  ([Metrikler](/operations/metrics)).
- **API üzerinden loglar**: Kubernetes OpenConsole'un kendi hesabını reddettiğinde `GET …/pods/{name}/logs` `403`
  `cluster_forbidden` döner (eskiden `502` `forbidden`). İsteğin kendisi hatalı olduğu için reddedilen bir cluster
  değişikliği `failed`, nedeni `invalid` olarak audit'e yazılır.
- **Ad**: ürünün adı artık **OpenConsole for Kubernetes**. İmaj, repo, namespace ve manifest'ler adlarını korur.
- **İsteğe bağlı**: şifreleme anahtarını bir Secret'ta tutun
  ([Şifreleme anahtarını veritabanının dışında tutun](/installation/backup-restore#keep-the-encryption-key-out-of-the-database)).

### 2.22'ye yükseltme {#upgrading-to-222}

- **Elastic**: [`deploy/elk/install.sh`](https://github.com/vurulkan/kubernetes-openconsole/blob/main/deploy/elk/README.md)'yi bir kez yeniden çalıştırın: `openconsole.api_key.id` / `.name`, `openconsole.admin_scope`, `openconsole.expires_at`, `openconsole.api_access`, `openconsole.by_admin`, `openconsole.comment`, `openconsole.mode`, `openconsole.program` ve `openconsole.recording_id` için mapping ekler (pipeline değişmedi). Çalıştırmazsanız hiçbir şey kaybolmaz: alanlar dinamik olarak map'lenir ve doğru tipi, script'i çalıştırdıktan sonraki ilk rollover'da alır.
- **Veritabanı**: yeni tablolar ve sütunlar ilk açılışta eklenir; yapmanız gereken bir şey yok.
- **Elasticsearch 8.7** (`reroute` yok, dolayısıyla `install.sh` de yok): aynı adımları elle yapmak, bir ILM policy ve yeni alanları canlı index'e eklemek için `deploy/elk/README.md` → *Elasticsearch 8.7 and older* bölümüne bakın.
- **Loglar**: anahtarla yapılan isteklerde (reddedilenler dahil) `http.request` satırları artık `openconsole.api_key.id` / `.name` taşır; `openconsole.api_key.id : *` ile uygulama logunda da, audit logunda olduğu gibi, API ve web isteklerini ayırabilirsiniz.
- **403 yanıtları** artık bir cümle ya da boş gövde yerine nedeni söyler (`{"error": "forbidden"}`, `api_key_not_allowed`, `admin_only`, `feature_disabled`, `api_access_policy`, `api_access_off`); audit CSV'sine son sütun olarak `api_key_name` eklenir.
- **API anahtarı politikası**: mevcut her rol **Güvenli salt okuma** API erişimiyle başlar. Bu yüzden yükseltmeden önce oluşturulmuş anahtarlar, bir admin rolü açana kadar (Yönetim → Roller → *API erişimi*) exec, düzenleme, ölçekleme, restart, ConfigMap ve Secret yetkilerini kaybeder. Anahtarların kendisi değişmez: politika izin verdiğinde eskisi gibi çalışırlar.

### 2.16'dan yükseltme {#upgrading-from-216}

2.17'den önce sonuç aksiyonun bir parçasıydı (`deployment.restart.success`), okumalar çıplak bir verb'dü (`resource_type: deployments` ile `list`) ve ayrıntılar kaynak adının içinde dururdu (`boh (restartedAt=…)`).

- **Veritabanı**: 2.17'nin ilk açılışında mevcut audit satırları yeni `action`, `verb`, `outcome` alanlarını ve tekil bir `resource_type` alır. Kaynak adları eski `(k=v)` ekini korur; varsayılan 30 günlük saklama süresiyle bu satırlar kendiliğinden silinir.
- **API**: `?action=deployment.restart.success` hâlâ çalışır; sonuç ayrıştırılır.
- **Elastic**: `deploy/elk/install.sh`'ı yeniden çalıştırın. Yeni mapping, `logs-openconsole.audit-*`'ın bir sonraki rollover'ından itibaren geçerli olur (hemen uygulamak için `POST logs-openconsole.audit-default/_rollover`). Pipeline, 2.16 satırlarını 2.17 biçimine getirir (sonuçsuz aksiyon, `openconsole.verb`, `openconsole.outcome`, `event.type`); böylece tek sorgu eski ve yeni olayları birlikte bulur. `event.action : *.success` / `*.denied` ile filtreleyen kayıtlı aramalar, görselleştirmeler ve alarmlar `event.action` + `event.outcome` (ya da `openconsole.outcome`) kullanacak şekilde değiştirilmeli.
- **Konsol**: fazladan basılan `deployment.action`, `workload.action`, `secret.action`, `yaml.apply`, `recording.action`, `pod.exec.start` / `pod.exec.end`, `*.logs.start`, `user.password_reset` ve `user.auto_provision` satırları kalktı; `level=error` ile basılan `deployment.restart.failed`, `deployment.scale.failed`, `statefulset.scale.failed` ve `<resource>.apply.failed` satırları da öyle. Bunların tüm alanları `audit` satırında. Başarısız bir aksiyon, `event.reason` ve `error.message` ile birlikte `event.outcome : "failure"` olarak görünür. `level=error` artık OpenConsole'un kendi hataları için kullanılır (ör. `http.panic`).

### Eski sürümlerden yükseltme {#upgrading-from-older-versions}

- **2.13'ten önce**: o zaman oluşturulan hesaplar Yönetim → Kullanıcılar'da **Local** kaynağıyla görünür. LDAP
  hesapları bir sonraki dizin girişinde LDAP'a geçer; kaynakları önceden düzeltmek için
  [2.22.0 README](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.22.0/README.md#users)'deki adımları izleyin.
- **2.3'ten önce**: eski sürümün verdiği oturum token'ları süreleri dolana kadar geçerli kalır; böylece yükseltme
  kimsenin oturumunu kapatmaz.
