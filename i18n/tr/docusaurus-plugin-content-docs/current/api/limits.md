---
title: "Limitler"
description: "Hız limitleri, log ve komut için boyut ve süre limitleri, kesme, WebSocket ticket'ları."
---

# Limitler

OpenConsole'un neleri reddettiği ya da kestiği burada; bir script ya da agent bunları ele alabilsin diye. Aşağıdaki her
ret, `rate_limited` (ya da `denied` / `failed`) sonucuyla audit'e yazılır.

## İstekler {#requests}

| Limit | Neye uygulanır | Aşılınca |
|---|---|---|
| Saniyede 10 istek, 30'luk patlamalar | her API anahtarı, her çağrı | `Retry-After: 1` ile 429 `rate_limited`; bir saniye bekleyin. `api_key.use` / `rate_limited` olarak audit'e yazılır; anahtar başına dakikada en fazla bir kez. |
| Aynı anda 5, sonra 6 saniyede bir | Deployment restart ve ölçekleme, StatefulSet ölçekleme, YAML uygulama (dry run hariç); kullanıcı başına, anahtarlar ve web birlikte | `Retry-After: 6` ile 429 `rate_limited`. |
| Aynı anda 10, sonra saniyede bir | Log okumaları ve log akışları; kullanıcı başına | 429 `rate_limited` (bir akış `retry: true` içeren bir `error` frame'i alır). |
| `MAX_EXEC_SESSIONS_PER_USER` açık shell (varsayılan 3) | Shell'ler ve tek komutluk exec; kullanıcı başına, anahtarlar ve web birlikte | 429 `too_many_sessions`; tarayıcıdan açılan shell ise *too many open shells* ve 4429 kapanış koduyla reddedilir. |
| `MAX_REPLICAS` (varsayılan 100) | Ölçekleme | 400 `invalid_input`, detail `replicas must be between 0 and 100`. |

Durumdan sonra gelen kod, gövdenin `error` alanıdır; gövde [Hatalar](/api/quick-start#errors) bölümünde anlatılır.
İki değişken de [Ortam değişkenleri](/reference/environment-variables) sayfasında.

## Log okuma: `GET …/pods/{name}/logs` {#reading-a-log-get-podsnamelogs}

| Parametre | Varsayılan | Limit |
|---|---|---|
| `tailLines` | 500 | 1 ile 10 000 arası; dışında → 400 `invalid_input`, detail `tailLines must be between 1 and 10000` |
| `sinceSeconds` | yok | pozitif bir sayı; değilse 400 `invalid_input` |
| `previous`, `timestamps`, `container` | `false`, `false`, ana container | |

Yanıt en fazla **5 MiB** düz metindir. Daha uzun bir log satır sonunda kesilir ve yanıt
`X-OpenConsole-Truncated: true` başlığını taşır: daha az satır ya da daha kısa bir `sinceSeconds` isteyin. Hatalar: 404
`pod_not_found`; 400 `container_not_found`, `not_ready` (container henüz başlamadı) ya da `previous_unavailable`.

## Komut çalıştırma: `POST …/pods/{name}/exec` {#running-a-command-post-podsnameexec}

| | |
|---|---|
| `command` | Bir argv dizisi; shell'de çalışmaz. Pipe için: `["sh", "-c", "ps aux \| head"]`. stdin yok. |
| `timeoutSeconds` | 1 ile 120 arası, varsayılan 30. |
| Çıktı | `stdout` ve `stderr`, **her biri 1 MiB**; ötesi atılır ve `truncated` `true` olur, komut ise sonuna kadar çalışır. |
| Zaman aşımı | O ana kadar yazılanlar, `exitCode: -1`, `truncated: true`. Kubernetes süreci durdurmaz; container'da çalışmaya devam edebilir. |
| Çıkış kodu | Sıfırdan farklı bir çıkış kodu, o `exitCode` ile birlikte 200 döner. |
| Metin | Çıktı metindir: UTF-8 olmayan byte'lar `�` olur; binary için çıktıyı `base64`'ten geçirin. |
| Hatalar | 404 `pod_not_found`; 400 `container_not_found` ya da `not_ready` (container çalışmıyor); exec'in kendisi başarısız olursa 502 `exec_failed`. |

Anahtarla çalıştırılan bir komut her zaman kaydedilir. Audit olayı programı (`command[0]`), çıkış kodunu, byte
sayılarını, süreyi ve kayıt id'sini tutar; argümanları asla tutmaz. Kayıt bir shell kaydı gibi okunur: ilk satırı
`$ <command>`, ardından çıktı gelir. Bu sayfadaki iki uç (log ve komut) yalnızca anahtarla değil, bir web
oturumuyla da çalışır.

## WebSocket'ler {#websockets}

Canlı loglar, shell'ler ve olay akışı WebSocket'tir. Anahtar URL'de asla kabul edilmez, bu yüzden:

1. Anahtarla ve `{"path": "/ws/namespaces/<ns>/pods/<pod>/logs"}` (socket'in yolu) gövdesiyle
   `POST /api/ws-ticket` çağırın; yanıt `{"ticket": "…"}` olur.
2. Socket'i o yolda, **30 saniye** içinde `?ticket=<ticket>` ile açın. Bir ticket yalnızca bir kez ve yalnızca o
   yol için geçerlidir. `?token=` kabul edilmez.

Shell socket'i (`/ws/namespaces/<ns>/pods/<pod>/exec`), `ticket`'ın yanında `container` ve `command` parametrelerini
de alır, örneğin `command=/bin/sh`; `command` verilmezse sırayla bash, ash ve sh'yi dener.

```bash
curl -s -H "Authorization: Bearer $OPENCONSOLE_API_KEY" -H "Content-Type: application/json" \
  -d '{"path": "/ws/namespaces/crashlab/pods/healthy-66fb4fb769-4cjqs/logs"}' "$OC_URL/api/ws-ticket"
```

```json
{"ticket":"89240df50d12c7a283c0607e0b38a0c95dff80d1d482714b"}
```

Bir agent için yukarıdaki düz HTTP uçları daha basittir: bir log anlık görüntüsü ve tek bir komut için socket
gerekmez.

Bir shell, `EXEC_IDLE_TIMEOUT` süresince girdi almazsa kapanır (varsayılan 5 dakika).
