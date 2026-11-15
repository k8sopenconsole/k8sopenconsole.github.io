---
title: "Sorun giderme"
description: "Belirtinizi OpenConsole'un gösterdiği ya da logladığı mesajdan bulun ve ne yapacağınızı görün. Bütün 403 sebepleri dahil."
---

# Sorun giderme

Bu sayfada gördüğünüz mesajı arayın. `code` olarak yazılan mesajlar, OpenConsole 2.23.0'ın tam olarak gösterdiği,
döndüğü ya da logladığı metindir. Log satırları `kubectl -n kubernetes-openconsole logs deploy/kubernetes-openconsole`
çıktısındadır ([Loglama](/operations/logging)).

## Cluster eklenemiyor {#adding-a-cluster-fails}

**Cluster'ı kaydet** şu cevabı veriyor: `cluster validation failed: cannot list namespaces with these credentials: …`.
Mesajın sonu sebebi söyler:

| Mesajın sonu | Sebep | Çözüm |
|---|---|---|
| `context deadline exceeded` | API server adresi OpenConsole pod'undan cevap vermiyor (yanlış adres, firewall, private endpoint) | pod'un ağından test edin; OpenConsole'un çalıştığı cluster için `https://kubernetes.default.svc` kullanın |
| `dial tcp: lookup <host> on …: no such host` | host adı cluster'ın içinde çözülmüyor | pod'un çözebildiği bir ad ya da IP kullanın |
| `tls: failed to verify certificate: x509: certificate signed by unknown authority` | CA sertifikası eksik ya da yanlış | cluster'ın CA'sını (base64) yapıştırın ([Cluster bağlama](/installation/connect-cluster#2-read-the-token-and-ca)) |
| `Unauthorized` | token yanlış, süresi dolmuş ya da ServiceAccount'u silinmiş | token'ı yeniden okuyun |
| `namespaces is forbidden: User "system:serviceaccount:…" cannot list resource "namespaces" …` | kimliğin ClusterRole binding'i yok (ya da bu ClusterRole'e değil) | `deploy/rbac.yaml`'ı uygulayın ve o kimliğe bağlayın |

## Bir cluster boş liste ya da 503 gösteriyor {#a-cluster-shows-empty-lists-or-503}

Cluster sorunsuz eklendi, ama şimdi iş yükü listeleri boş, diğer ekranlar hata veriyor ve log şunlarla dolu:

```text
…/reflector.go:229: Failed to watch *v1.Pod: failed to list *v1.Pod: Unauthorized
…/reflector.go:229: Failed to watch *v1.Job: failed to list *v1.Job: jobs.batch is forbidden: User "system:serviceaccount:default:temp" cannot list resource "jobs" in API group "batch" at the cluster scope
```

İstekler de `503`, `{"error":"Unauthorized"}` ya da
`{"error":"the OpenConsole ServiceAccount is not allowed to read secrets here (check the ClusterRole)"}` dönüyor.

OpenConsole'un o cluster için tuttuğu kimlik bilgileri artık çalışmıyor: token yenilendi ya da ServiceAccount'u
silindi (`Unauthorized`), veya ClusterRole ya da binding'i değişti (`forbidden`). Cluster'ın bağlantı gauge'u yine de
`1` gösterir ([Metrikler](/operations/metrics#what-to-watch)). Kimliği düzeltin, sonra **Yönetim → Cluster'lar →
Düzenle**'de **Credential'ları değiştir**'i işaretleyip token'ı ve CA'yı yapıştırın
([Token'ı yenileme](/installation/connect-cluster#rotate-the-token)). Cluster hemen yeniden çalışır; restart gerekmez.

Tek bir kaynak türü için yalnızca
`{"error":"the OpenConsole ServiceAccount is not allowed to read <resource> here (check the ClusterRole)"}` geliyorsa,
eksik olan yalnızca o kuraldır ([Kubernetes izinleri](/reference/kubernetes-permissions)). ClusterRole'ün izin
vermediği bir yazma işlemi API server'ın mesajıyla 403 döner, ör.
`restart failed: deployments.apps "web" is forbidden: …` (salt görüntüleme ClusterRole'ü, ya da `patch` / `update`
verb'ü kaldırılmış).

## CPU ya da memory değerleri yok {#no-cpu-or-memory-figures}

| Mesaj | Sebep |
|---|---|
| `metrics-server was not found on this cluster; CPU and memory usage are not shown.` (Türkçe arayüzde: "Bu cluster'da metrics-server bulunamadı; CPU ve memory kullanımı gösterilemiyor.") | metrics-server'ı kurun (`kubectl get apiservices v1beta1.metrics.k8s.io` `True` demeli) |
| `The OpenConsole ServiceAccount may not read metrics.k8s.io pods (check the ClusterRole).` (Türkçe arayüzde: "OpenConsole ServiceAccount'ı metrics.k8s.io pod'larını okuyamıyor (ClusterRole'ü kontrol edin).") | `deploy/rbac.yaml`'daki `metrics.k8s.io` kuralını ekleyin |
| `Pod metrics could not be read from this cluster.` (Türkçe arayüzde: "Pod metrikleri bu cluster'dan okunamadı.") | metrics-server hata döndü; kendi loguna bakın |
| `Prometheus is unreachable; showing the last 24 hours from memory` (Türkçe arayüzde: "Prometheus'a ulaşılamadı; son 24 saat bellekten gösteriliyor") | cluster'ın Prometheus ayarı cevap vermiyor; aşağıdaki **Bağlantıyı test et**'i kullanın |
| `No samples yet; the first arrive within 30 seconds.` (Türkçe arayüzde: "Henüz örnek yok; ilkler 30 saniye içinde gelir.") | OpenConsole yeni açıldı ya da cluster yeni bağlandı; bekleyin |

## Prometheus "Bağlantıyı test et" başarısız {#prometheus-test-connection-fails}

Yönetim → Cluster'lar → Prometheus → **Bağlantıyı test et**, başarısız olan ilk adımda durur ve sebebini söyler:

| Mesaj | Çözüm |
|---|---|
| `The settings are incomplete or invalid.` (Türkçe arayüzde: "Ayarlar eksik ya da geçersiz.") | namespace, Service ve port'u ya da `http(s)://` ile başlayan bir URL'i doldurun |
| `The OpenConsole ServiceAccount may not use services/proxy on this Service; add the rule from deploy/rbac.yaml.` (Türkçe arayüzde: "OpenConsole ServiceAccount'ı bu servis üzerinde services/proxy kullanamıyor; deploy/rbac.yaml'daki kuralı ekleyin.") | `services/proxy` kuralının yorumunu kaldırın; `resourceNames`'e Prometheus Service'inizi yazın |
| `The Service or its port was not found, or it has no ready endpoints.` (Türkçe arayüzde: "Servis ya da portu bulunamadı, veya hazır endpoint'i yok.") | namespace'i, Service adını ve port'u kontrol edin (**Cluster'da bul** adayları listeler) |
| `Prometheus refused the credentials (401 / 403).` (Türkçe arayüzde: "Prometheus kimlik bilgilerini reddetti (401 / 403).") | kullanıcı / şifreyi, token'ı ya da client sertifikasını kontrol edin |
| `The address answered, but not with the Prometheus API. Check the URL / port and the path prefix.` (Türkçe arayüzde: "Adres yanıt verdi ama Prometheus API'si değil. URL / port ve path önekini kontrol edin.") | Prometheus HTTP API'sini gösterin; varsa path prefix'i de ekleyin |
| `The host name could not be resolved.` (Türkçe arayüzde: "Host adı çözülemedi.") | URL'deki host OpenConsole pod'undan çözülmüyor |
| `TLS failed: check the CA certificate, or skip verification for a test.` (Türkçe arayüzde: "TLS başarısız: CA sertifikasını kontrol edin ya da test için doğrulamayı atlayın.") | CA sertifikasını ekleyin |
| `No answer in time.` / `The address could not be reached.` (Türkçe arayüzde: "Zamanında yanıt gelmedi." / "Adrese ulaşılamadı.") | firewall, NetworkPolicy, yanlış port |
| `Connected, but there are no container metrics for this cluster: cAdvisor may not be scraped, or the cluster filter is wrong.` (Türkçe arayüzde: "Bağlandı ama bu cluster için container metriği yok: cAdvisor scrape edilmiyor olabilir ya da cluster filtresi yanlış.") | kubelet'in cAdvisor ucunu scrape edin ya da cluster label değerini düzeltin |
| `This Prometheus holds several clusters (…); pick the value for this one, or the charts add them up.` (Türkçe arayüzde: "Bu Prometheus birden çok cluster tutuyor (…); bu cluster'ın değerini seçin, yoksa grafikler toplanır.") | cluster label'ını ve bu cluster'ın değerini ayarlayın |

Daha fazlası: [Prometheus](/administration/prometheus).

## Giriş yapılamıyor {#sign-in-fails}

| Belirti | Nereye bakmalı |
|---|---|
| `Login failed. Please check your credentials.` (Türkçe arayüzde: "Giriş başarısız. Lütfen bilgilerini kontrol et.") | Yönetim → Denetim Logları, aksiyon `user.login`, sonuç `failed`. Sebep hangisi olduğunu söyler: `bad_password` (yanlış şifre; dizin bind'i başarısız olan bir LDAP hesabı da), `unknown_user` (böyle bir hesap yok ya da deaktive), `azure_account` (bir Azure AD hesabı şifre girdi: **Microsoft ile giriş yap**'ı kullanın). Local bir hesap asla dizin şifresiyle giriş yapmaz: hesabının kaynağı *Local* görünen bir LDAP kullanıcısı `bad_password` alır ([LDAP](/administration/ldap#signing-in)) |
| 5 denemeden sonra aynı mesaj ve `/api/auth/login`'den `Retry-After` ile `429` | o kullanıcı adı o adresten 5 dakika kilitli; `user.login` `locked` (`too_many_failures`) olarak audit'e yazılır; herhangi adreslerden 20 başarısız denemeden sonra ad her yerden 5 dakika kilitlenir. Bekleyin ya da başka bir makineden giriş yapın |
| herkesin girişleri ve oturumları aynı adresi (Ingress pod'unun adresini) gösteriyor, bir kişinin yanlış denemeleri başkalarını kilitliyor | `TRUSTED_PROXIES` Ingress'inizi kapsamıyor, bu yüzden `X-Forwarded-For` okunmuyor: onu Ingress controller'ın pod ağına ayarlayın ([Ortam değişkenleri](/reference/environment-variables)) |
| **Microsoft ile giriş yap** `this account can't sign in with this Microsoft account` cevabını veriyor | `user.login` `failed`, sebep `not_azure_account` (bu ada sahip local ya da LDAP hesabı var), `azure_oid_mismatch` (hesap başka bir Entra kullanıcısına ait, örn. silinip yeniden oluşturulmuş biri) ya da `azure_no_oid` ([Azure AD](/administration/azure-ad#how-the-account-is-found)) |
| `Your session has ended. Please sign in again.` (Türkçe arayüzde: "Oturumun sona erdi. Lütfen tekrar giriş yap.") | oturumun süresi doldu (ömrü Yönetim → Oturumlar'dan ayarlanır) ya da bir yönetici iptal etti |

Denetim sebebi, bir LDAP bind'inin neden başarısız olduğunu söylemez. Dizini **Yönetim → LDAP → Bağlantıyı test et**
ile test edin; cevap dizin client'ının mesajıdır, örneğin:

```text
LDAP Result Code 200 "Network Error": dial tcp 127.0.0.1:389: connect: connection refused
LDAP Result Code 200 "Network Error": dial tcp: lookup ldap.example.invalid on 10.43.0.10:53: no such host
```

`connection refused` / `no such host` host ve port demektir; `Invalid Credentials` bind DN ya da şifredir; bir
sertifika hatası TLS ayarlarıdır.

## Proxy arkasında shell'ler ya da canlı loglar kopuyor {#shells-or-live-logs-break-behind-a-proxy}

| Belirti | Sebep | Çözüm |
|---|---|---|
| shell hemen `Connection error.` (Türkçe arayüzde: "Bağlantı hatası.") ya da `Session closed (1006).` (Türkçe arayüzde: "Oturum kapandı (1006).") diyor; logda `GET /ws/namespaces/…/exec 400` var, cevap `{"error":"a WebSocket upgrade is required"}` | proxy `Upgrade` / `Connection` header'larını düşürüyor | WebSocket'leri geçirin (ingress-nginx, Traefik ve Gateway API varsayılan olarak geçirir; elle yazılmış bir nginx için `proxy_http_version 1.1` ve iki header da gerekir) |
| sessiz bir shell yaklaşık bir dakika sonra `Session closed (1006).` ("Oturum kapandı (1006).") ile kapanıyor; sessiz bir log akışı `Connection dropped; reconnecting…` (Türkçe arayüzde: "Bağlantı koptu; yeniden bağlanıyor…") gösteriyor | proxy'nin idle timeout'u | `EXEC_IDLE_TIMEOUT`'un (5 dakika) üstüne çıkarın ([TLS'li Ingress](/installation/kubernetes#ingress-with-tls)) |
| `You already have 3 shells open, the most allowed. Close one and try again.` (Türkçe arayüzde: "Zaten 3 açık shell'in var, izin verilen en fazla bu. Birini kapatıp tekrar dene.") | `MAX_EXEC_SESSIONS_PER_USER` (3) kadar açık shell var; `pod.exec` `rate_limited` (`max_sessions`) olarak audit'e yazılır | birini kapatın ya da limiti yükseltin |
| `Too many log streams; try again shortly.` (Türkçe arayüzde: "Çok fazla log akışı; birazdan tekrar deneyin.") | kullanıcı başına log akışı limiti | ihtiyacınız olmayan log görüntüleyicileri kapatın |
| shell'ler, loglar ve canlı olaylar hemen başarısız oluyor; logda `"refused":true` ile `ws.origin_mismatch` var | `WS_ORIGIN_CHECK=enforce` ve tarayıcının adresi isteğin geldiği adres değil: proxy `Host`'u değiştiriyor ve ya `X-Forwarded-Host` göndermiyor ya da `TRUSTED_PROXIES`'te değil | proxy `Host`'u korusun ya da `X-Forwarded-Host` göndersin (ve ona güvenin), veya adresi `ALLOWED_ORIGINS`'e ekleyin |
| bir WebSocket `401` dönüyor | ticket'ı zaten kullanılmış ya da 30 saniyeden eski | arayüz her bağlantı için yeni bir ticket alır; bir script de almalı (`POST /api/ws-ticket`) |

Canlı bir log ya da shell, tarayıcıdan OpenConsole'a bir WebSocket ve OpenConsole pod'undan Kubernetes API
server'ına bir akıştır; bu yüzden OpenConsole pod'unun API server'a da erişebilmesi gerekir.

## Pod açılmıyor {#the-pod-doesnt-start}

Pod yeniden başlıyor (`CrashLoopBackOff`) ve logu bir `ERROR` satırıyla bitiyor:

| Log satırı | Sebep | Çözüm |
|---|---|---|
| `db error` … `migrate …` | yeni bir sürümün veritabanı migration'ı başarısız oldu (dolu volume, bozuk dosya); veritabanı değişmedi | volume'de yer açın ya da `…-pre-upgrade.db` kopyasını [geri yükleyip](/installation/backup-restore) önceki sürümü başlatın |
| `ENCRYPTION_KEY` … `the key must be base64 of 32 bytes (openssl rand -base64 32)` | anahtar dosyası ya da değeri bir anahtar değil | `openssl rand -base64 32` ile oluşturun |
| `store error` … `the stored credentials are encrypted with an external key: set ENCRYPTION_KEY_FILE (or ENCRYPTION_KEY)` | anahtar veritabanının dışına taşındı ve Deployment onu artık mount etmiyor | `ENCRYPTION_KEY_FILE`'ı ve Secret'ı geri koyun |
| `store error` … `value is encrypted with key <id>, which is neither ENCRYPTION_KEY nor ENCRYPTION_KEY_PREVIOUS` | Secret'ta başka bir anahtar var | doğru anahtarı kullanın; anahtar değiştirirken `ENCRYPTION_KEY_PREVIOUS_FILE`'ı da ayarlayın; tamamen kaybolmuş bir anahtar: [Anahtar kaybolursa](/installation/backup-restore) |
| `store error` … `ENCRYPTION_KEY_PREVIOUS / ENCRYPTION_KEY_LOST need ENCRYPTION_KEY (or ENCRYPTION_KEY_FILE)` | önceki anahtar ya da kayıp anahtar anahtarı, geçerli anahtar olmadan verilmiş | `ENCRYPTION_KEY_FILE`'ı da ayarlayın |

## Hata cevapları {#error-answers}

Her hata cevabı JSON'dır: `{"error": "<reason or message>"}`. `401`'in gövdesi yoktur: oturum ya da API anahtarı
eksik, süresi dolmuş ya da iptal edilmiş.

### 403 sebepleri {#403-reasons}

| `error` | Anlamı | Kaynak (v2.23.0) |
|---|---|---|
| `forbidden` | burada (namespace, cluster) bu aksiyon için izin yok | [audit_events.go#L91](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.0/backend/internal/api/audit_events.go#L91), [router.go#L2642-L2651](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.0/backend/internal/api/router.go#L2642-L2651) |
| `api_access_policy` | API anahtarıyla: sahibinin izni var ve anahtar onu listeliyor, ama yöneticinin API erişim politikası anahtarlara bunu vermiyor | [audit_events.go#L95-L97](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.0/backend/internal/api/audit_events.go#L95-L97), [router.go#L2612-L2629](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.0/backend/internal/api/router.go#L2612-L2629) |
| `api_access_off` | API anahtarıyla: politika bu kullanıcı için API erişimini kapatıyor | [audit_events.go#L98-L99](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.0/backend/internal/api/audit_events.go#L98-L99), [apikeys.go#L205-L208](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.0/backend/internal/api/apikeys.go#L205-L208) |
| `api_key_not_allowed` | bir API anahtarı bunu hiçbir zaman yapamaz (anahtar yönetmek, şifre değiştirmek, cluster seçmek, görünüm kaydetmek) | [apikeys.go#L51](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.0/backend/internal/api/apikeys.go#L51), [apikeys.go#L244-L252](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.0/backend/internal/api/apikeys.go#L244-L252) |
| `feature_disabled` | operatör bu yeteneği kapattı (`FEATURE_*=false`) | [audit_events.go#L92](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.0/backend/internal/api/audit_events.go#L92), [router.go#L2637-L2640](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.0/backend/internal/api/router.go#L2637-L2640) |
| `admin_only` | bir yönetim ekranı ya da ucu; API anahtarıyla: Admin API kapsamı olmayan bir anahtar | [audit_events.go#L93](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.0/backend/internal/api/audit_events.go#L93), [router.go#L598-L605](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.0/backend/internal/api/router.go#L598-L605) |
| `change your password first` | ilk şifresini hâlâ değiştirmesi gereken bir hesabın API anahtarı ya da API anahtarları sayfası (böyle bir hesap diğer ekranlarda `forbidden` alır) | [apikeys.go#L196-L199](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.0/backend/internal/api/apikeys.go#L196-L199), [apikeys.go#L431-L432](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.0/backend/internal/api/apikeys.go#L431-L432) |
| `backup_download_disabled` | yedek indirme kapalı (`BACKUP_ALLOW_DOWNLOAD` `true` değil) | [backups.go](https://github.com/vurulkan/kubernetes-openconsole/blob/dev/backend/internal/api/backups.go) |
| `you have no permissions on this cluster` | hiçbir izninizin kapsamadığı bir cluster'ı seçmek | [cluster_ctx.go#L172](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.0/backend/internal/api/cluster_ctx.go#L172) |
| `only the owner can change this view` | başkasının paylaşılan görünümünü düzenlemek | [views.go#L161](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.0/backend/internal/api/views.go#L161) |
| `user is disabled` | deaktive edilmiş bir hesap için Azure AD girişi | [router.go#L989-L991](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.0/backend/internal/api/router.go#L989-L991) |
| `this account can't sign in with this Microsoft account` | local ya da LDAP hesabı için, ya da başka bir Entra kullanıcısının ilk giriş yaptığı bir hesap için Azure AD girişi ([Giriş yapılamıyor](#sign-in-fails) bölümüne bakın) | [router.go](https://github.com/vurulkan/kubernetes-openconsole/blob/dev/backend/internal/api/router.go) |
| `the OpenConsole ServiceAccount is not allowed to read <resource> here (check the ClusterRole)` | Kubernetes sizi değil, OpenConsole'un kimliğini reddetti | [secrets.go#L227-L229](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.0/backend/internal/api/secrets.go#L227-L229) |
| `restart failed: …` / `scale failed: …` / API server'ın mesajı | Kubernetes bir yazma işlemini reddetti (o verb'ü içermeyen ClusterRole) | [deployment_actions.go#L160-L164](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.0/backend/internal/api/deployment_actions.go#L160-L164), [yaml_apply.go#L111](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.0/backend/internal/api/yaml_apply.go#L111) |

İlk altısı aynı zamanda `denied` denetim olayının `reason`'ıdır. API anahtarları ve agent'lar için ayrıca
[API'ye genel bakış](/api/overview) sayfasına bakın.

### Diğer cevaplar {#other-answers}

| Cevap | Anlamı |
|---|---|
| `400` `cluster "<name>" is unknown or not reachable with this key` | `X-OpenConsole-Cluster` header'ı, var olmayan ya da anahtarın kapsamadığı bir cluster'ı gösteriyor |
| API anahtarıyla `429` (gövdesiz) | o anahtar için saniyede 10'dan fazla istek (30'luk patlamalar) |
| `429` `too many open shells (limit 3 per user); close one first` | shell limiti; tarayıcı olmayan bir client'tan |
| `400` `kubeconfig_unsupported: user "…" uses exec; …` | kubeconfig bir program çalıştırıyor ya da dosya okuyor (exec plugin, `auth-provider`, `tokenFile`, sertifika ya da anahtar yolu): satır içi kimlik bilgisi olan bir kubeconfig kullanın ([Cluster bağlama](/installation/connect-cluster)). Daha önce böyle bir kubeconfig ile kaydedilmiş cluster bağlanmaz: listeleri boş kalır (`503`), pod logunda bir kez `cluster not connected: its kubeconfig runs a program or reads a file` olur; **Yönetim → Cluster'lar → Düzenle**'den satır içi bir kubeconfig yükleyin |
| `409` `a revoked key can't be regenerated; create a new one` | iptal edilmiş bir API anahtarını yeniden üretmek; yalnızca süresi dolmuş anahtar yeniden üretilebilir |
| `413` `request body too large` | gövde 1 MiB'tan büyük (YAML apply için 4 MiB) |
| `400` `username is required` | `username` olmadan `PUT /api/admin/users/{id}`: her güncellemede kullanıcının adını gönderin |
| restart, ölçekleme, YAML apply ya da bir Secret isteğinden `404`, `409`, `400` ya da `504` | Kubernetes NotFound, Conflict (ör. eskimiş bir `resourceVersion`), Invalid ya da Timeout cevabı verdi; OpenConsole aynı status'u iletir, böylece bir proxy 4xx'i 5xx ile sarmaz. `failed` denetim olayında neden (`not_found`, `conflict`, `invalid`) ve `error` yer alır |
| `400` `unknown group or role id` / `unknown user or group id`, `404` `role not found` | istekteki bir grup, rol ya da kullanıcı id'si yok (bu arada silinmiş); hiçbir şey değişmedi |
| `/readyz`'den `503`: `db not reachable` | veritabanı dosyası açılamıyor: volume'u kontrol edin ([Sağlık probe'ları](/operations/health-probes)) |
