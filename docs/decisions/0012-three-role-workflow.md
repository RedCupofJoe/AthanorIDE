# ADR 0012: Three-role Workflow and Fresh Project Model

- **Status:** Accepted
- **Date:** 2026-10-24

## Context

SMEs define bounded tasks, engineers configure their implementation, and AgentOpSec engineers review controls before deployment. A flat component graph does not preserve the SME's intent or provide clear task execution boundaries. Keeping existing saved-project migrations would complicate this change without a retention requirement.

## Decision

Use canonical schema **2.0.0**, mirrored in JSON Schema, Zod, and Pydantic. A required workflow holds briefs (role, expected tasks, constraints), colors, separate layouts, normal/recovery transitions, input, concurrency, and input/result bindings. Three universally available tabs project the same graph; no identity management is introduced.

Upgrade the project IndexedDB to version 2 by recreating only its projects store. Replace project indexes/body keys once; retain unrelated browser data and the vault. Reject old imports with an unsupported-version message. Remove migration code and rebuild starters directly.

Normal incoming edges determine each task's global stage; Start targets stage 1 and subsequent edges strictly advance. All incoming stage labels agree. Stage peers run concurrently (default four, maximum 32); all finish or recover before advancement. Roots use workflow input or an explicit CLI override. Single predecessors pass their string result; joins serialize a sorted task-ID/result object.

A normal task can have one dedicated recovery task, labeled A followed by the failed stage. Failure, timeout, and guardrail rejection trigger it with original input and sanitized error category. Recovery replaces the failed result. No loops, nested recovery, retries, or business expressions are supported. A failure stops advancement after current peers settle within their isolated worker deadlines. One generated scheduler serves local-container and cluster entrypoints. CLI approvals serialize behind a deadline-aware lock; unattended approvals fail closed.

Each implementation has one string input and one string result boundary. Internal wires determine the result dependency closure. Executable components must be assigned and reach their task result; workflow transitions carry data across tasks. Shared non-executable model/tool/security resources may remain outside groups. Instructions inherit the live SME brief unless explicitly overridden; assignment preserves configured custom instructions as flagged overrides. Harness requests include the effective brief.

Design validation permits an incomplete implementation; deployment validation also checks components, bindings, policies, and security findings. Handoff is a deterministic ZIP for an external builder, with no integrated building agent. Every deployment export revalidates on the server and includes the workflow and deterministic review report. Detected embedded credentials block both handoff and deployment; overrides warn without an approval gate.

Pruning previews exact optional-port or disconnected-member removals, applies one undoable edit, and revalidates. Omitted ports must be catalog-defined optional ports; required, connected, and bound ports survive. Group pruning preserves task boundaries, macro/portal references, and shared resources. Optional ports can be restored. Deleting a task unassigns members and removes transitions.

## Consequences

Old saved projects intentionally do not survive the upgrade. Templates and runtime/deployment capabilities remain. The browser stores role preference separately from graph semantics and keeps separate SME/engineering viewports. IDE preview remains non-executing for tasks. Secret scanning is heuristic and does not substitute for production secret management or review of deployed endpoints. Cluster workers share the existing pod sandbox, with a fresh process and deadline per invocation.
