# ADR 0006: Optional cluster deployment generation

## Status

Accepted (Phase 6; extended for OKD, Argo CD, Podman bundle)

## Context

AthanorIDE is local-first. Architects still need optional Kubernetes, OKD/OpenShift, Argo CD
GitOps, and Terraform artifacts for environments modeled as swimlanes—without requiring a
cluster to run the IDE, and without embedding secrets.

## Decision

1. **Local Podman/compose remains the default runtime.** A self-contained multi-stage
   `Containerfile` plus `deploy/podman/` helpers are **always** exported.
2. **Export flags** on the request body and `exportConfiguration`:
   - `includeKubernetes` — per-namespace manifests under `deploy/kubernetes/`
   - `includeOpenShift` — full **OKD** package under `deploy/okd/{namespace}/` (Deployment,
     Service, Route, ConfigMap, Secret stubs, NetworkPolicy, ImageStream, BuildConfig,
     kustomization); auto-enables Kubernetes
   - `includeArgoCd` — Argo CD App of Apps under `deploy/argocd/` (AppProject, root Application,
     child Applications per target); auto-enables Kubernetes; children point at
     `deploy/okd/` when OKD is enabled, else `deploy/kubernetes/`
   - `includeTerraform` — Terraform for the primary cluster target
3. **Cluster swimlanes** auto-enable Kubernetes (and OKD when kind is `OPENSHIFT`).
4. **Secrets** are names/keys only—`stringData` values are empty; exporters refuse non-empty
   secret payloads. Argo `repoURL` values are placeholders only.
5. **Boundary validation** escalates incomplete cross-env edges when any cluster/GitOps export
   flag is enabled; rejects unknown `deploymentTarget`s and external HTTP inside air-gapped
   swimlanes.

## Consequences

- Users can develop fully offline/local and only toggle cluster/GitOps export when ready.
- Generated Terraform requires a configured kubeconfig; it does not provision cloud accounts.
- Argo CD requires the operator to push the ZIP contents to Git and replace `repoURL`.
- Multi-environment meshes are represented as NetworkPolicy rules + docs, not as full
  service-mesh CRDs.
