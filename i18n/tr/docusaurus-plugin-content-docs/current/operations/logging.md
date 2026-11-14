---
title: "Loglama"
description: "OpenConsole'un stdout'a ne yazdığı, hangi formatta yazdığı ve bir isteğin denetim olayıyla nasıl eşleştirildiği."
---

# Loglama

OpenConsole logunu stdout'a yazar, her satıra bir kayıt. Log dosyası yoktur, rotate edilecek bir şey de yoktur:
satırları container runtime'ınız tutar, log toplayıcınız okur. Dört tür satır çıkar:

| Satır | `message` (`ecs`) | Ne zaman |
|---|---|---|
| HTTP isteği | `GET /api/namespaces/{…}/pods 200` | her istek, bittiğinde |
| Denetim olayı | `alice: deployment.scale success shop/web on prod-eu` | audit'e yazılan her aksiyon, `LOG_INCLUDE_AUDIT=true` iken (varsayılan) |
| Kubernetes istemcisi | `…/reflector.go:229: failed to list *v1.Pod: Unauthorized` | client-go'nun kendi mesajları (watch hataları, yeniden denemeler) |
| Uygulama | `starting openconsole`, `cluster connected`, `session recording ready`, … | açılış, cluster bağlantıları, kayıtlar, arka plan işleri |

Satırları ayrıştırılmış alanlarla ve kendi data stream'lerinde Elasticsearch'e göndermek için [Elastic](/operations/elastic) sayfasına bakın.

## Format {#format}

`LOG_FORMAT` üç formattan birini seçer. `deploy/` içindeki manifest `ecs` ayarlar; yerleşik varsayılan `text`'tir.

| `LOG_FORMAT` | Ne için |
|---|---|
| `ecs` | Elastic: [Elastic Common Schema](https://www.elastic.co/guide/en/ecs/current/index.html) alan adlarıyla iç içe JSON, `event.*` dolu |
| `json` | Loki, Vector ya da kendi ayrıştırmanız: kısa adlı düz JSON (`time`, `level`, `msg`, `user`, …) |
| `text` | `kubectl logs` çıktısını gözle okumak |

`ecs` ya da `json` ile her satır (client-go'nun mesajları da) tek bir JSON nesnesidir; Elastic Agent, Filebeat,
Logstash, Fluent Bit ya da Vector satırları grok olmadan okur.

Aynı başarısız giriş denemesi, 2.22.0'ın yazdığı haliyle her formatta (her biri tek satır; `ecs` satırları burada
bölündü):

```text title="LOG_FORMAT=text"
time=2026-11-14T11:44:24.743Z level=WARN msg=http.request service=openconsole version=2.22.0 method=POST path=/api/auth/login status=401 duration_ms=290 remote_ip=172.17.0.1 request_id=docs-example-1 user_agent=curl/8.7.1
time=2026-11-14T11:44:24.774Z level=INFO msg=audit service=openconsole version=2.22.0 event=user.login verb=login outcome=failed reason=bad_password user=admin resource_type=user resource_name=admin request_id=docs-example-1 remote_ip=172.17.0.1 user_agent=curl/8.7.1 account_source=local
```

```json title="LOG_FORMAT=json"
{"time":"2026-11-14T11:44:24.39464748Z","level":"WARN","msg":"http.request","service":"openconsole","version":"2.22.0","method":"POST","path":"/api/auth/login","status":401,"duration_ms":230,"remote_ip":"172.17.0.1","request_id":"docs-example-1","user_agent":"curl/8.7.1"}
{"time":"2026-11-14T11:44:24.42660799Z","level":"INFO","msg":"audit","service":"openconsole","version":"2.22.0","event":"user.login","verb":"login","outcome":"failed","reason":"bad_password","user":"admin","resource_type":"user","resource_name":"admin","request_id":"docs-example-1","remote_ip":"172.17.0.1","user_agent":"curl/8.7.1","account_source":"local"}
```

`LOG_FORMAT=ecs` ile API anahtarıyla yapılmış bir istek ve bir denetim olayı:

```json title="LOG_FORMAT=ecs"
{"@timestamp":"2026-11-14T11:33:35.098421Z","log":{"level":"info","logger":"http"},"message":"GET /api/auth/me 200",
 "service":{"name":"openconsole","version":"2.22.0","environment":"prod"},"ecs":{"version":"8.11.0"},
 "http":{"request":{"method":"GET","id":"IfagdSYu-juQwKa8"},"response":{"status_code":200,"body":{"bytes":904}}},
 "url":{"path":"/api/auth/me"},"event":{"duration":51677741,"kind":"event","category":["web"],"type":["access"],
 "outcome":"success","dataset":"openconsole.app"},"source":{"ip":"127.0.0.1"},"user_agent":{"original":"node"},
 "openconsole":{"api_key":{"id":1,"name":"triage-bot"}}}

{"@timestamp":"2026-11-14T11:33:34.714411Z","log":{"level":"info","logger":"audit"},
 "message":"admin: deployment.scale success crashlab/web on demo",
 "service":{"name":"openconsole","version":"2.22.0","environment":"prod"},"ecs":{"version":"8.11.0"},
 "event":{"action":"deployment.scale","kind":"event","category":["configuration"],"type":["change"],
 "outcome":"success","dataset":"openconsole.audit"},
 "openconsole":{"verb":"scale","outcome":"success","auth_source":"local","cluster":"demo","cluster_id":1,
 "namespace":"crashlab","resource_type":"deployment","resource_name":"web","replicas_from":1,"replicas_to":2},
 "user":{"name":"admin"},"http":{"request":{"id":"wWqvhvT3HewFXXqD"}},"source":{"ip":"127.0.0.1"},
 "user_agent":{"original":"node"}}
```

Her `json` alanının `ecs`'teki adı:

| `json` | `ecs` |
|---|---|
| `time`, `level`, `msg` | `@timestamp` (UTC), `log.level` (küçük harf), `message` (istekler: `GET /path 401`; audit: `user: action outcome namespace/name on cluster (reason)`) |
| `service`, `version`, `env` | `service.name`, `service.version`, `service.environment` |
| `user`, `user_agent`, `remote_ip` | `user.name`, `user_agent.original`, `source.ip` |
| `method`, `path`, `status`, `request_id` | `http.request.method`, `url.path`, `http.response.status_code`, `http.request.id` |
| `duration_ms` | `event.duration` (nanosaniye; ölçülen değer, yuvarlanmaz) |
| — | `http.response.body.bytes` |
| `event` (audit aksiyonu), `reason`, `error`, `trace_id` | `event.action`, `event.reason`, `error.message`, `trace.id` |
| `api_key_id`, `api_key_name` | `openconsole.api_key.id`, `openconsole.api_key.name`: denetim olaylarında **ve** istek satırlarında; web oturumunda yoktur. API'yi web'den `openconsole.api_key.id : *` ile ayırın, user agent ile değil: onu istemci seçer |
| geri kalan her şey (`verb`, `outcome`, `cluster`, `namespace`, `resource_name`, `replicas_to` gibi audit ayrıntıları, …) | `openconsole.<name>` |

Her `ecs` kaydında `event.dataset` vardır: denetim olaylarında `openconsole.audit`, geri kalan her şeyde
`openconsole.app`. Bu iki türde `log.logger` da `http` ya da `audit`'tir ve ikisi de `event.kind: event` taşır. İstek kayıtları `event.category: [web]`,
`event.type: [access]` ve `event.outcome` taşır (4xx / 5xx için `failure`). Denetim olayları şunları taşır:
`event.outcome` (`success`; denied / failed / rate_limited / locked için `failure`; asıl değer
`openconsole.outcome`'dadır), verb'den gelen `event.type` (okumalar için `access`, `change`, `creation`,
`deletion`, shell'ler ve girişler için `start` / `end`) ve uygun olduğunda `event.category` (`authentication`,
`session`, `process`, `iam`, `configuration`). Aksiyonların ve ayrıntıların tam listesi
[Denetim olayları](/reference/audit-events) sayfasında.

`openconsole.namespace`, `openconsole.resource_name` ve diğer `openconsole.*` alanları, aksiyonun yapıldığı nesneyi
anlatır. Log toplayıcınızın kendi `kubernetes.*` ve `container.*` alanları ise satırı yazan OpenConsole pod'unu
anlatır; ikisi hiç karışmaz.

Tracing açıkken açılıştaki `tracing enabled` satırı JSON logger kurulmadan önce yazılır, bu yüzden düz metin
olarak gelir (`2026/11/14 11:42:09 INFO tracing enabled service=openconsole`). Diğer bütün satırlar `LOG_FORMAT`'a
uyar.

## Seviyeler {#levels}

`LOG_LEVEL` şunlardan biridir: `debug`, `info` (varsayılan), `warn` ya da `error`.

| Satır | Seviye |
|---|---|
| 5xx dönen istek | `error` |
| 4xx dönen istek | `warn` |
| başarılı `/healthz`, `/livez`, `/readyz` ve `/metrics` | `debug`; böylece probe'lar ve scrape'ler logu doldurmaz. Başarısız olanlar kendi seviyelerini korur |
| diğer istekler, denetim olayları | `info` |
| Kubernetes istemcisi | başarısız list için `info`, başarısız watch için `error` |

`debug` yalnızca başarılı probe ve scrape satırlarını ekler; istek gövdelerini loglamaz.

## Bir isteği denetim olayıyla eşleştirmek {#linking-a-request-and-its-audit-event}

Her yanıtta bir `X-Request-Id` header'ı vardır. Aynı id hem istek satırında (`http.request.id`) hem de isteğin
yol açtığı denetim olaylarında bulunur; tek bir aramayla ikisini de bulursunuz:

```bash
curl -si http://localhost:8080/api/auth/login -d '{"username":"admin","password":"wrong"}' | grep -i x-request-id
# X-Request-Id: p0ROI8YNQqdXURAg
```

İstekte zaten bir `X-Request-Id` header'ı varsa (ingress'iniz ya da gateway'iniz koymuşsa), OpenConsole yenisini
üretmez, onu kullanır; böylece id proxy'nizin access log'unda da aynı kalır. [Tracing](/operations/tracing)
açıkken istek satırlarında `trace.id` de bulunur.

Yönetim → Denetim Logları ekranı her olayda aynı istek ID'sini gösterir
([Olaydan istek loguna](/administration/audit-log#from-an-event-to-the-request-log)).

## Diğer ayarlar {#other-settings}

| Değişken | Varsayılan | Anlamı |
|---|---|---|
| `LOG_OUTPUT` | `stdout` | `stdout` ya da `stderr` |
| `LOG_ADD_SOURCE` | `false` | kaynak dosyayı ve satırı ekler (`ecs`'te `log.origin.*`) |
| `LOG_INCLUDE_AUDIT` | `true` | her denetim olayını veritabanının yanı sıra stdout'a da yazar. `false` ile denetim olayları yalnızca veritabanında olur (Yönetim → Denetim Logları, CSV) |
| `APP_ENV` | boş (manifest `prod` ayarlar) | her satırda `service.environment`, trace'lerde `deployment.environment` |
| `APP_VERSION` | imajın sürümü | `service.version`'ı ezer; örneğin bir canary'yi ayırt etmek için |

Bütün değişkenler: [Ortam değişkenleri](/reference/environment-variables).

## Saklama süresi {#retention}

Veritabanı denetim olaylarını `LOG_RETENTION_DAYS` (30) gün, API anahtarıyla yapılan başarılı okumaları
`API_KEY_READ_RETENTION_DAYS` (7) gün tutar. stdout satırları bu ikisinden etkilenmez: ne kadar duracakları log
platformunuza bağlıdır. Denetim kaydını 30 günden uzun tutmanız gerekiyorsa stdout'u gönderin
([Elastic](/operations/elastic)) ve saklama süresini orada ayarlayın.
