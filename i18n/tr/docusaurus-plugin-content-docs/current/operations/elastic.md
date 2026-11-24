---
title: "Elastic"
description: "OpenConsole'un denetim olaylarını ve istek loglarını Elasticsearch'e gönderin, istediğiniz kadar saklayın ve Kibana'da sorgulayın."
---

# Elastic

`LOG_FORMAT=ecs` ile (manifest'in ayarı) OpenConsole'un yazdığı her satır, Elastic Common Schema alan adlarıyla tek
bir JSON nesnesidir ([Loglama](/operations/logging)).
[`deploy/elk`](https://github.com/vurulkan/kubernetes-openconsole/tree/v2.25.0/deploy/elk) içindeki dosyalar bu
satırları, alanları tipli iki data stream'e dönüştürür:

| Data stream | İçerik |
|---|---|
| `logs-openconsole.audit-<namespace>` | denetim olayları: kim, nerede, ne yaptı, sonuç ne oldu (`event.dataset: openconsole.audit`) |
| `logs-openconsole.app-<namespace>` | geri kalan her şey: istek satırları, açılış, Kubernetes istemci mesajları (`event.dataset: openconsole.app`) |

Pipeline yalnızca OpenConsole'un satırlarına dokunur (`service.name: openconsole` içeren JSON); diğer
container'ların satırları olduğu gibi geçer. Ayrıştıramadığı bir satır ham `message`'ını korur,
`openconsole_json_failure` etiketini alır ve geldiği yerde kalır.

Elasticsearch 8.8 ya da üstü gerekir. Bu sayfadaki her komut ve sorgu, OpenConsole 2.22.0 satırlarıyla
Elasticsearch **8.15.3** ve **9.1.0** üzerinde çalıştırıldı. 8.7 için
[Elasticsearch 8.7 and older](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.25.0/deploy/elk/README.md#elasticsearch-87-and-older)
bölümüne bakın.

## 1. Pipeline'ı ve template'leri kurun {#1-install-the-pipeline-and-templates}

Kod deposunun, çalıştırdığınız sürüme ait bir checkout'ından:

```bash
git clone --depth 1 --branch v2.25.0 https://github.com/vurulkan/kubernetes-openconsole.git
cd kubernetes-openconsole
ES_URL=https://elasticsearch.example:9200 ES_API_KEY=<base64 id:key> deploy/elk/install.sh
# or ES_USER=elastic ES_PASSWORD=…; ES_INSECURE=1 for a self-signed certificate
```

```text
ok   PUT /_component_template/openconsole@mappings
ok   PUT /_index_template/logs-openconsole
ok   PUT /_ingest/pipeline/openconsole-logs
ok   PUT /_ingest/pipeline/logs-kubernetes.container_logs@custom
```

API anahtarının `manage_index_templates` ve `manage_pipeline` cluster yetkilerine sahip olması gerekir. Script'i
tekrar çalıştırmak güvenlidir; örneğin alan ekleyen bir sürüm yükseltmesinden sonra. `logs-kubernetes.container_logs@custom`
zaten varsa script ona dokunmaz ve içine eklenmesi gereken tek processor'ı yazdırır. Shell erişiminiz yoksa aynı
dört isteği Kibana → Dev Tools'tan gönderin
([Without install.sh](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.25.0/deploy/elk/README.md#without-installsh)).

## 2. Satırları gönderin {#2-ship-the-lines}

### Kubernetes entegrasyonlu Elastic Agent {#elastic-agent-with-the-kubernetes-integration}

Container loglarınızı zaten Fleet'in Kubernetes entegrasyonu topluyorsa, Agent policy'sinde değiştirecek bir şey
yoktur. Entegrasyonun pipeline'ı her satır için `logs-kubernetes.container_logs@custom`'ı çağırır, `install.sh` o
pipeline'ın `openconsole-logs`'u çağırmasını sağladı ve OpenConsole satırları yukarıdaki iki data stream'e geçer.
Kurulumdan önce yazılmış satırlar geldikleri yerde kalır.

Pipeline çözdüğü kaydı dokümanla birleştirir; böylece Agent'ın `kubernetes.*`, `container.*` ve `log.file.path`
alanları korunur. Ayrıca eski sürümlerden gelen ve `event.outcome` taşımayan denetim olaylarına bu alanı ekler.
Pipeline olmadan da satırlar gelir ama ayrıştırılmadan: her biri `logs-kubernetes.container_logs-*` içinde,
`message`'da tek bir JSON string'i olarak durur; filtrelenecek alan yoktur, denetim ve uygulama kayıtları karışır ve
`@timestamp` kaydın kendi zamanı değil, log toplayıcının zamanıdır.

### Filebeat ya da standalone Elastic Agent {#filebeat-or-elastic-agent-standalone}

OpenConsole pod'unun log dosyalarını okuyun, satırı olduğu gibi bırakın ve aynı pipeline'a verin:

```yaml title="filebeat.yml"
filebeat.inputs:
  - type: filestream
    id: openconsole
    paths:
      - /var/log/containers/kubernetes-openconsole-*_kubernetes-openconsole_*.log
    prospector.scanner.symlinks: true    # the files in /var/log/containers are symlinks
    parsers:
      - container: {}                    # strips the CRI prefix
    pipeline: openconsole-logs
    index: logs-openconsole-default      # a data stream name; the pipeline moves each line on from there
    processors:
      - add_kubernetes_metadata:
          node: ${NODE_NAME}
          matchers:
            - logs_path:
                logs_path: /var/log/containers/
output.elasticsearch:
  hosts: ["https://elasticsearch.example:9200"]
```

- `index` bir data stream adı olmalıdır (`logs-<dataset>-<namespace>`): pipeline'ın son adımı satırı
  `logs-openconsole.audit-default` ya da `…app-default`'a taşır ve `filebeat-9.1.0` gibi bir index'i reddeder.
- Aynı dosyaları genel container input'unuzdan hariç tutun; yoksa her satır iki kez gelir.
- Standalone Elastic Agent'ta input, aynı `paths`, `parsers` ve `pipeline` ile `inputs:` altına girer.

## 3. Kontrol edin {#3-check}

OpenConsole'a gelen bir sonraki istekten sonra (Dev Tools'tan ya da Elasticsearch'e `curl` ile):

```text
GET logs-openconsole.audit-*/_search
{ "size": 3, "sort": [{ "@timestamp": "desc" }], "_source": ["@timestamp", "message"] }
```

```text
GET _cat/indices/*openconsole*?v&h=index,docs.count
index                                                docs.count
.ds-logs-openconsole.app-default-2026.11.14-000001         1301
.ds-logs-openconsole.audit-default-2026.11.14-000001         70
```

Kibana'da `logs-openconsole.audit-*` için bir, `logs-openconsole.app-*` için bir data view oluşturun
(Stack Management → Data views); zaman alanı olarak `@timestamp`'i seçin.

## Denetim logunun yanıtladığı sorular {#questions-the-audit-log-answers}

Kibana → Discover, data view `logs-openconsole.audit-*`, KQL:

| Soru | KQL |
|---|---|
| Hangi Secret'ı kim gösterdi? | `event.action : "secret.reveal" and event.outcome : "success"` |
| Kim shell açtı? | `event.action : "pod.exec" and openconsole.phase : "start"` |
| API üzerinden tek komut kim çalıştırdı? | `event.action : "pod.exec" and openconsole.mode : "command"` |
| Neler reddedildi? | `openconsole.outcome : "denied"` |
| Başarısız ve kilitlenen girişler | `event.action : "user.login" and (openconsole.outcome : "failed" or openconsole.outcome : "locked")` |
| Restart'lar ve ölçeklemeler | `(event.action : "deployment.restart" or event.action : "deployment.scale" or event.action : "statefulset.scale") and event.outcome : "success"` |
| Gerçekten uygulanan YAML (dry-run değil) | `openconsole.verb : "apply" and openconsole.dry_run : false` |
| Bir API anahtarının yaptığı her şey | `openconsole.api_key.name : "triage-bot"` |
| Değişen kullanıcılar, gruplar, roller ve izinler | `event.category : "iam"` |
| Bir kullanıcı için başarısız olan her şey | `user.name : "dev1" and event.outcome : "failure"` |
| Kullanıcı başına limite takılıp reddedilen shell'ler | `event.action : "pod.exec" and openconsole.outcome : "rate_limited"` |

İşe yarayan sütunlar: `user.name`, `event.action`, `openconsole.outcome`, `event.reason`, `openconsole.cluster`,
`openconsole.namespace`, `openconsole.resource_name`, `source.ip`. Secret gösterme olayında ayrıca `openconsole.key`
vardır (anahtarın adı, asla değeri değil); shell olayında `openconsole.container`, `openconsole.command` ve shell
bittiğinde `openconsole.exit_code` ile `openconsole.duration_ms` bulunur.

Data view `logs-openconsole.app-*`:

| Soru | KQL |
|---|---|
| Sunucu hataları | `http.response.status_code >= 500` |
| Bir API anahtarının yaptığı, başarısız olan istekler | `http.response.status_code >= 400 and openconsole.api_key.id : *` |
| 1 sn'den yavaş istekler | `event.duration > 1000000000` |
| Kubernetes istemci hataları (başarısız watch'lar, reddedilen kimlik bilgileri) | `log.level : "error"` |
| Bir ağdan gelen giriş denemeleri | `url.path : "/api/auth/login" and source.ip : "10.0.0.0/8"` |
| Tek bir istek ve yol açtıkları | `http.request.id : "wWqvhvT3HewFXXqD"` (iki data view'da da) |

Aynı sorular, tablo halinde ES|QL ile (Discover → ES|QL ya da 8.11 ve üstünde `POST _query`):

```sql
FROM logs-openconsole.audit-*
| WHERE event.action == "secret.reveal"
| KEEP @timestamp, user.name, event.outcome, openconsole.cluster, openconsole.namespace, openconsole.resource_name, openconsole.key
| SORT @timestamp DESC
```

```sql
FROM logs-openconsole.audit-*
| WHERE event.action == "pod.exec" AND openconsole.phase == "start"
| KEEP @timestamp, user.name, openconsole.cluster, openconsole.namespace, openconsole.resource_name, openconsole.container, openconsole.command, source.ip
| SORT @timestamp DESC
```

```sql
FROM logs-openconsole.audit-*
| WHERE openconsole.outcome == "denied"
| STATS refusals = COUNT(*) BY user.name, event.action, event.reason
| SORT refusals DESC
```

## Denetim kaydını istediğiniz kadar saklayın {#keep-the-audit-trail-as-long-as-you-need}

8.8 ve üstünde iki data stream, stack'in `logs` lifecycle policy'sini alır; bu policy rollover yapar ama **hiçbir
zaman silmez**. OpenConsole satırlarını belirli bir süre (burada bir yıl) tutmak için onlara kendi policy'lerini
verin:

```text
PUT _ilm/policy/openconsole-logs
{
  "policy": {
    "_meta": { "description": "OpenConsole audit and app logs" },
    "phases": {
      "hot":    { "actions": { "rollover": { "max_age": "30d", "max_primary_shard_size": "10gb" } } },
      "delete": { "min_age": "365d", "actions": { "delete": {} } }
    }
  }
}

PUT _component_template/openconsole@settings
{ "template": { "settings": { "index.lifecycle.name": "openconsole-logs" } } }
```

`deploy/elk/logs-openconsole.index-template.json` içindeki `composed_of`'un sonuna `"openconsole@settings"` ekleyin
ve bu dosyayla `PUT _index_template/logs-openconsole` yapın. Bundan sonra yeni backing index'ler policy'yi alır;
var olanlara da verin:

```text
PUT logs-openconsole.audit-*,logs-openconsole.app-*/_settings
{ "index.lifecycle.name": "openconsole-logs" }

GET logs-openconsole.audit-*/_ilm/explain     ← every index "managed": true, "policy": "openconsole-logs"
```

Index template'in kendi kopyanızı saklayın: `install.sh` tekrar çalıştırıldığında depodaki dosyayı,
`openconsole@settings` olmadan geri yazar. Bunun için `logs@custom` kullanmayın: her `logs-*` data stream'i onu okur.

## Sürüm yükseltmeden sonra {#after-an-upgrade}

Yeni sürümün `install.sh`'ını çalıştırın. Yeni alanlar bir sonraki backing index'ten itibaren geçerli olur; hemen
almak için rollover yapın:

```text
POST logs-openconsole.audit-default/_rollover
POST logs-openconsole.app-default/_rollover
```

Bir sürüm alan eklerse sürüm notları bunu belirtir (2.22 on alan ekledi). Ayrıntılar:
[deploy/elk/README.md](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.25.0/deploy/elk/README.md).

## Kaldırma {#remove}

```text
DELETE _ingest/pipeline/logs-kubernetes.container_logs@custom   ← only if install.sh created it
DELETE _ingest/pipeline/openconsole-logs
DELETE _index_template/logs-openconsole
DELETE _component_template/openconsole@mappings
```

Data stream'ler ve içerdikleri, siz silene kadar kalır: `DELETE _data_stream/logs-openconsole.*`.
