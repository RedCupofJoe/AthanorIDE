"""Deployment packages for the actual agent graph (no legacy application stubs)."""

from __future__ import annotations

import json
from typing import Any

import yaml

FORMATS = {"code", "helm", "podman", "docker", "openshift", "npm", "makefile"}


def references(graph: dict[str, Any]) -> list[str]:
    names = {n["configuration"].get("secretName") for n in graph["nodes"]} - {None, ""}
    for node in graph["nodes"]:
        names.update(
            n.strip()
            for n in node["configuration"].get("environmentNames", "").split(",")
            if n.strip()
        )
    return sorted(names)


def cluster_files(graph: dict[str, Any], slug: str, fmt: str) -> dict[str, str]:
    nodes = graph["nodes"]
    sandboxes = [n for n in nodes if n["type"].startswith("sandbox.")]
    if not sandboxes:
        raise ValueError("Connect a sandbox before exporting a cluster deployment.")
    policies = {(n["type"], json.dumps(n["configuration"], sort_keys=True)) for n in sandboxes}
    if len(policies) != 1:
        raise ValueError(
            "Cluster exports share one pod boundary. Use the same sandbox "
            "policy for every block, or export code for per-agent isolation."
        )
    sandbox = sandboxes[0]
    if sandbox["type"] == "sandbox.firecracker":
        raise ValueError(
            "Firecracker needs a platform adapter; select another sandbox for cluster export."
        )
    cfg = sandbox["configuration"]
    servers = [n for n in nodes if n["type"] == "mcp.server"]
    agents = [
        n for n in nodes if n["type"] == "agent.sandboxed" or n["type"].startswith("harness.")
    ]
    if not servers and not agents:
        raise ValueError("Add an agent, harness, or MCP server before deploying.")
    # Graph mode runs all agents; standalone server graphs publish each MCP server separately.
    entries = agents[:1] if agents else servers
    docs: list[dict[str, Any]] = []
    for i, entry in enumerate(entries):
        is_server = not agents
        if is_server and entry["configuration"]["transport"] != "streamable-http":
            raise ValueError(
                "Cluster MCP deployments require Streamable HTTP. Choose that "
                "transport in the server inspector."
            )
        name = f"{slug[:45]}-{i + 1}"
        labels = {"app.kubernetes.io/name": name}
        port = int(entry["configuration"].get("port", 8001))
        container: dict[str, Any] = {
            "name": "workflow",
            "image": f"{slug}:latest",
            "imagePullPolicy": "IfNotPresent",
            "command": ["python", "container_entry.py"],
            "args": ["--server", entry["id"]] if is_server else [],
            "env": [
                {
                    "name": "MCP_ALLOWED_HOSTS",
                    "value": f"{name}:*,{name}.*:*,localhost:*,127.0.0.1:*",
                }
            ],
            "securityContext": {
                "allowPrivilegeEscalation": False,
                "readOnlyRootFilesystem": True,
                "runAsNonRoot": True,
                "capabilities": {"drop": ["ALL"]},
                "seccompProfile": {"type": "RuntimeDefault"},
            },
            "resources": {
                "requests": {"cpu": str(cfg["cpus"]), "memory": f"{int(cfg['memoryMb'])}Mi"},
                "limits": {"cpu": str(cfg["cpus"]), "memory": f"{int(cfg['memoryMb'])}Mi"},
            },
            "volumeMounts": [{"name": "tmp", "mountPath": "/tmp"}],
        }
        for ref in references(graph):
            container["env"].append(
                {
                    "name": ref,
                    "valueFrom": {"secretKeyRef": {"name": f"{slug}-credentials", "key": ref}},
                }
            )
        pod: dict[str, Any] = {
            "automountServiceAccountToken": False,
            "restartPolicy": "Always" if is_server else "Never",
            "containers": [container],
            "volumes": [{"name": "tmp", "emptyDir": {"medium": "Memory", "sizeLimit": "64Mi"}}],
        }
        runtime = {"sandbox.gvisor": "gvisor", "sandbox.kata": "kata"}.get(sandbox["type"])
        if runtime:
            pod["runtimeClassName"] = runtime
        if is_server:
            container["ports"] = [{"containerPort": port, "name": "mcp"}]
            container["readinessProbe"] = {
                "tcpSocket": {"port": "mcp"},
                "initialDelaySeconds": 2,
                "periodSeconds": 10,
            }
        else:
            pod["activeDeadlineSeconds"] = (
                sum(int(n["configuration"]["timeoutSeconds"]) for n in agents) + 30
            )
        spec: dict[str, Any] = {"template": {"metadata": {"labels": labels}, "spec": pod}}
        if is_server:
            spec.update({"replicas": 1, "selector": {"matchLabels": labels}})
        else:
            spec.update({"backoffLimit": 0, "ttlSecondsAfterFinished": 3600})
        docs.append(
            {
                "apiVersion": "apps/v1" if is_server else "batch/v1",
                "kind": "Deployment" if is_server else "Job",
                "metadata": {"name": name, "labels": labels},
                "spec": spec,
            }
        )
        if is_server:
            docs.append(
                {
                    "apiVersion": "v1",
                    "kind": "Service",
                    "metadata": {"name": name},
                    "spec": {
                        "type": "ClusterIP",
                        "selector": labels,
                        "ports": [{"port": port, "targetPort": "mcp"}],
                    },
                }
            )
        policy = {
            "podSelector": {"matchLabels": labels},
            "policyTypes": ["Ingress", "Egress"],
            "ingress": [{"from": [{"podSelector": {}}], "ports": [{"port": port}]}]
            if is_server
            else [],
            "egress": [{}] if cfg["network"] == "bridge" else [],
        }
        docs.append(
            {
                "apiVersion": "networking.k8s.io/v1",
                "kind": "NetworkPolicy",
                "metadata": {"name": name},
                "spec": policy,
            }
        )
    rendered = yaml.safe_dump_all(docs, sort_keys=False)
    files = {f"deploy/{fmt}/workload.yaml": rendered}
    if fmt == "helm":
        # This chart always renders valid YAML; values configure the image and credentials name.
        chart = f"deploy/helm/{slug}"
        files = {
            f"{chart}/Chart.yaml": yaml.safe_dump(
                {
                    "apiVersion": "v2",
                    "name": slug,
                    "description": "Sandboxed agent workflow",
                    "type": "application",
                    "version": "0.1.0",
                    "appVersion": "0.1.0",
                }
            ),
            f"{chart}/values.yaml": yaml.safe_dump(
                {
                    "image": f"{slug}:latest",
                    "credentialsSecret": f"{slug}-credentials",
                    "namePrefix": slug[:45],
                }
            ),
            f"{chart}/templates/workload.yaml": rendered.replace(
                f"image: {slug}:latest", "image: {{ .Values.image | quote }}"
            )
            .replace(f"name: {slug}-credentials", "name: {{ .Values.credentialsSecret | quote }}")
            .replace(f"{slug[:45]}-", "{{ .Values.namePrefix }}-"),
        }
    install_command = (
        f"Run `helm lint {slug}` then `helm upgrade --install {slug} ./{slug} "
        "--set image=REGISTRY/IMAGE:TAG` from this folder."
        if fmt == "helm"
        else "Run `oc apply --dry-run=server -f workload.yaml`, then `oc apply -f workload.yaml`."
    )
    files[f"deploy/{fmt}/README.md"] = f"""# {fmt.title()} deployment

Build the Containerfile.agent image and push it to your registry. Replace the image
in the manifest or Helm values with the pushed image (prefer an immutable digest).
Create the named credentials Secret yourself using keys listed in agent.env.example.
No credentials or public ingress are generated.

{install_command}

Agent workflows run once as Jobs; MCP servers run as Deployments with ClusterIP Services.
The **whole workflow shares a pod sandbox**. Agent processes have individual deadlines;
container CPU/memory and network policy apply to the whole workflow. Differing sandbox
policies are rejected for this target. Use the Python launcher for separate containers
per agent. Podman/Docker choices map to the cluster OCI runtime; gVisor/Kata require the
matching installed RuntimeClass. Firecracker is unsupported without a platform adapter.

A NetworkPolicy-capable CNI is required. Bridge permits all egress; narrow it before
production. Kubernetes process limits and noexec tmp mounts need node/runtime policy;
configure podPidsLimit={int(cfg["pidsLimit"])} on the node pool. The workload does not
request privileged SCCs, host mounts, engine sockets, or API credentials. OpenShift
assigns its own UID. Interactive tool approval is unavailable and fails closed.

For MCP, use port forwarding for local testing. Remote exposure needs an MCP-aware
OAuth gateway and explicit host/origin configuration; no unauthenticated Route is created.
Jobs have no automatic retry, preventing duplicate side effects. Delete a completed Job
before submitting another run. Edit task input in the graph and rebuild for a new task.
"""
    return files


def packaging_files(graph: dict[str, Any], slug: str, fmt: str) -> dict[str, str]:
    files: dict[str, str] = {}
    if fmt in {"helm", "openshift"}:
        files.update(cluster_files(graph, slug, fmt))
    if fmt in {"code", "makefile", "docker", "podman", "npm"}:
        engine = (
            "docker"
            if fmt == "docker"
            or any(n["type"] in {"sandbox.docker", "sandbox.gvisor"} for n in graph["nodes"])
            else "podman"
        )
        files["Makefile"] = f"""ENGINE ?= {engine}
IMAGE ?= localhost/athanor-agent:latest
PYTHON ?= python3
.PHONY: build plan run serve
build:
\t$(ENGINE) build -f Containerfile.agent -t $(IMAGE) .
plan:
\t$(PYTHON) workflow.py plan
run:
\tATHANOR_IMAGE=$(IMAGE) $(PYTHON) workflow.py run
serve:
\tATHANOR_IMAGE=$(IMAGE) $(PYTHON) workflow.py serve-mcp --node "$(NODE)"
"""
        if fmt == "npm":
            files["Makefile"] += ".PHONY: pack\npack:\n\tnpm pack\n"
    if fmt == "npm":
        files["package.json"] = (
            json.dumps(
                {
                    "name": slug,
                    "version": "0.1.0",
                    "description": "Exported sandboxed agent workflow CLI",
                    "type": "module",
                    "bin": {slug: "bin/cli.mjs"},
                    "files": [
                        "bin",
                        "README.md",
                        "NPM_README.md",
                        "app",
                        "workflow.py",
                        "agent-workflow.json",
                        "agent-deployment.json",
                        "agent.env.example",
                        "requirements-agent.txt",
                        "Containerfile.agent",
                        "container_entry.py",
                        "Makefile",
                        "AGENT_README.md",
                        "mcp-client.example.json",
                    ],
                    "scripts": {"plan": "node bin/cli.mjs plan", "build:image": "make build"},
                    "engines": {"node": ">=20"},
                },
                indent=2,
            )
            + "\n"
        )
        files["bin/cli.mjs"] = """#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const entry = fileURLToPath(new URL("../workflow.py", import.meta.url));
const child = spawn(process.env.ATHANOR_PYTHON || "python3",
  [entry, ...process.argv.slice(2)], { stdio: "inherit", shell: false });
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => { process.exitCode = signal ? 1 : code ?? 1; });
"""
        files["NPM_README.md"] = (
            "# npm package\n\nRun `npm pack --dry-run`, then `npm pack` to "
            "create a tarball. Install the tarball and run the named CLI with "
            "`plan`, `run`, or `serve-mcp --node ID`. Requires Python 3.12+ "
            "and the configured container runtime. This is an npm-distributed "
            "CLI wrapper around the exported Python runtime, not a JavaScript "
            "rewrite. Build the image with `make build` first; publishing is a"
            " separate user action. There are no install hooks.\n"
        )
    return files
