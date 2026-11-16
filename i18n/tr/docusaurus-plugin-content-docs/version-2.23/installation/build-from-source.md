---
title: "Kaynaktan derleme"
description: "Kendi imajınızı derleyin ve testleri çalıştırın."
---

# Kaynaktan derleme

## Kendi imajınız {#option-a--your-own-image}

```bash
docker build -t kubernetes-openconsole:local .
```

## Testler {#tests}

CI bunları her push'ta çalıştırır. PR açmadan önce yerelde çalıştırın:

```bash
cd backend && go vet ./... && go test -race ./...    # recorder, exec bridge, RBAC engine, API, store, LDAP, Azure AD, tracing
cd frontend && npx tsc --noEmit -p . && npm test && npm run build
```

- API testleri gerçek router'ı ve SQLite store'u client-go'nun fake clientset'ine karşı çalıştırır. Her admin ucunun, namespace / kaynak / cluster kapsamlı her iznin, her yazma aksiyonunun (403 + `denied` audit) ve secret gösterme işleminin uygulandığını; ayrıca özellik bayraklarını, kayıtlı görünümleri, CSV dışa aktarmaları, parola politikasını ve exec oturum limitini kontrol eder.
- Store testleri 2.x öncesi bir veritabanı şemasını yükseltir; her migration'ın idempotent olduğunu ve kimlik bilgilerinin diskte şifreli durduğunu kontrol eder.
- LDAP, process içinde çalışan bir LDAP server'a karşı uçtan uca test edilir (yapılandır → test et → ara → içe aktar → giriş yap → devre dışı bırak); Azure AD ise sahte bir Entra token ucuna karşı (state, audience, issuer ve süre yanlışsa hepsi reddedilir).
- Frontend (`npm test`, Vitest + Testing Library + axe-core): EN / TR sözlüklerinin aynı anahtarlara sahip olduğu ve kodda kullanılan her `t('…')` anahtarının var olduğu, tablo klavye navigasyonu, dialog'lar ve ana bileşenlerde erişilebilirlik kontrolleri.
