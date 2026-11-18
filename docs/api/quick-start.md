---
title: "Quick start"
description: "Create an API key and make the first calls with curl: who am I, pods, logs, one command, errors."
---

# Quick start

**You want to:** call OpenConsole from a terminal with an API key, before handing it to an agent.

You need `curl` and `jq`. The examples were run against a test cluster with the `crashlab` namespace of the code
repository's `hack/k3d/crashlab.yaml`; your names will differ.

A key is not affected by [two-factor authentication](../user-guide/two-factor.mdx): it never asks for a code, whatever the
admin's policy, and it can't call `/api/me/2fa/*`.

## 1. Create a key {#1-create-a-key}

In OpenConsole: your name (top right) → **API keys** → **New API key**. Pick the cluster, the namespaces and the
**Read-only (safe)** template, then copy the key (`oc_` and 40 characters). It is shown once. Details:
[Your API keys](/user-guide/api-keys).

```bash
export OC_URL=https://openconsole.example.com   # your OpenConsole address, no trailing slash
export OPENCONSOLE_API_KEY=oc_…                  # the key you copied
```

## 2. Who am I {#2-who-am-i}

```bash
curl -s -H "Authorization: Bearer $OPENCONSOLE_API_KEY" "$OC_URL/api/auth/me" \
  | jq '{key: .apiKey.name, grants: .apiKey.grants, namespaces}'
```

```json
{
  "key": "claude-code",
  "grants": ["deployments:get", "deployments:list", "pods:get", "pods:list", "pods:logs"],
  "namespaces": ["crashlab"]
}
```

`namespaces` and `permissions` in the full answer are what the key reaches **now** (key ∩ your roles ∩ the admin's
policy); start every script or agent with this call.

## 3. Pick the cluster {#3-pick-the-cluster}

Each request works on your selected cluster unless it names one with `X-OpenConsole-Cluster`, by name or id. The
clusters the key can use:

```bash
curl -s -H "Authorization: Bearer $OPENCONSOLE_API_KEY" "$OC_URL/api/clusters/public"
```

```json
{"items":[{"id":1,"name":"k3d","isActive":true,"selected":true}]}
```

Then name it on each request:

```bash
curl -s -H "Authorization: Bearer $OPENCONSOLE_API_KEY" -H "X-OpenConsole-Cluster: k3d" \
  "$OC_URL/api/namespaces/crashlab/pods" \
  | jq -r '.items[] | [.metadata.name, .status.phase, .status.containerStatuses[0].restartCount] | @tsv'
```

```text
agent-598r8	Running	0
badimage-67b7966bb-82lhs	Pending	0
brokendb-0	Running	6
db-0	Running	0
db-1	Running	0
…
```

Lists return the Kubernetes objects as the API server sends them (`metadata`, `spec`, `status`) under `items`.

## 4. Read a log {#4-read-a-log}

```bash
curl -s -H "Authorization: Bearer $OPENCONSOLE_API_KEY" \
  "$OC_URL/api/namespaces/crashlab/pods/exit1-6bb6b857dc-bbcxg/logs?container=app&previous=true&tailLines=5"
```

```text
starting
fatal: config missing
```

Plain text. `previous=true` is the container run before the current one (the one that crashed); `tailLines` defaults
to 500. Right after a restart Kubernetes may answer `unable to retrieve container logs for containerd://…` for a
while, like `kubectl logs --previous` does: if the container is in `Error` now, read without `previous`.

## 5. Run one command {#5-run-one-command}

Needs `pods:exec` on the key (the **Read-only** templates don't have it):

```bash
curl -s -H "Authorization: Bearer $OPENCONSOLE_API_KEY" -H "Content-Type: application/json" \
  -d '{"container": "app", "command": ["uname", "-sr"], "timeoutSeconds": 30}' \
  "$OC_URL/api/namespaces/crashlab/pods/healthy-66fb4fb769-4cjqs/exec"
```

```json
{"stdout":"Linux 6.8.0-110-generic\n","stderr":"","exitCode":0,"truncated":false,"durationMs":496}
```

`command` is an argv array, not run in a shell (`["sh", "-c", "…"]` for pipes). A non-zero exit code is still a 200.
The command is recorded like a shell session; the audit event keeps only the program (`uname`), never the arguments.

## Errors {#errors}

Every refusal is audited. An error answer is JSON in the problem details format of
[RFC 9457](https://www.rfc-editor.org/rfc/rfc9457), with `Content-Type: application/problem+json`:

```json
{"type":"about:blank","title":"Bad Request","status":400,"error":"invalid_input","detail":"cluster \"nope\" is unknown or not yours to use"}
```

- `error` is always a reason code (`snake_case`): switch on it.
- `detail` (not always there) is English text for a person: which field, which name. Show or log it; don't parse it.
- `title` is the HTTP status text, `type` is always `about:blank`.

The API has no version in its path. It only grows (new fields, new codes, new endpoints), so ignore what you don't
know; `info.version` in `/api/openapi.json` is the server's version. An unknown `/api/…` path answers `404`
`not_found`, a known path with the wrong method `405` `method_not_allowed` with an `Allow` header.

| Status | `error` | Means |
|---|---|---|
| 401 | `unauthorized` | No key, an unknown key, or its owner is disabled. |
| 401 | `api_key_expired` / `api_key_revoked` | The key has expired / was revoked. |
| 403 | `password_change_required` | The owner must change their password (first sign-in or an admin reset). |
| 403 | `forbidden` | The key doesn't list it, or you don't hold it in that namespace. |
| 403 | `api_access_policy` | You hold it on the web, but the admin's API access policy keeps it from keys. |
| 403 | `api_access_off` | The policy gives your keys nothing; every call is refused, `/api/auth/me` too. |
| 403 | `api_key_not_allowed` | Web session only (managing keys, password, saved views, two-factor authentication). |
| 403 | `feature_disabled` | The operator switched the feature off (`FEATURE_*=false`). |
| 403 | `admin_only` | An admin endpoint, and the key isn't an Admin API key of an admin. |
| 400 | `invalid_input` | A value isn't accepted; `detail` says which. For example `X-OpenConsole-Cluster` names a cluster that doesn't exist (`403` `forbidden` for one the key doesn't cover). |
| 404 | `not_found` / `pod_not_found` | The object or the path doesn't exist. |
| 403 | `cluster_forbidden` | The cluster refused the read: OpenConsole's ClusterRole there doesn't allow it. |
| 502 / 503 / 504 | `cluster_unreachable` / `not_connected` / `cluster_timeout` | The cluster can't be reached or refused OpenConsole's credentials / isn't connected / didn't answer in time. |
| 429 | `rate_limited` | More than 10 requests a second for this key; wait for `Retry-After` (1 second). See [Limits](/api/limits). |

Every code: [Troubleshooting → Error answers](/operations/troubleshooting#error-answers).

Seen on the test cluster with:

```bash
curl -s -w ' %{http_code}\n' -H "Authorization: Bearer $OPENCONSOLE_API_KEY" "$OC_URL/api/namespaces/kube-system/pods"
# {"type":"about:blank","title":"Forbidden","status":403,"error":"forbidden"}
#  403
curl -s -w ' %{http_code}\n' -H "Authorization: Bearer $OPENCONSOLE_API_KEY" "$OC_URL/api/me/api-keys"
# {"type":"about:blank","title":"Forbidden","status":403,"error":"api_key_not_allowed"}
#  403
curl -s -w ' %{http_code}\n' -H "Authorization: Bearer $OPENCONSOLE_API_KEY" -H "X-OpenConsole-Cluster: nope" \
  "$OC_URL/api/namespaces/crashlab/pods"
# {"type":"about:blank","title":"Bad Request","status":400,"error":"invalid_input","detail":"cluster \"nope\" is unknown or not yours to use"}
#  400
curl -s -w ' %{http_code}\n' -H "Authorization: Bearer $OPENCONSOLE_API_KEY" "$OC_URL/api/admin/users"
# {"type":"about:blank","title":"Forbidden","status":403,"error":"admin_only"}
#  403
curl -s -w ' %{http_code}\n' -H "Authorization: Bearer oc_notarealkey" "$OC_URL/api/auth/me"
# {"type":"about:blank","title":"Unauthorized","status":401,"error":"unauthorized"}
#  401
curl -s -i -X DELETE -H "Authorization: Bearer $OPENCONSOLE_API_KEY" "$OC_URL/api/namespaces/crashlab/pods" | grep -E '^(HTTP|Allow)|"error"'
# HTTP/1.1 405 Method Not Allowed
# Allow: GET
# {"type":"about:blank","title":"Method Not Allowed","status":405,"error":"method_not_allowed"}
```

**Next:** give it to an agent: [Agent recipes](/api/agent-recipes). Every endpoint:
[endpoint reference](/api/endpoints/openconsole-api).
