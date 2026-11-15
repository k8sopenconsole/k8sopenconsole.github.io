---
title: "İlk giriş ve yönetici kontrol listesi"
sidebar_label: "İlk giriş"
description: "Varsayılan admin, şifre politikası ve sırasıyla ilk yapılacak ayarlar."
---

# İlk giriş ve yönetici kontrol listesi

## İlk giriş {#first-login}

OpenConsole ilk açılışında tek bir yönetici oluşturur: **`admin` / `admin`**. Bununla giriş yapın ve yeni bir
şifre seçin; bunu yapana kadar diğer tüm sayfalar ve API çağrıları reddedilir. Değişiklikten sonra oturumunuz
kapanır; yeni şifreyle tekrar giriş yapın.

Yerel şifreler en az 8 karakter (`PASSWORD_MIN_LENGTH`), en fazla 72 bayt olmalı ve boş olmamalıdır; değişiklik de
şifreyi gerçekten değiştirmelidir. Bir kullanıcı için aynı adresten beş hatalı giriş, bu kullanıcı-adres ikilisini
beş dakika kilitler.

## Yönetici kontrol listesi {#admin-checklist}

Bunları sırayla yapın; her adım bir öncekine dayanır.

1. **Cluster'larınızı bağlayın.** Yönetim → Cluster'lar → Cluster Ekle; ardından en çok kullanılan cluster'da
   **Varsayılan yap** ([Cluster bağlama](/installation/connect-cluster)). Her kullanıcı, izinlerinin kapsadığı başka
   bir cluster'a geçebilir; seçim kullanıcıya özeldir.
2. **Kendinize kişisel bir hesap açın.** Yönetim → Kullanıcılar → Yeni kullanıcı, **Admin yetkisi ver** kutusunu
   işaretleyin. Bundan sonra bu hesapla giriş yapın; böylece audit log'da bir kişinin adı görünür. `admin`'i uzun
   bir şifreyle acil durum (break-glass) hesabı olarak tutun ya da ikinci bir yönetici olduktan sonra devre dışı
   bırakın (son aktif yönetici devre dışı bırakılamaz ve silinemez).
3. **Roller oluşturun.** Yönetim → Roller → **Yeni rol** (ad, açıklama, API erişimi), ardından rolün Rol İzinleri
   panelinde **İzin ekle**: bir cluster (ya da tüm cluster'lar), bir ya da daha fazla namespace ve bir şablon
   (Görüntüleyici, Geliştirici, SRE, Yönetici) ya da tek tek aksiyonlar. İlk rol için iyi bir seçim, tek bir
   namespace'in Görüntüleyici'sidir. **Görüntüleyici**, her türde `list` ve `get` verir, Secret metadata'sı dahil
   (değerler değil, adlar ve key'ler) ve **log vermez**: görüntüleyiciler log okuyacaksa `pods:logs` ekleyin.
   Aksiyonların tam listesi: [Uygulama izinleri](/reference/permissions).
4. **Gruplar oluşturun ve onlara rol verin.** Yönetim → Gruplar → **Yeni grup** (bir ad), ardından **Edit group**
   (kalem simgesi) → Roller → *Assign roles…*. Erişim her zaman
   kullanıcı → grup → rol yolunu izler; hiçbir grupta olmayan bir kullanıcı hiçbir namespace görmez.
5. **Kişileri ekleyin.** Bir yol seçin (ya da birkaçını yan yana kullanın):
   - **Yerel hesaplar**: Yönetim → Kullanıcılar → Yeni kullanıcı (LDAP ya da Azure AD açıksa: → Yerel kullanıcı),
     gruplarıyla birlikte. İlk şifreyi siz belirlersiniz; kullanıcı bunu değiştirmeye zorlanmaz, bu yüzden
     değiştirmesini isteyin (header menüsü → Şifre değiştir).
   - **LDAP / Active Directory**: Yönetim → LDAP: ayarları doldurun, **Bağlantıyı test et**, ardından kullanıcıları
     gruplara içe aktarın (Yönetim → Kullanıcılar → Yeni kullanıcı → LDAP'tan içe aktar…) ya da varsayılan
     gruplarla *Kullanıcının ilk girişinde hesabını oluştur* seçeneğini açın. Herkese duyurmadan önce bir kez LDAP
     kullanıcısı olarak giriş yapın. [LDAP / Active Directory](/administration/ldap)
   - **Azure AD (Entra ID)**: app registration'ı oluşturun, Yönetim → Azure AD'yi doldurun, **Test Connection**,
     ardından kullanıcıları gruplarıyla önceden oluşturun (Yeni kullanıcı → Azure AD kullanıcısı); böylece ilk
     "Microsoft ile giriş yap" denemelerinde bir şey görürler. [Azure AD](/administration/azure-ad)
6. **Bir kullanıcının ne gördüğünü kontrol edin.** Gizli bir pencerede yönetici olmayan biri olarak giriş yapın:
   yalnızca onun namespace'leri görünür; Yönetim, Genel bakış ya da Node'lar yoktur; izni yoksa restart / ölçekleme
   / düzenleme / shell de yoktur. (2.23.0, `pods:logs` olmadan da bir **Loglar** düğmesi gösterir; düğme
   *Bu logu okuma yetkiniz yok* yanıtını verir.)
7. **Opsiyonel ayarlar**:
   - Yönetim → Oturum: bir girişin ne kadar geçerli kalacağı (varsayılan 60 dakika) ve API anahtarı süre politikası
     ([Oturumlar](/administration/sessions)).
   - Yönetim → Kayıtlar → Kayıt ayarları: shell kaydı açık / kapalı, saklama süresi, disk kotası
     ([Oturum kaydı](/administration/recordings)).
   - Yönetim → Roller → *API erişimi*: her rolün kullanıcılarının API anahtarlarının o rolden ne kadarını
     kullanabileceği (varsayılan *Güvenli salt okuma*) ([API ve agent'lar](/api/overview)).
   - Yönetim → Cluster'lar → Prometheus: daha uzun kullanım geçmişi ([Prometheus](/administration/prometheus)).
   - Yönetim → Özelleştirme: logonuz.
   - Yönetim → Yedekler: veritabanı kopyaları (indirmek için `BACKUP_ALLOW_DOWNLOAD=true` gerekir)
     ([Yedekleme ve geri yükleme](/installation/backup-restore)).
8. **Audit log'u dışarı aktarın.** Veritabanında `LOG_RETENTION_DAYS` (30) gün kalır ve stdout'a JSON olarak
   yazılır; daha uzun saklamak için stdout'u log platformunuza gönderin ([Elastic](/operations/elastic)).
9. **Volume yedeklerini planlayın** ([Yedek ve geri yükleme](/installation/backup-restore)).
