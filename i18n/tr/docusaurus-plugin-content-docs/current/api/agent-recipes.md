---
title: "Agent tarifleri"
description: "Claude Code, Cursor ve bir shell script için hazır kurulumlar; anahtar bir ortam değişkeninde durur."
---

# Agent tarifleri

**Yapmak istediğiniz:** bir AI agent'ın ya da bir script'in iş yüklerinize bakmasını sağlamak; örneğin "crash loop'a
giren pod'ları bul ve loglarını özetle". Bunu, anahtar hiçbir prompt'ta ya da konuşma dökümünde görünmeden yapmak.

Her tarif, **Salt okuma (güvenli)** şablonuyla oluşturulmuş ve agent'ın görmesi gereken namespace'lerle sınırlanmış
bir [anahtar](/api/quick-start#1-create-a-key) kullanır. `pods:exec` iznini yalnızca agent'ın komut çalıştırması
gerekiyorsa ekleyin; her komut kaydedilir.

## `oc` yardımcısı {#the-oc-helper}

Agent'ın `curl` yerine çağırdığı küçük bir script. Anahtarı, adresi ve cluster'ı ortamdan okur. Böylece agent'ın
yazdığı (ve sizin onayladığınız) komutlarda ne anahtar ne de bir `$VARIABLE` geçer. Agent'ın çalıştığı dizine `oc`
adıyla kaydedin:

```bash title="oc"
#!/usr/bin/env bash
# oc <path> [json body]: one OpenConsole API call. The key comes from
# OPENCONSOLE_API_KEY, the address from OC_URL, the cluster from OC_CLUSTER;
# none of them appears in the command an agent runs. With a body it is a POST.
set -euo pipefail
path="${1:?usage: oc <path> [json body]}"
args=(-sS --fail-with-body -H "Authorization: Bearer $OPENCONSOLE_API_KEY")
if [ -n "${OC_CLUSTER:-}" ]; then args+=(-H "X-OpenConsole-Cluster: $OC_CLUSTER"); fi
if [ $# -ge 2 ]; then args+=(-H "Content-Type: application/json" -d "$2"); fi
curl "${args[@]}" "$OC_URL$path"
```

```bash
chmod +x oc
export OC_URL=https://openconsole.example.com   # your OpenConsole address
export OC_CLUSTER=prod                           # optional: cluster name or id; default your selected cluster
export OPENCONSOLE_API_KEY=oc_…                  # the key; never in a prompt or a file in the repo
./oc /api/auth/me | jq -c '{key: .apiKey.name, namespaces}'
```

```json
{"key":"claude-code","namespaces":["crashlab"]}
```

Reddedilen bir çağrı `curl: (22) The requested URL returned error: 403` satırını ve gövdeyi yazar, sıfırdan farklı
bir kodla çıkar. Agent'lar bunu kolayca anlar:

```bash
./oc /api/namespaces/kube-system/pods
```

```text
curl: (22) The requested URL returned error: 403
{"type":"about:blank","title":"Forbidden","status":403,"error":"forbidden"}
```

Nedeni `error` alanı söyler; kodlar [Hızlı başlangıç → Hatalar](/api/quick-start#errors) bölümünde.

## Bir shell script {#a-shell-script}

Bir namespace'te restart eden ya da başlayamayan pod'ları listeler; yanında crash eden container'ın logunun son
satırlarını gösterir (çalışma yeni bittiyse o çalışmanın, değilse bir öncekinin):

```bash title="oc-crashes.sh"
#!/usr/bin/env bash
# Pods in one namespace that restart or can't start, with the end of the log of
# the container that crashed. Uses ./oc; needs jq.
set -euo pipefail
ns="${1:?usage: ./oc-crashes.sh <namespace>}"

./oc "/api/namespaces/$ns/pods" | jq -r '
  .items[]
  | {name: .metadata.name, c: ((.status.containerStatuses // [])[0] // {})}
  | select(.c.restartCount > 0 or (.c.state.waiting.reason // "" | test("BackOff|Error")))
  | [.name, .c.name, .c.restartCount,
     (.c.state.waiting.reason // .c.state.terminated.reason // .c.lastState.terminated.reason // "-"),
     (if .c.state.terminated then "false" else "true" end)]  # the crashed run: now or the one before
  | @tsv' |
while IFS=$'\t' read -r pod container restarts reason previous; do
  echo "== $pod ($container): $restarts restarts, $reason"
  { ./oc "/api/namespaces/$ns/pods/$pod/logs?container=$container&previous=$previous&tailLines=5" 2>/dev/null || true; echo; } \
    | sed '/^$/d; s/^/   /'
done
```

```bash
chmod +x oc-crashes.sh
./oc-crashes.sh crashlab
```

```text
== badimage-67b7966bb-c4g8n (app): 0 restarts, ImagePullBackOff
   {"type":"about:blank","title":"Bad Request","status":400,"error":"previous_unavailable"}
== brokendb-0 (db): 5 restarts, CrashLoopBackOff
   boom
== exit1-6bb6b857dc-fg8xm (app): 5 restarts, CrashLoopBackOff
   starting
   fatal: config missing
== flappy-54fcb745f9-tg5bn (app): 5 restarts, Error
   line 56 07:13:59
   line 57 07:13:59
   line 58 07:13:59
   line 59 07:13:59
   line 60 07:14:00
== liveness-5cb5798b6b-999kw (app): 6 restarts, CrashLoopBackOff
   up
== missingcm-64757c46c4-fn7pg (app): 0 restarts, CreateContainerConfigError
   {"type":"about:blank","title":"Bad Request","status":400,"error":"previous_unavailable"}
== oom-56b9dbd646-jgsnc (app): 5 restarts, CrashLoopBackOff
   allocating
```

`previous_unavailable`, container'ın hiç çalışmadığı, dolayısıyla logu olmadığı anlamına gelir. Nedenini pod'un
olayları söyler (`GET /api/namespaces/<ns>/pods/<pod>/events`).

## Claude Code {#claude-code}

API'yi Claude Code'a projenin `CLAUDE.md` dosyasında tanıtın (uygulamadaki **API anahtarları → Dokümantasyon →
Agent'a verilecek metin** ile aynı metin, `./oc` kullanılarak):

```markdown title="CLAUDE.md"
You can use the OpenConsole API (a Kubernetes console). Call it with `./oc <path>` (GET) or
`./oc <path> '<json>'` (POST); the script adds the key, the address and the cluster. Never print
the OPENCONSOLE_API_KEY environment variable.
Read the API description first: `./oc /api/openapi.json`.
Start with `./oc /api/auth/me`: it shows the namespaces and permissions the key has.
For logs use /api/namespaces/<ns>/pods/<pod>/logs?tailLines=200 (add previous=true for the crashed
instance). To run one command: `./oc /api/namespaces/<ns>/pods/<pod>/exec '{"command": ["cat", "/etc/os-release"]}'`
(an argv array, not run in a shell).
Every action and resource read is audited under the key's name.
```

Yardımcıya izin vererek çalıştırın; böylece her çağrıdan önce durup onay istemez:

```bash
claude -p "Find the crash-looping pods in the crashlab namespace and summarize the end of their logs in a short table." \
  --allowedTools "Bash(./oc:*)" "Bash(jq:*)"
```

Test cluster'ında (Claude Code 2.1.317) önce `/api/auth/me`'yi okudu, pod'ları listeledi, crash eden her container'ın
logunu okudu ve bir tabloyla yanıt verdi (satırlarından üçü):

```text
| Pod / container | Restarts | Last exit | End of log | Likely cause |
|---|---|---|---|---|
| `brokendb-0` / db | 6 | 2 (Error), CrashLoopBackOff | `boom` | The app fails on purpose right after it starts. |
| `exit1-…-bbcxg` / app | 6 | 1 (Error) | `starting` → `fatal: config missing` | Its config is missing. |
| `oom-…-dkkpz` / app | 6 | 137 (OOMKilled) | `allocating` | Uses more memory than its limit allows. |
```

Yaptığı her çağrı **Yönetim → Denetim Logları**'nda anahtarın adıyla görünür.

:::note[Neden `curl` değil de bir yardımcı]
Claude Code, `curl -H "Authorization: Bearer $OPENCONSOLE_API_KEY" …` gibi bir değişkeni açan komutu çalıştırmadan
önce onay ister; `Bash(curl:*)` izinli olsa bile. `claude -p` ile soracak kimse olmadığı için durur. `./oc` ile
anahtar ortamda kalır ve izin verilen komut tam olarak `./oc …` olur.
:::

## Cursor {#cursor}

Cursor'ın agent'ı proje kurallarını `.cursor/rules/` dizininden okur. `oc` yardımcısını projeye koyun, üç değişkeni
Cursor'ı başlattığınız terminalde export edin ve aynı metni bir kural olarak kaydedin:

```markdown title=".cursor/rules/openconsole.mdc"
---
description: OpenConsole API (Kubernetes console) through ./oc
alwaysApply: false
---
You can use the OpenConsole API (a Kubernetes console). Call it with `./oc <path>` (GET) or
`./oc <path> '<json>'` (POST); the script adds the key, the address and the cluster. Never print
the OPENCONSOLE_API_KEY environment variable.
Read the API description first: `./oc /api/openapi.json`.
Start with `./oc /api/auth/me`: it shows the namespaces and permissions the key has.
For logs use /api/namespaces/<ns>/pods/<pod>/logs?tailLines=200 (add previous=true for the crashed
instance). To run one command: `./oc /api/namespaces/<ns>/pods/<pod>/exec '{"command": ["cat", "/etc/os-release"]}'`
(an argv array, not run in a shell).
Every action and resource read is audited under the key's name.
```

Sonra agent sohbetinde sorun, örneğin: *crashlab namespace'inde crash loop'a giren pod'ları bul ve
loglarının son kısmını özetle.*

:::info[Göremiyor ya da yapamıyor musunuz?]
- **`"error":"forbidden"`**: anahtar o namespace'i ya da izni içermiyor, ya da bu izin artık sizde yok
  (`./oc /api/auth/me` anahtarın şu an nelere eriştiğini gösterir).
- **`"error":"api_access_policy"`**: izin sizde var, ama yöneticinin API erişimi politikası onu anahtarlara
  vermiyor.
- **`curl: (22) The requested URL returned error: 401`**: anahtar bilinmiyor (`unauthorized`), süresi dolmuş
  (`api_key_expired`) ya da iptal edilmiş (`api_key_revoked`), ya da sahibi devre dışı (`unauthorized`).
  **`… error: 429`** (`rate_limited`): bu anahtarla saniyede 10'dan fazla çağrı; `Retry-After` kadar bir saniye
  bekleyin, bkz. [Limitler](/api/limits).
:::
