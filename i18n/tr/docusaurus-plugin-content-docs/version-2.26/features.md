---
title: "Özellikler"
description: "OpenConsole'un yaptığı her şey, tek listede."
---

# Özellikler

## Gözlemlenebilirlik ve canlı veri {#observability--live-data}
- **Yönetici genel bakışı** (`/overview`, yalnızca yöneticiler; yöneticiler girişten sonra bu sayfaya gelir) — seçili cluster'a tek bakış: çalışan pod'lar, ilgi bekleyen pod'lar (kırmızı / sarı), 24 saatteki restart'lar, hazır Deployment'lar, allocatable'ın yüzdesi olarak CPU ve bellek (her biri 24 saatlik trendiyle), allocatable'a karşı 24 saatlik cluster kullanımı (yapılandırıldıysa Prometheus'tan, yoksa bellekteki örneklerden), ilgi bekleyen pod'lar, en çok restart eden iş yükleri ve olağan exit kodları, saat başına restart'lar, en yoğun namespace'ler (limitlerine yakın pod'lar), son 15 dakikanın Warning olayları ve bir node şeridi (bir node, Node'lar sayfasında ayrıntı panelini açar; "Tüm node'lar" listeyi açar). `GET /api/admin/overview` (cluster başına 15 sn önbellekli) sayfayı Prometheus'u beklemeden çizer; 24 saatlik kullanım `GET /api/admin/overview/history`'den gelir (Prometheus yanıtı 5 dakika tutulur ve arka planda yenilenir). Sayfayı açmak `cluster.view_overview` olarak audit'e yazılır, sayfanın kendi yenilemeleri yazılmaz. Node verisi için ClusterRole'de `nodes` ve `metrics.k8s.io` `nodes` gerekir.
- **Node'lar** (`/nodes`, yalnızca yöneticiler, salt okuma; kenar çubuğunda Genel bakış'ın altında, `g n`, komut paleti; `/nodes?node=<name>` bir node'u açar, genel bakıştaki şerit ve pod ayrıntı panelindeki node adı da böyle açar) — seçili cluster'ın tüm node'ları: durum (Ready / NotReady / pressure, cordon'lu), roller, kubelet sürümü, işletim sistemi / mimari, yaş, kapasiteye karşı pod'lar ve allocatable'ın yüzdesi olarak kullanılan, request edilen ve limitlenen CPU / bellek. `GET /api/admin/nodes` (cluster başına 15 sn önbellekli), `GET /api/admin/nodes/{name}` (node, request'leri ve kullanımlarıyla pod'ları, olayları; informer önbelleğinden, pod'lar bir `spec.nodeName` index'iyle), `GET /api/admin/nodes/{name}/metrics/history?range=` (Prometheus: node'un container'ları `node` ya da `instance` label'ıyla, yoksa pod'larının toplamı; Prometheus yoksa pod'larının bellekteki örnekleri). Ayrıntı paneli için bir node'a tıklayın (ya da `j` / `k` ve Enter): özet (OS imajı, kernel, runtime, IP'ler, cordon'lu), CPU, bellek, pod'lar ve ephemeral storage için capacity / allocatable / requests / limits / kullanılan, kullanım geçmişi (1 sa / 6 sa / 24 sa, Prometheus ile 7 gün), CPU'ya ya da belleğe göre en çok tüketen pod'ları, üzerindeki tüm pod'lar (hepsi ya da yalnızca ilgi bekleyenler; bir pod Panel'de açılır), conditions, taint'ler, label'lar, annotation'lar ve olaylar. Arama; adı, bir rolü ya da bir label'ı (`key=value`) eşleştirir. `node.list` / `node.get` olarak audit'e yazılır (ECS `event.type: access`); yönetici olmayan biri 403 alır ve bir `denied` olayı yazılır; sayfanın yenilemeleri audit'e yazılmaz.
- **Informer tabanlı lister önbelleği** — liste uçları bir `client-go` SharedInformerFactory'den okur; böylece arayüz anında yanıt verir ve API server polling ile yüklenmez.
- **Canlı olaylar yan paneli** (header'daki düğme ya da `e`, Panel'de ve Genel bakış'ta) — `added` / `updated` / `deleted` olaylarını ve yerel `corev1.Event` nesnelerini (yenileri ve tekrarlayan bir olayın her tekrarı) WebSocket üzerinden akıtır. Tümü / K8s olayları / Uyarılar ile filtreleyin. Kullanıcı yalnızca o namespace'te `list` edebildiği nesneleri görür (Kubernetes Event'leri, ilgili oldukları nesneye göre); node ve diğer cluster kapsamlı olaylar yöneticiler içindir. Genel bakış'ta panel tüm cluster için, Uyarılar seçili olarak açılır.
- **Prometheus `/metrics`**, ayrı `/livez` (süreç) ve `/readyz` (veritabanı) uçları. Cluster'lar readiness'a dahil edilmez; böylece erişilemeyen tek bir cluster konsolu düşüremez. Bkz. [Metrikler](/operations/metrics).
- **`kubectl` gibi pod sağlığı ve neden restart ettiği** — `kubectl get pods`'un yazdığı STATUS (CrashLoopBackOff, OOMKilled, ImagePullBackOff, Init:Error, Unschedulable …) kırmızı / sarı / yeşil olarak; restart etmiş bir container'ın son çıkışı (`137 OOMKilled · 2m`) ve sade bir dille açıklaması; container'ın son restart'tan önceki logu. Bkz. [Pod sağlığı, kullanım ve restart geçmişi](/user-guide/pod-health).
- **Ayrıntı panelleri**: pod'lar, Deployment'lar, StatefulSet'ler ve DaemonSet'ler için — container'lar, request / limit'ler, probe'lar, conditions, olaylar; rollout, iş yükünün pod'ları, kullanım, restart geçmişi ve bir Deployment'ın revizyonları (salt okuma). İş yükü listeleri, pod'ları hata veren iş yüklerini işaretler.
- **CPU / bellek**: metrics-server'dan, limite karşı; bellekte tutulan 1 sa – 24 sa grafikler ya da cluster'ın **Prometheus**'undan 7 güne kadar (cluster içinde API server proxy'si üzerinden ya da Prometheus uyumlu herhangi bir URL).
- **Restart geçmişi** — OpenConsole'un gördüğü her container çıkışı 30 gün saklanır; artık var olmayan pod'lar için de.
- **OpenTelemetry tracing** (isteğe bağlı açılır): her API isteği için, route'unun adını taşıyan bir span; isteğin yaptığı Kubernetes API çağrıları da alt span olarak. OTLP/HTTP üzerinden herhangi bir collector'a (Jaeger, Tempo, Elastic APM, …) gönderilir. Bkz. [Tracing](/operations/tracing).

## Panel'de gösterilen iş yükleri {#workloads-shown-in-the-dashboard}
Pod'lar, Deployment'lar, **DaemonSet'ler**, **StatefulSet'ler**, **HorizontalPodAutoscaler'lar (v2)**, Service'ler, ConfigMap'ler, **Secret'lar**, Ingress'ler, CronJob'lar, Job'lar — sütun seçicili (Pod IP varsayılan kapalı, Service'in LoadBalancer IP'si) liste görünümü, kart görünümü, liste görünümü, label filtreleri, kayıtlı görünümler.

## Yazma işlemleri (rol ve namespace bazında, yalnızca verilirse) {#write-operations-opt-in-per-role-per-namespace}
- **Deployment restart** (`deployments:restart`)
- **Deployment / StatefulSet ölçekleme** (`deployments:scale`, `statefulsets:scale`)
- **YAML görüntüleme + düzenleme + sunucu tarafında dry-run + apply**: yukarıdaki tüm iş yükleri için (`{resource}:edit`), Monaco ile. Diff görünümü var; dry-run, sunucunun normalize ettiği nesneyi döndürür; `resourceVersion` ile iyimser eşzamanlılık (optimistic concurrency).
- **Pod shell** (`pods:exec`): xterm.js ile WebSocket üzerinden; script'ler ve agent'lar için de REST üzerinden tek komut (`POST …/pods/{name}/exec`).
- **Pod shell oturum kaydı** — her shell ve her tekil komut asciicast v2 dosyası olarak kaydedilir; yöneticiler bunları tarayıcı içindeki oynatıcıyla tekrar izleyebilir (Yönetim → Kayıtlar). Bkz. [Oturum kaydı](/administration/recordings).
- **Secret'lar** (`secrets:list`, `secrets:get`, `secrets:reveal`, `secrets:edit`) — varsayılan olarak adlar, türler ve key adları görünür; değerler key key açılır ve Secret'lar YAML editöründe düzenlenebilir (diff + dry-run). Her değer açma ve her YAML açılışı audit'e yazılır. Bkz. [Secret'lar](/user-guide/secrets).
- **Pod / Deployment / Job logları** (`pods:logs`): container seçici (init container'lar dahil; `kubectl.kubernetes.io/default-container` annotation'ındaki container'la, yoksa iş yüküyle aynı adı taşıyan container'la açılır; böylece listede ilk sıradaki bir sidecar varsayılan olmaz), canlı ya da son restart'tan önceki örnek; restart eden bir container'ı takip eder, kopan bağlantıdan sonra satır kaybetmeden ya da tekrarlamadan devam eder; arama, duraklatma, satır kaydırma, kopyalama, indirme; son 10.000 satırı tutar. Kullanıcı başına: aynı anda 10 yeni log akışı, sonrasında saniyede bir.

Her okuma ve yazma, kendi alanları olan bir audit olayıdır: `action` (`deployment.restart`), `verb`, `outcome` (`success` / `denied` / `failed` / `rate_limited` / `locked`), hedef cluster, namespace ve kaynak, `restarted_at` ya da `replicas_from` / `replicas_to` gibi ayrıntılar ve kim / nereden. Bkz. [Audit olayları](/reference/audit-events). HTTP yanıtı, stdout'taki audit satırıyla eşleştirmek için `X-Request-Id` taşır.

## Erişim ve kimlik {#access--identity}
- **Kullanıcı → Gruplar → Roller → cluster ve namespace bazında izinler** (uygulama düzeyinde RBAC; son kullanıcılar için Kubernetes RBAC yok).
- **Namespace keşfi izne dayalıdır** (erişemediğiniz namespace'lerin adları sızmaz).
- **Çoklu cluster, kullanıcı başına**: N tane cluster kaydedin. Her kullanıcı **kendi** cluster'ını header'dan (ya da `c` ile) seçer; yöneticiler diğer herkes için bir varsayılan ve tüm cluster listelerinin sırasını belirler. İzinler cluster bazında sınırlanabilir ve audit cluster'ı kaydeder.
- **Yerel kullanıcılar** (bcrypt) + **LDAP** (bind tabanlı, aranabilir + içe aktarılabilir) + **Azure AD** single-tenant giriş (kişileri içe aktarmak için isteğe bağlı, Microsoft Graph üzerinden Entra ID dizin araması) — hepsi arayüzden yapılandırılır.
- **JWT kimlik doğrulama**; ilk girişte parola değişikliği zorunludur.
- Yerel ve LDAP hesapları için **iki adımlı doğrulama** (doğrulama uygulamasından TOTP, kurtarma kodları): kapalı / isteğe bağlı / yöneticilere zorunlu / herkese zorunlu; Azure AD girişi için **MFA zorunluluğu**.
- **Oturum yönetimi** (Yönetim → Oturumlar): tüm aktif token'ları listeleyin, oturumları tek tek ya da bir kullanıcının tüm oturumlarını birden iptal edin; parola değişikliği hepsini iptal eder.
- **Oturum kayıtları** (Yönetim → Kayıtlar): filtreleme, tekrar oynatma (1x / 2x / 4x, ileri-geri sarma, boşta geçen süreyi atlama), `.cast` indirme, silme; saklama süresi, kota ve açma / kapama anahtarı arayüzden düzenlenir.
- **Girişte brute-force koruması** (IP+kullanıcı başına 5 hatalı deneme → 5 dakika kilit, audit'e yazılır). Her giriş `user.login` olarak audit'e yazılır: sonucuyla (`success` / `failed` / `locked`), yöntemiyle (`login_method`: `local` / `ldap` / `azure`) ve başarısız girişte nedeniyle.

## API ve AI agent'ları {#api--ai-agents}
- **API anahtarları** (hesap menüsü → API anahtarları): Claude Code, Cursor ya da kendi script'leriniz için. `oc_…` anahtarları seçilen cluster'larla, namespace'lerle ve bir izin matrisiyle sınırlıdır; çağrı anında sahibinin sahip olduğundan fazlasını asla alamaz. Süre, yeniden üretme, iptal. Anahtar bir kez gösterilir ve SHA-256 hash'i olarak saklanır. Her aksiyon ve kaynak okuması kullanıcıyla **ve anahtarın adıyla** audit'e yazılır; bir anahtarla çalıştırılan shell'ler ve komutlar her zaman kaydedilir.
- **Yönetici politikası** — rol başına, bir anahtarın o rolden ne kadarını alabileceği (Kapalı / Güvenli salt okuma / Rolün tüm yetkileri), kullanıcı bazında geçersiz kılma, bir süre politikası (en uzun ömür, süresiz anahtara izin verilip verilmediği) ve Yönetim → API anahtarları: tüm kullanıcıların anahtarları, gerekçeyle iptal, CSV.
- **OpenAPI 3.1**: `/api/openapi.json` adresinde (giriş gerekmez) ve uygulama içinde bir **Dokümantasyon** sekmesi: hızlı başlangıç, agent'ınıza verebileceğiniz bir metin, her uç izniyle ve bir `curl` örneğiyle; anahtarlarınızın erişemediği yerler gri görünür.
- **WebSocket gerekmez** — bir pod'un logu düz metin olarak (`GET …/pods/{name}/logs`) ve tek bir komut, çıktısı ve exit koduyla (`POST …/pods/{name}/exec`; audit log program adını tutar, komut satırını asla).

Bkz. [API ve agent'lar](/api/overview).

## Kullanıcı deneyimi {#ux}
- **Açık / Koyu / Sistem teması** (kalıcı; işletim sistemine uyar).
- **Çoklu dil — İngilizce ve Türkçe** (dil seçici, tema düğmesinin yanında; varsayılan tarayıcı dilidir, kullanıcının seçimi saklanır). TR; navigasyonu, Panel'i, Yönetim'i, audit'i ve klavye kısayolları listesini kapsar.
- **`⌘K` kaynak araması** — komut paleti, seçili cluster'daki Pod, Deployment, StatefulSet, DaemonSet, Service, Ingress, ConfigMap, Job, CronJob ve HPA'ları (admin'ler için node'ları da) adla ya da IP ile (pod, Service, node) bulur; kubectl kısa adlarıyla (`svc web`) ve `ns:<ad>` ile daraltılır; `Enter` paneli ya da sekmeyi açar; son açılan kaynaklar en üstte. Yalnızca listeleyebildikleriniz, Secret'lar asla; informer önbelleğinden okunur ve audit'e yazılmaz (`GET /api/search`).
- **Klavye öncelikli gezinme**: `⌘K` / `Ctrl+K` komut paleti, `?` kısayol listesi, navigasyon / tema için akor kısayolları, `c` cluster seçici, `v` kayıtlı görünümler, `e` canlı olaylar paneli, `n` namespace filtresine odak. TR klavyedeki tuşlar (`ğ` / `ü` / `.`) fiziksel konuma göre US `[` / `]` / `/` tuşlarına eşlenir; böylece kısayollar TR Q düzeninde bozulmaz.
- **Kayıtlı görünümler** — (cluster, namespace, sekme, arama, görünüm modu) bilgisini bir adla sunucuda saklayın; hangi tarayıcıya geçerseniz geçin sizinle gelir. Bir görünümü tüm kullanıcılarla **paylaşın**.
- **Tabloda klavyeyle gezinme** — `j` / `k` yönetim tablolarında satırlar arasında gezer, `Enter` açar, `d` siler (onay ister), `n` / `p` sayfa değiştirir.
- **Her sütunda arama, artı label filtreleri** — düz terimler adı ve herhangi bir sütunun metnini eşleştirir; `label:app=foo`, `label:tier`; hepsi VE ile birleşir.
- **Denetim logları**: sayfalama, filtreler, CSV dışa aktarma; erişim gözden geçirmeleri için **kullanıcı ve grup CSV dışa aktarma**.
- **Erişilebilir**: açık ve koyu temada WCAG 2.1 AA kontrastı, etiketli kontroller, odaklanabilir kaydırma alanları — test paketinde ve gerçek bir tarayıcıda axe ile kontrol edilir.
- **Yönetim'de Rol İzinleri yeniden tasarımı** — rol kenar çubuğu, gruplanmış izin kartları (aynı izinleri paylaşan namespace'ler birleşir), şablonlu toplu İzin ekle penceresi (Görüntüleyici / Geliştirici / SRE / Yönetici), rolden kopyalama, satır içi düzenleme.


## Mimari {#architecture}

- **Backend**: Go + `client-go` + chi router + slog + sqlite (modernc.org/sqlite).
- **Frontend**: React 18 + TypeScript + Vite + Tailwind + Monaco (geç yüklenir, CDN'den) + react-i18next + xterm.js + asciinema-player (geç yüklenir, pakete dahil — CDN yok).
- **Dağıtım**: tek container'lı Docker imajı; Kubernetes manifest'leri `deploy/` içinde.
