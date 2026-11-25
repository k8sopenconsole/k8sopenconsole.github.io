---
title: "Hızlı başlangıç"
description: "Bir API anahtarı oluşturun ve curl ile ilk çağrıları yapın: ben kimim, pod'lar, loglar, tek komut, hatalar."
---

# Hızlı başlangıç

**Yapmak istediğiniz:** bir agent'a vermeden önce OpenConsole'u bir terminalden API anahtarıyla çağırmak.

`curl` ve `jq` gerekir. Örnekler, kod repository'sindeki `hack/k3d/crashlab.yaml` ile oluşturulan `crashlab`
namespace'ine sahip bir test cluster'ında çalıştırıldı; sizdeki adlar farklı olacaktır.

Bir anahtar [iki adımlı doğrulamadan](../user-guide/two-factor.mdx) etkilenmez: yöneticinin politikası ne olursa olsun hiçbir
zaman kod istemez ve `/api/me/2fa/*`'yi çağıramaz.

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

Her ret audit'e yazılır. Hata cevabı, [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)'nin problem details
biçiminde JSON'dır; `Content-Type: application/problem+json`:

```json
{"type":"about:blank","title":"Bad Request","status":400,"error":"invalid_input","detail":"cluster \"nope\" is unknown or not yours to use"}
```

- `error` her zaman bir neden kodudur (`snake_case`): kararı buna göre verin.
- `detail` (her zaman yoktur) bir insan için İngilizce metindir: hangi alan, hangi ad. Gösterin ya da loglayın;
  ayrıştırmayın.
- `title` HTTP durum metnidir, `type` her zaman `about:blank`'tır.

API'nin yolunda sürüm yoktur. Yalnızca büyür (yeni alanlar, yeni kodlar, yeni uçlar); bu yüzden bilmediğiniz şeyleri
yok sayın. `/api/openapi.json` içindeki `info.version` sunucunun sürümüdür. Bilinmeyen bir `/api/…` yolu `404`
`not_found`, bilinen bir yola yanlış metotla gelen istek `Allow` header'ıyla `405` `method_not_allowed` cevabı alır.

| Durum | `error` | Anlamı |
|---|---|---|
| 401 | `unauthorized` | Anahtar yok, anahtar bilinmiyor ya da sahibi devre dışı. |
| 401 | `api_key_expired` / `api_key_revoked` | Anahtarın süresi doldu / anahtar iptal edildi. |
| 403 | `password_change_required` | Sahibinin parolasını değiştirmesi gerekiyor (ilk giriş ya da admin sıfırlaması). |
| 403 | `forbidden` | Anahtarda listelenmiyor ya da o namespace'te sizde yok. |
| 403 | `api_access_policy` | Web'de sizde var, ama admin'in API erişim politikası anahtarlara vermiyor. |
| 403 | `api_access_off` | Politika anahtarlarınıza hiçbir şey vermiyor; `/api/auth/me` dahil her çağrı reddedilir. |
| 403 | `api_key_not_allowed` | Yalnızca web oturumunda yapılabilir (anahtar yönetimi, parola, kayıtlı görünümler, iki adımlı doğrulama). |
| 403 | `feature_disabled` | Operatör özelliği kapattı (`FEATURE_*=false`). |
| 403 | `admin_only` | Bir admin ucu ve anahtar bir admin'in Admin API anahtarı değil. |
| 400 | `invalid_input` | Bir değer kabul edilmedi; hangisi olduğunu `detail` söyler. Örneğin `X-OpenConsole-Cluster` var olmayan bir cluster'ı belirtiyor (anahtarın kapsamadığı biri için `403` `forbidden`). |
| 404 | `not_found` / `pod_not_found` | Nesne ya da yol yok. |
| 403 | `cluster_forbidden` | Cluster okumayı reddetti: OpenConsole'un oradaki ClusterRole'ü buna izin vermiyor. |
| 502 / 503 / 504 | `cluster_unreachable` / `not_connected` / `cluster_timeout` | Cluster'a ulaşılamıyor ya da OpenConsole'un kimlik bilgilerini reddetti / bağlı değil / zamanında cevap vermedi. |
| 429 | `rate_limited` | Bu anahtar için saniyede 10'dan fazla istek; `Retry-After` kadar (1 saniye) bekleyin. Bkz. [Limitler](/api/limits). |

Tüm kodlar: [Sorun giderme → Hata cevapları](/operations/troubleshooting#error-answers).

Test cluster'ında şu komutlarla görüldü:

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

**Sonraki adım:** anahtarı bir agent'a verin: [Agent tarifleri](/api/agent-recipes). Tüm uçlar:
[uç referansı](/api/endpoints/openconsole-api).
