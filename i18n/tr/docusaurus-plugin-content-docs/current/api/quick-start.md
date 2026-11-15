---
title: "Hızlı başlangıç"
description: "Bir API anahtarı oluşturun ve curl ile ilk çağrıları yapın: ben kimim, pod'lar, loglar, tek komut, hatalar."
---

# Hızlı başlangıç

**Yapmak istediğiniz:** bir agent'a vermeden önce OpenConsole'u bir terminalden API anahtarıyla çağırmak.

`curl` ve `jq` gerekir. Örnekler, kod repository'sindeki `hack/k3d/crashlab.yaml` ile oluşturulan `crashlab`
namespace'ine sahip bir test cluster'ında çalıştırıldı; sizdeki adlar farklı olacaktır.

## 1. Anahtar oluşturun {#1-create-a-key}

OpenConsole'da: adınız (sağ üst) → **API anahtarları** → **Yeni API anahtarı**. Cluster'ı, namespace'leri ve
**Salt okuma (güvenli)** şablonunu seçin, sonra anahtarı kopyalayın (`oc_` ve 40 karakter). Anahtar yalnızca bir kez
gösterilir. Ayrıntılar: [API anahtarlarınız](/user-guide/api-keys).

```bash
export OC_URL=https://openconsole.example.com   # your OpenConsole address, no trailing slash
export OPENCONSOLE_API_KEY=oc_…                  # the key you copied
```

## 2. Ben kimim {#2-who-am-i}

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

Tam yanıttaki `namespaces` ve `permissions`, anahtarın **şu an** erişebildikleridir (anahtar ∩ rolleriniz ∩ admin'in
politikası); her script'e ya da agent'a bu çağrıyla başlayın.

## 3. Cluster'ı seçin {#3-pick-the-cluster}

Her istek, `X-OpenConsole-Cluster` ile adı ya da id'siyle bir cluster belirtmedikçe seçili cluster'ınızda çalışır.
Anahtarın kullanabileceği cluster'lar:

```bash
curl -s -H "Authorization: Bearer $OPENCONSOLE_API_KEY" "$OC_URL/api/clusters/public"
```

```json
{"items":[{"id":1,"name":"k3d","isActive":true,"selected":true}]}
```

Sonra her istekte cluster'ı belirtin:

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

Listeler, Kubernetes nesnelerini API server'ın gönderdiği haliyle (`metadata`, `spec`, `status`) `items` altında
döndürür.

## 4. Log okuyun {#4-read-a-log}

```bash
curl -s -H "Authorization: Bearer $OPENCONSOLE_API_KEY" \
  "$OC_URL/api/namespaces/crashlab/pods/exit1-6bb6b857dc-bbcxg/logs?container=app&previous=true&tailLines=5"
```

```text
starting
fatal: config missing
```

Düz metin döner. `previous=true`, container'ın bir önceki çalışmasıdır (çöken çalışma); `tailLines` varsayılan
olarak 500'dür. Restart'tan hemen sonra Kubernetes bir süre `unable to retrieve container logs for containerd://…`
yanıtı verebilir, tıpkı `kubectl logs --previous` gibi: container şu an `Error` durumundaysa `previous` olmadan okuyun.

## 5. Tek komut çalıştırın {#5-run-one-command}

Anahtarda `pods:exec` gerekir (**Salt okuma** şablonlarında yoktur):

```bash
curl -s -H "Authorization: Bearer $OPENCONSOLE_API_KEY" -H "Content-Type: application/json" \
  -d '{"container": "app", "command": ["uname", "-sr"], "timeoutSeconds": 30}' \
  "$OC_URL/api/namespaces/crashlab/pods/healthy-66fb4fb769-4cjqs/exec"
```

```json
{"stdout":"Linux 6.8.0-110-generic\n","stderr":"","exitCode":0,"truncated":false,"durationMs":496}
```

`command` bir argv dizisidir, shell içinde çalıştırılmaz (pipe için `["sh", "-c", "…"]`). Sıfırdan farklı bir çıkış
kodu da 200 döner. Komut bir shell oturumu gibi kaydedilir; audit olayı argümanları değil, yalnızca programı
(`uname`) tutar.

## Hatalar {#errors}

Her ret audit'e yazılır. Gövde nedeni söyler:

| Durum | Gövde | Anlamı |
|---|---|---|
| 401 | boş | Anahtar bilinmiyor, süresi dolmuş ya da iptal edilmiş, veya sahibi devre dışı. |
| 403 | `{"error":"change your password first"}` | Sahibinin parolasını değiştirmesi gerekiyor (ilk giriş ya da admin sıfırlaması). |
| 403 | `{"error":"forbidden"}` | Anahtarda listelenmiyor ya da o namespace'te sizde yok. |
| 403 | `{"error":"api_access_policy"}` | Web'de sizde var, ama admin'in API erişim politikası anahtarlara vermiyor. |
| 403 | `{"error":"api_access_off"}` | Politika anahtarlarınıza hiçbir şey vermiyor; `/api/auth/me` dahil her çağrı reddedilir. |
| 403 | `{"error":"api_key_not_allowed"}` | Yalnızca web oturumunda yapılabilir (anahtar yönetimi, parola, kayıtlı görünümler). |
| 403 | `{"error":"feature_disabled"}` | Operatör özelliği kapattı (`FEATURE_*=false`). |
| 403 | `{"error":"admin_only"}` | Bir admin ucu ve anahtar bir admin'in Admin API anahtarı değil. |
| 400 | `{"error":"cluster \"nope\" is unknown or not yours to use"}` | `X-OpenConsole-Cluster`, var olmayan bir cluster'ı belirtiyor (anahtarın kapsamadığı biri için `403`). |
| 403 | `{"error":"cluster_forbidden"}` | Cluster okumayı reddetti: OpenConsole'un oradaki ClusterRole'ü buna izin vermiyor. |
| 502 / 503 / 504 | `{"error":"cluster_unreachable"}` / `not_connected` / `cluster_timeout` | Cluster'a ulaşılamıyor ya da OpenConsole'un kimlik bilgilerini reddetti / bağlı değil / zamanında cevap vermedi. |
| 429 | boş | Bu anahtar için saniyede 10'dan fazla istek; bkz. [Limitler](/api/limits). |

Test cluster'ında şu komutlarla görüldü:

```bash
curl -s -w ' %{http_code}\n' -H "Authorization: Bearer $OPENCONSOLE_API_KEY" "$OC_URL/api/namespaces/kube-system/pods"
# {"error":"forbidden"}
#  403
curl -s -w ' %{http_code}\n' -H "Authorization: Bearer $OPENCONSOLE_API_KEY" "$OC_URL/api/me/api-keys"
# {"error":"api_key_not_allowed"}
#  403
curl -s -w ' %{http_code}\n' -H "Authorization: Bearer $OPENCONSOLE_API_KEY" -H "X-OpenConsole-Cluster: nope" \
  "$OC_URL/api/namespaces/crashlab/pods"
# {"error":"cluster \"nope\" is unknown or not yours to use"}
#  400
curl -s -w ' %{http_code}\n' -H "Authorization: Bearer $OPENCONSOLE_API_KEY" "$OC_URL/api/admin/users"
# {"error":"admin_only"}
#  403
```

**Sonraki adım:** anahtarı bir agent'a verin: [Agent tarifleri](/api/agent-recipes). Tüm uçlar:
[uç referansı](/api/endpoints/openconsole-api).
