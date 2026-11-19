---
title: "Install on Kubernetes"
description: "Deploy OpenConsole with kustomize: pinned version, one replica, volume, Service, Ingress with TLS."
---

# Install on Kubernetes

OpenConsole is one Deployment with one pod, a 5 GiB volume and a ClusterIP Service. The manifests are in the
[`deploy/`](https://github.com/vurulkan/kubernetes-openconsole/tree/main/deploy) folder of the code repository;
you apply them with kustomize, which is built into `kubectl`.

## 1. Write a kustomization {#1-write-a-kustomization}

Create a folder (keep it in Git) with this `kustomization.yaml`:

```yaml title="kustomization.yaml"
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  # the manifests of one release
  - https://github.com/vurulkan/kubernetes-openconsole//deploy?ref=v2.24.0
images:
  # the image of the same release
  - name: ghcr.io/vurulkan/kubernetes-openconsole
    newTag: "2.24.0"
patches:
  - patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: kubernetes-openconsole
        namespace: kubernetes-openconsole
      spec:
        # Stop the old pod before the new one starts: SQLite must never be
        # opened by two pods at once (upgrades, rollout restart).
        strategy:
          type: Recreate
          rollingUpdate: null
        template:
          spec:
            containers:
              - name: dashboard
                imagePullPolicy: IfNotPresent
                env:
                  # the time zone of audit timestamps in the UI (the manifest says Europe/Istanbul)
                  - name: TIMEZONE
                    value: UTC
```

- The `?ref=` resource is fetched with `git`, so the machine running `kubectl` needs `git` and access to GitHub.
- **Pin the release** in both places (`ref=v2.24.0` and `newTag`). Without the `images:` override the manifest runs
  `:latest`, and a pod restart could then upgrade you without notice.
- **`Recreate`** is important. With the default rolling update the new pod starts while the old one still holds
  the database; on 2.23.0 that can lose the writes made after the overlap until the next restart. Upgrades and
  `rollout restart` then have a few seconds of downtime while the new pod starts. From 2.23.1 the
  manifest itself uses `Recreate`; the patch then changes nothing.
- Add other variables to the same `env:` list (see [below](#settings-you-may-want-to-change)).

## 2. Apply it {#2-apply-it}

```bash
kubectl apply -k .
kubectl -n kubernetes-openconsole rollout status deploy/kubernetes-openconsole --timeout=5m
```

What gets created, all in namespace `kubernetes-openconsole` (`deploy/elk/` is optional and not applied by
kustomize; see [Elastic](/operations/elastic)):

| Object | What |
|---|---|
| Namespace `kubernetes-openconsole` | |
| Deployment `kubernetes-openconsole` | 1 replica, non-root (uid 65532), `seccompProfile: RuntimeDefault`, all capabilities dropped, **no ServiceAccount token mounted**: the app never uses the pod's own identity. Probes on `/livez` and `/readyz` |
| PersistentVolumeClaim `kubernetes-openconsole-data` | 5 GiB, ReadWriteOnce, the cluster's default StorageClass, mounted at `/data`: the SQLite database `app.db` and shell recordings |
| Service `kubernetes-openconsole` | ClusterIP, port 80 → container port 8080 |
| ServiceAccount `openconsole-reader`, Secret `openconsole-reader-token` | the identity OpenConsole reads this cluster with: you paste its token into the UI ([Connect a cluster](/installation/connect-cluster)) |
| ClusterRole `openconsole-readonly` + ClusterRoleBinding | what that identity may do (despite the name, it includes the write verbs; see [Connect a cluster](/installation/connect-cluster#what-each-clusterrole-rule-is-for)) |

To install without the ServiceAccount and ClusterRole (you connect every cluster with a kubeconfig of your own), list
the files instead of the folder:

```yaml
resources:
  - https://raw.githubusercontent.com/vurulkan/kubernetes-openconsole/v2.24.0/deploy/namespace.yaml
  - https://raw.githubusercontent.com/vurulkan/kubernetes-openconsole/v2.24.0/deploy/pvc.yaml
  - https://raw.githubusercontent.com/vurulkan/kubernetes-openconsole/v2.24.0/deploy/service.yaml
  - https://raw.githubusercontent.com/vurulkan/kubernetes-openconsole/v2.24.0/deploy/deployment.yaml
```

For a [read-only](/installation/connect-cluster#full-or-read-only) console, list the files the same way and add
`https://raw.githubusercontent.com/vurulkan/kubernetes-openconsole/v2.24.0/deploy/rbac-readonly.yaml`. Installed with
the folder, every `kubectl apply -k` would put the full `rbac.yaml` back.

## Why exactly one replica {#why-exactly-one-replica}

The database is a SQLite file on a ReadWriteOnce volume. A second pod would either not start (the volume is
attached to another node) or open the same file next to the first one, which loses or corrupts writes. Don't
scale the Deployment and don't add an HPA. One pod serves a large team: lists come from an in-memory cache, not
from the API server.

## Resources {#resources}

The manifest requests `300m` CPU and `384Mi` memory and limits them to `1` CPU and `1Gi`. Memory grows with the
number of pods, Deployments, Services, … in the connected clusters, since OpenConsole keeps them in memory, plus
about 10 KB per pod for 24 hours of usage samples. The cache leaves out what OpenConsole never reads from it
(`managedFields` and the `last-applied-configuration` annotation, often half of an object), but ConfigMaps are kept
with their data. With several large clusters, watch the pod's memory (`kubectl top pod`) after connecting them, and
if the pod is OOMKilled, raise the memory limit first.

The volume holds the database (small: users, roles, the audit log for `LOG_RETENTION_DAYS`), up to 7 copies of it in
`/data/backups` ([Backup and restore](/installation/backup-restore)) and shell recordings, which are capped at 2 GiB
by default (Admin → Recordings). 5 GiB is enough for most installations; with a large audit log, count the database
size times 8.

## Settings you may want to change {#settings-you-may-want-to-change}

Everything else is configured in the UI and stored in the database. These are read from the environment on start:

| Variable | Default | Meaning |
|---|---|---|
| `TIMEZONE` | `UTC` (the manifest sets `Europe/Istanbul`) | time zone of audit timestamps in the UI; stored times are UTC. Other times are in the browser's time zone; every date is written `2026-11-16 23:37:51` |
| `LOG_RETENTION_DAYS` | `30` | days audit events are kept in the database; `0` keeps them forever (before 2.23.1 it meant 30) |
| `BACKUP_ALLOW_DOWNLOAD` | `false` | `true` lets admins download the backups in Admin → Backups |
| `BACKUP_INTERVAL` / `BACKUP_KEEP` | `24h` / `7` | how often the database is copied to `/data/backups` (`0` = no scheduled copy) and how many copies are kept ([Backup and restore](/installation/backup-restore)) |
| `ENCRYPTION_KEY_FILE` | empty (the key is in the database) | file with the key that encrypts the stored credentials, from a Secret ([Keep the encryption key out of the database](/installation/backup-restore)) |
| `RESTART_HISTORY_RETENTION_DAYS` | `30` | container exits kept for the restart history |
| `API_KEY_READ_RETENTION_DAYS` | `7` | successful reads made with an API key |
| `APP_ENV` | (the manifest sets `prod`) | environment label on every log line and trace |
| `LOG_FORMAT` | `text` (the manifest sets `ecs`) | `ecs` for Elastic, `json`, or `text` |
| `DATA_PATH` | `/data/app.db` | the database file; must be on the volume |
| `ALLOWED_ORIGINS` | empty | other sites whose pages may call the API from a browser (CORS), e.g. `https://tools.example.com`; the console itself needs nothing here |
| `WS_ORIGIN_CHECK` | `warn` | a WebSocket opened from another site's page: `warn` logs `ws.origin_mismatch`, `enforce` refuses it |
| `TRUSTED_PROXIES` | empty (the manifest sets `10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7`) | proxies whose `X-Forwarded-For` gives the client address in the audit, sessions and sign-in lock; narrow it to your ingress controller's pod network |

The full list, including feature flags and limits: [Environment variables](/reference/environment-variables).

## Ingress with TLS {#ingress-with-tls}

The Service is ClusterIP; put your Ingress or Gateway in front of it. OpenConsole needs nothing special from it
except WebSockets (logs, shell, live events), which every common controller passes through. Example for a
certificate in a Secret (or let cert-manager create it):

```yaml title="ingress.yaml"
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: kubernetes-openconsole
  namespace: kubernetes-openconsole
spec:
  ingressClassName: nginx            # your Ingress class
  tls:
    - hosts: [openconsole.example.com]
      secretName: openconsole-tls    # kubernetes.io/tls Secret in this namespace
  rules:
    - host: openconsole.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: kubernetes-openconsole
                port:
                  name: http
```

```bash
kubectl -n kubernetes-openconsole create secret tls openconsole-tls --cert=tls.crt --key=tls.key
kubectl apply -f ingress.yaml
```

OpenConsole pings every open WebSocket (shell, live log, Live Events) every 25 seconds, so ingress-nginx's 60-second
idle timeout doesn't close a shell that waits for input or the log of a quiet container. A proxy that doesn't count
pings as traffic needs a longer idle timeout; for ingress-nginx that would be (optional):

```yaml
metadata:
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
```

If shells still close after a minute or so behind another proxy (e.g. an Azure Application Gateway or AWS load
balancer in front of the Ingress), set its idle timeout above the shell idle timeout, `EXEC_IDLE_TIMEOUT` (5 minutes).

Don't route `/metrics` from outside: it is unauthenticated, for your Prometheus inside the cluster
([Metrics](/operations/metrics)).

## Next {#next}

1. [Connect a cluster](/installation/connect-cluster): this one (the ServiceAccount is already there) and any others.
2. [First login](/getting-started/first-login): change the admin password, set up users and roles.
3. [Back up](/installation/backup-restore) the volume before your first [upgrade](/installation/upgrading).
