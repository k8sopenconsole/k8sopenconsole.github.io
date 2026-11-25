---
title: "Hızlı başlangıç (Docker)"
sidebar_label: "Hızlı başlangıç"
description: "OpenConsole'u tek bir docker run ile yerelde çalıştırın, giriş yapın ve bir cluster bağlayın."
---

# Hızlı başlangıç (Docker)

Makinenizde tek bir container; etrafa göz atmak için yeterli. Bir ekip için [Kubernetes'e kurun](/installation/kubernetes).

## 1. Başlatın {#1-start-it}

```bash
docker run -d --name openconsole -p 8080:8080 \
  -v openconsole-data:/data \
  ghcr.io/vurulkan/kubernetes-openconsole:2.26.0
```

| Parça | Anlamı |
|---|---|
| `-p 8080:8080` | arayüz ve API, http://localhost:8080 adresinde |
| `-v openconsole-data:/data` | SQLite veritabanı ve shell kayıtları; yeniden başlatmalarda korunur. Sonra silinecek bir deneme için bunu çıkarın |
| `:2.26.0` | sürüm. İmajlar `linux/amd64` ve `linux/arm64` için var |

Ayakta olduğunu kontrol edin: `curl http://localhost:8080/readyz` `ready` yanıtını verir.

## 2. Giriş yapın {#2-sign-in}

http://localhost:8080 adresini açın ve **`admin` / `admin`** ile giriş yapın. Başka hiçbir şey çalışmadan önce
yeni bir parola seçmeniz istenir (en az 8 karakter, `PASSWORD_MIN_LENGTH`). Değişiklikten sonra oturumunuz kapanır;
yeni parolayla tekrar giriş yapın.

## 3. Bir cluster bağlayın {#3-connect-a-cluster}

OpenConsole hiçbir cluster'ı kendiliğinden almaz. Cluster'ı **Yönetim → Cluster'lar → Cluster Ekle** ekranından,
bir API server URL'i, bir ServiceAccount token'ı ve onun CA sertifikasıyla eklersiniz.
[Cluster bağlama](/installation/connect-cluster) sayfası bu ServiceAccount'un nasıl oluşturulacağını (adım 1: bir
namespace ve tek bir `kubectl apply`) ve token'ı ile CA'sının nasıl okunacağını (adım 2) anlatır.

API server'a **container'ın içinden** erişilebilmelidir. `127.0.0.1`'i gösteren bir kubeconfig (Docker Desktop,
kind, k3d) olduğu gibi çalışmaz: container'ın içinde bu adres container'ın kendisidir.

- Bir k3d cluster'ı için container'ı cluster'ın ağında çalıştırın (1. adımdakinin yerine; veri volume'u yerinde
  kalır):

  ```bash
  docker rm -f openconsole
  docker run -d --name openconsole --network k3d-<name> -p 8080:8080 \
    -v openconsole-data:/data \
    ghcr.io/vurulkan/kubernetes-openconsole:2.26.0
  ```

  ve API server olarak `https://k3d-<name>-server-0:6443` kullanın. [k3d'de deneyin](/getting-started/try-on-k3d)
  ise OpenConsole'u cluster'ın içinde çalıştırır; bu daha basittir.
- Uzak bir cluster için kubeconfig'inizdeki API server adresini kullanın
  (`kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}'`).

**Cluster'ı kaydet**'e tıkladıktan sonra (bağlantı, kaydedilmeden önce kontrol edilir) **Varsayılan yap**'a
tıklayın. Panel artık cluster'ın namespace'lerini gösterir.

## 4. Durdurun ya da kaldırın {#4-stop-or-remove-it}

```bash
docker stop openconsole && docker rm openconsole   # keeps the data volume
docker volume rm openconsole-data                  # deletes users, settings, audit log
```
