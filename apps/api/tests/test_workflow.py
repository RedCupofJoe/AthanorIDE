from __future__ import annotations

import copy
import io
import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator
from test_agent_studio import graph_dict, load_module, node
from test_agent_studio import runtime as runtime

from athanor_api.exporter.handoff import create_handoff
from athanor_api.exporter.service import ExportError, export_architecture_graph
from athanor_api.main import app
from athanor_api.schemas.graph import ArchitectureGraph
from athanor_api.validation import validate_architecture_graph
from athanor_api.validation.workflow import security_findings


def parallel_graph():
    result = graph_dict()
    result["nodes"], result["edges"], result["workflow"]["tasks"] = [], [], []
    for name in ["alpha", "beta", "join", "recover"]:
        part = graph_dict()
        mapping = {n["id"]: name + ":" + n["id"] for n in part["nodes"]}
        task = part["workflow"]["tasks"][0]
        task["id"], task["name"] = name, name
        for binding in [task["inputBinding"], task["outputBinding"]]:
            binding["nodeId"] = mapping[binding["nodeId"]]
        result["workflow"]["tasks"].append(task)
        for component in part["nodes"]:
            component["id"] = mapping[component["id"]]
            if component.get("workflowTaskId"):
                component["workflowTaskId"] = name
            result["nodes"].append(component)
        for edge in part["edges"]:
            edge["id"] = name + ":" + edge["id"]
            edge["sourceNodeId"] = mapping[edge["sourceNodeId"]]
            edge["targetNodeId"] = mapping[edge["targetNodeId"]]
            result["edges"].append(edge)
    result["workflow"]["transitions"] = [
        {
            "id": str(i),
            "sourceTaskId": source,
            "targetTaskId": target,
            "stage": stage,
            "kind": kind,
            "recoveryDescription": "Recover safely" if kind == "recovery" else "",
        }
        for i, (source, target, stage, kind) in enumerate(
            [
                (None, "alpha", 1, "normal"),
                (None, "beta", 1, "normal"),
                ("alpha", "join", 2, "normal"),
                ("beta", "join", 2, "normal"),
                ("alpha", "recover", 1, "recovery"),
            ]
        )
    ]
    return result


def codes(data, profile="deployment"):
    return {
        i.code for i in validate_architecture_graph(ArchitectureGraph.model_validate(data), profile)
    }


def test_parallel_runtime_and_stage_barrier(runtime):
    _, launcher, _ = runtime
    data = parallel_graph()
    assert not [
        i
        for i in validate_architecture_graph(ArchitectureGraph.model_validate(data))
        if i.severity == "error"
    ]
    barrier = threading.Barrier(2)
    finished = set()
    lock = threading.Lock()

    def runner(graph, component, payload):
        name = component["workflowTaskId"]
        if name in {"alpha", "beta"}:
            barrier.wait(timeout=3)  # A sequential implementation cannot pass this test.
            with lock:
                finished.add(name)
            return name + " result"
        assert name == "join"
        assert finished == {"alpha", "beta"}
        assert json.loads(payload) == {"alpha": "alpha result", "beta": "beta result"}
        return "joined"

    results = launcher.run_workflow(data, runner=runner)
    assert results == {"alpha": "alpha result", "beta": "beta result", "join": "joined"}


@pytest.mark.parametrize(
    "failure",
    [RuntimeError("sensitive detail"), TimeoutError("secret"), PermissionError("rejected")],
)
def test_recovery_substitutes_result_and_resumes(runtime, failure, capsys):
    _, launcher, _ = runtime
    data = parallel_graph()
    calls = []

    def runner(graph, component, payload):
        name = component["workflowTaskId"]
        calls.append(name)
        if name == "alpha":
            raise failure
        if name == "recover":
            context = json.loads(payload)
            assert context["input"] == "original"
            assert context["failure"]["taskId"] == "alpha"
            assert context["failure"]["code"] == (
                "timeout"
                if isinstance(failure, TimeoutError)
                else "guardrail_rejection"
                if isinstance(failure, PermissionError)
                else "execution_failure"
            )
            assert "sensitive detail" not in payload and "secret" not in payload
            return "recovered result"
        if name == "join":
            assert json.loads(payload)["alpha"] == "recovered result"
        return name

    assert launcher.run_workflow(data, "original", runner)["alpha"] == "recovered result"
    assert calls.count("alpha") == 1 and calls.count("recover") == 1
    assert "sensitive detail" not in capsys.readouterr().err


@pytest.mark.parametrize("handler", [True, False])
def test_unhandled_failure_finishes_peers_without_advancing(runtime, handler):
    _, launcher, _ = runtime
    data = parallel_graph()
    if not handler:
        data["workflow"]["tasks"] = [t for t in data["workflow"]["tasks"] if t["id"] != "recover"]
        data["workflow"]["transitions"] = [
            e for e in data["workflow"]["transitions"] if e["kind"] != "recovery"
        ]
    peer_finished = threading.Event()
    calls = []

    def runner(graph, component, payload):
        name = component["workflowTaskId"]
        calls.append(name)
        if name in {"alpha", "recover"}:
            raise RuntimeError("do not log this")
        peer_finished.set()
        return name

    with pytest.raises(RuntimeError, match="Workflow task failed"):
        launcher.run_workflow(data, runner=runner)
    assert peer_finished.is_set() and "join" not in calls


def test_parallel_limit_one_and_cli_override(runtime):
    _, launcher, _ = runtime
    data = parallel_graph()
    data["workflow"]["maxParallelTasks"] = 1
    running = threading.Lock()

    def runner(graph, component, payload):
        assert running.acquire(blocking=False)
        try:
            if component["workflowTaskId"] in {"alpha", "beta"}:
                assert payload == "override"
            return "done"
        finally:
            running.release()

    launcher.run_workflow(data, "override", runner)


def test_current_brief_inherited_and_engineer_override(runtime):
    _, launcher, _ = runtime
    data = graph_dict()
    data["workflow"]["tasks"][0]["constraints"] = "Latest constraint"
    captured = []

    def runner(graph, component, payload):
        captured.append(component["configuration"]["instructions"])
        return "done"

    launcher.run_workflow(data, runner=runner)
    assert "Latest constraint" in captured[-1]
    data["nodes"][0]["instructionMode"] = "override"
    data["nodes"][0]["configuration"]["instructions"] = "Engineer replacement"
    launcher.run_workflow(data, runner=runner)
    assert captured[-1] == "Engineer replacement"
    assert "SECURITY_INSTRUCTION_OVERRIDE" in codes(data)


def test_harness_receives_effective_brief(runtime):
    _, launcher, _ = runtime
    data = graph_dict()
    old = data["nodes"][0]
    harness = node("harness.langgraph", old["id"])
    harness.update(workflowTaskId=old["workflowTaskId"], instructionMode="inherit")
    data["nodes"][0] = harness
    data["edges"] = [e for e in data["edges"] if e["targetPortId"] == "in-sandbox"]
    received = []
    launcher.run_workflow(data, runner=lambda graph, component, text: received.append(text) or "ok")
    assert "Functional constraints:" in received[0] and "Task input:" in received[0]


@pytest.mark.parametrize(
    "mutate,expected",
    [
        (lambda d: d["workflow"]["transitions"][0].update(stage=2), "WORKFLOW_START_STAGE"),
        (lambda d: d["workflow"]["transitions"][2].update(stage=3), "WORKFLOW_STAGE_CONFLICT"),
        (lambda d: d["workflow"]["transitions"][4].update(stage=2), "WORKFLOW_RECOVERY_STAGE"),
        (
            lambda d: d["workflow"]["transitions"][4].update(targetTaskId="beta"),
            "WORKFLOW_RECOVERY_CONFLICT",
        ),
        (lambda d: d["workflow"]["tasks"][0].pop("inputBinding"), "WORKFLOW_BOUNDARY"),
        (lambda d: d["nodes"][0].pop("workflowTaskId"), "WORKFLOW_UNASSIGNED_AGENT"),
    ],
)
def test_invalid_workflow_is_rejected(mutate, expected):
    data = parallel_graph()
    mutate(data)
    assert expected in codes(data)


def test_design_handoff_requires_no_implementation_and_is_deterministic():
    data = parallel_graph()
    data["nodes"], data["edges"] = [], []
    for task in data["workflow"]["tasks"]:
        task.pop("inputBinding")
        task.pop("outputBinding")
    graph = ArchitectureGraph.model_validate(data)
    assert not [i for i in validate_architecture_graph(graph, "design") if i.severity == "error"]
    first = create_handoff(graph)
    assert first == create_handoff(graph)
    assert set(first[0]) == {"workflow.json", "build-brief.md", "project-scaffold.json"}
    assert "A1" in first[0]["build-brief.md"]
    client = TestClient(app)
    assert client.post("/api/v1/projects/handoff", json={"graph": data}).status_code == 200
    assert client.post(
        "/api/v1/projects/validate", json={"graph": data, "profile": "design"}
    ).json()["valid"]
    assert not client.post("/api/v1/projects/validate", json={"graph": data}).json()["valid"]


def test_nested_credentials_block_handoff_and_export_without_echoing_values():
    data = graph_dict()
    secret = "sk-" + "fakecredential12345" * 3
    data["nodes"][0]["metadata"] = {"nested": [{"apiKey": secret}]}
    data["workflow"]["tasks"][0]["constraints"] += " " + secret
    data["validationResults"] = [
        {"id": "imported", "severity": "info", "code": "IMPORTED", "message": secret}
    ]
    graph = ArchitectureGraph.model_validate(data)
    findings = security_findings(graph)
    assert {f.node_id for f in findings} >= {data["nodes"][0]["id"]}
    assert any(f.task_id for f in findings)
    assert any(f.field_path.startswith("validationResults") for f in findings)
    assert secret not in str(findings)
    for export in [create_handoff, export_architecture_graph]:
        with pytest.raises(ExportError):
            export(graph)


def test_optional_port_omissions_survive_export_and_required_ports_cannot_be_pruned():
    data = graph_dict()
    agent = data["nodes"][0]
    agent["inputs"] = [
        p for p in agent["inputs"] if p["name"] == "task" or p["required"] or p["name"] == "tools"
    ]
    agent["prunedPorts"] = {"inputs": ["mcp", "guardrails"], "outputs": []}
    exported = export_architecture_graph(ArchitectureGraph.model_validate(data))
    assert json.loads(exported.files["agent-workflow.json"])["nodes"][0]["prunedPorts"][
        "inputs"
    ] == ["mcp", "guardrails"]
    assert "security-review.json" in exported.files and "workflow.json" in exported.files
    agent["inputs"] = [p for p in agent["inputs"] if p["name"] != "model"]
    agent["prunedPorts"]["inputs"].append("model")
    assert "INVALID_PRUNING" in codes(data)


def test_workflow_schema_parity_and_old_version_rejection(contracts_root):
    data = parallel_graph()
    schema = json.loads((contracts_root / "schema/architecture-graph.v2.schema.json").read_text())
    validator = Draft202012Validator(schema)
    validator.validate(data)
    ArchitectureGraph.model_validate(data)
    invalid = copy.deepcopy(data)
    invalid["workflow"]["maxParallelTasks"] = 0
    assert list(validator.iter_errors(invalid))
    with pytest.raises(ValueError):
        ArchitectureGraph.model_validate(invalid)
    data["schemaVersion"] = "1.0.0"
    with pytest.raises(ValueError):
        ArchitectureGraph.model_validate(data)


def test_interactive_approvals_are_serial_and_deadline_bounded(runtime, monkeypatch):
    _, launcher, _ = runtime
    active, peak = 0, 0
    lock = threading.Lock()

    class Terminal:
        def isatty(self):
            return True

        def readline(self):
            nonlocal active
            with lock:
                active -= 1
            return "yes\n"

    terminal = Terminal()

    def readable(*args):
        nonlocal active, peak
        with lock:
            active += 1
            peak = max(peak, active)
        time.sleep(0.02)
        return [terminal], [], []

    monkeypatch.setattr(launcher.sys, "stdin", terminal)
    monkeypatch.setattr(launcher.select, "select", readable)
    request = {"tool": "lookup", "arguments": {}, "approvalDeadline": time.monotonic() + 3}
    with ThreadPoolExecutor(max_workers=3) as pool:
        assert all(pool.map(lambda _: launcher.human_approval(request), range(3)))
    assert peak == 1
    assert not launcher.human_approval({**request, "approvalDeadline": time.monotonic() - 1})


@pytest.mark.parametrize(
    "event",
    [
        {"kind": "result", "output": "ok"},
        {"kind": "error", "errorCode": "guardrail_rejection"},
        None,
    ],
)
def test_isolated_workers_removed_on_success_failure_and_timeout(runtime, monkeypatch, event):
    _, launcher, _ = runtime
    data = graph_dict()
    agent = data["nodes"][0]
    agent["configuration"]["timeoutSeconds"] = 0.03

    class Output(io.StringIO):
        def readline(self, *args):
            if event is None:
                time.sleep(0.06)
            return super().readline(*args)

    process = SimpleNamespace(
        stdin=io.StringIO(),
        stdout=Output(json.dumps(event) + "\n" if event else ""),
        poll=lambda: None,
        kill=lambda: cleaned.append("kill"),
        wait=lambda **_: cleaned.append("wait"),
    )
    cleaned = []
    monkeypatch.setattr(launcher, "require_credentials", lambda _: None)
    monkeypatch.setattr(launcher, "credential_args", lambda _: [])
    monkeypatch.setattr(launcher, "require_engine", lambda _: None)
    monkeypatch.setattr(launcher.subprocess, "Popen", lambda *_, **__: process)
    monkeypatch.setattr(launcher, "remove_worker", lambda *_: cleaned.append("remove"))
    if event and event["kind"] == "result":
        assert launcher.run_isolated(data, agent, "input") == "ok"
    else:
        with pytest.raises((RuntimeError, TimeoutError)):
            launcher.run_isolated(data, agent, "input")
    assert cleaned == ["remove", "kill", "wait"]
    assert process.stdin.closed and process.stdout.closed


def test_cluster_entrypoint_uses_same_scheduler_and_routes_worker_rejection(runtime, monkeypatch):
    _, launcher, _ = runtime
    cluster = load_module(
        Path(launcher.__file__).parent / "container_entry.py", "cluster_entry_test"
    )
    assert cluster.run_workflow.__module__ == "workflow"
    data = parallel_graph()
    seen = []

    def worker(*args, **kwargs):
        request = json.loads(kwargs["input"])
        tid = request["node"]["workflowTaskId"]
        seen.append(tid)
        if tid == "alpha":
            event = {"kind": "error", "errorCode": "guardrail_rejection"}
        else:
            if tid == "recover":
                assert json.loads(request["task"])["failure"]["code"] == "guardrail_rejection"
            event = {"kind": "result", "output": tid}
        assert kwargs["timeout"] > 0
        return SimpleNamespace(stdout=json.dumps(event), returncode=0)

    monkeypatch.setattr(cluster.subprocess, "run", worker)
    assert cluster.run_workflow(data, runner=cluster.run_worker)["alpha"] == "recover"
    assert "join" in seen
