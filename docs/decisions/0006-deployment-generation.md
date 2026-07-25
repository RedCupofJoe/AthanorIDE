# ADR 0006: Optional cluster deployment generation

## Status

Accepted (Phase 6)

## Context

AthanorIDE is local-first. Architects still need optional Kubernetes, OpenShift, and Terraform artifacts for environments modeled as swimlanes—without requiring OpenShift/Kubernetes to run the IDE, and without embedding secrets.

## Decision

1. **Local Podman/compose remains the default runtime.** Cluster manifests are additive under `deploy/`.
2. **Export flags** `includeKubernetes` / `includeOpenShift` / `includeTerraform` (request body + `exportConfiguration`) control generation. Cluster swimlanes auto-enable Kubernetes (and OpenShift when kind is `OPENSHIFT`).
3. **Per-environment namespaces** get Deployment, Service, ConfigMap, Secret placeholders, and NetworkPolicy with resource requests/limits (including GPU for `AWS_GPU`).
4. **OpenShift** adds Route overlays; Terraform mirrors the primary cluster target via the Kubernetes provider.
5. **Secrets** are names/keys only—`stringData` values are empty and ignored by Terraform lifecycle; exporters refuse non-empty secret payloads.
6. **Boundary validation** escalates incomplete cross-env edges to errors when cluster export is enabled; rejects unknown `deploymentTarget`s and external HTTP inside air-gapped swimlanes.

## Consequences

- Users can develop fully offline/local and only toggle cluster export when ready.
- Generated Terraform requires a configured kubeconfig; it does not provision cloud accounts.
- Multi-environment meshes are represented as NetworkPolicy rules + docs, not as full service-mesh CRDs.
