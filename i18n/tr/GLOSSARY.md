# Turkish translation: terms and rules

The Turkish site (`i18n/tr/`) uses the words of the app's Turkish UI (`frontend/src/i18n.ts` in the code repo, the
`tr` dictionary). A reader who follows a page must find the same label on the screen. This file lists the terms
pages use most; for any other label, find the English text in `i18n.ts` and copy its `tr` value as it is.

## Rules

- **Tone: "siz"** (as the UI's sentences): "Rolü seçin", "isterseniz". Button and menu names are quoted exactly as the
  UI shows them, even when they are in the imperative ("**İptal et**", "**Giriş yap**").
- Short sentences, natural Turkish; don't translate word for word. Each Turkish page carries exactly the English
  page's information: nothing left out, nothing added.
- **Never translated:** commands, code blocks and their output, file names, field names, environment variables,
  permission names (`pods:exec`), audit actions (`pod.exec`) and outcomes (`denied`), API paths, HTTP headers,
  Kubernetes kinds in code (`Deployment`), product names (OpenConsole, Kubernetes, Prometheus, Elastic, LDAP,
  Azure AD / Entra ID, Claude Code, Cursor). Comments inside code blocks stay English (the blocks are the run
  examples).
- **Headings keep the English anchor:** copy the English heading's `{#id}` (`.md`) or `{/* #id */}` (`.mdx`) to the
  Turkish heading unchanged. Links and the language switch then land on the same section.
- Links: same targets as the English page (`/installation/connect-cluster#read-only-mode`); Docusaurus adds `/tr/`.
- Front matter: translate `title`, `description`, `sidebar_label`; keep `id`, `slug`, `sidebar_position` and the rest.
- `.mdx`: keep imports and components; translate the `alt` / `caption` text of `<Screenshot>` and the text of
  admonitions (`:::note`, `:::tip` …), keep their type.
- Suffixes after English words and code take an apostrophe: `pod'un`, `Deployment'ı`, `namespace'te`,
  `` `deploy/rbac.yaml`'ı ``. Use `'` (U+0027), not `’`.
- Open security findings are never written on the site (same rule as English).
- The "**You want to:**" opening of user-guide pages is "**Yapmak istediğiniz:**"; the *Can't see it?* box is
  "**Göremiyor musunuz?**".

## UI terms

Navigation and screens (UI path separators stay `→`):

| English (UI) | Turkish (UI) |
|---|---|
| Overview | Genel bakış |
| Nodes | Node'lar |
| Dashboard (nav) | Panel |
| Cluster Resources (Dashboard title) | Küme Kaynakları |
| Admin (nav) | Yönetim |
| Administrator | Yönetici |
| Users / User accounts | Kullanıcılar / Kullanıcı hesapları |
| Groups | Gruplar |
| Roles | Roller |
| Role Permissions | Rol İzinleri |
| LDAP Configuration | LDAP Yapılandırması |
| Azure AD Configuration | Azure AD Yapılandırması |
| Session / Session Settings | Oturum / Oturum Ayarları |
| Sessions | Oturumlar |
| Clusters | Cluster'lar |
| Customization | Özelleştirme |
| Audit Logs | Denetim Logları |
| API keys | API anahtarları |
| API key expiry | API anahtarı süresi |
| API access | API erişimi |
| Recordings / Session recordings / Recording settings | Kayıtlar / Oturum kayıtları / Kayıt ayarları |
| Keyboard shortcuts | Klavye kısayolları |
| Command palette | Komut paleti |
| Live events | Canlı olaylar |
| Saved views / Views | Kayıtlı görünümler / Görünümler |
| Restart history | Restart geçmişi |
| Resource usage | Kaynak kullanımı |
| Usage history | Kullanım geçmişi |
| Change password | Parola değiştir |
| Sign in / Sign out | Giriş yap / Çıkış |
| Language | Dil |
| Card view / List view | Kart görünümü / Liste görünümü |
| Columns | Sütunlar |
| Workloads | İş yükleri |
| Pods needing attention | İlgi bekleyen pod'lar |

Actions and states (button labels as shown):

| English (UI) | Turkish (UI) |
|---|---|
| Restart | Yeniden başlat |
| Scale | Ölçekle |
| Apply | Uygula |
| Save | Kaydet |
| Edit | Düzenle |
| Delete | Sil |
| Revoke | İptal et |
| Regenerate | Yeniden üret |
| Activate / Deactivate | Aktive et / Deaktive et |
| Add Cluster | Cluster Ekle |
| Test connection | Bağlantıyı test et |
| Import from LDAP… | LDAP'tan içe aktar… |
| Export CSV | CSV olarak dışa aktar |
| Download / Play | İndir / Oynat |
| Copy | Kopyala |
| Reconnect | Yeniden bağlan |
| Previous logs | Önceki loglar |
| Find in log | Logda ara |
| Wrap | Satır kaydır |
| Pause / Resume | Duraklat / Devam et |
| Show / Hide | Göster / Gizle |
| Read-only (safe) / Read-only (all) | Salt okuma (güvenli) / Salt okuma (tümü) |
| Safe read-only | Güvenli salt okuma |
| All my permissions | Tüm yetkilerim |
| No expiry | Süresiz |
| Enabled / Disabled | Etkin / Devre dışı |
| Running / Pending / Succeeded | Çalışıyor / Bekliyor / Tamamlandı |
| Ready / Not ready | Hazır / Hazır değil |
| Switched off by the operator | Operatör bu özelliği kapattı |

Words in running text:

| English | Turkish |
|---|---|
| permission (a grant, `pods:exec`) | izin (UI: "Rol İzinleri"; "yetki" where the UI says it: "Tüm yetkilerim") |
| action (audit / permission) | aksiyon |
| outcome | sonuç |
| audit (verb, "is audited") | audit'e yazılır (as the UI) |
| audit log (the screen) | Denetim Logları |
| endpoint | uç (UI: "Uçlar") |
| API key | API anahtarı |
| expiry | süre / bitiş |
| session | oturum |
| recording | kayıt |
| password | parola ("şifre" is not used for passwords; "şifreleme" stays for encryption) |
| role / group / user | rol / grup / kullanıcı |
| cluster, namespace, pod, node, container, Deployment, Secret, ConfigMap, Ingress, label, annotation, taint | unchanged, Turkish suffix after an apostrophe (`cluster'lar`, `namespace'ler`) |
| log / logs | log / loglar |
| shell | shell |
| restart (noun) | restart |
| request / limit (CPU, memory) | request / limit |
| image (container) | imaj |
| drawer (detail panel) | ayrıntı paneli |
| dashboard (the screen) | Panel |
| deploy / install | kurulum / kurmak |
| upgrade | sürüm yükseltme / güncelleme |
| backup / restore | yedek / geri yükleme |
| troubleshooting | sorun giderme |
| health probe | sağlık probe'u |
| read-only | salt okuma |
| feature flag | özellik bayrağı |
| tracing | tracing |
| metrics | metrikler |
| scrape | scrape |
| air-gapped | internetsiz (air-gapped) |
| hardening | sıkılaştırma |
| quick start | Hızlı başlangıç |

Since 2.23.x the UI says "siz", "Parola" and a straight apostrophe everywhere (`Pod'lar`, `Node'lar`); the site
uses the same.
