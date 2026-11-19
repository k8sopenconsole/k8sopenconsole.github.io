---
title: "Air-gapped install"
description: "Run OpenConsole without internet access: the image from your own registry, the manifests from a file, and what the browser still loads from outside."
---

# Air-gapped install

The OpenConsole server needs no internet access: it talks to your clusters' API servers and, if you use them, your
LDAP server, Azure AD, Prometheus and trace receiver. Only the image and the manifests come from outside;
you copy them in once per release. The **browser** loads nothing from the internet either (see
[What the browser loads](#what-the-browser-loads)).

## 1. Copy the image into your registry {#1-copy-the-image-into-your-registry}

On a machine that reaches both `ghcr.io` and your registry, verify the release ([Verify the image](/installation/verify-image)),
then copy it with [crane](https://github.com/google/go-containerregistry/blob/main/cmd/crane/README.md) (or
`skopeo copy --all`). A copy keeps the multi-arch index and its digest:

```bash
crane copy ghcr.io/vurulkan/kubernetes-openconsole:2.24.0 \
  registry.example.internal/openconsole/kubernetes-openconsole:2.24.0
crane digest registry.example.internal/openconsole/kubernetes-openconsole:2.24.0
# sha256:f4d193cf9d2d65aa0c1c863e3221ced13eb0d17cd3d18cff09ecd3cac91935b2
```

The digest is the same as on `ghcr.io`, so the provenance you verified there holds for your copy.

## 2. Bring the manifests in as files {#2-bring-the-manifests-in-as-files}

The [usual kustomization](/installation/kubernetes) fetches `deploy/` from GitHub. Download it once instead:

```bash
curl -sL https://github.com/vurulkan/kubernetes-openconsole/archive/refs/tags/v2.24.0.tar.gz \
  | tar xz --strip-components=1 kubernetes-openconsole-2.24.0/deploy
```

Keep the `deploy/` folder next to your `kustomization.yaml` (in Git), and point both the resource and the image at
your copies. Pin the image by digest:

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

If your registry needs credentials, add an `imagePullSecrets` entry to the same patch. The Elasticsearch files
([Elastic](/operations/elastic)) are in the same `deploy/elk` folder.

## What the browser loads {#what-the-browser-loads}

Everything, the fonts (Inter, Fira Code) and the YAML editor included, is served by OpenConsole itself. The Content
Security Policy allows no other source ([Security model](/operations/security#http)). Up to 2.23.0 the fonts came
from `fonts.googleapis.com` / `fonts.gstatic.com`.

## Upgrading {#upgrading}

Per release: copy the new image (step 1), download the new `deploy/` (step 2), change the digest, and follow
[Upgrading](/installation/upgrading).
