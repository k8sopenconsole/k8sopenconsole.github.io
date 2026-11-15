---
title: "Connect a cluster"
description: "ServiceAccount and ClusterRole, token or kubeconfig, what each rule is for, token rotation, Prometheus."
---

# Connect a cluster

OpenConsole talks to each cluster as one identity, usually a ServiceAccount, and enforces per-user access itself
(Users → Groups → Roles). That identity's RBAC is the ceiling: no user can do more than it allows, whatever their
role says.

Clusters are added **only in the UI** (Admin → Clusters), never from environment variables or the pod's own
ServiceAccount, not even the cluster OpenConsole runs in. Two methods:

| Method | You paste | Use it when |
|---|---|---|
| **ServiceAccount Token** | API server URL + token + CA certificate | the usual case: a ServiceAccount made for OpenConsole (steps 1–3 below) |
| **Kubeconfig** | a kubeconfig file | you already have a kubeconfig for an identity meant for OpenConsole, with a static token or client certificate |

The credentials are checked against the API server before they are saved (a real namespace list, so a wrong
server, token or CA is refused) and stored encrypted in the database. Every cluster is connected at startup.

## 1. Create the ServiceAccount {#1-create-the-serviceaccount}

Skip this for a kubeconfig whose identity you already manage; its RBAC must then cover what OpenConsole should do
([the table below](#what-each-clusterrole-rule-is-for)).

On the cluster OpenConsole runs in, [the install](/installation/kubernetes) already created it. On every other
cluster:

```bash
kubectl --context <cluster> create namespace kubernetes-openconsole
kubectl --context <cluster> apply -f \
  https://raw.githubusercontent.com/vurulkan/kubernetes-openconsole/v2.23.0/deploy/rbac.yaml
```

This creates:

- ServiceAccount `openconsole-reader` in namespace `kubernetes-openconsole`
- Secret `openconsole-reader-token`: a long-lived token; Kubernetes fills in `token` and `ca.crt`
- ClusterRole `openconsole-readonly` and a ClusterRoleBinding to the ServiceAccount

The OpenConsole pod does **not** run as this ServiceAccount (its Deployment mounts no token). The ServiceAccount
only exists to mint the token you paste into the UI.

### Full or read-only {#full-or-read-only}

| File | ClusterRole | What works | What Kubernetes refuses (403) |
|---|---|---|---|
| [`rbac.yaml`](https://github.com/vurulkan/kubernetes-openconsole/blob/main/deploy/rbac.yaml) | reads + the write verbs OpenConsole uses | everything | — |
| [`rbac-readonly.yaml`](https://github.com/vurulkan/kubernetes-openconsole/blob/main/deploy/rbac-readonly.yaml) | `get` / `list` / `watch` only | every Dashboard tab, Live Events, logs, Overview, Nodes, CPU / memory | restart, scale, YAML apply, pod shell. **Secrets are not included at all** |

Both files use the same names, so applying one replaces the other in place; nothing changes in the UI. With
`rbac-readonly.yaml`, also leave write actions out of your OpenConsole roles, so users don't see buttons that only
fail. Logs are included; remove the `pods/log` rule if read-only should also mean no logs.

Secrets are left out of the read-only file on purpose: at the Kubernetes level `get` on Secrets means reading their
values, so the OpenConsole permission `secrets:reveal` would be the only protection. If you need the Secrets tab with
metadata only, uncomment the rule and grant `secrets:list` / `secrets:get` only.

### Writes in some namespaces only {#writes-in-some-namespaces-only}

`rbac.yaml` lets OpenConsole read Secrets, open shells and change workloads in every namespace, `kube-system`
included. To allow that only in the namespaces you choose, keep the reads cluster-wide (OpenConsole watches pods,
Deployments, … across the cluster) and bind the write rights per namespace with
[`deploy/optional/rbac-namespaced-writes.yaml`](https://github.com/vurulkan/kubernetes-openconsole/blob/dev/deploy/optional/rbac-namespaced-writes.yaml):

```bash
kubectl apply -f https://raw.githubusercontent.com/vurulkan/kubernetes-openconsole/dev/deploy/rbac-readonly.yaml
curl -sL https://raw.githubusercontent.com/vurulkan/kubernetes-openconsole/dev/deploy/optional/rbac-namespaced-writes.yaml \
  | sed 's/namespace: team-a/namespace: payments/' | kubectl apply -f -
```

Run the second command once per namespace, with its name. Elsewhere Kubernetes refuses: the Secrets tab says
*OpenConsole's account on this cluster may not read this (check its ClusterRole).* (`403` `cluster_forbidden`), a shell or a command
fails (`exec_failed`), and restart, scale and YAML apply fail with the API server's message. Keep the OpenConsole
roles in line, so users don't get buttons that only fail. If you install with the `deploy/` folder, list the files
instead ([Install on Kubernetes](/installation/kubernetes#2-apply-it)), or every `kubectl apply -k` puts `rbac.yaml`
back.

### What each ClusterRole rule is for {#what-each-clusterrole-rule-is-for}

Delete the rules for permissions you will never grant (from a copy of the file).

| Rule (`rbac.yaml`) | Needed for | Without it |
|---|---|---|
| `namespaces, pods, services, configmaps, events`: get / list / watch | every Dashboard tab, Live Events | OpenConsole can't list anything |
| `secrets`: get / list | `secrets:list`, `secrets:get`, `secrets:reveal` | the Secrets tab says *"OpenConsole's account on this cluster may not read this"* |
| `secrets`: update | `secrets:edit` | applying a Secret's YAML fails with 403 |
| `pods/log`: get | pod / deployment / job logs (`pods:logs`) | logs fail with 403 |
| `pods/exec`: create | pod shell and one-command exec (`pods:exec`) | the shell fails with 403 |
| `pods, services, configmaps`: update | YAML apply (`{resource}:edit`) | apply fails with 403 |
| `deployments, daemonsets, statefulsets`: get / list / watch / update | their tabs, YAML apply | the tabs show an error; apply fails with 403 |
| `deployments`: patch | `deployments:restart` | restart fails with 403 |
| `deployments/scale, statefulsets/scale`: get / update | `deployments:scale`, `statefulsets:scale` | scale fails with 403 |
| `horizontalpodautoscalers, ingresses, cronjobs, jobs`: get / list / watch / update | their tabs, YAML apply | the tabs show an error; apply fails with 403 |
| `replicasets`: get / list | a Deployment's revisions in its drawer | no revisions |
| `metrics.k8s.io` `pods`: get / list | CPU / memory of pods and workloads (needs metrics-server) | no CPU / memory; the Pods tab says why |
| `nodes`: get / list / watch, `metrics.k8s.io` `nodes`: get / list | Overview (node count, % of allocatable, node strip) and Nodes | the Overview shows absolute CPU / memory and no node strip; Nodes says the token can't list nodes. Without `watch` nodes are listed on every request |
| `services/proxy`: get on your Prometheus Service (commented out) | Prometheus "in the cluster" mode | the Prometheus test fails at the first step |

## 2. Read the token and CA {#2-read-the-token-and-ca}

Run this against the cluster you are adding (`CTX` is its kubectl context):

```bash
CTX=<cluster>
NS=kubernetes-openconsole
TOKEN=$(kubectl --context $CTX -n $NS get secret openconsole-reader-token -o jsonpath='{.data.token}' | base64 -d)
CA=$(kubectl --context $CTX -n $NS get secret openconsole-reader-token -o jsonpath='{.data.ca\.crt}')   # already base64, use as is
SERVER=$(kubectl config view --context $CTX --minify -o jsonpath='{.clusters[0].cluster.server}')
echo "$SERVER"; echo "$TOKEN"; echo "$CA"
```

`SERVER` must be reachable **from the OpenConsole pod** (network policies, private endpoints). For the cluster
OpenConsole runs in, use `https://kubernetes.default.svc` instead.

## 3. Add it in the UI {#3-add-it-in-the-ui}

### ServiceAccount Token method {#serviceaccount-token-method}

**Admin → Clusters → Add Cluster**:

| Field | Value |
|---|---|
| Name | anything, e.g. `prod-west`; it appears in the cluster switcher and in every audit event |
| Description | optional |
| Method | `ServiceAccount Token` (the form opens on Kubeconfig) |
| API Server | `$SERVER`, or `https://kubernetes.default.svc` for the cluster OpenConsole runs in |
| Token | `$TOKEN` |
| CA Cert (base64) | `$CA`. Leave it empty only if the API server's certificate is signed by a public CA |

**Save Cluster** checks the connection. On the first cluster, click **Set as default**: users who haven't picked a
cluster work on the default; everyone can switch to another cluster their permissions cover.

### Kubeconfig method {#kubeconfig-method}

Under **Method: Kubeconfig → Upload kubeconfig**, upload a kubeconfig whose identity uses a static token or a
client certificate. To build one from the ServiceAccount above:

```bash
cat > openconsole-prod-west.kubeconfig <<EOF
apiVersion: v1
kind: Config
clusters:
- name: target
  cluster:
    server: ${SERVER}
    certificate-authority-data: ${CA}
users:
- name: openconsole-reader
  user:
    token: ${TOKEN}
contexts:
- name: openconsole
  context:
    cluster: target
    user: openconsole-reader
current-context: openconsole
EOF
```

:::warning Not your personal kubeconfig
A kubeconfig may only carry its credentials **inline**: `token`, `client-certificate-data` / `client-key-data`,
`certificate-authority-data`. One that signs in through an exec plugin (`kubelogin`, `aws eks get-token`,
`gke-gcloud-auth-plugin`), an `auth-provider`, or reads a file (`tokenFile`, `client-certificate`, `client-key`,
`certificate-authority`) is refused with `kubeconfig_unsupported: …`: it would run a program or read a file inside
the OpenConsole pod. A personal kubeconfig would also make OpenConsole act as you instead of as a dedicated
identity.
:::

## Rotate the token {#rotate-the-token}

The token of `openconsole-reader-token` never expires. To replace it, delete the **ServiceAccount**, not only the
Secret, and apply the file again:

```bash
CTX=<cluster>
NS=kubernetes-openconsole
kubectl --context $CTX -n $NS delete serviceaccount openconsole-reader          # its token Secret goes with it
kubectl --context $CTX -n $NS wait --for=delete secret/openconsole-reader-token --timeout=60s
kubectl --context $CTX apply -f \
  https://raw.githubusercontent.com/vurulkan/kubernetes-openconsole/v2.23.0/deploy/rbac.yaml
```

Deleting and re-creating only the Secret gives you **the same token again**: Kubernetes derives a ServiceAccount
token from the ServiceAccount and the Secret's name, so the "new" token is identical and the old one keeps working.
A new ServiceAccount gets a new identity, and the old token is refused at once. (The comment in `rbac.yaml` up to
2.23.0 described the Secret-only way; it was wrong.)

Then read the new token and CA (step 2), click **Edit** on the cluster in **Admin → Clusters**, tick **Replace
credentials** and paste the new token. Leave the CA field empty: the stored CA stays (the API server's certificate
didn't change). For a kubeconfig cluster, upload the new file.

Until you do, every cluster entry that uses the old token (token and kubeconfig alike) has lost access. The lists may
still show what OpenConsole had cached, and the Clusters page shows no error; the pod log has
`Failed to watch … Unauthorized` lines.

For a token that expires on its own instead:
`kubectl -n kubernetes-openconsole create token openconsole-reader --duration=8760h`. Replace it in the UI before
it expires.

## Prometheus (optional) {#prometheus-optional}

Without Prometheus, CPU and memory charts cover the last 24 hours, kept in OpenConsole's memory (lost on restart).
For up to 7 days, set the cluster's Prometheus under **Admin → Clusters → Prometheus**; see
[Prometheus](/administration/prometheus). Its "in the cluster" mode needs the `services/proxy` rule in the table above.

## Troubleshooting {#troubleshooting}

- **Save fails**: the API server is not reachable from the pod (network policy, private endpoint, `127.0.0.1` in a
  kubeconfig), or the CA doesn't match.
- **A tab is empty or 403 for a user**: check that user's role permissions first, then the ClusterRole rule above.
  A tab that says *OpenConsole's account on this cluster may not read this* (`cluster_forbidden`) is the ClusterRole.
- **No CPU / memory**: the cluster has no metrics-server (`kubectl get apiservices v1beta1.metrics.k8s.io`), or the
  ClusterRole lacks `metrics.k8s.io` `pods`. The Pods tab says which.
- **Prometheus test fails**: the test names the failing step; see [Prometheus](/administration/prometheus).
