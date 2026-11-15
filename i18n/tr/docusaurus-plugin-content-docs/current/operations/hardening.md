---
title: "Production sıkılaştırma kontrol listesi"
sidebar_label: "Sıkılaştırma kontrol listesi"
description: "Gerçek kullanıcılardan ve gerçek cluster'lardan önce OpenConsole'un çevresine kurulacaklar: erişim, ağ, secret'lar, kayıtlar."
---

# Production sıkılaştırma kontrol listesi

OpenConsole cluster'larınızın kimlik bilgilerini tutar ve insanların onlar üzerinde işlem yapmasını sağlar. Bu yüzden
pod'unu, volume'unu ve yönetici hesaplarını o kimlik bilgileri kadar ciddiye alın. Kullanıcılara açmadan önce bu
listeyi baştan sona geçin. Her maddenin neden önemli olduğu [Güvenlik modeli](/operations/security) sayfasında.

## Cluster erişimi {#cluster-access}

- **Verdiğiniz izinleri karşılayan en küçük ClusterRole.** Bir cluster'da kimse OpenConsole üzerinden restart,
  ölçekleme, düzenleme yapmıyor ya da shell açmıyorsa, cluster'ı salt görüntüleme ClusterRole'üyle bağlayın
  ([Tam ya da salt okuma](/installation/connect-cluster#full-or-read-only)). Tam ClusterRole'de, hiçbir `secrets:*`
  izni vermiyorsanız Secret'lar kuralını, `secrets:edit` vermiyorsanız o kuraldaki `update` verb'ünü silin.
  `services/proxy`'nin yorumunu yalnızca Prometheus için ve yalnızca kendi Prometheus Service'iniz için kaldırın.
  OpenConsole port-forward kullanmaz, bu yüzden onun için bir kurala gerek yoktur. Her kural ve ne işe yaradığı:
  [Kubernetes izinleri](/reference/kubernetes-permissions).
- **Yazma yalnızca gereken yerde**: okumaları cluster genelinde bırakın; Secret'ları, shell'leri ve yazma verb'lerini
  namespace başına bağlayın ([Yazma yalnızca bazı namespace'lerde](/installation/connect-cluster)).
- **Her cluster için bir ServiceAccount, asla kişisel bir kubeconfig değil**; token'ını yenilemek için de bir plan,
  örneğin 6 ile 12 ayda bir ([Token'ı yenileme](/installation/connect-cluster#rotate-the-token)). Üretilen token'ları
  Git'te tutmayın.
- **OpenConsole'un çalıştığı her cluster'da OpenConsole namespace'ini koruyun.** Kubernetes'te OpenConsole pod'una
  `exec` yapabilen, volume'unu ya da Secret'larını okuyabilen herkes, OpenConsole'un tuttuğu bütün cluster kimlik
  bilgilerini ele geçirir. Bu Kubernetes izinlerini OpenConsole'u işleten kişilerle sınırlı tutun.

## Deployment {#the-deployment}

- **Release'i sabitleyin ve `Recreate` kullanın** ([Kubernetes'e kurulum](/installation/kubernetes#1-write-a-kustomization)),
  tek replica çalıştırın ve çalıştırdığınız imajı doğrulayın ([İmajı doğrulama](/installation/verify-image)).
- **Manifest'in container ayarlarını koruyun**: `/tmp` `emptyDir`'iyle salt okunur kök dosya sistemi, root olmayan
  kullanıcı, capability yok, ServiceAccount token'ı yok. İmajda shell yoktur; pod'un içine bakmak için geçici bir
  container kullanın (`kubectl debug -it <pod> --image=busybox:1.36 --target=dashboard`).
- **Başka sitelerden gelen WebSocket'leri reddedin**: log bir süre hiç `ws.origin_mismatch` göstermediyse
  `WS_ORIGIN_CHECK=enforce` ayarlayın. Başka bir sitenin sayfası API'yi çağırmak zorunda değilse `ALLOWED_ORIGINS`'i
  boş bırakın ([Güvenlik modeli](/operations/security#http)).
- **TLS Ingress'te olsun, Service'in önünde başka hiçbir şey olmasın.** OpenConsole düz HTTP konuşur. Denetim logu ve
  giriş kilidi için istemci adresini `X-Forwarded-For`'dan yalnızca bağlantı `TRUSTED_PROXIES`'teki bir proxy'den
  geliyorsa alır (manifest özel ağları listeler); bunu Ingress controller'ınızın pod ağına ayarlayın, böylece içeri tek
  giriş yolu o proxy olur ([TLS'li Ingress](/installation/kubernetes#ingress-with-tls),
  [Ortam değişkenleri](/reference/environment-variables)).
- **Yalnızca Ingress controller'ınızı ve Prometheus'unuzu içeri alan bir NetworkPolicy.** `/metrics` giriş istemez;
  onu Ingress üzerinden de yönlendirmeyin. Aynı policy
  [`deploy/optional/networkpolicy.yaml`](https://github.com/vurulkan/kubernetes-openconsole/blob/dev/deploy/optional/networkpolicy.yaml)
  dosyasında da var. İki namespace adını kendinizinkilerle değiştirin:

  ```yaml title="networkpolicy.yaml"
  apiVersion: networking.k8s.io/v1
  kind: NetworkPolicy
  metadata:
    name: kubernetes-openconsole
    namespace: kubernetes-openconsole
  spec:
    podSelector:
      matchLabels:
        app: kubernetes-openconsole
    policyTypes: [Ingress]
    ingress:
      - from:   # your Ingress controller's namespace
          - namespaceSelector:
              matchLabels:
                kubernetes.io/metadata.name: ingress-nginx
        ports:
          - port: 8080
      - from:   # Prometheus, for /metrics
          - namespaceSelector:
              matchLabels:
                kubernetes.io/metadata.name: monitoring
        ports:
          - port: 8080
  ```

  ```bash
  kubectl apply -f networkpolicy.yaml
  # from any other namespace the console is now closed:
  kubectl -n default run nptest --rm -i --restart=Never --image=busybox:1.36 -- \
    wget -q -T 4 -O- http://kubernetes-openconsole.kubernetes-openconsole/readyz
  # wget: can't connect to remote host (10.43.245.184): Connection refused
  ```

  Kubelet probe'ları ve `kubectl port-forward` çalışmaya devam eder. Giden trafik açık bırakılır: OpenConsole'un API
  server'larınıza ve kullanıyorsanız LDAP'a, `login.microsoftonline.com`'a ve Prometheus'a erişmesi gerekir.

## Hesaplar ve erişim {#accounts-and-access}

- **`admin` şifresini ilk girişte değiştirin**; günlük işler için LDAP ya da Azure AD ile giriş yapın, acil durumlar
  için bir yerel yönetici hesabı tutun ([İlk giriş](/getting-started/first-login)).
- **Az sayıda yönetici.** Bir yönetici, Secret'lar ve shell'ler dahil her cluster'da her izne sahiptir. Diğer
  herkese rol verin ([Erişim modeli](/administration/access-model)).
- **`secrets:reveal`, `secrets:edit` ve `pods:exec`'i dar tutun**: namespace bazında, cluster bazında, yalnızca
  ihtiyacı olan rollere. Kimlik bilgilerini gösteren izinler bunlardır.
- **Kullanmadığınızı kapatın**, herkes için, özellik bayraklarıyla: `FEATURE_POD_EXEC=false`,
  `FEATURE_SECRET_REVEAL=false`, `FEATURE_API_KEYS=false`, …
  ([Özellik bayrakları](/administration/customization-and-flags#feature-flags)).
- Politikanıza uyan bir **hareketsizlik süresi** (varsayılan 60 dakika; oturum en geç 12 saat sonra biter) ve bir **API anahtarı süre politikası**: bir anahtarın
  sahip olabileceği en uzun ömür ([Oturum ömrü ve API anahtarı süresi](/administration/sessions#session-lifetime-and-api-key-expiry)).
- Agent'lar daha fazlasına ihtiyaç duymadıkça **API erişim politikasını roller için *Güvenli salt okuma*'da tutun**
  ([API erişim politikası](/administration/api-access-policy)).
- **Erişimleri düzenli gözden geçirin**: Yönetim → Kullanıcılar / Gruplar → CSV olarak dışa aktar; bütün anahtarlar
  için de Yönetim → API anahtarları.

## Kayıtlar {#records}

- **Denetim logunu** log platformunuza gönderin ve gerektiği kadar saklayın; veritabanı 30 gün tutar
  ([Elastic](/operations/elastic#keep-the-audit-trail-as-long-as-you-need)).
- Reddedilen aksiyonlar, kilitlenen girişler ve gösterilen secret'lar için **alarm** kurun ([Metrikler ve alarmlar](/operations/metrics#alerts)).
- **`secret.reveal`, `secret.view_yaml`, `secret.apply` ve `pod.exec` denetim olaylarını gözden geçirin**: kimlik
  bilgilerini açığa çıkarabilen aksiyonlar bunlardır ([Denetim olayları](/reference/audit-events)).
- **Shell kaydını açık tutun** ve saklama süresini ayarlayın (Yönetim → Kayıtlar). Kayıtlar, bir shell'in ekrana
  bastığı her şeyi içerir; yalnızca yöneticiler oynatabilir ([Oturum kaydı](/administration/recordings)).

## Volume {#the-volume}

- **Şifreleme anahtarını veritabanının dışında tutun** (bir Secret'tan `ENCRYPTION_KEY_FILE`) ve anahtarın bir
  kopyasını başka bir yerde saklayın ([Yedekleme ve geri yükleme](/installation/backup-restore)).
- **Yedekleri volume'un dışına kopyalayın ve cluster kimlik bilgileri gibi koruyun.** OpenConsole her gün
  `/data/backups`'a, yani aynı volume'a bir yedek yazar; volume kaybolursa onlar da kaybolur. Kullanmıyorsanız
  `BACKUP_ALLOW_DOWNLOAD`'ı kapalı bırakın ([Yedekleme ve geri yükleme](/installation/backup-restore)).
- **Volume'u şifreleyin:** platformunuz destekliyorsa depolama katmanında (şifreli StorageClass, şifreli
  snapshot'lar).
