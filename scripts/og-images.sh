#!/usr/bin/env bash
# Writes static/img/og-{en,tr}.png (1200x630, the Open Graph / social preview
# image of each locale) from the dark Dashboard screenshot of screenshots/.
# Run after `npm run screenshots` changed dashboard-pods.*.dark.webp.
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME=${CHROME_PATH:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
work=$(mktemp -d)
logo=$(sed 's/<svg /<svg width="48" height="48" /' static/img/logo.svg)
for L in en tr; do
  if [ "$L" = en ]; then
    text="A web console for several Kubernetes clusters. Access granted in the app, every action audited."
    sub="Documentation · English · Türkçe"
  else
    text="Birden çok Kubernetes cluster'ı için web konsolu. Yetki uygulamada verilir, her aksiyon audit'e yazılır."
    sub="Dokümanlar · Türkçe · English"
  fi
  cp "static/img/screens/dashboard-pods.$L.dark.webp" "$work/shot-$L.webp"
  cat > "$work/og-$L.html" <<HTML
<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#0b1120;font-family:Inter,sans-serif;color:#e2e8f0}
.wrap{position:relative;width:1200px;height:630px;background:radial-gradient(900px 500px at 0% 0%,#312e81 0%,rgba(11,17,32,0) 60%),#0b1120}
.text{position:absolute;left:64px;top:72px;width:520px}
.logo{display:flex;align-items:center;gap:16px;font-weight:600;font-size:22px;color:#c7d2fe;letter-spacing:.02em}
h1{font-size:60px;line-height:1.05;margin:36px 0 24px;font-weight:700;color:#fff}
p{font-size:26px;line-height:1.4;margin:0;color:#cbd5e1}
.sub{position:absolute;left:64px;bottom:56px;font-size:20px;color:#a5b4fc;font-weight:600}
.shot{position:absolute;left:640px;top:96px;width:900px;border-radius:14px;border:1px solid #334155;box-shadow:0 30px 80px rgba(0,0,0,.6)}</style></head>
<body><div class="wrap"><div class="text"><div class="logo">$logo k8sopenconsole.github.io</div>
<h1>Kubernetes OpenConsole</h1><p>$text</p></div><img class="shot" src="shot-$L.webp"><div class="sub">$sub</div></div></body></html>
HTML
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=1200,630 --virtual-time-budget=5000 \
    --screenshot="$PWD/static/img/og-$L.png" "file://$work/og-$L.html" >/dev/null 2>&1
done
rm -rf "$work"
echo "wrote static/img/og-en.png, static/img/og-tr.png"
