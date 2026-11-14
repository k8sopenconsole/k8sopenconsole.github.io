---
title: "Tracing (OpenTelemetry)"
sidebar_label: "Tracing"
description: "Her API isteği için, yaptığı Kubernetes API çağrılarıyla birlikte bir span'i OTLP üzerinden Jaeger, Tempo ya da Elastic APM'e gönderin."
---

# Tracing (OpenTelemetry)

Bir OTLP ucu (endpoint) tanımlanana kadar tracing kapalıdır. Tanımlandığında her API isteği bir span olur ve OTLP/HTTP
üzerinden bu protokolü konuşan herhangi bir alıcıya gönderilir: OpenTelemetry Collector, Jaeger, Grafana Tempo,
Elastic APM.

## Açmak {#turn-it-on}

Ucu container'ın ortam değişkenlerine, diğer ayarlarınızın bulunduğu kustomization'a ekleyin
([Kubernetes'e kurulum](/installation/kubernetes)):

```yaml title="kustomization.yaml (addition)"
patches:
  - patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: kubernetes-openconsole
        namespace: kubernetes-openconsole
      spec:
        template:
          spec:
            containers:
              - name: dashboard
                env:
                  - name: OTEL_EXPORTER_OTLP_ENDPOINT
                    value: http://jaeger.observability:4318
```

```bash
kubectl apply -k .
kubectl -n kubernetes-openconsole logs deploy/kubernetes-openconsole | grep 'tracing enabled'
# 2026/11/14 11:42:09 INFO tracing enabled service=openconsole
```

Uç, alıcının **OTLP/HTTP** port'udur (genelde 4318); gRPC (4317) değil. OpenConsole `/v1/traces` yolunu
kendisi ekler. Tam URL'i vermek isterseniz `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`'i kullanın. İki değişkenden biri
tracing'i açmaya yeter.

Standart OpenTelemetry değişkenleri,
[OpenTelemetry SDK](https://opentelemetry.io/docs/languages/sdk-configuration/)'nın tanımladığı şekilde geçerlidir:

| Değişken | Varsayılan | Kullanım |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | tanımsız (tracing kapalı) | alıcı, ör. `http://otel-collector.observability:4318` |
| `OTEL_EXPORTER_OTLP_HEADERS` | tanımsız | barındırılan (hosted) bir alıcı için ör. `Authorization=Bearer <token>` |
| `OTEL_SERVICE_NAME` | `openconsole` | trace arayüzündeki servis adı |
| `OTEL_RESOURCE_ATTRIBUTES` | tanımsız | ek resource attribute'ları, ör. `k8s.cluster.name=mgmt` |
| `OTEL_TRACES_SAMPLER`, `OTEL_TRACES_SAMPLER_ARG` | her istek | ör. onda bir için `parentbased_traceidratio` ve `0.1` |

`APP_VERSION` ve `APP_ENV`, `service.version` ve `deployment.environment` resource attribute'larına dönüşür.

## Bir trace'te neler var {#what-a-trace-contains}

| Span | Ad | Attribute'lar |
|---|---|---|
| API isteği (server) | route: `GET /api/namespaces/{namespace}/secrets` | `enduser.id` (kullanıcı adı), `openconsole.cluster`, `openconsole.request_id` (`X-Request-Id`), `http.method`, `http.target`, `http.status_code` |
| isteğin yaptığı her Kubernetes API çağrısı (client), alt span olarak | `HTTP GET` | `http.url` (API server URL'i), `http.status_code` |

Pod, Deployment ve diğer iş yükü listeleri OpenConsole'un bellekteki cache'inden gelir; bu isteklerin alt span'i
olmaz. API server'a giden okumaların (Secret'lar, YAML, loglar, exec, restart, ölçekleme, apply) alt span'i olur.
Arka plandaki watch'lar trace üretmez. `/healthz`, `/livez`, `/readyz` ve `/metrics` trace'lenmez.

Gelen bir W3C `traceparent` header'ı dikkate alınır: isteğin span'i, Ingress'inizin ya da gateway'inizin span'inin
alt span'i olur. İstek log satırları trace id'yi taşır (`ecs`'te `trace.id`, `json`'da `trace_id`); böylece bir log
satırından trace'ine gidebilirsiniz:

```bash
curl -s -o /dev/null http://localhost:8080/api/namespaces/crashlab/pods \
  -H "Authorization: Bearer $OC_API_KEY" \
  -H 'traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
kubectl -n kubernetes-openconsole logs deploy/kubernetes-openconsole | grep 4bf92f3577b34da6a3ce929d0e0e4736
```

```json
{"@timestamp":"2026-11-14T11:42:33.628588Z","log":{"level":"info","logger":"http"},"message":"GET /api/namespaces/crashlab/pods 200", … ,"trace":{"id":"4bf92f3577b34da6a3ce929d0e0e4736"}, …}
```

## Jaeger {#jaeger}

Jaeger 2, OTLP/HTTP'yi ek ayar gerekmeden 4318 port'unda kabul eder. Denemek için tek pod'luk bir Jaeger (bellekte
depolama, restart'tan sonra hiçbir şey kalmaz):

```yaml title="jaeger.yaml"
apiVersion: v1
kind: Namespace
metadata: {name: observability}
---
apiVersion: apps/v1
kind: Deployment
metadata: {name: jaeger, namespace: observability}
spec:
  selector: {matchLabels: {app: jaeger}}
  template:
    metadata: {labels: {app: jaeger}}
    spec:
      containers:
      - name: jaeger
        image: jaegertracing/jaeger:2.22.0
        ports:
        - {containerPort: 4318, name: otlp-http}
        - {containerPort: 16686, name: ui}
---
apiVersion: v1
kind: Service
metadata: {name: jaeger, namespace: observability}
spec:
  selector: {app: jaeger}
  ports:
  - {name: otlp-http, port: 4318, targetPort: 4318}
  - {name: ui, port: 16686, targetPort: 16686}
```

```bash
kubectl apply -f jaeger.yaml
# set OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger.observability:4318 as above, use OpenConsole, then:
kubectl -n observability port-forward svc/jaeger 16686 &
curl -s localhost:16686/api/v3/services
# {"services":["openconsole","jaeger"]}  → open http://localhost:16686, Service: openconsole
```

## Grafana Tempo {#grafana-tempo}

Ucu, OTLP/HTTP alıcısı açık (`distributor.receivers.otlp.protocols.http`) Tempo distributor'ına yönlendirin:

```yaml
- name: OTEL_EXPORTER_OTLP_ENDPOINT
  value: http://tempo-distributor.monitoring:4318
```

Grafana Cloud'da ya da kimlik doğrulama arkasındaki bir Tempo'da header'ı da ekleyin:

```yaml
- name: OTEL_EXPORTER_OTLP_HEADERS
  valueFrom:
    secretKeyRef: {name: openconsole-otlp, key: headers}   # e.g. "Authorization=Basic <base64 user:token>"
```

## Elastic APM {#elastic-apm}

APM Server (ya da Elastic Agent APM entegrasyonu) OTLP/HTTP'yi kendi port'u olan 8200'de kabul eder:

```yaml
- name: OTEL_EXPORTER_OTLP_ENDPOINT
  value: https://apm-server.elastic:8200
- name: OTEL_EXPORTER_OTLP_HEADERS
  valueFrom:
    secretKeyRef: {name: openconsole-otlp, key: headers}   # "Authorization=Bearer <secret token>" or "Authorization=ApiKey <key>"
```

Tempo ve Elastic APM ayarları bu ürünlerin OTLP dokümantasyonuna göre yazıldı, bu sayfa için çalıştırılmadı;
yukarıdaki Jaeger kurulumu çalıştırıldı. OTLP/HTTP kabul eden her alıcı aynı şekilde çalışır.
