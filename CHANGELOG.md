# Change notes

## Three-role workflow workspace — 2026-10-24

### Added

- **Subject Matter Expert, AI Engineer, and AgentOpSec Engineer tabs** over one shared project, with matching home-page entry choices, remembered role selection, separate viewports, keyboard navigation, and narrow-layout controls.
- **Visual task briefs:** draw, move, resize, color, and clone tasks containing a role, expected work, and functional constraints. Connect Start, numbered stages, parallel tasks, and dedicated `AN` recovery handlers.
- **Grouped implementation:** persistent task groups, explicit component assignment, string input/result boundaries, live SME instruction inheritance, and visible engineer overrides with an instruction comparison.
- **Build-brief handoff:** `POST /api/v1/projects/handoff` produces a deterministic ZIP containing `workflow.json`, `build-brief.md`, and `project-scaffold.json`. A valid design can be handed to an engineer or external building agent before components are configured.
- **Shared workflow scheduler:** bounded stage concurrency (default four), stage barriers, deterministic joins, and recovery after execution failure, timeout, or guardrail rejection. Successful recovery substitutes the failed result; unsuccessful recovery stops advancement after running peers settle. Local and cluster exports share scheduling semantics, deadlines, and serialized interactive approvals.
- **AgentOpSec review:** highlighted controls, authentication/credential references, instruction overrides, disconnected components, and unused ports. Nested credential scanning reports field locations without echoing detected values.
- **Previewed, undoable pruning:** remove unconnected optional ports or fully disconnected components within a selected task. Preserve required/connected ports, task boundaries, macro/portal references, and shared resources; restore omitted optional ports from the catalog.
- **Design and deployment validation profiles:** check briefs and workflow structure before implementation, then check components, bindings, policies, and security readiness for deployment. Graph edits invalidate validation; pruning revalidates; the server validates again on export.
- **Workflow and security artifacts** in code, container, Helm, OpenShift, npm, and Makefile exports: `workflow.json`, `build-brief.md`, and deterministic `security-review.json`.
- **Current-schema starters:** Sandboxed agent, Agent harness, MCP server, and Parallel workflow + recovery.

### Changed

- Autosave, duplication, JSON import/export, and undo/redo preserve task briefs, layouts, transitions, bindings, instruction overrides, and pruned ports. Deleting a task removes its transitions and unassigns its components.
- IDE preview shows planned stages and recovery routes without executing agents. Server-only MCP projects may keep an empty workflow and their server entrypoint.
- Instruction overrides produce review warnings. Missing required connections, invalid policies/bindings, and detected embedded credentials block deployment export; credential findings also block handoff.

### Breaking project format change

Graph schema **2.0.0** requires a workflow section and is aligned across JSON Schema, Zod, and Pydantic. This is a graph schema version, not an application release number.

The IndexedDB version-2 upgrade resets the project store once. A project-only cleanup replaces older browser project indexes and removes old project-body keys. Newly created projects survive subsequent loads; templates, preferences, marketplace data, and the local secrets vault are preserved. Old project loaders/migrations are removed, and older graph imports receive an unsupported-version error.

### Scope

All three tabs are available to everyone; role selection does not grant or restrict access. Handoff exports a brief for an external builder. Recovery has no loops, nested handlers, automatic retries, or business-condition expressions. Credential scanning is heuristic; deployment endpoints and runtime policies still need review.

See the [workspace overview](README.md#three-role-workflow-workspace), [user guide](docs/user-guide.md), [starter walkthrough](examples/README.md), and [architecture decision](docs/decisions/0012-three-role-workflow.md).
