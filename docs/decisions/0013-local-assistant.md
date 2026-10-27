# ADR 0013: Opt-in Local Assistant and Project GraphRAG

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

Subject matter experts can describe tasks, but turning those briefs into an initial engineering graph is still manual. Engineers and AgentOpSec reviewers also need a way to ask about the deployment they are looking at. ADR 0012 keeps the deterministic build brief as the handoff to an external builder.

## Decision

Add an opt-in assistant in the right-hand column. The SME **Build draft** action sends task briefs and transitions to a user-supplied chat-completions endpoint. The model may inspect the local catalog through `list_blocks` and `describe_block`, then return nodes and edges. The API rejects unknown types, incompatible ports, missing required fields, cross-task wires, and embedded secrets. The editor applies new components only to tasks that have none, records one undo entry, and switches to AI Engineer.

The endpoint and model ID are browser preferences. The token is written to the local vault as `ATHANOR_ASSISTANT_TOKEN` and is never read back into the settings form, the graph, or the model prompt. A locked or empty vault returns an error and does not call the endpoint.

Each project keeps a local index of task briefs and non-secret component configuration, beside the graph rather than inside exported JSON. Engineer and AgentOpSec questions send the question plus retrieved passages and the immediate neighbors of those components. The same draft function is available to a localhost MCP client.

This assistant does not replace the deterministic build-brief handoff.

## Consequences

The assistant runs only after the user saves an endpoint and unlocks a vault token. Graph schema stays 2.0.0. Secret scanning remains heuristic. Answers depend on the user's model endpoint and on the local embedding model used for retrieval.
