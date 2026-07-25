"""Big Blocks catalog, validation, export, and execution coverage."""

from __future__ import annotations

from athanor_api.catalog import NODE_CATALOG
from athanor_api.execution import execute_architecture_graph
from athanor_api.exporter import export_architecture_graph
from athanor_api.schemas.graph import ArchitectureGraph
from athanor_api.validation import validate_architecture_graph

BIG_BLOCK_TYPES = (
    "big_blocks.ai_gateway",
    "big_blocks.graphrag",
    "big_blocks.autorag",
    "big_blocks.local_s3_bucket",
    "big_blocks.simple_ui_chatbot",
    "big_blocks.simple_ui_multimodal",
    "big_blocks.model_runtime",
    "big_blocks.image_classifier",
    "big_blocks.voice_to_text",
    "big_blocks.sound_classifier",
    "big_blocks.agentic_harness",
    "big_blocks.video_to_rag",
    "big_blocks.audio_to_rag",
    "big_blocks.multimodal_rag",
    "big_blocks.video_chunking_ic_lora",
)


def _project_meta() -> dict:
    return {
        "id": "bb-1",
        "name": "Big Blocks",
        "createdAt": "2026-07-24T14:00:00.000Z",
        "updatedAt": "2026-07-24T14:00:00.000Z",
    }


def _gateway_node(
    *,
    configuration: dict | None = None,
    extra_config: dict | None = None,
) -> dict:
    config = {
        "openSourceStack": "litellm",
        "defaultModel": "llama3.2",
        "deploymentMode": "local",
        "cloudProvider": "none",
        "endpointUri": "",
        "tokenSecretName": "",
        "useCustomTemplate": False,
        "customTemplate": (
            "# AthanorIDE Big Block custom template — ai_gateway\n"
            "kind: ai_gateway\n"
            "stack: litellm\n"
        ),
    }
    if configuration is not None:
        config = configuration
    if extra_config:
        config = {**config, **extra_config}
    return {
        "id": "bb-gateway-1",
        "type": "big_blocks.ai_gateway",
        "version": "1.0.0",
        "name": "Gateway",
        "position": {"x": 0, "y": 0},
        "configuration": config,
        "inputs": [
            {
                "id": "in-prompt",
                "name": "prompt",
                "direction": "input",
                "contractType": "PROMPT",
                "required": False,
                "multiple": True,
            }
        ],
        "outputs": [
            {
                "id": "out-response",
                "name": "response",
                "direction": "output",
                "contractType": "STRING",
                "required": True,
                "multiple": False,
            }
        ],
    }


def test_catalog_includes_all_big_blocks() -> None:
    by_type = {entry.type: entry for entry in NODE_CATALOG}
    for node_type in BIG_BLOCK_TYPES:
        assert node_type in by_type
        assert by_type[node_type].export_kind == "big_blocks"
        assert by_type[node_type].category == "big-blocks"
    assert len([t for t in by_type if t.startswith("big_blocks.")]) == 15


def test_agentic_harness_required_config_order() -> None:
    entry = next(e for e in NODE_CATALOG if e.type == "big_blocks.agentic_harness")
    assert entry.required_config == (
        "harness",
        "openSourceStack",
        "harnessRuntime",
        "deploymentMode",
        "cloudProvider",
        "useCustomTemplate",
    )


def test_big_block_rejects_embedded_secret_key() -> None:
    graph = ArchitectureGraph.model_validate(
        {
            "schemaVersion": "1.0.0",
            "project": _project_meta(),
            "nodes": [_gateway_node(extra_config={"apiKey": "sk-live-should-not-appear"})],
            "edges": [],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        }
    )
    codes = {issue.code for issue in validate_architecture_graph(graph)}
    assert "BIG_BLOCK_SECRET_EMBEDDED" in codes


def test_big_block_rejects_long_token_secret_name() -> None:
    graph = ArchitectureGraph.model_validate(
        {
            "schemaVersion": "1.0.0",
            "project": _project_meta(),
            "nodes": [_gateway_node(extra_config={"tokenSecretName": "x" * 200})],
            "edges": [],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        }
    )
    codes = {issue.code for issue in validate_architecture_graph(graph)}
    assert "BIG_BLOCK_TOKEN_NAME_TOO_LONG" in codes


def test_big_block_rejects_secret_in_custom_template() -> None:
    graph = ArchitectureGraph.model_validate(
        {
            "schemaVersion": "1.0.0",
            "project": _project_meta(),
            "nodes": [
                _gateway_node(
                    extra_config={
                        "customTemplate": "apiKey: sk-abcdefghijklmnopqrstuvwxyz012345\n",
                    }
                )
            ],
            "edges": [],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        }
    )
    codes = {issue.code for issue in validate_architecture_graph(graph)}
    assert "BIG_BLOCK_TEMPLATE_SECRET_EMBEDDED" in codes


def test_export_includes_big_blocks_lineage() -> None:
    graph = ArchitectureGraph.model_validate(
        {
            "schemaVersion": "1.0.0",
            "project": _project_meta(),
            "nodes": [_gateway_node()],
            "edges": [],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        }
    )
    result = export_architecture_graph(graph, project_slug="big-blocks")
    architecture = result.files["docs/architecture.md"]
    assert "## Big Blocks lineage" in architecture
    assert "big_blocks.ai_gateway" in architecture


def test_export_redacts_secrets_in_custom_template() -> None:
    secret = "sk-abcdefghijklmnopqrstuvwxyz012345"
    graph = ArchitectureGraph.model_validate(
        {
            "schemaVersion": "1.0.0",
            "project": _project_meta(),
            "nodes": [
                _gateway_node(
                    extra_config={
                        "customTemplate": f"apiKey: {secret}\nkind: ai_gateway\n",
                    }
                )
            ],
            "edges": [],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        }
    )
    # Defense-in-depth: even if validation is bypassed, export must redact.
    result = export_architecture_graph(
        graph,
        project_slug="big-blocks-redact",
        allow_invalid=True,
    )
    architecture = result.files["docs/architecture.md"]
    assert "## Big Blocks lineage" in architecture
    assert secret not in architecture
    assert "[REDACTED]" in architecture


def test_big_block_skipped_in_executor() -> None:
    graph = ArchitectureGraph.model_validate(
        {
            "schemaVersion": "1.0.0",
            "project": _project_meta(),
            "nodes": [_gateway_node()],
            "edges": [],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
        }
    )
    result = execute_architecture_graph(graph)
    assert result.status == "partial"
    assert result.steps[0].status == "skipped"
    assert result.steps[0].node_id == "bb-gateway-1"
