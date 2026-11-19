---
title: "Kaldırma"
description: "OpenConsole'u kaldırın ve geride nelerin kaldığını bilin."
---

# Kaldırma

Audit loguna ya da ayarlara ileride ihtiyacınız olabilecekse önce [yedek alın](/installation/backup-restore).

`kustomization.yaml` dosyanızın bulunduğu klasörde:

```bash
kubectl delete -k .
```

`secrets "openconsole-reader-token" not found` hatası zararsızdır: Secret, bir an önce ServiceAccount'uyla birlikte
silinmiştir.

Bu komut `kubernetes-openconsole` namespace'ini ve içindeki her şeyi, ayrıca cluster genelindeki
`openconsole-readonly` ClusterRole'ünü ve ClusterRoleBinding'ini siler. Namespace silinince PersistentVolumeClaim de
silinir; dinamik oluşturulan volume'lerin olağan `Delete` reclaim policy'siyle **veritabanı ve kayıtlar gider**.
StorageClass'ınız `Retain` kullanıyorsa PersistentVolume, siz silene kadar kalır (`kubectl get pv`).

Geride kalanlar:

| Ne | Nerede | Nasıl kaldırılır |
|---|---|---|
| Bağladığınız **diğer** her cluster'daki ServiceAccount, token'ı ve ClusterRole | o cluster'lar | `kubectl --context <cluster> delete -f https://raw.githubusercontent.com/vurulkan/kubernetes-openconsole/v2.24.0/deploy/rbac.yaml`, ardından `kubectl --context <cluster> delete namespace kubernetes-openconsole` |
| Kustomization dışında oluşturduysanız Ingress'iniz ve TLS Secret'ı | namespace (onunla birlikte silinir) ya da onları koyduğunuz yer | `kubectl delete -f ingress.yaml` |
| Log platformunuza gönderilmiş audit satırları | Elasticsearch, Loki, … | platformunuzun saklama süresi |
| `deploy/elk/install.sh`'ın kurduğu Elasticsearch pipeline'ı ve template'leri | Elasticsearch | [`deploy/elk/README.md` → Remove](https://github.com/vurulkan/kubernetes-openconsole/blob/main/deploy/elk/README.md#remove) |

Bir cluster'da ServiceAccount'u silmek token'ını da geçersiz kılar; böylece veritabanı yedeği başka bir yere geri
yüklense bile o cluster'a artık erişemez.

Docker hızlı başlangıcı için: `docker rm -f openconsole && docker volume rm openconsole-data`.
