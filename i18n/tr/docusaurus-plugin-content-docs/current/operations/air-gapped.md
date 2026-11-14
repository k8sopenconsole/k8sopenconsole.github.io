---
title: "İnternetsiz (air-gapped) kurulum"
description: "OpenConsole'u internet erişimi olmadan çalıştırın: imaj kendi registry'nizden, manifest'ler dosyadan; tarayıcının hâlâ dışarıdan yüklediği şeyler."
---

# İnternetsiz (air-gapped) kurulum

OpenConsole server'ının internet erişimine ihtiyacı yoktur: cluster'larınızın API server'larıyla ve kullanıyorsanız
LDAP server'ınız, Azure AD, Prometheus ve trace alıcınızla konuşur. Dışarıdan iki şey gelir: her release'te bir kez
içeri kopyaladığınız imaj ve manifest'ler, bir de **tarayıcının** public CDN'lerden yüklediği iki dosya (bkz.
[Tarayıcının yükledikleri](#what-the-browser-loads)).

## 1. İmajı registry'nize kopyalayın {#1-copy-the-image-into-your-registry}

Hem `ghcr.io`'ya hem registry'nize erişebilen bir makinede release'i doğrulayın ([İmajı doğrulama](/installation/verify-image)),
sonra [crane](https://github.com/google/go-containerregistry/blob/main/cmd/crane/README.md) ile (ya da
`skopeo copy --all` ile) kopyalayın. Kopya, multi-arch index'i ve digest'ini korur:

```bash
crane copy ghcr.io/vurulkan/kubernetes-openconsole:2.22.0 \
  registry.example.internal/openconsole/kubernetes-openconsole:2.22.0
crane digest registry.example.internal/openconsole/kubernetes-openconsole:2.22.0
# sha256:f4d193cf9d2d65aa0c1c863e3221ced13eb0d17cd3d18cff09ecd3cac91935b2
```

Digest `ghcr.io`'dakiyle aynıdır; orada doğruladığınız provenance kopyanız için de geçerlidir.

## 2. Manifest'leri dosya olarak içeri alın {#2-bring-the-manifests-in-as-files}

[Olağan kustomization](/installation/kubernetes) `deploy/` klasörünü GitHub'dan çeker. Bunun yerine bir kez indirin:

```bash
curl -sL https://github.com/vurulkan/kubernetes-openconsole/archive/refs/tags/v2.22.0.tar.gz \
  | tar xz --strip-components=1 kubernetes-openconsole-2.22.0/deploy
```

`deploy/` klasörünü `kustomization.yaml`'ınızın yanında (Git'te) tutun; hem resource'u hem imajı kendi
kopyalarınıza yönlendirin. İmajı digest ile sabitleyin:

```yaml title="kustomization.yaml"
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - deploy
images:
  - name: ghcr.io/vurulkan/kubernetes-openconsole
    newName: registry.example.internal/openconsole/kubernetes-openconsole
    digest: sha256:f4d193cf9d2d65aa0c1c863e3221ced13eb0d17cd3d18cff09ecd3cac91935b2
patches:
  - patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: kubernetes-openconsole
        namespace: kubernetes-openconsole
      spec:
        strategy:
          type: Recreate
          rollingUpdate: null
        template:
          spec:
            containers:
              - name: dashboard
                imagePullPolicy: IfNotPresent
```

```bash
kubectl apply -k .
kubectl -n kubernetes-openconsole get pod -l app=kubernetes-openconsole \
  -o jsonpath='{.items[0].spec.containers[0].image}{"\n"}'
# registry.example.internal/openconsole/kubernetes-openconsole@sha256:f4d193cf…
```

Registry'niz kimlik bilgisi istiyorsa aynı patch'e bir `imagePullSecrets` girdisi ekleyin. Elasticsearch dosyaları
([Elastic](/operations/elastic)) aynı `deploy/elk` klasöründedir.

## Tarayıcının yükledikleri {#what-the-browser-loads}

| Nereden | Ne | Olmazsa |
|---|---|---|
| `cdn.jsdelivr.net` | YAML editörü (Monaco); biri bir YAML görünümü açtığında yüklenir | YAML penceresi açılır ve *Yükleniyor…*'da kalır: YAML, OpenConsole'da görüntülenemez ve düzenlenemez. YAML için `kubectl` kullanın |
| `fonts.googleapis.com`, `fonts.gstatic.com` | Inter ve Fira Code fontları | tarayıcının kendi fontları kullanılır; başka hiçbir şey değişmez |

Geri kalan her şey (listeler, ayrıntılar, loglar, shell'ler, restart ve ölçekleme, Secret'lar, yönetim ekranları)
OpenConsole'un kendisi tarafından sunulur ve bunlar olmadan da çalışır. Bu release'te editörü OpenConsole'dan sunmak
için bir ayar yok; kullanıcılarınızın tarayıcıları `cdn.jsdelivr.net`'e bir proxy üzerinden erişebiliyorsa editör
her zamanki gibi çalışır. Content Security Policy tam olarak bu kaynaklara izin verir ([Güvenlik modeli](/operations/security#http)).

## Sürüm yükseltme {#upgrading}

Her release'te: yeni imajı kopyalayın (1. adım), yeni `deploy/` klasörünü indirin (2. adım), digest'i değiştirin ve
[Sürüm yükseltme](/installation/upgrading) sayfasını izleyin.
