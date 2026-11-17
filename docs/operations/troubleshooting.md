---
title: "Troubleshooting"
description: "Find your symptom by the message OpenConsole shows or logs, and what to do about it. Includes every 403 reason."
---

# Troubleshooting

Search this page for the message you see. Messages in `code` are exactly what OpenConsole 2.23.4 shows, answers or
logs. The log lines are in `kubectl -n kubernetes-openconsole logs deploy/kubernetes-openconsole`
([Logging](/operations/logging)).

## Adding a cluster fails {#adding-a-cluster-fails}

**Save Cluster** answers *The cluster refused the credentials or could not be reached.* with the cause in parentheses:
`(cannot list namespaces with these credentials: …)` (the API answers `400` `cluster_invalid` with that `detail`).
The end of the message says why:

| Message ends with | Cause | Fix |
|---|---|---|
| `context deadline exceeded` | the API server address doesn't answer from the OpenConsole pod (wrong address, firewall, private endpoint) | test from the pod's network; for the cluster OpenConsole runs in, use `https://kubernetes.default.svc` |
| `dial tcp: lookup <host> on …: no such host` | the host name doesn't resolve inside the cluster | use a name or IP the pod can resolve |
| `tls: failed to verify certificate: x509: certificate signed by unknown authority` | the CA certificate is missing or wrong | paste the cluster's CA (base64) ([Connect a cluster](/installation/connect-cluster#2-read-the-token-and-ca)) |
| `Unauthorized` | the token is wrong, expired, or its ServiceAccount was deleted | read the token again |
| `namespaces is forbidden: User "system:serviceaccount:…" cannot list resource "namespaces" …` | the identity has no ClusterRole binding (or not this one) | apply `deploy/rbac.yaml` and bind it to that identity |

## A cluster shows errors instead of lists {#a-cluster-shows-empty-lists-or-503}

The cluster was added fine, but now its screens say *The cluster cannot be reached, or it refused OpenConsole's
credentials* or *OpenConsole's account on this cluster may not read this (check its ClusterRole)*, and the log is full of:

```text
…/reflector.go:229: Failed to watch *v1.Pod: failed to list *v1.Pod: Unauthorized
…/reflector.go:229: Failed to watch *v1.Job: failed to list *v1.Job: jobs.batch is forbidden: User "system:serviceaccount:default:temp" cannot list resource "jobs" in API group "batch" at the cluster scope
```

and of `cluster read failed` lines naming the resource, the cluster and the request id. Requests answer
`502` `cluster_unreachable`, or `403` `cluster_forbidden` (the body's `error`).

The credentials OpenConsole holds for that cluster stopped working: the token was rotated or its ServiceAccount
deleted (`Unauthorized`), or the ClusterRole or its binding changed (`forbidden`). For `Unauthorized` the cluster's
connection gauge reads `0` ([Metrics](/operations/metrics#what-to-watch)), and picking the cluster in the header fails
with *The cluster cannot be reached, or it refused OpenConsole's credentials. (cannot connect to cluster: Unauthorized)*. Fix the identity, then in **Admin → Clusters → Edit**
tick **Replace credentials** and paste the token and the CA ([Rotate the token](/installation/connect-cluster#rotate-the-token)).
The cluster works again at once; no restart is needed.

`403` `cluster_forbidden` alone, on one tab (say Ingresses), means only that rule is missing
([Kubernetes permissions](/reference/kubernetes-permissions)); the other tabs and the gauge are unaffected.
A cluster that answers too slowly gives `504` `cluster_timeout`.
A write the ClusterRole doesn't allow answers `403` `cluster_forbidden` with the API server's message as `detail`, e.g.
`restart failed: deployments.apps "web" is forbidden: …` (a view-only ClusterRole, or the `patch` / `update` verb
removed).

## No CPU or memory figures {#no-cpu-or-memory-figures}

| Message | Cause |
|---|---|
| `metrics-server was not found on this cluster; CPU and memory usage are not shown.` | install metrics-server (`kubectl get apiservices v1beta1.metrics.k8s.io` should say `True`) |
| `The OpenConsole ServiceAccount may not read metrics.k8s.io pods (check the ClusterRole).` | add the `metrics.k8s.io` rule of `deploy/rbac.yaml` |
| `Pod metrics could not be read from this cluster.` | metrics-server answered with an error; see its own log |
| `Prometheus is unreachable; showing the last 24 hours from memory` | the cluster's Prometheus setting doesn't answer; use **Test connection** below |
| `No samples yet; the first arrive within 30 seconds.` | OpenConsole just started or the cluster was just connected; wait |

## Prometheus "Test connection" fails {#prometheus-test-connection-fails}

Admin → Clusters → Prometheus → **Test connection** stops at the first failing step and says why:

| Message | Fix |
|---|---|
| `The settings are incomplete or invalid.` | fill in namespace, Service and port, or a URL starting with `http(s)://` |
| `The OpenConsole ServiceAccount may not use services/proxy on this Service; add the rule from deploy/rbac.yaml.` | uncomment the `services/proxy` rule, with your Prometheus Service in `resourceNames` |
| `The Service or its port was not found, or it has no ready endpoints.` | check the namespace, Service name and port (**Find** lists candidates) |
| `Prometheus refused the credentials (401 / 403).` | check the user / password, token, or client certificate |
| `The address answered, but not with the Prometheus API. Check the URL / port and the path prefix.` | point at the Prometheus HTTP API, including a path prefix if it has one |
| `The host name could not be resolved.` | the URL's host doesn't resolve from the OpenConsole pod |
| `TLS failed: check the CA certificate, or skip verification for a test.` | add the CA certificate |
| `No answer in time.` / `The address could not be reached.` | firewall, NetworkPolicy, wrong port |
| `Connected, but there are no container metrics for this cluster: cAdvisor may not be scraped, or the cluster filter is wrong.` | scrape the kubelet's cAdvisor endpoint, or fix the cluster label value |
| `This Prometheus holds several clusters (…); pick the value for this one, or the charts add them up.` | set the cluster label and this cluster's value |

More: [Prometheus](/administration/prometheus).

## Sign-in fails {#sign-in-fails}

| Symptom | Where to look |
|---|---|
| `Login failed. Please check your credentials.` | Admin → Audit Logs, action `user.login`, outcome `failed`. The reason says which: `bad_password` (wrong password; also an LDAP account whose directory bind failed), `unknown_user` (no such account, or deactivated), `azure_account` (an Azure AD account typed a password: use **Sign in with Microsoft**). A local account never signs in with a directory password: an LDAP user whose account shows source *Local* gets `bad_password` ([LDAP](/administration/ldap#signing-in)) |
| the same message after 5 tries, and `429` `rate_limited` with `Retry-After` from `/api/auth/login` | that user name is locked for 5 minutes from that address, audited as `user.login` `locked` (`too_many_failures`); after 20 failures from any addresses, the name is locked everywhere for 5 minutes. Wait, or sign in from another machine |
| everyone's sign-ins and sessions show the same address (the ingress pod's), and one person's typos lock others out | `TRUSTED_PROXIES` doesn't cover your ingress, so `X-Forwarded-For` isn't read: set it to the ingress controller's pod network ([Environment variables](/reference/environment-variables)) |
| **Sign in with Microsoft** answers `403` `sign_in_failed` with the detail `this account can't sign in with this Microsoft account` | `user.login` `failed` with reason `not_azure_account` (a local or LDAP account has that name), `azure_oid_mismatch` (the account belongs to another Entra user, e.g. one deleted and re-created) or `azure_no_oid` ([Azure AD](/administration/azure-ad#how-the-account-is-found)) |
| `Your session has ended. Please sign in again.` | no activity for the inactivity time (Admin → Sessions, 60 minutes by default), 12 hours since sign-in, or an admin revoked it |

The audit reason doesn't say why an LDAP bind failed; the pod log does. Every failed LDAP sign-in (the first one,
which would create the account, too) writes a line `ldap sign-in failed` with the user name, the directory's message
(`error`) and the request id of the sign-in: level `INFO` for a wrong password
(`LDAP Result Code 49 "Invalid Credentials"`), `WARN` for anything else:

```text
level=WARN msg="ldap sign-in failed" service=openconsole version=dev user=ghost error="LDAP Result Code 200 \"Network Error\": dial tcp 127.0.0.1:1: connect: connection refused" request_id=_Ehr0EXS3V9EnInT
```

To check the directory without anyone signing in, use **Admin → LDAP → Test connection**; on a failure it shows
*The connection test failed.* with the same client message in parentheses, for example:

```text
LDAP Result Code 200 "Network Error": dial tcp 127.0.0.1:389: connect: connection refused
LDAP Result Code 200 "Network Error": dial tcp: lookup ldap.example.invalid on 10.43.0.10:53: no such host
```

`connection refused` / `no such host` are the host and port; `Invalid Credentials` is the bind DN or password; a
certificate error is the TLS settings.

## Shells or live logs break behind a proxy {#shells-or-live-logs-break-behind-a-proxy}

| Symptom | Cause | Fix |
|---|---|---|
| the shell says `Connection error.` or `Session closed (1006).` at once; the log has `GET /ws/namespaces/…/exec 400`, the answer is `400` `invalid_input` with the detail `a WebSocket upgrade is required` | the proxy drops the `Upgrade` / `Connection` headers | pass WebSockets through (ingress-nginx, Traefik and the Gateway API do by default; a hand-written nginx needs `proxy_http_version 1.1` and both headers) |
| a quiet shell closes after about a minute with `Session closed (1006).`; a quiet log stream shows `Connection dropped; reconnecting…` | the proxy's idle timeout, and the proxy doesn't count WebSocket pings as traffic (OpenConsole pings every open shell, log and Live Events socket every 25 seconds) | raise the proxy's idle timeout above `EXEC_IDLE_TIMEOUT` (5 minutes) ([Ingress with TLS](/installation/kubernetes#ingress-with-tls)) |
| `You already have 3 shells open, the most allowed. Close one and try again.` | `MAX_EXEC_SESSIONS_PER_USER` (3) open shells; audited `pod.exec` `rate_limited` (`max_sessions`) | close one, or raise the limit |
| `Too many log streams; try again shortly.` | the per-user log stream limit | close log viewers you don't need |
| shells, logs and live events fail at once, the log has `ws.origin_mismatch` with `"refused":true` | `WS_ORIGIN_CHECK=enforce`, and the browser's address isn't the one the request arrives with: the proxy changes `Host` and either sends no `X-Forwarded-Host` or isn't in `TRUSTED_PROXIES` | let the proxy keep `Host` or send `X-Forwarded-Host` (and trust it), or add the address to `ALLOWED_ORIGINS` |
| a WebSocket answers `401` | its ticket was used already or is older than 30 seconds | the UI gets a new ticket for every connection; a script must too (`POST /api/ws-ticket`) |

A live log or shell is a WebSocket from the browser to OpenConsole and a stream from the OpenConsole pod to the
Kubernetes API server, so the OpenConsole pod must reach the API server too.

## The pod doesn't start {#the-pod-doesnt-start}

The pod restarts (`CrashLoopBackOff`) and its log ends with an `ERROR` line:

| Log line | Cause | Fix |
|---|---|---|
| `db error` … `migrate …` | the database migration of a new version failed (a full volume, a damaged file); the database is unchanged | free space on the volume, or [restore](/installation/backup-restore#restore-one-database-copy) the `…-pre-upgrade.db` copy and start the previous version |
| `ENCRYPTION_KEY` … `the key must be base64 of 32 bytes (openssl rand -base64 32)` | the key file or value isn't a key | create it with `openssl rand -base64 32` |
| `store error` … `the stored credentials are encrypted with an external key: set ENCRYPTION_KEY_FILE (or ENCRYPTION_KEY)` | the key was moved out of the database, and the Deployment no longer mounts it | put `ENCRYPTION_KEY_FILE` and the Secret back |
| `store error` … `value is encrypted with key <id>, which is neither ENCRYPTION_KEY nor ENCRYPTION_KEY_PREVIOUS` | the Secret holds another key | use the right key; during a rotation also set `ENCRYPTION_KEY_PREVIOUS_FILE`; a key lost for good: [If the key is lost](/installation/backup-restore#if-the-key-is-lost) |
| `store error` … `ENCRYPTION_KEY_PREVIOUS / ENCRYPTION_KEY_LOST need ENCRYPTION_KEY (or ENCRYPTION_KEY_FILE)` | the previous key, or the lost-key switch, without the current key | set `ENCRYPTION_KEY_FILE` too |

## Error answers {#error-answers}

Every error answer of the API is JSON in the problem details format (RFC 9457), `Content-Type:
application/problem+json`, `401` and `429` included:

```json
{"type":"about:blank","title":"Forbidden","status":403,"error":"admin_only"}
```

`error` is always one of the reason codes below; `detail`, when there is one, is English text that names the field,
the object or the message of the cluster or directory. The web UI shows the code as a sentence in your language and
the detail in parentheses, for example *The new password does not meet the password policy. (password must be at
least 8 characters)*. Search this page for the code or the detail. An unknown `/api/…` or `/ws/…` path answers `404`
`not_found`; a known path with the wrong method `405` `method_not_allowed` with an `Allow` header.

| `error` | Status | Meaning |
|---|---|---|
| `unauthorized` | 401 | not signed in, or the session or API key is no longer valid (unknown, signed out, owner deactivated) |
| `api_key_expired` / `api_key_revoked` | 401 | the API key has expired / was revoked |
| `password_change_required` | 403 | the account must change its password first |
| `forbidden`, `admin_only`, `feature_disabled`, `api_key_not_allowed`, `api_access_policy`, `api_access_off`, `backup_download_disabled` | 403 | refused by OpenConsole; see [403 reasons](#403-reasons) |
| `rate_limited` | 429 | too many requests; wait for `Retry-After` ([Limits](/api/limits)) |
| `too_many_sessions` | 429 | too many shells open at once for this user |
| `not_found` | 404 | the object or the path doesn't exist |
| `method_not_allowed` | 405 | the path exists, not with this method (`Allow` lists the methods) |
| `invalid_id` | 400 | an id in the path isn't a number |
| `invalid_body` | 400 | the body is missing or isn't JSON of the expected shape |
| `invalid_input` | 400 | a value isn't accepted; `detail` says which |
| `body_too_large` | 413 | the body is over 1 MiB (4 MiB for a YAML apply) |
| `conflict` | 409 | the change conflicts with the current state (a name that exists, a revoked key, a recording still running, a stale `resourceVersion`) |
| `wrong_password` / `weak_password` / `password_unchanged` | 400 | the current password is wrong / the new one doesn't meet the policy (`detail` says why) / the new one equals the current one |
| `cannot_delete_self` | 409 | deleting your own account |
| `kubeconfig_unsupported` | 400 | the kubeconfig runs a program or reads a file; see [Other answers](#other-answers) |
| `cluster_invalid` | 400, 502 | the cluster's credentials were refused or its API server couldn't be reached when saving or activating it; see [Adding a cluster fails](#adding-a-cluster-fails) |
| `cluster_forbidden`, `cluster_unreachable`, `cluster_timeout`, `not_connected` | 403, 502, 504, 503 | the cluster failed the request, not OpenConsole's permissions; see [A cluster shows errors instead of lists](#a-cluster-shows-empty-lists-or-503) |
| `cluster_error` | the API server's status | the cluster answered with another error (it refused a change, a server error); `detail` has its message |
| `pod_not_found` / `container_not_found` | 404 / 400 | a log or command for a pod that doesn't exist (any more) / a container the pod doesn't have |
| `not_ready` / `previous_unavailable` | 400 | the container isn't running yet / it has no previous log (it hasn't restarted, or never ran) |
| `unavailable` | 502 | the cluster couldn't serve the log or the command; try again |
| `exec_failed` | 502 | the command could not be started in the container (no such program) |
| `connection_failed` | 400 | an LDAP / Azure AD **Test connection** or LDAP search failed; `detail` has the directory's message |
| `not_configured` | 400, 503 | not set up on this server (Azure AD, backups) |
| `sign_in_failed` | 400, 401, 403, 502 | the Microsoft sign-in failed or doesn't match this account; see [Sign-in fails](#sign-in-fails) |
| `recording_unavailable` | 503 | a shell that must be recorded (API key) can't be right now ([Recordings](/administration/recordings)) |
| `internal_error` | 500 | OpenConsole failed; the pod log has the cause under the response's `X-Request-Id` |

### 403 reasons {#403-reasons}

| `error` | Meaning | Source |
|---|---|---|
| `forbidden` | no permission for this action here (namespace, cluster) | [audit_events.go#L93](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.4/backend/internal/api/audit_events.go#L93), [access.go#L116-L140](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.4/backend/internal/api/access.go#L116-L140) |
| `api_access_policy` | with an API key: the owner has the permission and the key lists it, but the admin's API access policy keeps it from keys | [audit_events.go#L97-L99](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.4/backend/internal/api/audit_events.go#L97-L99), [access.go#L97-L114](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.4/backend/internal/api/access.go#L97-L114) |
| `api_access_off` | with an API key: the policy turns API access off for this user | [audit_events.go#L100-L101](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.4/backend/internal/api/audit_events.go#L100-L101), [apikeys.go#L207-L209](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.4/backend/internal/api/apikeys.go#L207-L209) |
| `api_key_not_allowed` | an API key may never do this (manage keys, change the password, pick the cluster, save views) | [apikeys.go#L52](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.4/backend/internal/api/apikeys.go#L52), [apikeys.go#L243-L253](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.4/backend/internal/api/apikeys.go#L243-L253) |
| `feature_disabled` | the operator switched the capability off (`FEATURE_*=false`) | [audit_events.go#L94](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.4/backend/internal/api/audit_events.go#L94), [access.go#L122-L126](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.4/backend/internal/api/access.go#L122-L126) |
| `admin_only` | an admin screen or endpoint; with an API key, one without the Admin API scope | [audit_events.go#L95](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.4/backend/internal/api/audit_events.go#L95), [access.go#L21-L43](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.4/backend/internal/api/access.go#L21-L43) |
| `password_change_required` | an API key, or the API keys page, of an account that still has to change its initial password (on other screens such an account gets `forbidden`) | [apikeys.go#L197-L200](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.4/backend/internal/api/apikeys.go#L197-L200), [apikeys.go#L422-L423](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.4/backend/internal/api/apikeys.go#L422-L423) |
| `backup_download_disabled` | downloading backups is off (`BACKUP_ALLOW_DOWNLOAD` isn't `true`) | [backups.go#L86-L88](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.4/backend/internal/api/backups.go#L86-L88) |
| `forbidden`, detail `you have no permissions on this cluster` | picking a cluster none of your grants cover | [cluster_ctx.go#L191](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.4/backend/internal/api/cluster_ctx.go#L191) |
| `forbidden`, detail `only the owner can change this view` | editing someone else's shared view | [views.go#L162](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.4/backend/internal/api/views.go#L162) |
| `sign_in_failed`, detail `user is disabled` | an Azure AD sign-in for a deactivated account | [auth_handlers.go#L469](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.4/backend/internal/api/auth_handlers.go#L469) |
| `sign_in_failed`, detail `this account can't sign in with this Microsoft account` | an Azure AD sign-in for a local or LDAP account, or for an account another Entra user signed in to first (see [Sign-in fails](#sign-in-fails)) | [auth_handlers.go#L422-L426](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.4/backend/internal/api/auth_handlers.go#L422-L426), [auth_handlers.go#L476-L481](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.4/backend/internal/api/auth_handlers.go#L476-L481) |
| `cluster_forbidden` (*OpenConsole's account on this cluster may not read this*) | Kubernetes refused OpenConsole's identity, not you | [kube_errors.go#L28-L48](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.4/backend/internal/api/kube_errors.go#L28-L48) |
| `cluster_forbidden`, detail `restart failed: …` / `scale failed: …` / the API server's message | Kubernetes refused a write (ClusterRole without that verb) | [deployment_actions.go#L155-L163](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.4/backend/internal/api/deployment_actions.go#L155-L163), [yaml_apply.go#L113](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.4/backend/internal/api/yaml_apply.go#L113), [kube_errors.go#L74-L90](https://github.com/vurulkan/kubernetes-openconsole/blob/v2.23.4/backend/internal/api/kube_errors.go#L74-L90) |

The first six are also the `reason` of the `denied` audit event. For API keys and agents, see also
[API overview](/api/overview).

### Other answers {#other-answers}

| Answer | Meaning |
|---|---|
| `400` `invalid_input` / `403` `forbidden`, detail `cluster "<name>" is unknown or not yours to use` | the `X-OpenConsole-Cluster` header names a cluster that doesn't exist (`400`), or one the key or the user doesn't cover (`403`, audited `cluster.use` or `api_key.use` `denied`). In the browser: the cluster this tab works on was deleted or your permissions on it were removed; reload the page |
| `403` `cluster_forbidden`, `502` `cluster_unreachable`, `503` `not_connected`, `504` `cluster_timeout` | the cluster failed the read, not OpenConsole's permissions; see [A cluster shows errors instead of lists](#a-cluster-shows-empty-lists-or-503) |
| `429` `rate_limited` with an API key | more than 10 requests per second (bursts of 30) for that key; the answer has `Retry-After: 1` |
| `429` `too_many_sessions`, detail `too many open shells (limit 3 per user); close one first` | the shell limit, from a client that isn't a browser |
| `400` `kubeconfig_unsupported`, detail `user "…" uses exec; …` | the kubeconfig runs a program or reads a file (exec plugin, `auth-provider`, `tokenFile`, a certificate or key path): use one with inline credentials ([Connect a cluster](/installation/connect-cluster)). A cluster saved with such a kubeconfig before doesn't connect: its lists say *The cluster is not connected.* (`503` `not_connected`), and the pod log has `cluster not connected: its kubeconfig runs a program or reads a file` once; upload an inline kubeconfig under **Admin → Clusters → Edit** |
| `409` `conflict`, detail `a revoked key can't be regenerated; create a new one` | regenerating a revoked API key; only an expired key can be regenerated |
| `413` `body_too_large` | the body is over 1 MiB (4 MiB for a YAML apply) |
| `400` `invalid_input`, detail `username is required` | `PUT /api/admin/users/{id}` without `username`: send the user's name with every update |
| `404` `not_found`, `409` `conflict`, `400` `invalid_input` or `504` `cluster_timeout` from restart, scale, YAML apply or a Secret request | Kubernetes answered NotFound, Conflict (e.g. a stale `resourceVersion`), Invalid or Timeout; OpenConsole passes that status on, so a proxy doesn't wrap a 5xx around a 4xx, and puts the API server's message in `detail`. The `failed` audit event has the reason (`not_found`, `conflict`, `invalid`) and the `error` |
| `400` `invalid_input`, detail `unknown group or role id` / `unknown user or group id`; `404` `not_found`, detail `role not found` | a group, role or user id in the request doesn't exist (deleted meanwhile); nothing was changed |
| `404` `not_found` for a path you expect to exist | the path is wrong, the server is older than the page you read, or the endpoint was removed: `GET` / `POST` / `PUT /api/admin/cluster` and `POST /api/admin/cluster/validate` (single-cluster era) are gone, use `/api/admin/clusters` |
| `503` from `/readyz`: `db not reachable` | the database file can't be opened: check the volume ([Health probes](/operations/health-probes)) |
