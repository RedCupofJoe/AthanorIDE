# Examples

Starter workflows for the [three-role workspace](../README.md#three-role-workflow-workspace). All home-page starters use graph schema 2.0.0.

## In the IDE (recommended)

On the home page (`/`), use **Examples** to create:

| Example | What it demonstrates |
| --- | --- |
| Adaptive research · 4 / 7 / 5 blocks | Different task implementations: prompt preparation, API/MCP evidence gathering, and independent review with final formatting |
| Parallel workflow + recovery | Two stage-1 tasks, a stage-2 join, and a dedicated A1 recovery handler, each with a matching implementation group |
| Sandboxed agent | One task with a bounded agent, model, API tool, sandbox, and result boundary |
| Agent harness | One task implemented by a configurable deployed harness endpoint and sandboxed adapter |
| MCP server | Tools, resources, and prompts exposed through MCP Server Builder; an empty task workflow retains the server entrypoint |

Builders live in [apps/web/lib/example-projects.ts](../apps/web/lib/example-projects.ts). Configure real endpoints, model IDs, network policy, and credential environment-variable names before running exported code.

## Explore different block counts

Open **Adaptive research · 4 / 7 / 5 blocks** and switch to **AI Engineer**:

- **Scope the request — 4 blocks:** input prompt template, agent, model, and sandbox. The task input binds to the template; its rendered text feeds the agent.
- **Gather evidence — 7 blocks:** agent, model, sandbox, guardrails, document-search API, document-read API, and a requirements-registry MCP connection. The agent chooses which tools to call for each question.
- **Review and deliver — 5 blocks:** agent, model, sandbox, guardrails, and final report template. The task result binds to the formatter, so the exported workflow returns the formatted report.

Every component contributes to its task's result. Block counts are intentionally different in this example; the canvas does not add or remove blocks at runtime. Task results pass through the serial workflow to **End**. Tool URLs under `example.test` are placeholders, and the model address must be reachable from the worker container. Configure services before execution; **Run preview** does not contact them.

## Explore parallel tasks and recovery

1. Open **Parallel workflow + recovery** and select **Subject Matter Expert**. Start feeds **Research evidence** and **Check requirements** at stage 1; both feed **Combine findings** at stage 2. **Recover research** is the A1 handler for Research evidence.
2. Edit the task roles, expected work, and constraints. Try cloning or resizing a task and Undo. Select a transition to inspect its stage or recovery description. **Validate** checks the design; **Export build brief** produces a ZIP for an engineer or external builder.
3. Switch to **AI Engineer**. Each task has a matching colored group. Inspect component assignment, string input/result boundaries, and inherited instructions. Shared resources may remain outside groups.
4. Switch to **AgentOpSec Engineer**. Review controls and findings, compare effective instructions with the SME brief, and preview optional-port or disconnected-component pruning. Applying a pruning preview is undoable.
5. Use **Run preview** to inspect the plan without invoking agents. Configure the implementation, resolve deployment validation errors, and export source code or a deployment package to execute it.

At runtime, the stage-1 tasks may run concurrently. Stage 2 waits until both succeed or recover and receives a deterministic JSON object keyed by predecessor task ID. The A1 handler runs only if Research evidence fails, times out, or is rejected by a guardrail; its successful result replaces the failed result. See the [user guide](../docs/user-guide.md#preview-export-and-execution) for deadlines, failed recovery, and approval behavior.

## Retained text transformation walkthrough

The transform walkthrough remains separate from the current home-page starters. See [text-transformation/README.md](./text-transformation/README.md) for validating, exporting, and running the generated FastAPI container.

Golden fixture: [text-transform.v2.json](../packages/contracts/fixtures/text-transform.v2.json).
