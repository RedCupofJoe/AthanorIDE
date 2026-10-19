# Deploy AthanorIDE on OpenShift 4.20+

This package deploys the **IDE application itself** as one OpenShift Deployment
with three containers in the same pod:

- Next.js web application on port 3000
- FastAPI backend on port 8000
- OpenShift OAuth proxy sidecar on port 4180

Only the OAuth proxy is exposed through the Service and Route. Browser requests
to `/api/...` use a Next.js same-origin rewrite to the API container over pod
loopback, so the browser never tries to call its own `localhost` and API traffic
passes through the authenticated Route.

The deployment uses OpenShift Route v1, a namespaced ServiceAccount, the 4.20
OAuth proxy image, restricted non-root container settings, and a NetworkPolicy
that admits the OpenShift router and allows DNS plus HTTPS egress. The proxy
requires users to have `get` permission on the `athanoride` Service in this
namespace. Grant access through namespace RBAC; the generated manifest does not
grant broad user permissions.

## 1. Build and push the application images

Build two images from the repository root. Replace `REGISTRY` with a registry
your cluster can pull from, then push both images:

```bash
REGISTRY=quay.io
IMAGE_NAMESPACE=YOUR_ORG
VERSION=latest

podman build -f Containerfile --target api \
  -t "$REGISTRY/$IMAGE_NAMESPACE/athanoride-api:$VERSION" .
podman build -f Containerfile --target web \
  --build-arg NEXT_PUBLIC_API_BASE_URL= \
  --build-arg ATHANOR_INTERNAL_API_URL=http://127.0.0.1:8000 \
  -t "$REGISTRY/$IMAGE_NAMESPACE/athanoride-web:$VERSION" .

podman login "$REGISTRY"
podman push "$REGISTRY/athanoride-api:$VERSION"
podman push "$REGISTRY/athanoride-web:$VERSION"
```

Edit the `images` entries in `kustomization.yaml` to match the pushed image
names and tags. If the registry is private, create an image pull secret in the
namespace and attach it to the `athanoride-auth` ServiceAccount before applying
the Deployment.

## 2. Create the namespace and OAuth cookie secret

The cookie key is generated on the deployment machine and is not stored in this
repository. OpenShift OAuth redirects users to the generated Route; its
ServiceAccount annotation is already included.

```bash
cd deploy/openshift-ide
oc apply -f namespace.yaml
oc -n athanoride create secret generic athanoride-oauth \
  --from-literal=cookie-secret="$(openssl rand -base64 32)"
```

The OAuth proxy allows users who can `get` the `athanoride` Service. A user with
the namespace `view` role normally has that permission. Have a namespace admin
grant access to the intended users or groups before sharing the Route.

## 3. Deploy and find the Route

```bash
oc apply -k .
oc -n athanoride rollout status deployment/athanoride
oc -n athanoride get route athanoride
```

The default Kustomize namespace is `athanoride`. To use another namespace,
change `namespace` in `kustomization.yaml` and `namespace.yaml`, plus the
namespace in the OAuth proxy `--openshift-sar` argument. Apply the namespace
first, create `athanoride-oauth` in that namespace, then apply the Kustomize
package.

## Data and runtime notes

Projects are stored in each user's browser IndexedDB, so no project database or
PersistentVolume is required. Browser storage remains on that user's device and
does not synchronize between users or browsers. API uploads and temporary files
are ephemeral.

The API's safe compiler/execution path requires Podman. This Deployment does not
install a container engine, request privileged mode, or mount a host/container
engine socket. Editing, local browser persistence, validation, and export work;
features that require sandbox execution report the runtime as unavailable.

The Route uses edge TLS, so the OpenShift router serves HTTPS and forwards
traffic to the OAuth sidecar inside the cluster. The sidecar image is set to
`quay.io/openshift/origin-oauth-proxy:4.20`; update its Kustomize image tag when
matching a later OpenShift minor release or a mirrored registry.
