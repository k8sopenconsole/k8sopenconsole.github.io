---
title: "Metrikler ve alert'ler"
sidebar_label: "Metrikler"
description: "/metrics'i bir ServiceMonitor ya da pod annotation'larıyla scrape edin; kurmaya değer alert'ler."
---

# Metrikler ve alert'ler

OpenConsole, Prometheus metriklerini HTTP port'unda `GET /metrics` üzerinden sunar (pod'da 8080, Service'te `http`
port'u). Bu uç giriş istemez: cluster'ın içinden scrape edin, Ingress'inizden geçirmeyin. Her metrik, türü ve
label'ları: [Metrikler referansı](/reference/metrics).

```bash
kubectl -n kubernetes-openconsole port-forward svc/kubernetes-openconsole 8080:80 &
curl -s localhost:8080/metrics | grep -v '^#'
```

```text
openconsole_http_requests_total 15
openconsole_http_requests_status_total{status="2xx"} 15
openconsole_http_request_duration_ms_sum 1026
openconsole_http_request_duration_ms_count 15
openconsole_audit_events_total 4
openconsole_pod_exec_sessions_total 0
openconsole_pod_log_streams_total 0
openconsole_deployment_actions_total 0
openconsole_pod_exec_active 0
openconsole_cluster_requests_total{cluster="demo"} 3
openconsole_cluster_connected{cluster="demo"} 1
```

Sayaçlar bellekte tutulur ve pod yeniden başlayınca sıfırdan başlar; `rate()` ve `increase()` bunu hesaba katar.

## Prometheus Operator ile scrape {#scrape-with-the-prometheus-operator}

kube-prometheus-stack ya da başka bir Prometheus Operator kurulumunda bir ServiceMonitor ekleyin. `deploy/`
içindeki Service'in label'ı yoktur, ServiceMonitor ise Service'leri label'a göre seçer; bu yüzden aynı
kustomization'da Service'e bir label verin ([Kubernetes'e kurulum](/installation/kubernetes)):

```yaml title="kustomization.yaml (additions)"
resources:
  - servicemonitor.yaml
patches:
  # The Service has no labels; a ServiceMonitor selects Services by label.
  - patch: |-
      apiVersion: v1
      kind: Service
      metadata:
        name: kubernetes-openconsole
        namespace: kubernetes-openconsole
        labels:
          app: kubernetes-openconsole
```

```yaml title="servicemonitor.yaml"
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: kubernetes-openconsole
  namespace: kubernetes-openconsole
  labels:
    release: kube-prometheus-stack   # the label your Prometheus selects ServiceMonitors by
spec:
  selector:
    matchLabels:
      app: kubernetes-openconsole
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
```

`release: kube-prometheus-stack`, bu release adıyla kurulmuş bir kube-prometheus-stack'in seçtiği label'dır;
sizinkini `kubectl get prometheus -A -o jsonpath='{..serviceMonitorSelector}'` ile kontrol edin. Prometheus'un
ayrıca `kubernetes-openconsole` namespace'ini izlemesi gerekir (`serviceMonitorNamespaceSelector`;
kube-prometheus-stack varsayılan olarak bütün namespace'leri izler). Ardından target, `kubernetes-openconsole`
job'ı olarak görünür:

```bash
kubectl apply -k .
# Prometheus → Status → Targets, or ask it (prometheus-operated is the operator's Service for it):
kubectl -n monitoring port-forward svc/prometheus-operated 9090 &
curl -s 'localhost:9090/api/v1/query?query=openconsole_cluster_connected'
```

```json
{"__name__":"openconsole_cluster_connected","cluster":"demo","container":"dashboard","endpoint":"http",
 "instance":"10.42.0.33:8080","job":"kubernetes-openconsole","namespace":"kubernetes-openconsole",
 "pod":"kubernetes-openconsole-856cdc7c49-t5rbf","service":"kubernetes-openconsole"} 1
```

## Pod annotation'larıyla scrape {#scrape-with-pod-annotations}

Alışılmış "isteyen pod'ları scrape et" job'ına sahip bir Prometheus (prometheus-community Helm chart'ının
`kubernetes-pods` job'ı ve elle yazılmış birçok config) pod'u üç annotation'dan bulur:

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
          metadata:
            annotations:
              prometheus.io/scrape: "true"
              prometheus.io/port: "8080"
              prometheus.io/path: /metrics
```

Prometheus'unuzda böyle bir job yoksa, annotation'ların birlikte çalıştığı job şudur:

```yaml title="prometheus.yml"
scrape_configs:
  - job_name: kubernetes-pods
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: "true"
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
      - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
        action: replace
        regex: ([^:]+)(?::\d+)?;(\d+)
        replacement: $1:$2
        target_label: __address__
      - source_labels: [__meta_kubernetes_namespace]
        target_label: namespace
      - source_labels: [__meta_kubernetes_pod_name]
        target_label: pod
```

Pod annotation'ı pod template'ini değiştirir; bu yüzden uygulamak OpenConsole'u bir kez yeniden başlatır.

## Neyi izlemeli {#what-to-watch}

| Metrik | Size ne söyler |
|---|---|
| OpenConsole target'ının `up`'ı | pod yanıt veriyor |
| `openconsole_cluster_connected{cluster}` | OpenConsole'un cluster önbelleği nesneleri listelemişken ve watch'larından hiçbiri hata vermiyorken `1`. Cluster açılışta, eklenir eklenmez ve kimlik bilgileri değiştirilir değiştirilmez bağlanır. Reddedilen bir token ya da ulaşılamayan bir API server `0` verir (çalışan bir bağlantı bunu watch'ları bir sonraki yenilendiğinde fark eder); ClusterRole'ün izin vermediği tek bir tür ise vermez, yalnızca o sekmede `403` `cluster_forbidden` döner ([Sorun giderme](/operations/troubleshooting#a-cluster-shows-empty-lists-or-503)) |
| `openconsole_http_requests_status_total{status="5xx"}` | hatalı yanıtlar: OpenConsole'u reddeden bir cluster, bir veritabanı sorunu |
| `openconsole_http_request_duration_ms_sum` / `_count` | ortalama istek süresi |
| `openconsole_pod_exec_active` | şu an açık shell'ler |
| `openconsole_cluster_requests_total{cluster}` | insanların hangi cluster'ları kullandığı |
| `openconsole_audit_write_failures_total` | veritabanının reddettiği denetim olayları (dolu ya da kilitli volume); her biri logda ayrıca bir `audit write failed` hata satırıdır. `0` kalmalı |

## Alert'ler {#alerts}

Prometheus Operator için bir PrometheusRule (düz bir Prometheus'ta `groups:` kısmı bir rules dosyasına girer):

```yaml title="prometheusrule.yaml"
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: kubernetes-openconsole
  namespace: kubernetes-openconsole
  labels:
    release: kube-prometheus-stack   # the label your Prometheus selects rules by
spec:
  groups:
    - name: openconsole
      rules:
        - alert: OpenConsoleDown
          expr: up{job="kubernetes-openconsole"} == 0 or absent(up{job="kubernetes-openconsole"})
          for: 5m
          labels: {severity: critical}
          annotations:
            summary: OpenConsole is not answering its /metrics scrape.
        - alert: OpenConsoleClusterNotConnected
          expr: openconsole_cluster_connected == 0
          for: 15m
          labels: {severity: warning}
          annotations:
            summary: "OpenConsole has no connection to cluster {{ $labels.cluster }}."
        - alert: OpenConsoleServerErrors
          expr: increase(openconsole_http_requests_status_total{status="5xx"}[10m]) > 10
          labels: {severity: warning}
          annotations:
            summary: "OpenConsole answered {{ $value | printf \"%.0f\" }} requests with 5xx in 10 minutes."
        - alert: OpenConsoleSlowRequests
          expr: |
            rate(openconsole_http_request_duration_ms_sum[10m])
              / rate(openconsole_http_request_duration_ms_count[10m]) > 1000
          for: 10m
          labels: {severity: warning}
          annotations:
            summary: OpenConsole requests take more than 1 s on average.
        - alert: OpenConsoleAuditWriteFailures
          expr: increase(openconsole_audit_write_failures_total[10m]) > 0
          labels: {severity: critical}
          annotations:
            summary: OpenConsole could not write audit events to its database (full or locked volume).
```

`job` label'ı ServiceMonitor'ınkidir; pod annotation'larıyla `job="kubernetes-pods"` kullanın. Eklendiğinden beri
kimsenin kullanmadığı bir cluster, `OpenConsoleClusterNotConnected`'ı pending'de tutar; bir cluster ekledikten
sonra onu bir kez seçin ya da OpenConsole'u yeniden başlatın.

Bazı şeyler metrik değil, denetim olayıdır. Bunlar için log platformunuzda alert kurun
([Elastic](/operations/elastic#questions-the-audit-log-answers)); örneğin audit data view'ı üzerinde bir Kibana
rule'u olarak:

| Alert | Sorgu (`logs-openconsole.audit-*`) |
|---|---|
| 5 yanlış şifreden sonra bir giriş kilitlendi | `openconsole.outcome : "locked"` |
| Biri shell limitine takıldı | `event.action : "pod.exec" and openconsole.outcome : "rate_limited"` |
| Bir Secret gösterildi | `event.action : "secret.reveal" and event.outcome : "success"` |
| Bir kullanıcı için tekrarlanan retler | `openconsole.outcome : "denied"`, `user.name`'e göre gruplanmış |
