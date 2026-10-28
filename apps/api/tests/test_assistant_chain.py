"""Exercise planning, graph compilation, and the exported prompt-chain scheduler."""

from __future__ import annotations

import json
from copy import deepcopy

import pytest
from test_agent_studio import graph_dict, node
from test_agent_studio import runtime as runtime
from test_assistant import PLAN, PROPOSAL, WORKFLOW

from athanor_api.assistant.draft import AssistantError, DraftError, generate_draft, validate_draft
from athanor_api.assistant.plans import chain_transitions
from athanor_api.schemas.graph import ArchitectureGraph
from athanor_api.validation import validate_architecture_graph

ENDPOINT = "http://127.0.0.1:8081/v1/chat/completions"
MODEL = "qwen2.5-7b-instruct"


def chain():
    return {
        "input": "Create a local Markdown notes application.",
        "tasks": [
            {
                "id": name,
                "name": name.title(),
                "role": role,
                "expectedTasks": brief,
                "constraints": "No cloud services.",
            }
            for name, role, brief in [
                ("requirements", "Analyst", "Produce numbered, testable requirements."),
                ("design", "Engineer", "Design modules and interfaces from the requirements."),
                ("review", "Reviewer", "Check the design and return a prioritized gap report."),
            ]
        ],
        "transitions": [],
    }


def response(plan):
    return {
        "choices": [
            {
                "message": {
                    "tool_calls": [
                        {
                            "id": "plan-call",
                            "type": "function",
                            "function": {
                                "name": "submit_task_plan",
                                "arguments": json.dumps(plan),
                            },
                        }
                    ]
                }
            }
        ]
    }


def planner(endpoint, token, payload):
    context = json.loads(payload["messages"][1]["content"])
    return response({**deepcopy(PLAN), "taskId": context["task"]["id"]})


def materialize(workflow, draft):
    """Use catalog ports and the same task bindings as the browser draft applicator."""
    data = graph_dict()
    template = data["workflow"]["tasks"][0]
    data["nodes"] = []
    for spec in draft["nodes"]:
        component = node(spec["type"], spec["ref"], **spec["configuration"])
        component.update(name=spec["name"], workflowTaskId=spec["taskId"])
        if "instructionMode" in spec:
            component["instructionMode"] = spec["instructionMode"]
        data["nodes"].append(component)
    data["edges"] = [
        {
            "id": str(i),
            "sourceNodeId": edge["source"],
            "sourcePortId": "out-" + edge["sourcePort"],
            "targetNodeId": edge["target"],
            "targetPortId": "in-" + edge["targetPort"],
        }
        for i, edge in enumerate(draft["edges"])
    ]
    tasks = []
    for brief in workflow["tasks"]:
        agent = next(
            n
            for n in draft["nodes"]
            if n["taskId"] == brief["id"] and n["type"] == "agent.sandboxed"
        )
        tasks.append(
            {
                **deepcopy(template),
                **brief,
                "inputBinding": {"nodeId": agent["ref"], "portId": "in-task"},
                "outputBinding": {"nodeId": agent["ref"], "portId": "out-result"},
            }
        )
    data["workflow"].update(
        tasks=tasks,
        input=workflow["input"],
        transitions=draft.get("workflowTransitions", workflow["transitions"]),
    )
    return data


def test_planner_builds_complete_chain_and_runtime_uses_stage_prompts(runtime):
    contexts = []

    def post(endpoint, token, payload):
        contexts.append(json.loads(payload["messages"][1]["content"]))
        assert payload["tool_choice"]["function"]["name"] == "submit_task_plan"
        return planner(endpoint, token, payload)

    workflow = chain()
    draft = generate_draft(endpoint=ENDPOINT, model=MODEL, workflow=workflow, token="", post=post)
    assert len(draft["nodes"]) == 12 and len(draft["edges"]) == 9
    assert len(draft["taskPlans"]) == 3
    assert contexts[0]["predecessors"] == []
    assert contexts[1]["predecessors"][0]["outputContract"] == PLAN["outputContract"]
    assert contexts[2]["predecessors"][0]["task"]["id"] == "design"
    for component in draft["nodes"]:
        if component["type"] == "agent.model":
            assert component["configuration"]["endpoint"] == ENDPOINT
            assert component["configuration"]["model"] == MODEL
            assert component["configuration"]["secretName"] == ""
    data = materialize(workflow, draft)
    errors = [
        issue
        for issue in validate_architecture_graph(ArchitectureGraph.model_validate(data))
        if issue.severity == "error"
    ]
    assert not errors
    calls = []

    def runner(graph, component, payload):
        task = workflow["tasks"][len(calls)]
        instructions = component["configuration"]["instructions"]
        assert component["instructionMode"] == "override"
        assert task["expectedTasks"] in instructions
        assert "Acceptance checks:" in instructions
        assert PLAN["steps"][0] in instructions  # Not overwritten by brief inheritance.
        assert payload == (calls[-1]["output"] if calls else workflow["input"])
        output = json.dumps({"stage": task["id"], "result": "output " + task["id"]})
        calls.append({"taskId": task["id"], "input": payload, "output": output})
        return output

    _, launcher, _ = runtime
    result = launcher.run_workflow(data, runner=runner)
    assert list(result) == ["design", "requirements", "review"]
    assert len(calls) == 3
    assert workflow["input"] not in calls[-1]["input"]  # Only the immediate result is passed.


@pytest.mark.parametrize("nodes,edges", [([], []), ([PROPOSAL["nodes"][1]], [])])
def test_empty_and_one_node_results_are_rejected(nodes, edges):
    with pytest.raises(DraftError):
        validate_draft(WORKFLOW, {"nodes": nodes, "edges": edges})


def test_plan_repairs_are_bounded_and_do_not_echo_credentials():
    requests = []

    def post(endpoint, token, payload):
        requests.append(deepcopy(payload))
        return response({**PLAN, "approach": "Use sk-" + "A" * 50})

    with pytest.raises(AssistantError, match="credential"):
        generate_draft(endpoint=ENDPOINT, model=MODEL, workflow=WORKFLOW, token="", post=post)
    assert len(requests) == 3
    assert "sk-" not in json.dumps(requests)
    assert json.loads(requests[-1]["messages"][-1]["content"])["rejectedPlan"] is None


def test_repair_can_correct_invalid_plan():
    calls = []

    def post(endpoint, token, payload):
        calls.append(deepcopy(payload))
        return response({} if len(calls) == 1 else PLAN)

    draft = generate_draft(endpoint=ENDPOINT, model=MODEL, workflow=WORKFLOW, token="", post=post)
    assert len(calls) == 2 and len(draft["nodes"]) == 4
    assert json.loads(calls[1]["messages"][-1]["content"])["errors"]


@pytest.mark.parametrize("supplied", [True, False])
def test_tools_require_known_endpoints_and_valid_schema(supplied):
    workflow = deepcopy(WORKFLOW)
    if supplied:
        workflow["tasks"][0]["constraints"] = "Use https://tools.example.test/search"
    plan = {
        **PLAN,
        "tools": [
            {
                "name": "Search",
                "purpose": "Search the supplied source collection.",
                "blockType": "agent.tool",
                "configuration": {
                    "endpoint": "https://tools.example.test/search",
                    "method": "POST",
                    "toolName": "search",
                    "description": "Search documents",
                    "inputSchema": '{"type":"object","properties":{"query":{"type":"string"}}}',
                },
            }
        ],
    }
    draft = generate_draft(
        endpoint=ENDPOINT, model=MODEL, workflow=workflow, token="", post=lambda *_: response(plan)
    )
    tools = [n for n in draft["nodes"] if n["type"] == "agent.tool"]
    assert len(tools) == int(supplied)
    if supplied:
        assert tools[0]["configuration"]["requiresApproval"] is True
        plan["tools"][0]["configuration"]["inputSchema"] = '{"type":"object","required":3}'
        with pytest.raises(AssistantError, match="inputSchema"):
            generate_draft(
                endpoint=ENDPOINT,
                model=MODEL,
                workflow=workflow,
                token="",
                post=lambda *_: response(plan),
            )
    else:
        assert "Connect Search" in " ".join(draft["taskPlans"][0]["setupRequirements"])


def test_partial_build_preserves_all_briefs_and_drawn_transitions():
    workflow = chain()
    workflow["transitions"] = chain_transitions(workflow)
    original = deepcopy(workflow)
    contexts = []

    def post(endpoint, token, payload):
        contexts.append(json.loads(payload["messages"][1]["content"]))
        return planner(endpoint, token, payload)

    draft = generate_draft(
        endpoint=ENDPOINT,
        model=MODEL,
        workflow=workflow,
        token="",
        target_task_ids=["design"],
        post=post,
    )
    assert {n["taskId"] for n in draft["nodes"]} == {"design"}
    assert contexts[0]["predecessors"][0]["task"]["id"] == "requirements"
    assert contexts[0]["successors"][0]["task"]["id"] == "review"
    assert "workflowTransitions" not in draft
    assert workflow == original


def test_invalid_drawn_routes_fail_before_contacting_model():
    workflow = chain()
    workflow["transitions"] = chain_transitions(workflow)
    workflow["transitions"][-1]["stage"] = 1
    with pytest.raises(DraftError, match="advance"):
        generate_draft(
            endpoint=ENDPOINT,
            model=MODEL,
            workflow=workflow,
            token="",
            post=lambda *_: pytest.fail("Invalid routes reached the model"),
        )


def test_every_task_receives_inventory_and_reuses_saved_tool():
    workflow = chain()
    config = {
        "endpoint": "https://tools.example.test/search",
        "method": "POST",
        "toolName": "search",
        "description": "Search supplied documents",
        "inputSchema": '{"type":"object","properties":{"query":{"type":"string"}}}',
        "secretName": "SEARCH_API_TOKEN",
    }
    workflow["availableTools"] = [
        {"name": "Document search", "type": "agent.tool", "configuration": config}
    ]
    contexts = []

    def post(endpoint, token, payload):
        context = json.loads(payload["messages"][1]["content"])
        contexts.append(context)
        inventory = context["toolInventory"]
        assert {a["type"] for a in inventory["adapters"]} == {"agent.tool", "mcp.client"}
        assert inventory["configuredTools"][0]["configuration"]["endpoint"] == config["endpoint"]
        return response(
            {
                **deepcopy(PLAN),
                "taskId": context["task"]["id"],
                "tools": [
                    {
                        "name": "Document search",
                        "purpose": "Find evidence for this task from documents.",
                        "blockType": "agent.tool",
                        "configuration": {},
                    }
                ],
            }
        )

    draft = generate_draft(endpoint=ENDPOINT, model=MODEL, workflow=workflow, token="", post=post)
    tools = [n for n in draft["nodes"] if n["type"] == "agent.tool"]
    assert len(contexts) == 3 and len(tools) == 3
    for tool in tools:
        assert tool["configuration"]["endpoint"] == config["endpoint"]
        assert tool["configuration"]["inputSchema"] == config["inputSchema"]
        assert tool["configuration"]["secretName"] == "SEARCH_API_TOKEN"
        assert tool["configuration"]["requiresApproval"] is True
    assert all(p["connectedTools"] == ["Document search"] for p in draft["taskPlans"])
