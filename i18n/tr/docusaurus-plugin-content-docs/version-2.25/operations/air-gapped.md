---
title: "İnternetsiz (air-gapped) kurulum"
description: "OpenConsole'u internet erişimi olmadan çalıştırın: imaj kendi registry'nizden, manifest'ler dosyadan; tarayıcının hâlâ dışarıdan yüklediği şeyler."
---

# İnternetsiz (air-gapped) kurulum

OpenConsole server'ının internet erişimine ihtiyacı yoktur: cluster'larınızın API server'larıyla ve kullanıyorsanız
LDAP server'ınız, Azure AD, Prometheus ve trace alıcınızla konuşur. Dışarıdan yalnız imaj ve manifest'ler gelir; her
release'te bir kez içeri kopyalarsınız. **Tarayıcı** da internetten hiçbir şey yüklemez (bkz.
[Tarayıcının yükledikleri](#what-the-browser-loads)).

## 1. İmajı registry'nize kopyalayın {#1-copy-the-image-into-your-registry}

Hem `ghcr.io`'ya hem registry'nize erişebilen bir makinede release'i doğrulayın ([İmajı doğrulama](/installation/verify-image)),
sonra [crane](https://github.com/google/go-containerregistry/blob/main/cmd/crane/README.md) ile (ya da
`skopeo copy --all` ile) kopyalayın. Kopya, multi-arch index'i ve digest'ini korur:

```bash
crane copy ghcr.io/vurulkan/kubernetes-openconsole:2.25.0 \
  registry.example.internal/openconsole/kubernetes-openconsole:2.25.0
crane digest registry.example.internal/openconsole/kubernetes-openconsole:2.25.0
# sha256:f4d193cf9d2d65aa0c1c863e3221ced13eb0d17cd3d18cff09ecd3cac91935b2
```

Digest `ghcr.io`'dakiyle aynıdır; orada doğruladığınız provenance kopyanız için de geçerlidir.

## 2. Manifest'leri dosya olarak içeri alın {#2-bring-the-manifests-in-as-files}

[Olağan kustomization](/installation/kubernetes) `deploy/` klasörünü GitHub'dan çeker. Bunun yerine bir kez indirin:

```bash
curl -sL https://github.com/vurulkan/kubernetes-openconsole/archive/refs/tags/v2.25.0.tar.gz \
  | tar xz --strip-components=1 kubernetes-openconsole-2.25.0/deploy
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

Fontlar (Inter, Fira Code) ve YAML editörü dahil her şeyi OpenConsole'un kendisi sunar. Content Security Policy başka
hiçbir kaynağa izin vermez ([Güvenlik modeli](/operations/security#http)). 2.23.0'a kadar fontlar
`fonts.googleapis.com` / `fonts.gstatic.com`'dan geliyordu.

## Sürüm yükseltme {#upgrading}

Her release'te: yeni imajı kopyalayın (1. adım), yeni `deploy/` klasörünü indirin (2. adım), digest'i değiştirin ve
[Sürüm yükseltme](/installation/upgrading) sayfasını izleyin.
