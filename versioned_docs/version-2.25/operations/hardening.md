---
title: "Production hardening checklist"
sidebar_label: "Hardening checklist"
description: "What to set up around OpenConsole before real users and real clusters: access, network, secrets, records."
---

# Production hardening checklist

OpenConsole holds credentials to your clusters and lets people act on them, so treat its pod, its volume and its
admin accounts like those credentials. Go through this list before you hand it to users. Why each item matters is in
the [Security model](/operations/security).

## Cluster access {#cluster-access}

- **The smallest ClusterRole that covers what you grant.** If nobody restarts, scales, edits or opens shells
  through OpenConsole on a cluster, connect it with the view-only ClusterRole
  ([Full or read-only](/installation/connect-cluster#full-or-read-only)). In the full one, drop the Secrets rule if you
  grant no `secrets:*` permission, and its `update` verb if you grant no `secrets:edit`. Uncomment `services/proxy`
  only for Prometheus, and only for your Prometheus Service. OpenConsole doesn't use port-forward, so it needs no
  rule for it. Every rule and what it is for: [Kubernetes permissions](/reference/kubernetes-permissions).
- **Writes only where they are needed**: keep the reads cluster-wide and bind Secrets, shells and write verbs per
  namespace ([Writes in some namespaces only](/installation/connect-cluster#writes-in-some-namespaces-only)).
- **One ServiceAccount per cluster, never a personal kubeconfig**, and a plan to rotate its token, for example every
  6 to 12 months ([Rotate the token](/installation/connect-cluster#rotate-the-token)). Don't keep the generated tokens
  in Git.
- **Protect the OpenConsole namespace in each cluster it runs in.** Whoever may `exec` into the OpenConsole pod,
  read its volume, or read its Secrets in Kubernetes gets every cluster credential OpenConsole holds. Keep those
  Kubernetes permissions to the people who run OpenConsole.

## The deployment {#the-deployment}

- **Pin the release and use `Recreate`** ([Install on Kubernetes](/installation/kubernetes#1-write-a-kustomization)),
  one replica, and verify the image you run ([Verify the image](/installation/verify-image)).
- **Keep the manifest's container settings**: read-only root filesystem with the `/tmp` `emptyDir`, non-root user,
  no capabilities, no ServiceAccount token. The image has no shell; to look inside the pod use an ephemeral
  container (`kubectl debug -it <pod> --image=busybox:1.36 --target=dashboard`).
- **Refuse WebSockets from other sites**: once the log shows no `ws.origin_mismatch` for a while, set
  `WS_ORIGIN_CHECK=enforce`. Leave `ALLOWED_ORIGINS` empty unless another site's page must call the API
  ([Security model](/operations/security#http)).
- **TLS at the Ingress, and nothing else in front of the Service.** OpenConsole speaks plain HTTP. It takes the
  client address for the audit log and the sign-in lock from `X-Forwarded-For` only when the connection comes from a
  proxy in `TRUSTED_PROXIES` (the manifest lists the private networks); set it to your ingress controller's pod
  network, so the only way in is that proxy ([Ingress with TLS](/installation/kubernetes#ingress-with-tls),
  [Environment variables](/reference/environment-variables)).
- **A NetworkPolicy** that lets in only your Ingress controller and your Prometheus. `/metrics` has no sign-in;
  don't route it through the Ingress either. The same policy is
  [`deploy/optional/networkpolicy.yaml`](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.25.0/deploy/optional/networkpolicy.yaml). Change the two namespace names to
  yours:

  ```yaml title="networkpolicy.yaml"
  apiVersion: networking.k8s.io/v1
  kind: NetworkPolicy
  metadata:
    name: kubernetes-openconsole
    namespace: kubernetes-openconsole
  spec:
    podSelector:
      matchLabels:
        app: kubernetes-openconsole
    policyTypes: [Ingress]
    ingress:
      - from:   # your Ingress controller's namespace
          - namespaceSelector:
              matchLabels:
                kubernetes.io/metadata.name: ingress-nginx
        ports:
          - port: 8080
      - from:   # Prometheus, for /metrics
          - namespaceSelector:
              matchLabels:
                kubernetes.io/metadata.name: monitoring
        ports:
          - port: 8080
  ```

  ```bash
  kubectl apply -f networkpolicy.yaml
  # from any other namespace the console is now closed:
  kubectl -n default run nptest --rm -i --restart=Never --image=busybox:1.36 -- \
    wget -q -T 4 -O- http://kubernetes-openconsole.kubernetes-openconsole/readyz
  # wget: can't connect to remote host (10.43.245.184): Connection refused
  ```

  Kubelet probes and `kubectl port-forward` still work. Outgoing traffic is left open: OpenConsole needs your API
  servers, and, if you use them, LDAP, `login.microsoftonline.com` and Prometheus.

## Accounts and access {#accounts-and-access}

- **Change the `admin` password at the first sign-in**, then sign in through LDAP or Azure AD for daily work and
  keep one local admin for emergencies ([First login](/getting-started/first-login)).
- **Two-factor authentication at least for admins**: Admin → Two-factor authentication → *Required for admins* (or *Required for
  everyone*); keep the recovery codes of the break-glass `admin` account offline
  ([Two-factor authentication](../administration/two-factor.mdx)). For Microsoft accounts require
  MFA with Conditional Access in Entra and tick **Require MFA for Azure AD sign-in**
  ([Azure AD](../administration/azure-ad.mdx#require-mfa)).
- **Few admins.** An admin holds every permission on every cluster, including Secrets and shells. Give everyone
  else roles ([Access model](/administration/access-model)).
- **Grant `secrets:reveal`, `secrets:edit` and `pods:exec` narrowly**: per namespace, per cluster, to the roles
  that need them. These are the permissions that show credentials.
- **Switch off what you don't use**, for everyone, with feature flags: `FEATURE_POD_EXEC=false`,
  `FEATURE_SECRET_REVEAL=false`, `FEATURE_API_KEYS=false`, …
  ([Feature flags](/administration/customization-and-flags#feature-flags)).
- **An inactivity timeout** that fits your policy (60 minutes by default; a session ends after 12 hours at the latest), and an **API key expiry policy**: the
  longest lifetime a key may have ([Session lifetime and API key expiry](/administration/sessions#session-lifetime-and-api-key-expiry)).
- **Keep the API access policy at *Safe read-only*** for roles unless agents need more
  ([API access policy](/administration/api-access-policy)).
- **Review access regularly**: Admin → Users / Groups → Export CSV, and Admin → API keys for every key.

## Records {#records}

- **Ship the audit log** to your log platform and keep it as long as you must; the database keeps 30 days
  ([Elastic](/operations/elastic#keep-the-audit-trail-as-long-as-you-need)).
- **Alert** on refused actions, locked sign-ins and revealed secrets ([Metrics and alerts](/operations/metrics#alerts)).
- **Review the `secret.reveal`, `secret.view_yaml`, `secret.apply` and `pod.exec` audit events**: these are the actions
  that can expose credentials ([Audit events](/reference/audit-events)).
- **Keep shell recording on** and set its retention (Admin → Recordings). Recordings contain whatever a shell
  printed; only admins can replay them ([Session recording](/administration/recordings)).

## The volume {#the-volume}

- **Keep the encryption key outside the database** (`ENCRYPTION_KEY_FILE` from a Secret), and keep a copy of the key
  somewhere else ([Backup and restore](/installation/backup-restore#keep-the-encryption-key-out-of-the-database)).
- **Copy the backups off the volume, and protect them like the cluster credentials.** OpenConsole writes one a day to
  `/data/backups`, on the same volume, so they don't survive losing it. Leave `BACKUP_ALLOW_DOWNLOAD` off unless
  you use it ([Backup and restore](/installation/backup-restore)).
- **Encrypt the volume** at the storage layer if your platform offers it (encrypted StorageClass, encrypted
  snapshots).
