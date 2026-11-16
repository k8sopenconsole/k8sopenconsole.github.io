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
  - https://github.com/vurulkan/kubernetes-openconsole//deploy?ref=v2.23.0   # was v2.22.0
images:
  - name: ghcr.io/vurulkan/kubernetes-openconsole
    newTag: "2.23.0"                                                         # was 2.22.0
```

```bash
kubectl diff -k .      # the image tag, plus whatever the release changed in deploy/
kubectl apply -k .
kubectl -n kubernetes-openconsole rollout status deploy/kubernetes-openconsole --timeout=5m
kubectl -n kubernetes-openconsole logs deploy/kubernetes-openconsole | head -3   # "version":"2.23.0"
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
- **Optional**: keep the encryption key in a Secret
  ([Keep the encryption key out of the database](/installation/backup-restore)).

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
