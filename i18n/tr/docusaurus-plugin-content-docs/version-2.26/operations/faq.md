---
title: "SSS"
description: "Neden tek replica, neden Kubernetes RBAC değil, kubectl'den farkı ne, veriler nerede."
---

# SSS

## Neden tam olarak tek replica? {#why-exactly-one-replica}

Veritabanı, ReadWriteOnce bir volume üzerindeki tek bir SQLite dosyasıdır. İkinci bir pod ya hiç başlamaz (volume
başka yere bağlıdır) ya da aynı dosyayı aynı anda açar; bu da yazmaların kaybolmasına ya da bozulmasına yol açar.
Tek bir pod büyük bir ekibe yeter: listeler API server'dan değil, her cluster'ın bellekteki cache'inden gelir. Bir
sürüm yükseltmenin hiçbir zaman aynı anda iki pod çalıştırmaması için `strategy: Recreate` kullanın
([Kubernetes'e kurulum](/installation/kubernetes#why-exactly-one-replica)).

## Neden Kubernetes RBAC yerine kendi izinleri? {#why-its-own-permissions-instead-of-kubernetes-rbac}

OpenConsole her cluster'a tek bir kimlikle bağlanır ve insanlara aksiyonları uygulamanın içinde, namespace ve cluster
bazında verir. Böylece birine, her cluster'da bir Kubernetes kullanıcısı, kubeconfig ya da RoleBinding oluşturmadan,
tek bir cluster'ın tek bir namespace'inde `pods:logs` verebilirsiniz. Bu yerel, LDAP ve Azure AD hesapları ile API
anahtarları için aynı şekilde çalışır; her aksiyon da kişinin adıyla tek bir denetim loguna düşer. Bağlı kimliğin
ClusterRole'ü herkes için üst sınır olarak kalır ([Güvenlik modeli](/operations/security#who-may-do-what)).

## kubectl'den farkı ne? {#how-is-it-different-from-kubectl}

kubectl her kişiye kendi kimlik bilgilerini ve API'nin tamamını verir. OpenConsole ise insanlara sabit bir aksiyon
kümesi (görüntüleme, loglar, shell, restart, ölçekleme, YAML düzenleme, bir Secret'ı gösterme) sunar; bunu tarayıcı
ya da API anahtarı üzerinden, cluster kimlik bilgilerini dağıtmadan yapar ve her birini kaydeder. Nesne oluşturmaz ya
da silmez; deploy için kubectl'in, Helm'in ya da GitOps'un yerini tutmaz.

## Veriler nerede? {#where-is-the-data}

Hepsi OpenConsole volume'undadır: `/data/app.db` (kullanıcılar, roller, cluster'lar ve şifreli kimlik bilgileri,
ayarlar, oturumlar, API anahtarı özetleri, `LOG_RETENTION_DAYS` boyunca denetim logu) ve `/data/recordings` (shell
kayıtları). Sizin yapılandırdıklarınız dışında hiçbir şey başka bir yere gönderilmez: log platformunuz için stdout'taki
loglar, Prometheus için `/metrics`, OTLP alıcınıza trace'ler ([Yedekleme ve geri yükleme](/installation/backup-restore)).

## Cluster'larımda bir şey değiştirir mi? {#does-it-change-anything-in-my-clusters}

Yalnızca izni olan bir kullanıcı restart, ölçekleme, YAML apply yaptığında ya da shell açtığında. Restart ve
ölçekleme, Deployment / StatefulSet'in olağan alanları üzerinden yapılır; YAML apply nesnenin güncellenmesidir
(kullanıcı isterse önce bir dry-run). Hiçbir agent ya da CRD kurmaz; ihtiyaç duyduğu tek nesneler, sizin uyguladığınız
ServiceAccount ve ClusterRole'dür.

## Secret'ları kim görebilir? {#who-can-see-secrets}

Varsayılan olarak yöneticiler dışında kimse. Secret listesi adları, türleri ve anahtar adlarını gösterir; bir değer
yalnızca `secrets:reveal` ile, her seferinde tek bir anahtar olarak gösterilir ve her biri audit'e yazılır
([Secret'lar](/user-guide/secrets)).
