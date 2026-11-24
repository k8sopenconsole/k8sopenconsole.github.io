---
title: "Prometheus"
description: "Daha uzun kullanım geçmişi için cluster başına Prometheus."
---

# Prometheus

Yönetim → Cluster'lar → **Prometheus**, her cluster için ayrı bir ayar. Ayar yoksa cluster'ın grafikleri bellekteki örnekleri kullanır (en fazla 24 saat). Prometheus uyumlu her sorgu API'si çalışır: Prometheus, kube-prometheus-stack, Thanos, Mimir, Cortex, VictoriaMetrics, Azure Monitor managed Prometheus.

| Mod | Ne zaman | Ne gerekir |
|---|---|---|
| **Cluster içinden (API server proxy)** | Prometheus'a yalnızca cluster içinden erişilebiliyorsa (ClusterIP Service; olağan kube-prometheus-stack kurulumu) | namespace, Service, port (*Cluster'da bul* bunları doldurur). OpenConsole, cluster'ın kimlik bilgileriyle Kubernetes API üzerinden gider; bu yüzden ağ erişimi ya da Prometheus parolası gerekmez. Ama ServiceAccount'un o Service üzerinde `services/proxy` `get` iznine ihtiyacı vardır: `deploy/rbac.yaml`'daki kuralın yorumunu kaldırın ve yalnızca kendi Service'inizin adını yazın. |
| **Doğrudan URL** | Prometheus'un OpenConsole'un erişebildiği bir adresi varsa (ingress, Thanos / Mimir, yönetilen servis) | URL (path öneki korunur); kimlik doğrulama: yok, basic, bearer token, **Azure AD** client credentials (scope `https://prometheus.monitor.azure.com/.default`; Azure Monitor managed Prometheus için) ya da client sertifikası; ek header'lar (örn. `X-Scope-OrgID`); CA sertifikası ya da doğrulamayı atlama. |

Parolalar, token'lar, client secret'lar, client key'ler ve header değerleri şifrelenerek saklanır ve asla geri döndürülmez; form bir maske gösterir, maskeyi kaydetmek saklanan değeri korur. Bir değişiklik `changed: [prometheus]` ile `cluster.update` olarak audit'e yazılır.

Tek bir Prometheus birden çok cluster'ı tutuyorsa, onları ayıran label'ı (`cluster`, `cluster_name`, …) ve bu cluster'ın değerini girin; *Bağlantıyı test et* bulduğu değerleri listeler. Bu ayar olmadan grafikler cluster'ları toplar.

**Bağlantıyı test et** şunları sırayla kontrol eder ve ilk hatada durur: erişilebilirlik (DNS / TLS / zaman aşımı ayrı ayrı belirtilir), içeri alınma, adresin bir Prometheus API'si olması, bu cluster için container metrikleri, cluster filtresi ve cAdvisor'ın iki kez scrape edilip edilmediği (zararsızdır: OpenConsole container başına maksimumu alır).

Sorgular cAdvisor metrikleri `container_cpu_usage_seconds_total` ve `container_memory_working_set_bytes`'ı kullanır (kube-state-metrics gerekmez; request ve limit'ler pod spec'inden gelir). Çift scrape'e karşı container bazında `max by` alınır; 60 sn'lik scrape aralıkları da çalışsın diye rate penceresi en az 5 dakikadır. Bir deployment'ın grafiği önceki revizyonlarının pod'larını da içerir. Prometheus başarısız olursa grafik bellekteki örneklere döner ve bunu belirtir.
