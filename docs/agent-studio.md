# Agent studio

AthanorIDE preserves the existing project library, canvas, palette, inspector, validation,
preview, and export flow. The main palette now focuses on executable agent and MCP
blocks. Existing project storage is not migrated; agent projects use a new namespace.
No backend database reset is required for browser-local projects.

## Build a workflow

Start with **Sandboxed agent**. Set the full Chat Completions-compatible model endpoint
and model ID. Configure each API Tool's method, endpoint, and arguments using the field
builder. GET encodes arguments as query parameters; other methods send JSON.
Use a Custom API Block for your own endpoint. Save applied configuration as a template
and share libraries through Import/Export templates. Exported Python is editable.

Connect task → agent, model → model, sandbox → sandbox, and tool → tools. Connect
agent result → another agent's task to chain agents, or → Output Viewer. A prompt
template produces text by replacing `{{input}}` with its connected input.

Set the sandbox network to `bridge` when endpoint access is required. The default
`none` deliberately denies network. Bridge permits egress; deployment administrators
must configure a firewall/proxy or narrower network policy where needed.
Credentials are environment variable references, not values in workflow JSON.

Agent execution has model-turn, tool-call, timeout, and response-size bounds. It checks
JSON Schema arguments before calls, permits only connected tools, disables HTTP redirects,
and does not automatically retry side-effecting requests. Tool approval defaults on.
The exported local CLI prompts for each call; unattended execution denies approval.

## MCP servers and imports

Use **Import MCP servers** to search the official MCP Registry or change the URL to a
compatible registry. Pagination and search use its public v0.1 API. Browser CORS rules
apply; paste/upload the manifest if a custom registry disallows browser access.

Supported imports:

- Standard `server.json` and registry responses: Streamable HTTP remotes and pinned
  npm/PyPI stdio packages.
- Common `mcpServers` configurations: remote URLs or custom executable/argument lists.
- Other sources, including a repository: copy its server manifest or client configuration.

Import reads metadata only. It does not install packages, run commands, or invoke tools.
Publisher listings are not Foundation security endorsements. URL credential fields,
auth header values, and environment values are removed. Arbitrary arguments still need
review. Only bearer-token HTTP authentication is built in; other headers/auth schemes
need an exported adapter. URL placeholders and required package arguments need configuration.
Legacy SSE and OCI registry packages are not automatically converted.

Imported blocks retain source/version metadata and can become reusable templates.
Select exact allowed tool names in the inspector; an empty list exposes no tools.
Pinned packages install in the generated image during build. Confirm each PyPI package's
executable; custom commands need dependencies in `Containerfile.agent`. No shell is used
to start an imported server. Third-party package build scripts can run during image build.

To design a server, connect API Tools, MCP Resources, and MCP Prompts to **MCP Server
Builder**, plus a sandbox. Stdio is the default. Streamable HTTP can be selected for
HTTP clients. The generated server supports tools, static text resources, and task prompts
using the official Python SDK v2. It does not generate an OAuth provider. Protected
server tools deny execution until a trusted host approval integration is supplied.

## Export targets

| Choice | Generated artifacts | Run model |
| --- | --- | --- |
| Source code | Editable Python, graph, image recipe, environment-name example | `make build`, `make plan`, `make run` |
| Podman container | `Containerfile`, `Containerfile.agent`, Makefile | Rootless Podman, separate worker per agent |
| Docker container | `Dockerfile`, `Containerfile.agent`, Makefile | Docker, separate worker per agent |
| Helm Chart | Chart, values, workloads, network policies | `helm lint`, then install with your pushed image |
| OpenShift deployment | Workload YAML, ClusterIP services, network policies | Server-side dry run, then `oc apply` |
| npm package | `package.json`, CLI bin, full Python source | `npm pack`; requires Python and container engine |
| Makefiles | Build, plan, run, serve targets plus code | `make build`; `make serve NODE=…` for MCP |

All archives include the graph, dependency declarations, runtime code, deployment notes,
and credential-name placeholders. No credentials are emitted. The npm target distributes
a CLI wrapper around Python; it does not rewrite the runtime in JavaScript and has no
install hooks. No export automatically publishes or deploys anything.

The local launcher uses non-root, read-only workers with dropped capabilities, CPU/memory/
process limits, no host mounts, explicit networking, deadlines, and forced cleanup. Images
must be built first. Docker/Podman exports explicitly select their engine for plain OCI
sandboxes. gVisor and Kata require their installed runtimes; there is no host fallback.
Firecracker is a blueprint that requires a microVM adapter and refuses execution as-is.

Cluster exports use one pod sandbox for the workflow and separate agent processes inside
it. They reject conflicting sandbox policies. Agents become one-shot Jobs with no retries;
server-only graphs become MCP Deployments. Cluster MCP servers must use Streamable HTTP.
Podman/Docker map to the cluster OCI runtime; gVisor/Kata use RuntimeClass. Cluster process
limits and noexec mounts need node/runtime configuration as described in the archive.
OpenShift assigns its own UID; no privileged SCC, engine socket, public Route, or service
account API token is requested. NetworkPolicy enforcement requires a capable CNI.

Set credentials in your shell for local runs, or create the named cluster Secret yourself.
HTTP servers publish on host loopback locally or ClusterIP in clusters. Remote publishing
requires an MCP-aware authorization gateway and explicit host/origin configuration.

## Harness alternatives

The five harness blocks are endpoint adapters for LangGraph, OpenAI Agents SDK, Google
ADK, PydanticAI, and CrewAI. They POST a configurable task field and read a configurable
string response field. A deployed harness endpoint or wrapper is required. Native
framework SDK scaffolds, remote approvals, checkpoints, and isolation are owned by that
service. These are five curated alternatives, not a claimed popularity ranking.

## Canvas controls

Drag matching output/input handles to connect. Larger handle hit areas help at normal
zoom. Drag an existing edge endpoint to reconnect; an invalid drop retains the original
wire. Select a node or wire and use **Disconnect** in the inspector. Duplicate wires are
rejected even on multiple-input ports.

Delete/Backspace queues deletion in the inspector; attached wires are removed in the
same undo step. Escape cancels. Ctrl/Cmd+Z restores nodes and wires. Shift selects multiple
nodes. Fit View frames the graph. Node movement stays local to React Flow during the drag
and commits once on drop, avoiding graph serialization on every pointer event.

## Development

`pnpm catalog:sync` rebuilds the TypeScript catalog and updates the backend JSON mirror.
`pnpm catalog:check` detects drift. Tests cover graph validation, preview isolation,
export formats, runtime tool limits, approval denials, MCP protocol behavior, templates,
imports, and canvas mutation integrity.

References used for the design:

- [Agentic AI Foundation](https://aaif.io/) and [MCP Registry](https://registry.modelcontextprotocol.io/).
- [Generic registry API](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/api/generic-registry-api.md).
- [MCP Python SDK](https://py.sdk.modelcontextprotocol.io/) and [MCP transports](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports).
- [Podman run](https://docs.podman.io/en/latest/markdown/podman-run.1.html), [Docker rootless](https://docs.docker.com/engine/security/rootless/), [gVisor](https://gvisor.dev/docs/user_guide/quick_start/docker/), [Kata](https://katacontainers.io/), [Firecracker](https://firecracker-microvm.github.io/).
- [LangGraph](https://docs.langchain.com/oss/python/langgraph/overview), [OpenAI Agents SDK](https://developers.openai.com/api/docs/guides/agents/sdk), [Google ADK](https://adk.dev/), [PydanticAI](https://ai.pydantic.dev/), [CrewAI](https://docs.crewai.com/).
- [Helm charts](https://helm.sh/docs/topics/charts/) and [npm package metadata](https://docs.npmjs.com/files/package.json/).
