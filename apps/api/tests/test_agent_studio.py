from __future__ import annotations

import importlib.util
import json
import sys

import httpx
import pytest
from jsonschema import ValidationError
from mcp import Client

from athanor_api.catalog import AGENT_DEFINITIONS_BY_TYPE
from athanor_api.execution.engine import execute_architecture_graph
from athanor_api.exporter.service import ExportError, export_architecture_graph
from athanor_api.schemas.graph import ArchitectureGraph
from athanor_api.validation import validate_architecture_graph


def node(kind, nid=None, **config):
    definition = AGENT_DEFINITIONS_BY_TYPE[kind]
    return {
        "id": nid or kind,
        "type": kind,
        "version": "1.0.0",
        "name": definition["displayName"],
        "position": {"x": 0, "y": 0},
        "configuration": {
            **{f["key"]: f["defaultValue"] for f in definition["configurationFields"]},
            **config,
        },
        "inputs": [{**p, "id": "in-" + p["name"]} for p in definition["inputs"]],
        "outputs": [{**p, "id": "out-" + p["name"]} for p in definition["outputs"]],
    }


def graph_dict():
    return {
        "schemaVersion": "1.0.0",
        "project": {
            "id": "agent-test",
            "name": "Agent Test",
            "createdAt": "2026-09-28T00:00:00Z",
            "updatedAt": "2026-09-28T00:00:00Z",
        },
        "nodes": [
            node("agent.sandboxed"),
            node("agent.model"),
            node("agent.tool"),
            node("sandbox.podman"),
            {
                "id": "task",
                "type": "foundation.text_input",
                "version": "1.0.0",
                "name": "Task",
                "position": {"x": 0, "y": 0},
                "configuration": {"value": "find a fact"},
                "inputs": [],
                "outputs": [
                    {
                        "id": "out-text",
                        "name": "text",
                        "direction": "output",
                        "contractType": "STRING",
                        "required": True,
                        "multiple": False,
                    }
                ],
            },
        ],
        "edges": [
            {
                "id": source,
                "sourceNodeId": source,
                "sourcePortId": "out-" + output,
                "targetNodeId": "agent.sandboxed",
                "targetPortId": "in-" + target,
            }
            for source, output, target in [
                ("task", "text", "task"),
                ("agent.model", "model", "model"),
                ("agent.tool", "tool", "tools"),
                ("sandbox.podman", "sandbox", "sandbox"),
            ]
        ],
        "contracts": [],
        "deploymentEnvironments": [],
        "macroBlocks": [],
        "portalBuses": [],
        "validationResults": [],
        "viewport": {"x": 0, "y": 0, "zoom": 1},
    }


def graph():
    return ArchitectureGraph.model_validate(graph_dict())


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def runtime(tmp_path, monkeypatch):
    result = export_architecture_graph(graph())
    for filename, text in result.files.items():
        path = tmp_path / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    monkeypatch.syspath_prepend(str(tmp_path))
    worker = load_module(tmp_path / "app/agent_worker.py", "agent_worker_test")
    monkeypatch.setitem(sys.modules, "app.agent_worker", worker)
    launcher = load_module(tmp_path / "workflow.py", "workflow_test")
    server = load_module(tmp_path / "app/mcp_server.py", "mcp_server_test")
    return worker, launcher, server


def test_agent_export_is_deterministic_and_contains_runtime():
    first = export_architecture_graph(graph())
    second = export_architecture_graph(graph())
    assert first.archive_base64 == second.archive_base64
    assert "workflow.py" in first.files
    assert "mcp>=2.2,<3" in first.files["requirements-agent.txt"]
    assert json.loads(first.files["agent-workflow.json"])["edges"] == graph_dict()["edges"]
    assert not [i for i in first.validation_issues if i.severity == "error"]


@pytest.mark.parametrize(
    "kind,key,value,code",
    [
        (
            "agent.model",
            "endpoint",
            "https://user:password@api.example.org",
            "AGENT_INVALID_ENDPOINT",
        ),
        (
            "agent.model",
            "endpoint",
            "https://api.example.org?api_key=value",
            "AGENT_INVALID_ENDPOINT",
        ),
        ("agent.model", "secretName", "sk-plain-text-credential", "AGENT_INVALID_SECRET_NAME"),
        ("agent.sandboxed", "maxSteps", 0, "AGENT_INVALID_CONFIG"),
        ("agent.sandboxed", "timeoutSeconds", None, "AGENT_INVALID_CONFIG"),
        ("agent.sandboxed", "maxSteps", True, "AGENT_INVALID_CONFIG"),
        ("agent.sandboxed", "maxToolCalls", 1.5, "AGENT_INVALID_CONFIG"),
        ("agent.tool", "method", "TRACE", "AGENT_INVALID_CONFIG"),
        ("agent.tool", "requiresApproval", "false", "AGENT_INVALID_CONFIG"),
        (
            "agent.tool",
            "inputSchema",
            '{"type":"object","properties":{"x":{"type":"nonsense"}}}',
            "AGENT_INVALID_SCHEMA",
        ),
        (
            "agent.tool",
            "inputSchema",
            '{"type":"object","$ref":"https://example.org/schema"}',
            "AGENT_INVALID_SCHEMA",
        ),
    ],
)
def test_bad_configuration_cannot_export(kind, key, value, code):
    data = graph_dict()
    next(n for n in data["nodes"] if n["type"] == kind)["configuration"][key] = value
    parsed = ArchitectureGraph.model_validate(data)
    assert code in [i.code for i in validate_architecture_graph(parsed)]
    with pytest.raises(ExportError):
        export_architecture_graph(parsed)


def test_removed_required_ports_cannot_bypass_sandbox():
    data = graph_dict()
    data["nodes"][0]["inputs"] = []
    assert "AGENT_PORT_CONTRACT" in [
        i.code for i in validate_architecture_graph(ArchitectureGraph.model_validate(data))
    ]


def test_preview_never_invokes_a_runtime(monkeypatch):
    monkeypatch.setattr(
        "subprocess.Popen", lambda *a, **kw: pytest.fail("preview launched a process")
    )
    result = execute_architecture_graph(graph())
    step = next(s for s in result.steps if s.node_type == "agent.sandboxed")
    assert step.status == "skipped"
    assert "No model, tool, or MCP request" in step.message


@pytest.mark.asyncio
async def test_generated_agent_calls_only_connected_tools_and_honors_approval(runtime, monkeypatch):
    worker, _, _ = runtime
    replies = [
        {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "tool_calls": [
                            {
                                "id": "call1",
                                "function": {"name": "lookup", "arguments": '{"query":"fact"}'},
                            }
                        ],
                    }
                }
            ]
        },
        {"found": True},
        {"choices": [{"message": {"content": "A fact"}}]},
    ]
    calls = []

    async def request(config, payload, method="POST"):
        calls.append((config["endpoint"], payload))
        return replies.pop(0)

    approved = []

    async def approval(name, args):
        approved.append((name, args))
        return True

    monkeypatch.setattr(worker, "request_json", request)
    data = graph_dict()
    assert await worker.run_agent(data, data["nodes"][0], "task", approval) == "A fact"
    assert approved == [("lookup", {"query": "fact"})]
    assert len(calls) == 3
    assert calls[1][0] == "https://api.example.com/search"


@pytest.mark.asyncio
async def test_denied_or_invalid_tool_call_never_reaches_endpoint(runtime, monkeypatch):
    worker, _, _ = runtime

    async def denied(*args):
        return False

    async def request(*args, **kwargs):
        pytest.fail("endpoint called despite denial")

    monkeypatch.setattr(worker, "request_json", request)
    cfg = node("agent.tool")["configuration"]
    with pytest.raises(PermissionError):
        await worker.call_api_tool(cfg, {"query": "fact"}, denied)
    with pytest.raises(ValidationError):
        await worker.call_api_tool(cfg, {"wrong": 123}, denied)


@pytest.mark.asyncio
async def test_turn_limit_and_unknown_tools_stop_the_agent(runtime, monkeypatch):
    worker, _, _ = runtime
    data = graph_dict()
    data["nodes"][0]["configuration"]["maxSteps"] = 1
    data["nodes"][2]["configuration"]["requiresApproval"] = False

    async def request(config, payload, method="POST"):
        if config.get("model"):
            return {
                "choices": [
                    {
                        "message": {
                            "tool_calls": [
                                {
                                    "id": "call",
                                    "function": {"name": "lookup", "arguments": '{"query":"fact"}'},
                                }
                            ]
                        }
                    }
                ]
            }
        return {}

    monkeypatch.setattr(worker, "request_json", request)
    with pytest.raises(RuntimeError, match="Maximum model turns"):
        await worker.run_agent(data, data["nodes"][0], "task")
    data["nodes"][2]["configuration"]["toolName"] = "something_else"
    with pytest.raises(PermissionError, match="unconnected"):
        await worker.run_agent(data, data["nodes"][0], "task")


@pytest.mark.asyncio
async def test_http_get_maps_arguments_and_does_not_follow_redirects(runtime, monkeypatch):
    worker, _, _ = runtime
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(302, headers={"location": "https://other.example.org"})

    original = httpx.AsyncClient
    monkeypatch.setattr(
        worker.httpx,
        "AsyncClient",
        lambda **kw: original(transport=httpx.MockTransport(handler), **kw),
    )
    with pytest.raises(httpx.HTTPStatusError):
        await worker.request_json(
            {"endpoint": "https://api.example.com/search"}, {"query": "fact"}, "GET"
        )
    assert len(seen) == 1
    assert seen[0].url.params["query"] == "fact"


def test_sandbox_commands_and_firecracker_fail_closed(runtime):
    _, launcher, _ = runtime
    for kind in ["podman", "docker", "gvisor", "kata"]:
        command = launcher.sandbox_command(node("sandbox." + kind), "test")
        assert "--read-only" in command
        assert "--cap-drop=ALL" in command
        assert command[command.index("--network") + 1] == "none"
        assert "--privileged" not in command
    with pytest.raises(RuntimeError, match="No fallback"):
        launcher.sandbox_command(node("sandbox.firecracker"), "test")
    command = launcher.sandbox_command(node("sandbox.openshell"), "worker")
    assert command[:3] == ["openshell", "sandbox", "create"]
    assert command[command.index("--name") + 1] == "worker"
    assert command[command.index("--from") + 1] == launcher.IMAGE
    assert command[command.index("--cpu") + 1] == "1"
    assert command[command.index("--memory") + 1] == "512Mi"
    assert "--no-keep" in command
    assert "--no-tty" in command
    assert "--env" not in command
    assert command[command.index("--") + 1 :] == ["python", "-m", "app.agent_worker"]
    forwarded = launcher.openshell_command(
        node("sandbox.openshell"),
        "mcp",
        ["python", "-m", "app.mcp_server", "server"],
        publish_port=8001,
    )
    assert "--no-keep" not in forwarded
    assert forwarded[forwarded.index("--forward") + 1] == "127.0.0.1:8001"


def test_generated_workflow_uses_graph_connections(runtime):
    _, launcher, _ = runtime
    tasks = []

    def runner(graph, node, task):
        tasks.append(task)
        return "answer"

    assert (
        launcher.run_workflow(graph_dict(), "override task", runner)["agent.sandboxed"] == "answer"
    )
    assert tasks == ["override task"]


@pytest.mark.asyncio
async def test_mcp_protocol_tools_resources_prompts_and_approval(runtime):
    _, _, module = runtime
    data = graph_dict()
    server_node = node("mcp.server")
    data["nodes"] += [server_node, node("mcp.resource"), node("mcp.prompt")]
    for source, output, target in [
        ("agent.tool", "tool", "tools"),
        ("mcp.resource", "resource", "resources"),
        ("mcp.prompt", "prompt", "prompts"),
        ("sandbox.podman", "sandbox", "sandbox"),
    ]:
        data["edges"].append(
            {
                "id": source + "-server",
                "sourceNodeId": source,
                "sourcePortId": "out-" + output,
                "targetNodeId": server_node["id"],
                "targetPortId": "in-" + target,
            }
        )
    server = module.build_server(data, server_node)
    async with Client(server) as client:
        tools = await client.list_tools()
        assert tools.tools[0].input_schema["required"] == ["query"]
        result = await client.call_tool("lookup", {"query": "fact"})
        assert result.is_error  # MCP does not silently grant approval.
        resources = await client.list_resources()
        resource = await client.read_resource(resources.resources[0].uri)
        assert "approved tools" in resource.contents[0].text
        prompt = await client.get_prompt("assist", {"task": "test task"})
        assert prompt.messages[0].content.text == "Help with this task: test task"
    assert module.http_app(server) is not None


@pytest.mark.parametrize(
    "target,artifact",
    [
        ("code", "workflow.py"),
        ("podman", "Containerfile"),
        ("docker", "Dockerfile"),
        ("makefile", "Makefile"),
        ("npm", "package.json"),
        ("helm", "deploy/helm/agent-test/Chart.yaml"),
        ("openshift", "deploy/openshift/workload.yaml"),
    ],
)
def test_agent_export_formats(target, artifact):
    import yaml

    result = export_architecture_graph(graph(), export_format=target)
    assert artifact in result.files
    assert "pipelines/text_transform.py" not in result.files
    if target == "docker":
        sandbox = next(
            n
            for n in json.loads(result.files["agent-workflow.json"])["nodes"]
            if n["id"] == "sandbox.podman"
        )
        assert sandbox["type"] == "sandbox.docker"
    if target == "openshift":
        docs = list(yaml.safe_load_all(result.files[artifact]))
        job = next(d for d in docs if d["kind"] == "Job")
        pod = job["spec"]["template"]["spec"]
        assert pod["automountServiceAccountToken"] is False
        assert "runAsUser" not in pod["containers"][0]["securityContext"]
        assert pod["containers"][0]["command"] == ["python", "container_entry.py"]
        assert job["spec"]["backoffLimit"] == 0
        policy = next(d for d in docs if d["kind"] == "NetworkPolicy")
        assert policy["spec"]["egress"] == []
    if target == "npm":
        package = json.loads(result.files[artifact])
        assert package["bin"] == {"agent-test": "bin/cli.mjs"}
        assert not {"install", "postinstall", "preinstall"} & package["scripts"].keys()


def test_default_sandbox_policy_preserves_oci_hardening(runtime):
    _, launcher, _ = runtime
    policy = node("sandbox.policy")
    assert launcher.sandbox_command(
        node("sandbox.podman"), "test", policy=policy
    ) == launcher.sandbox_command(node("sandbox.podman"), "test")


def test_sandbox_policy_exports_openshell_document_and_launch_flag(tmp_path):
    import yaml

    data = graph_dict()
    policy = node(
        "sandbox.policy",
        network="bridge",
        allowedEndpoints="api.example.com:443",
    )
    data["nodes"] = [
        node("sandbox.openshell", nid="sandbox.podman") if n["type"] == "sandbox.podman" else n
        for n in data["nodes"]
    ]
    data["nodes"].append(policy)
    data["edges"].append(
        {
            "id": "policy-link",
            "sourceNodeId": policy["id"],
            "sourcePortId": "out-policy",
            "targetNodeId": "sandbox.podman",
            "targetPortId": "in-policy",
        }
    )
    result = export_architecture_graph(ArchitectureGraph.model_validate(data))
    filename = "openshell-policy-sandbox.podman.yaml"
    document = yaml.safe_load(result.files[filename])
    assert document["version"] == 1
    assert document["process"]["run_as_user"] == "65532"
    assert document["network_policies"]["workload"]["endpoints"] == [
        {"host": "api.example.com", "port": 443, "protocol": "tcp"}
    ]
    for name, text in result.files.items():
        path = tmp_path / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    launcher = load_module(tmp_path / "workflow.py", "workflow_policy_test")
    sandbox = next(n for n in data["nodes"] if n["id"] == "sandbox.podman")
    command = launcher.sandbox_command(sandbox, "worker", policy=policy)
    assert command[command.index("--policy") + 1] == str(tmp_path / filename)
    assert "--network" not in command
    bridged = launcher.sandbox_command(node("sandbox.podman"), "worker", policy=policy)
    assert bridged[bridged.index("--network") + 1] == "bridge"


def test_sandbox_policy_must_connect_to_a_runtime():
    data = graph_dict()
    policy = node("sandbox.policy", runAsUser="0")
    data["nodes"].append(policy)
    for edge in data["edges"]:
        if edge["targetPortId"] == "in-sandbox":
            edge["sourceNodeId"] = policy["id"]
            edge["sourcePortId"] = "out-policy"
    issues = validate_architecture_graph(ArchitectureGraph.model_validate(data))
    assert any(issue.code == "AGENT_UNSUPPORTED_BINDING" for issue in issues)
    assert any(issue.code == "SANDBOX_POLICY_USER" for issue in issues)


def test_sandbox_policy_overrides_cluster_egress():
    import yaml

    data = graph_dict()
    policy = node("sandbox.policy", network="bridge", allowedEndpoints="api.example.com:443")
    data["nodes"].append(policy)
    data["edges"].append(
        {
            "id": "policy-link",
            "sourceNodeId": policy["id"],
            "sourcePortId": "out-policy",
            "targetNodeId": "sandbox.podman",
            "targetPortId": "in-policy",
        }
    )
    result = export_architecture_graph(
        ArchitectureGraph.model_validate(data), export_format="openshift"
    )
    documents = list(yaml.safe_load_all(result.files["deploy/openshift/workload.yaml"]))
    network_policy = next(item for item in documents if item["kind"] == "NetworkPolicy")
    assert network_policy["spec"]["egress"] == [{}]


def test_cluster_rejects_openshell():
    data = graph_dict()
    data["nodes"] = [
        node("sandbox.openshell", nid="sandbox.podman") if n["type"] == "sandbox.podman" else n
        for n in data["nodes"]
    ]
    with pytest.raises(ExportError, match="OpenShell"):
        export_architecture_graph(ArchitectureGraph.model_validate(data), export_format="helm")


def test_cluster_rejects_conflicting_policies_and_stdio_servers():
    data = graph_dict()
    data["nodes"].append(node("sandbox.docker"))
    with pytest.raises(ExportError, match="same sandbox"):
        export_architecture_graph(ArchitectureGraph.model_validate(data), export_format="helm")


def test_imported_packages_generate_pinned_build_and_names_only():
    data = graph_dict()
    data["nodes"].append(
        node(
            "mcp.stdio",
            packageRegistry="npm",
            packageSpec="@example/server@1.2.3",
            command="npx",
            environmentNames="MCP_TOKEN",
        )
    )
    result = export_architecture_graph(ArchitectureGraph.model_validate(data))
    assert '"@example/server@1.2.3"' in result.files["Containerfile.agent"]
    assert "MCP_TOKEN=\n" in result.files["agent.env.example"]
    data["nodes"][-1]["configuration"]["packageSpec"] = "@example/server@latest"
    with pytest.raises(ExportError):
        export_architecture_graph(ArchitectureGraph.model_validate(data))


def test_export_includes_customer_harness_contract_and_reference_adapter():
    result = export_architecture_graph(ArchitectureGraph.model_validate(graph_dict()))
    contract = json.loads(result.files["customer-harness.contract.json"])
    assert contract["request"] == {"input": "string"}
    assert contract["response"] == {"output": "string"}
    assert "run_task" in result.files["app/customer_harness.py"]
    assert "CUSTOM_HARNESS.md" in result.files
    assert "app/customer_harness.py" in result.files["Containerfile.agent"]


def test_predictive_onnx_tool_is_optional_cpu_runtime_and_mcp_wrappable():
    data = graph_dict()
    model_node = node(
        "model.predictive",
        adapter="onnxruntime",
        modelPath="/models/classifier.onnx",
        requiresApproval=False,
    )
    data["nodes"].append(model_node)
    data["edges"].append(
        {
            "id": "predictive-tool",
            "sourceNodeId": model_node["id"],
            "sourcePortId": "out-tool",
            "targetNodeId": "agent.sandboxed",
            "targetPortId": "in-tools",
        }
    )
    server_node = node("mcp.server", serverName="predictive-tools")
    data["nodes"].append(server_node)
    data["edges"].append(
        {
            "id": "predictive-mcp",
            "sourceNodeId": model_node["id"],
            "sourcePortId": "out-tool",
            "targetNodeId": server_node["id"],
            "targetPortId": "in-tools",
        }
    )
    data["edges"].append(
        {
            "id": "predictive-sandbox",
            "sourceNodeId": "sandbox.podman",
            "sourcePortId": "out-sandbox",
            "targetNodeId": server_node["id"],
            "targetPortId": "in-sandbox",
        }
    )
    result = export_architecture_graph(ArchitectureGraph.model_validate(data))
    assert "onnxruntime>=1.20,<2" in result.files["requirements-agent.txt"]
    assert "CPUExecutionProvider" in result.files["app/agent_worker.py"]
    assert "call_predictive_model" in result.files["app/mcp_server.py"]


def test_predictive_onnx_path_cannot_escape_models_directory():
    data = graph_dict()
    model_node = node("model.predictive", adapter="onnxruntime", modelPath="/tmp/model.onnx")
    data["nodes"].append(model_node)
    issues = validate_architecture_graph(ArchitectureGraph.model_validate(data))
    assert any(issue.code == "MODEL_PATH_OUTSIDE_IMAGE_MODELS" for issue in issues)


def attach_guardrail(data, **config):
    guard = node("agent.guardrails", "guard", **config)
    data["nodes"].append(guard)
    data["edges"].append(
        {
            "id": "guard",
            "sourceNodeId": "guard",
            "sourcePortId": "out-guardrails",
            "targetNodeId": "agent.sandboxed",
            "targetPortId": "in-guardrails",
        }
    )
    return data


def test_guardrail_rejects_oversized_phrases_and_bad_tool_names():
    long_phrase = graph_dict()
    long_phrase["nodes"].append(node("agent.guardrails", denyPhrases="x" * 201))
    issues = validate_architecture_graph(ArchitectureGraph.model_validate(long_phrase))
    assert "GUARDRAIL_PHRASES" in [issue.code for issue in issues]
    bad_tool = graph_dict()
    bad_tool["nodes"].append(node("agent.guardrails", denyTools="lookup, bad-name"))
    issues = validate_architecture_graph(ArchitectureGraph.model_validate(bad_tool))
    assert "GUARDRAIL_TOOLS" in [issue.code for issue in issues]


@pytest.mark.asyncio
async def test_guardrail_blocks_a_denied_phrase_before_the_model(runtime, monkeypatch):
    worker, _, _ = runtime

    async def request(*_args, **_kwargs):
        pytest.fail("model called")

    monkeypatch.setattr(worker, "request_json", request)
    data = attach_guardrail(graph_dict(), denyPhrases="secret phrase")
    with pytest.raises(PermissionError, match="Guardrail blocked"):
        await worker.run_agent(data, data["nodes"][0], "contains secret phrase")


@pytest.mark.asyncio
async def test_guardrail_redacts_output_and_refuses_denied_tools(runtime, monkeypatch):
    worker, _, _ = runtime
    data = attach_guardrail(
        graph_dict(),
        mode="redact",
        denyPhrases="secret phrase",
        denyTools="lookup",
    )

    async def request(_config, _payload, method="POST"):
        assert method == "POST"
        return {"choices": [{"message": {"content": "a secret phrase remains"}}]}

    monkeypatch.setattr(worker, "request_json", request)
    assert await worker.run_agent(data, data["nodes"][0], "task") == "a [redacted] remains"

    async def tool_request(_config, _payload, method="POST"):
        assert method == "POST"
        return {
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {
                                "id": "call",
                                "function": {
                                    "name": "lookup",
                                    "arguments": '{"query":"fact"}',
                                },
                            }
                        ]
                    }
                }
            ]
        }

    monkeypatch.setattr(worker, "request_json", tool_request)
    with pytest.raises(PermissionError, match="Guardrail blocked this tool"):
        await worker.run_agent(data, data["nodes"][0], "task")
