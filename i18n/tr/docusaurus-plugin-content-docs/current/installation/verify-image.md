---
title: "İmajı doğrulama"
description: "Sürüm tag'leri, sürüm sabitleme ve çalıştırmadan önce bir imajın provenance ve SBOM kontrolü."
---

# İmajı doğrulama

## Tag'ler {#tags}

İmajlar `ghcr.io/vurulkan/kubernetes-openconsole` adresine **linux/amd64** ve **linux/arm64** (Graviton, Ampere,
Apple silicon) için yayınlanır; runtime doğru olanı kendisi seçer. İmajları yalnızca projenin CI'ı yayınlar.

| Tag | Neyi gösterir | Değişir mi? |
|---|---|---|
| `X.Y.Z` (ör. `2.23.4`) | o sürümü | hayır: **production'da bunu kullanın** |
| `latest` | en yeni sürümü; o sürümün `X.Y.Z` tag'iyle aynı imaj (aynı digest) | evet, her sürümde |
| `dev-<number>`, `dev-latest` | yayınlanmamış branch'lerin test build'leri | bunları asla production'da çalıştırmayın |

Bir sürüm, `vX.Y.Z` git tag'i push edilerek yayınlanır: CI imajı bir kez derler ve `:X.Y.Z` ile `:latest` olarak
push eder. `main`'e yapılan push'lar derlenir ve test edilir ama hiçbir şey yayınlamaz; `:latest` hiçbir zaman bir
`dev-` imajını göstermez.

`deploy/` içindeki manifest'ler `:latest` imajını `imagePullPolicy: Always` ile kullanır; bu yüzden pod'un herhangi
bir restart'ı sizi yeni bir sürüme geçirebilir. Sürümü [Kubernetes'e kurulum](/installation/kubernetes) sayfasındaki
gibi sabitleyin (`images:` → `newTag`). Bire bir aynı byte'ları sabitlemek için tag yerine digest kullanın:

```bash
# the digest of a tag, after pulling it
docker pull ghcr.io/vurulkan/kubernetes-openconsole:2.23.4
docker inspect --format '{{index .RepoDigests 0}}' ghcr.io/vurulkan/kubernetes-openconsole:2.23.4
# → ghcr.io/vurulkan/kubernetes-openconsole@sha256:f4d193cf9d2d65aa0c1c863e3221ced13eb0d17cd3d18cff09ecd3cac91935b2

# or the digest your cluster is running
kubectl -n kubernetes-openconsole get pod -l app=kubernetes-openconsole \
  -o jsonpath='{.items[0].status.containerStatuses[0].imageID}'
```

```yaml title="kustomization.yaml"
images:
  - name: ghcr.io/vurulkan/kubernetes-openconsole
    digest: sha256:80afd95558454609d9234b48433047bf9167d90031ab0188b8f573cdfaa1ca35   # 2.23.4
```

## Provenance ve SBOM {#provenance-and-sbom}

Her sürüm imajının iki attestation'ı vardır. Bunlar CI workflow'u tarafından
[GitHub artifact attestations](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations)
ile (Sigstore, anahtarsız) imzalanır ve GitHub'da saklanır: bir SLSA **build provenance** (imajı hangi repository'nin,
workflow'un ve commit'in build ettiği) ve bir SPDX **SBOM** (imajdaki tüm paketler). Bunları
[GitHub CLI](https://cli.github.com/) ile kontrol edin:

```bash
# Built by this repository's CI workflow (exit code 0 = verified)
gh attestation verify oci://ghcr.io/vurulkan/kubernetes-openconsole:2.23.4 \
  --repo vurulkan/kubernetes-openconsole \
  --signer-workflow vurulkan/kubernetes-openconsole/.github/workflows/ci.yml
echo $?   # in a script nothing may be printed; 0 = verified

# Download the SBOM (SPDX 2.3 JSON)
gh attestation verify oci://ghcr.io/vurulkan/kubernetes-openconsole:2.23.4 \
  --repo vurulkan/kubernetes-openconsole \
  --predicate-type https://spdx.dev/Document/v2.3 --format json \
  --jq '.[0].verificationResult.statement.predicate' > openconsole-2.23.4.spdx.json
```

Bu repository'nin build etmediği bir imaj, ilk komutta sıfırdan farklı bir exit koduyla başarısız olur. SBOM'u
tarama aracınıza (Grype, Trivy, Dependency-Track) verin.

İmaj public olduğu hâlde `gh attestation verify` ya da `docker pull` **denied** yanıtı veriyorsa `ghcr.io`'ya süresi
dolmuş bir token'la giriş yapmışsınızdır: `docker logout ghcr.io` çalıştırıp tekrar deneyin.

Kyverno ve Sigstore policy-controller, bir pod kabul edilmeden önce aynı attestation'ları kontrol edebilir. 2.14.0 ve
2.14.1 sürümleri ise cosign ile imzalanmıştı (`--certificate-oidc-issuer https://token.actions.githubusercontent.com`
ile `cosign verify`).
