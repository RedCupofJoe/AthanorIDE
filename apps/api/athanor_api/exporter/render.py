"""Jinja2 rendering for exported repositories."""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, StrictUndefined

from athanor_api.exporter.ir import ExportIR

TEMPLATE_ROOT = Path(__file__).resolve().parent.parent / "templates" / "export"

# Always-rendered application templates
TEMPLATE_MAP: dict[str, str] = {
    "README.md.j2": "README.md",
    "env.example.j2": ".env.example",
    "Containerfile.j2": "Containerfile",
    "compose.yaml.j2": "compose.yaml",
    "pyproject.toml.j2": "pyproject.toml",
    "app/config.py.j2": "app/config.py",
    "app/contracts.py.j2": "app/contracts.py",
    "app/main.py.j2": "app/main.py",
    "app/http_clients.py.j2": "app/http_clients.py",
    "pipelines/text_transform.py.j2": "pipelines/text_transform.py",
    "tests/test_contracts.py.j2": "tests/test_contracts.py",
    "tests/test_graph.py.j2": "tests/test_graph.py",
    "tests/test_health.py.j2": "tests/test_health.py",
    "docs/architecture.md.j2": "docs/architecture.md",
    "docs/node-catalog.md.j2": "docs/node-catalog.md",
    "docs/deployment.md.j2": "docs/deployment.md",
    "scripts/run-local.sh.j2": "scripts/run-local.sh",
    "scripts/validate.sh.j2": "scripts/validate.sh",
}

K8S_TEMPLATES = (
    "namespace.yaml.j2",
    "configmap.yaml.j2",
    "secret.yaml.j2",
    "deployment.yaml.j2",
    "service.yaml.j2",
    "networkpolicy.yaml.j2",
)


def _env() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(TEMPLATE_ROOT)),
        undefined=StrictUndefined,
        autoescape=False,
        keep_trailing_newline=True,
        lstrip_blocks=True,
        trim_blocks=True,
    )


def ir_context(ir: ExportIR) -> dict[str, Any]:
    return {
        "project_slug": ir.project_slug,
        "project_name": ir.project_name,
        "project_description": ir.project_description,
        "schema_version": ir.schema_version,
        "project_id": ir.project_id,
        "generated_at": ir.generated_at,
        "node_ids": ir.node_ids,
        "edge_ids": ir.edge_ids,
        "text_inputs": [asdict(item) for item in ir.text_inputs],
        "transforms": [asdict(item) for item in ir.transforms],
        "outputs": [asdict(item) for item in ir.outputs],
        "prompt_templates": [asdict(item) for item in ir.prompt_templates],
        "http_clients": [asdict(item) for item in ir.http_clients],
        "env_bindings": [asdict(item) for item in ir.env_bindings],
        "secret_references": [asdict(item) for item in ir.secret_references],
        "fine_tuning": [asdict(item) for item in ir.fine_tuning],
        "vision": [asdict(item) for item in ir.vision],
        "multi_agent": [asdict(item) for item in ir.multi_agent],
        "enterprise": [asdict(item) for item in ir.enterprise],
        "big_blocks": [asdict(item) for item in ir.big_blocks],
        "catalog_nodes": [asdict(item) for item in ir.catalog_nodes],
        "pipeline_order": ir.pipeline_order,
        "include_docker_compat": ir.include_docker_compat,
        "include_kubernetes": ir.include_kubernetes,
        "include_openshift": ir.include_openshift,
        "include_terraform": ir.include_terraform,
        "deployment": ir.deployment,
        "source_node_trace": ir.source_node_trace,
        "default_text": ir.default_text,
        "primary_instruction": ir.primary_instruction,
        "primary_transform_kind": ir.primary_transform_kind,
        "primary_compiled_code": ir.primary_compiled_code,
        "uses_compiled_transform": ir.uses_compiled_transform,
        "has_http_clients": ir.has_http_clients,
        "has_fine_tuning": ir.has_fine_tuning,
        "has_vision": ir.has_vision,
        "has_multi_agent": ir.has_multi_agent,
        "has_enterprise": ir.has_enterprise,
        "has_big_blocks": ir.has_big_blocks,
        "has_deployment_manifests": ir.has_deployment_manifests,
    }


def render_export_files(ir: ExportIR) -> dict[str, str]:
    environment = _env()
    context = ir_context(ir)
    files: dict[str, str] = {}

    for template_name, output_path in sorted(TEMPLATE_MAP.items()):
        if template_name == "app/http_clients.py.j2" and not ir.has_http_clients:
            continue
        if template_name == "docs/deployment.md.j2" and not ir.has_deployment_manifests:
            continue
        template = environment.get_template(template_name)
        files[output_path] = template.render(**context)

    if ir.include_kubernetes:
        cluster_targets = ir.deployment.get("cluster_targets") or []
        targets = cluster_targets or (
            [ir.deployment["primary_target"]] if ir.deployment.get("primary_target") else []
        )
        for target in targets:
            if not target:
                continue
            target_context = {**context, "target": target}
            folder = f"deploy/kubernetes/{target['namespace']}"
            for template_name in K8S_TEMPLATES:
                template = environment.get_template(f"deploy/kubernetes/{template_name}")
                output_name = template_name.removesuffix(".j2")
                files[f"{folder}/{output_name}"] = template.render(**target_context)

    if ir.include_openshift:
        ocp_targets = [
            target for target in (ir.deployment.get("targets") or []) if target.get("is_openshift")
        ]
        if not ocp_targets and ir.deployment.get("primary_target"):
            ocp_targets = [ir.deployment["primary_target"]]
        for target in ocp_targets:
            target_context = {**context, "target": target}
            template = environment.get_template("deploy/openshift/route.yaml.j2")
            files[f"deploy/openshift/{target['namespace']}-route.yaml"] = template.render(
                **target_context
            )
        readme = environment.get_template("deploy/openshift/README.md.j2")
        files["deploy/openshift/README.md"] = readme.render(**context)

    if ir.include_terraform and ir.deployment.get("primary_target"):
        tf = environment.get_template("deploy/terraform/main.tf.j2")
        files["deploy/terraform/main.tf"] = tf.render(**context)

    files["app/__init__.py"] = '"""Generated application package."""\n\n__version__ = "0.1.0"\n'
    files["pipelines/__init__.py"] = '"""Generated pipelines package."""\n'
    files["docs/generated-graph.json"] = (
        json.dumps(ir.source_graph, indent=2, sort_keys=True) + "\n"
    )

    return {path: files[path] for path in sorted(files)}
