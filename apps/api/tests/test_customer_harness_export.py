"""Focused coverage for optional agent export artifacts without importing MCP SDK."""

from athanor_api.exporter.agent_studio import render_agent_files


def test_customer_harness_export_has_editable_contract_and_reference_server() -> None:
    files = render_agent_files({"nodes": [], "project": {"name": "Customer Workflow"}})

    assert "customer-harness.contract.json" in files
    assert '"requestBytes": 1048576' in files["customer-harness.contract.json"]
    assert "def run_task" in files["app/customer_harness.py"]
    assert "127.0.0.1" in files["app/customer_harness.py"]
    assert "reference server" in files["CUSTOM_HARNESS.md"]


def test_predictive_model_export_uses_optional_onnx_adapter() -> None:
    files = render_agent_files(
        {
            "project": {"name": "Prediction Workflow"},
            "nodes": [
                {
                    "id": "predictor",
                    "type": "model.predictive",
                    "configuration": {"adapter": "onnxruntime"},
                }
            ],
        }
    )

    assert "onnxruntime>=1.20,<2" in files["requirements-agent.txt"]
    assert "CPUExecutionProvider" in files["app/agent_worker.py"]
    assert "call_predictive_model" in files["app/mcp_server.py"]
