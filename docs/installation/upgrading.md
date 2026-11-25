---
title: "Upgrading"
description: "How to move to a new release, what happens to the database, and how to go back."
---

# Upgrading

## Before you start {#before-you-start}

1. **Read the release notes of every version between yours and the new one** ([Release notes](/release-notes)).
   The version-specific steps are also [below](#version-notes). Your version: hover the GitHub icon at the bottom of the left
   rail, or read the first log line of the pod (`"version":"…"`).
2. **Back up the volume** ([Backup and restore](/installation/backup-restore)). It is the only way back to the
   exact state before the upgrade. From 2.23.1 on, OpenConsole also copies the database to
   `/data/backups/app-<time>-pre-upgrade.db` before a new version changes it, but that copy is on the same volume.
3. Make sure the Deployment uses `strategy: Recreate` ([Install on Kubernetes](/installation/kubernetes)). With
   the default rolling update the new pod opens the database while the old one still runs; on 2.23.0 that can
   lose writes until the next restart.

You can skip versions: going from 2.21.0 to 2.22.0 or from 2.16 to 2.22 is one step. Each release brings its
database changes along and applies the missing ones on start.

## Upgrade {#upgrade}

Change the version in both places of your `kustomization.yaml` and apply it:

```yaml title="kustomization.yaml"
resources:
  - https://github.com/vurulkan/kubernetes-openconsole//deploy?ref=v2.26.0   # was v2.25.0
images:
  - name: ghcr.io/vurulkan/kubernetes-openconsole
    newTag: "2.26.0"                                                         # was 2.25.0
```

```bash
kubectl diff -k .      # the image tag, plus whatever the release changed in deploy/
kubectl apply -k .
kubectl -n kubernetes-openconsole rollout status deploy/kubernetes-openconsole --timeout=5m
kubectl -n kubernetes-openconsole logs deploy/kubernetes-openconsole | head -3   # "version":"2.26.0"
```

Sessions stay valid, so signed-in users carry on after a page reload. With `Recreate` the console is unavailable
for the few seconds the new pod needs to start.

**If you run the manifests unpinned** (`:latest` with `imagePullPolicy: Always`, as in `deploy/`), a
`kubectl -n kubernetes-openconsole rollout restart deploy/kubernetes-openconsole` pulls the newest release. The
manifests themselves (ClusterRole rules, new variables) are only updated when you apply the new `deploy/` again.

**The ClusterRole** may gain rules in a release (e.g. `nodes` `watch` in 2.20). It comes with `deploy/` in the
cluster OpenConsole runs in; on every other connected cluster apply the new `rbac.yaml` yourself
([Connect a cluster](/installation/connect-cluster#1-create-the-serviceaccount)).

## What happens to the database {#what-happens-to-the-database}

- Migrations run automatically on the first start of the new version: they add tables and columns, and some
  releases rewrite existing rows once (2.17 gave old audit rows the new action / outcome fields). There is no step
  to run by hand.
- From 2.23.1 the migration runs in one transaction: if it fails (a full disk, a damaged file), the pod stops with
  the error in its log and the database stays as it was.
- There are no down-migrations. Going back to an older version is not supported. In practice the older version
  usually starts on the newer database because the changes only add (checked: 2.21.0 on a 2.22.0 database), but
  data the newer version wrote can be ignored or misread.

## Going back {#going-back}

1. Set the previous version in `kustomization.yaml` and `kubectl apply -k .`.
2. If the older version misbehaves on the newer database, [restore the backup](/installation/backup-restore#restore)
   you took before the upgrade. Everything since the backup (audit events, users, settings) is lost.

## Version notes {#version-notes}

### Upgrading to 2.26 {#upgrading-to-226}

- No database change, no new environment variable, no new ClusterRole rule: only the image changes. Going back to
  2.25 works with the same database.
- The Secrets list (`GET /api/namespaces/{namespace}/secrets`) now reads Helm release Secrets
  (`helm.sh/release.v1`) as metadata only: their key `release` comes **without `size`**. One Secret's read
  (`GET …/secrets/{name}`) still has it. Update automation that reads the size from the list.
- New: `GET /api/search` (the `⌘K` resource search; [Find a resource](/user-guide/keyboard-shortcuts#find-a-resource)).
  It needs no new permission.

### Upgrading to 2.25 {#upgrading-to-225}

- **API key lifetime is required.** The longest lifetime (Admin → Session → API key expiry) is now 1 to 3650 days.
  The first start sets an empty (unlimited) limit to **365** and a longer one to 3650; existing keys are not touched.
  `PUT /api/admin/session` answers 400 `invalid_input` for `apiKeyMaxDays` 0 or above 3650: update automation that
  sends 0.
- **Cluster order**: the first start numbers the clusters in the order they are shown today (default first, then by
  name), so nothing moves; from then on Admin → Clusters sets it ([Clusters](../administration/clusters.mdx#the-order-of-the-clusters)).
- **Azure AD directory search** is off. To use it, give the app registration the Microsoft Graph Application
  permission `User.Read.All` with admin consent ([Azure AD](../administration/azure-ad.mdx#directory-search)). Azure AD
  sign-in now finds an account by its Entra object ID first.
- The first start adds columns to `clusters` and `azure_ad_config`; no step by hand. No new environment variable.
- Going back to 2.24 works with the same database: the clusters are then listed default first, then by name, and the
  365-day limit stays.

### Upgrading to 2.24 {#upgrading-to-224}

- **Two-factor authentication** for local and LDAP accounts, and **Require MFA for Azure AD sign-in**. Both are off
  after the upgrade: the policy starts at *Off*, so sign-in works exactly as before until an admin changes it
  ([Two-factor authentication](../administration/two-factor.mdx),
  [Azure AD](../administration/azure-ad.mdx#require-mfa)).
- The first start adds columns to `users`, `session_settings` and `azure_ad_config` and a `recovery_codes` table; no
  step by hand. The authenticator keys are encrypted like the other stored credentials (with `ENCRYPTION_KEY_FILE`
  when you use it).
- New environment variable `TWO_FACTOR_RESET_USER`, for an admin locked out of two-factor authentication
  ([Troubleshooting](/operations/troubleshooting#sign-in-fails)); leave it unset.
- The API only grows: `POST /api/auth/login` answers as before while two-factor authentication is off for the
  account; with it on, it answers `{"twoFactor": "verify", "challenge": "…"}` and the session comes from
  `POST /api/auth/2fa/verify`. API keys are not affected.

### Upgrading to 2.23.4 {#upgrading-to-2234}

- Replace the image: no change to the API's paths, the database or the manifests. Rolling back to 2.23.3 works.
- **Events follow the object live** in the pod and workload drawers and behind a row's **Events** button, which now
  shows the same list instead of raw JSON ([Detail drawers](/user-guide/detail-drawers#events)). `/ws/events` frames
  of Kubernetes events carry `count`.

### Upgrading to 2.23.3 {#upgrading-to-2233}

- Replace the image: no change to the API, the database or the manifests. The **Logs** buttons have their own icon
  (a page of text) instead of the terminal that **Shell** uses.

### Upgrading to 2.23.2 {#upgrading-to-2232}

- Replace the image: no change to the API, the database or the manifests. Rolling back to 2.23.1 works.
- **Dates** are written the same way everywhere, whatever the browser's language and region: `2026-11-16 23:37:51`
  (24 h) in the browser's time zone; audit log times keep `TIMEZONE`.
- **Audit**, with `WS_ORIGIN_CHECK=enforce`: a log socket from another site is no longer audited as `pod.logs`
  `success`; a shell from another site is `pod.exec` `denied`, reason `origin_not_allowed`, and leaves no recording.
- **Tables**: the action buttons and the column picker stay at the right edge of a wide table.

### Upgrading to 2.23.1 {#upgrading-to-2231}

- **Your own manifest**: the image is now distroless, and `deploy/deployment.yaml` sets
  `readOnlyRootFilesystem: true` with an `emptyDir` at `/tmp`. If you copy those settings, add the `/tmp` volume
  too: it is the only place besides `/data` where the server may write a temporary file.
- **No shell in the image**: `kubectl exec` into the OpenConsole pod no longer works; use
  `kubectl debug -it <pod> --image=busybox:1.36 --target=dashboard`.
- **Cross-site requests**: the API no longer answers CORS for any origin; list other sites in `ALLOWED_ORIGINS` if
  their pages call it. WebSockets from another site are logged as `ws.origin_mismatch` (still allowed with the
  default `WS_ORIGIN_CHECK=warn`).
- **The YAML editor** comes with the image; the browser no longer loads it from `cdn.jsdelivr.net`.
- **Your own manifest**: use `strategy: Recreate` and `terminationGracePeriodSeconds: 30`, as `deploy/` now does.
  On shutdown open shells close with code 1012 (*server restarting*) and their end and recording are audited.
- **Database**: the first start copies it to `/data/backups/app-<time>-pre-upgrade.db`. Group memberships and role
  permissions get foreign keys: rows left behind by users, groups and roles deleted earlier are dropped, and an id
  that doesn't exist is refused (`400` / `404`) instead of being stored.
- **Backups**: a copy of the database every day, the newest 7 kept in `/data/backups` (Admin → Backups). Check the
  free space on the volume: about 7 times the database size.
- **`LOG_RETENTION_DAYS=0`** now keeps audit events forever (it used to mean 30), and the purge also runs at start.
- **Audit Logs**: a page has at most 500 rows; **Export CSV** now has every matching row up to 50 000 (it stopped at
  1 000).
- **API error answers**: every error is now problem details (`application/problem+json`): `{"type", "title",
  "status", "error", "detail"}`. `error` is always a reason code; a message that used to be the whole `error` (for
  example `cluster "nope" is unknown or not yours to use`) is now in `detail`, under a code such as `invalid_input`.
  `401` and `429` have a body too (`unauthorized`, `api_key_expired`, `api_key_revoked`, `rate_limited` with
  `Retry-After: 1`), and the API key page of an account that must change its password answers
  `password_change_required`. A script that compares `error` with an English sentence must switch to the code
  ([Errors](/api/quick-start#errors)).
- **Unknown API paths**: an unknown `/api/…` or `/ws/…` path answers `404` `not_found` (it used to answer `200` with
  the web UI's page), a wrong method `405` with `Allow`. `GET` / `POST` / `PUT /api/admin/cluster` and
  `POST /api/admin/cluster/validate` are removed: use `/api/admin/clusters`.
- **Audit volume**: every admin change on users, groups, roles and the sign-in, session and logo settings is audited
  for every answer, refusals and failures included, and every YAML view is a `<kind>.get` read
  ([Audit log](/administration/audit-log)).
- **Logs**: WebSocket request lines say `status=101`; with tracing on, `tracing enabled` follows `LOG_FORMAT`; a
  failed LDAP sign-in writes `ldap sign-in failed` with the directory's message ([Logging](/operations/logging)).
- **Kubeconfig clusters**: a kubeconfig that runs a program (`exec`, e.g. kubelogin), uses an `auth-provider` or
  reads a file is refused (`kubeconfig_unsupported`), and a cluster saved with one no longer connects. Before
  upgrading, check Admin → Clusters and replace such a kubeconfig with a token or an inline one
  ([Kubeconfig method](/installation/connect-cluster#kubeconfig-method)).
- **Your own manifest**: set `TRUSTED_PROXIES` to the network of the proxies in front of the console
  (`deploy/deployment.yaml` sets the private ranges). Without it no `X-Forwarded-For` is believed: the audit log,
  Admin → Sessions and the sign-in lock see the ingress pod's address instead of the user's
  ([Install on Kubernetes](/installation/kubernetes)).
- **LDAP**: a local account (the built-in `admin` included) whose password doesn't match is no longer tried against
  the directory. *User base DNs* takes one DN per line: a value that lists several DNs separated by commas is read as
  one DN, so put each on its own line. StartTLS checks the directory's certificate; paste your CA in **CA
  certificate (PEM)** ([LDAP](/administration/ldap)).
- **Session timeout**: the minutes in Admin → Session are now the time without activity, and a session ends at the
  latest 12 hours after sign-in; review a long value that was meant as a fixed lifetime
  ([Sessions](/administration/sessions)).
- **`openconsole_cluster_connected`** is now `0` for a cluster whose credentials are refused or that can't be
  reached, so an alert on it may fire after the upgrade: fix that cluster's credentials ([Metrics](/operations/metrics)).
- **Logs over the API**: when Kubernetes refuses OpenConsole's own account, `GET …/pods/{name}/logs` answers `403`
  `cluster_forbidden` (it was `502` `forbidden`). A change to the cluster refused because the request itself is wrong
  is audited as `failed`, reason `invalid`.
- **Name**: the product is now called **OpenConsole for Kubernetes**. The image, the repository, the namespace and
  the manifests keep their names.
- **Optional**: keep the encryption key in a Secret
  ([Keep the encryption key out of the database](/installation/backup-restore#keep-the-encryption-key-out-of-the-database)).

### Upgrading to 2.22 {#upgrading-to-222}

- **Elastic**: re-run [`deploy/elk/install.sh`](https://github.com/vurulkan/kubernetes-openconsole/blob/main/deploy/elk/README.md) once: it adds the mapping of `openconsole.api_key.id` / `.name`, `openconsole.admin_scope`, `openconsole.expires_at`, `openconsole.api_access`, `openconsole.by_admin`, `openconsole.comment`, `openconsole.mode`, `openconsole.program` and `openconsole.recording_id` (the pipeline is unchanged). If you don't, nothing is lost: the fields are mapped dynamically, and get the right type from the next rollover after you run it.
- **Database**: new tables and columns are added on the first start; nothing to do.
- **Elasticsearch 8.7** (no `reroute`, so no `install.sh`): see `deploy/elk/README.md` → *Elasticsearch 8.7 and older* for the same steps by hand, an ILM policy, and adding the new fields to the live index.
- **Logs**: `http.request` lines now carry `openconsole.api_key.id` / `.name` for requests made with a key (also refused ones); `openconsole.api_key.id : *` separates API from web in the application log as in the audit log.
- **403 bodies** name the reason (`{"error": "forbidden"}`, `api_key_not_allowed`, `admin_only`, `feature_disabled`, `api_access_policy`, `api_access_off`) instead of a sentence or an empty body; the audit CSV gains a last column `api_key_name`.
- **API key policy**: every existing role starts at **Safe read-only** API access, so keys made before the upgrade lose exec, edit, scale, restart, ConfigMaps and Secrets until an admin opens a role (Admin → Roles → *API access*). The keys themselves are not changed: they work as before once the policy allows it.

### Upgrading from 2.16 {#upgrading-from-216}

Before 2.17 the outcome was part of the action (`deployment.restart.success`), reads were a bare verb (`list` with `resource_type: deployments`) and details sat in the resource name (`boh (restartedAt=…)`).

- **Database**: on the first start of 2.17 the existing audit rows get the new `action`, `verb`, `outcome` and a singular `resource_type`. Their resource names keep the old `(k=v)` suffix; with the default 30-day retention those rows age out on their own.
- **API**: `?action=deployment.restart.success` still works; the outcome is split off.
- **Elastic**: re-run `deploy/elk/install.sh`. The new mapping applies from the next rollover of `logs-openconsole.audit-*` (`POST logs-openconsole.audit-default/_rollover` to apply it now). The pipeline gives 2.16 lines the 2.17 shape (action without the outcome, `openconsole.verb`, `openconsole.outcome`, `event.type`), so one query finds old and new events. Saved searches, visualizations and alerts that filter on `event.action : *.success` / `*.denied` must be changed to `event.action` + `event.outcome` (or `openconsole.outcome`).
- **Console**: the extra `deployment.action`, `workload.action`, `secret.action`, `yaml.apply`, `recording.action`, `pod.exec.start` / `pod.exec.end`, `*.logs.start`, `user.password_reset` and `user.auto_provision` lines are gone, and so are the `level=error` lines `deployment.restart.failed`, `deployment.scale.failed`, `statefulset.scale.failed` and `<resource>.apply.failed`; the `audit` line has all their fields. A failed action is `event.outcome : "failure"` with `event.reason` and `error.message`. `level=error` is left for faults in OpenConsole itself (e.g. `http.panic`).

### Upgrading from older versions {#upgrading-from-older-versions}

- **Before 2.13**: accounts created then show the source **Local** in Admin → Users. LDAP accounts switch to LDAP on
  their next directory sign-in; to fix the sources up front, follow the procedure in the
  [2.22.0 README](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.22.0/README.md#users).
- **Before 2.3**: session tokens issued by the old version are honoured until they expire, so an upgrade
  doesn't sign anyone out.
