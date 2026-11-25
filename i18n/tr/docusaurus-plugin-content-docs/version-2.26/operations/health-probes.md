---
title: "Sağlık probe'ları"
description: "/livez, /readyz ve /healthz: her biri neyi kontrol eder, bağlı cluster'lar neden readiness'e dahil değildir."
---

# Sağlık probe'ları

HTTP port'unda, giriş gerektirmeyen üç uç:

| Uç | Kontrol ettiği | Cevap |
|---|---|---|
| `GET /livez` | process istek kabul ediyor | `200 live` |
| `GET /readyz` | veritabanı cevap veriyor | `200 ready` ya da `503 db not reachable` |
| `GET /healthz` | `/livez` ile aynı (eski probe'lar için duruyor) | `200 ok` |

```bash
kubectl -n kubernetes-openconsole port-forward svc/kubernetes-openconsole 8080:80 &
curl -s localhost:8080/livez; echo; curl -s localhost:8080/readyz; echo
# live
# ready
```

`deploy/` içindeki manifest bunları şöyle kullanır (değiştirmeniz gerekmemeli):

| Probe | Yol | Zamanlama |
|---|---|---|
| liveness | `/livez` | 10 sn sonra başlar, 15 sn'de bir, 3 sn timeout, 3 başarısızlıkta restart |
| readiness | `/readyz` | 5 sn sonra başlar, 10 sn'de bir, 3 sn timeout, 3 başarısızlıkta Service'ten çıkar |

## Cluster'lar neden readiness'e dahil değil {#why-the-clusters-are-not-part-of-readiness}

OpenConsole her biri kendi kimlik bilgileriyle birkaç cluster'a bağlanır. Readiness onlara bağlı olsaydı, erişilemeyen
tek bir cluster ya da süresi dolmuş tek bir token bütün konsolu Service'ten çıkarırdı: kimse giriş yapamazdı, o
cluster'ın kimlik bilgilerini düzeltmesi gereken yönetici de. Bu yüzden readiness yalnızca her isteğin ihtiyaç duyduğu
şeyi, yani veritabanını kontrol eder. Bir cluster'ın durumu ait olduğu yerde görünür: o cluster'a giden istekler hata
döner, bağlantı gauge'u `openconsole_cluster_connected`'dır ([Metrikler](/operations/metrics)) ve client hataları
logdadır ([Sorun giderme](/operations/troubleshooting#a-cluster-shows-empty-lists-or-503)).

Liveness de veritabanını kontrol etmez; veritabanındaki kısa bir aksaklık pod'u yeniden başlatmaz.

## Loglama {#logging}

Başarılı probe ve `/metrics` istekleri yalnızca `LOG_LEVEL=debug` iken loglanır; kubelet'in 10–15 saniyede bir gelen
probe'ları logu doldurmaz. Başarısız bir probe kendi seviyesini korur: 503 dönen `/readyz` bir `error` satırıdır.
Probe'lar ve `/metrics` trace'lenmez.
