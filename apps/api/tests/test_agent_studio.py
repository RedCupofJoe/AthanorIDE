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
