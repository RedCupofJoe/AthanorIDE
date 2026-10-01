import { createNodeFromDefinition } from "@athanor/node-definitions";
import { newId } from "@athanor/contracts";
import type { BlockTemplate } from "./block-templates";

export const OFFICIAL_MCP_REGISTRY = "https://registry.modelcontextprotocol.io";
export type McpCandidate = { id: string; name: string; description: string; transport: string; template: BlockTemplate; notes: string[] };
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const str = (v: unknown) => typeof v === "string" ? v : "";
const array = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const envName = (v: string) => v.replace(/[^A-Za-z0-9_]/g, "_").toUpperCase().replace(/^[0-9]/, "_$&");

function cleanEndpoint(raw: string, notes: string[]): string {
  try {
    const url = new URL(raw);
    if (!["https:", "http:"].includes(url.protocol)) throw new Error();
    if (url.username || url.password) notes.push("URL credentials were removed. Configure an environment variable in the inspector.");
    url.username = ""; url.password = ""; url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/token|key|secret|password|signature/i.test(key)) {
      url.searchParams.delete(key); notes.push("Credential query parameters were removed.");
    }
    if (/[{}]/.test(raw)) notes.push("Replace URL placeholders before use.");
    return url.toString();
  } catch { throw new Error("MCP endpoint must be an absolute HTTP(S) URL."); }
}

/** Parse metadata only. Never evaluate commands, install packages, or retain credential values. */
export function parseMcpImport(raw: string, source = "Imported manifest"): McpCandidate[] {
  if (raw.length > 2_000_000) throw new Error("MCP metadata exceeds 2 MB.");
  const data = record(JSON.parse(raw));
  const results: McpCandidate[] = [];
  function add(name: string, description: string, transport: string, config: Record<string, unknown>, notes: string[], version = "") {
    const node = createNodeFromDefinition(transport === "stdio" ? "mcp.stdio" : "mcp.client", { x: 0, y: 0 });
    node.name = name.slice(0, 120); node.configuration = { ...node.configuration, ...config };
    node.metadata = { importedFrom: source, serverVersion: version };
    const id = newId();
    results.push({ id, name: node.name, description, transport, notes, template: { id, name: node.name, node } });
  }
  if (data.mcpServers) {
    for (const [name, value] of Object.entries(record(data.mcpServers))) {
      const cfg = record(value); const notes = ["Select allowed tool names in the inspector before running."];
      if (cfg.url) {
        if (cfg.type === "sse") { notes.push("Legacy SSE must be replaced with a Streamable HTTP endpoint."); }
        const headers = Object.keys(record(cfg.headers));
        if (headers.length) notes.push(`Header values removed (${headers.join(", ")}). Configure a bearer token reference; other header schemes require an exported adapter.`);
        add(name, "Imported MCP client configuration", "streamable-http", { endpoint: cleanEndpoint(str(cfg.url), notes), secretName: headers.some(h => h.toLowerCase() === "authorization") ? `${envName(name)}_TOKEN` : "" }, notes);
      } else if (cfg.command) {
        // Values are deliberately discarded; arguments containing environment substitutions remain literal until configured.
        const args = array(cfg.args).map(v => str(v));
        if (args.some(v => /token|password|secret|api[-_]?key|\$\{|sk-[A-Za-z0-9]/i.test(v))) {
          notes.push("Arguments may reference credentials. Arguments were cleared; re-enter non-secret arguments and use environment variables."); args.length = 0;
        }
        notes.push("Custom commands must be installed in Containerfile.agent. No host command is executed on import.");
        add(name, "Imported stdio command", "stdio", { command: str(cfg.command), args: JSON.stringify(args), environmentNames: Object.keys(record(cfg.env)).filter(k => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k)).join(", ") }, notes);
      }
    }
  } else {
    const entries = data.servers ? array(data.servers) : [data];
    for (const entry of entries) {
      const wrapper = record(entry); const server = wrapper.server ? record(wrapper.server) : wrapper;
      const name = str(server.title) || str(server.name); if (!name) continue;
      const description = str(server.description); const version = str(server.version);
      for (const remoteValue of array(server.remotes)) {
        const remote = record(remoteValue); if (remote.type !== "streamable-http") continue;
        const notes = ["Select allowed tool names in the inspector before running. Registry listing is not a security endorsement."];
        const headers = array(remote.headers).map(record);
        if (headers.length) notes.push(`Required headers: ${headers.map(h => str(h.name)).join(", ")}. Only bearer-token auth is built in; extend the exported adapter for other schemes.`);
        add(name, description, "streamable-http", { endpoint: cleanEndpoint(str(remote.url), notes), secretName: headers.some(h => str(h.name).toLowerCase() === "authorization") ? `${envName(str(server.name) || name)}_TOKEN` : "" }, notes, version);
      }
      for (const value of array(server.packages)) {
        const pkg = record(value); const registry = str(pkg.registryType); const identifier = str(pkg.identifier); const pin = str(pkg.version);
        if (record(pkg.transport).type !== "stdio" || !["npm", "pypi"].includes(registry) || !identifier || !pin) continue;
        const notes = ["Confirm the package's executable and arguments in the inspector, then select allowed tools. Building the export installs this third-party package."];
        const args = array(pkg.packageArguments).flatMap(v => {
          const arg = record(v); if (arg.isSecret || arg.value === undefined) { notes.push(`Configure argument ${str(arg.name) || str(arg.valueHint)} without storing credentials.`); return []; }
          return arg.type === "named" ? [str(arg.name), str(arg.value)] : [str(arg.value)];
        });
        const spec = registry === "npm" ? `${identifier}@${pin}` : `${identifier}==${pin}`;
        add(name, description, "stdio", { command: registry === "npm" ? "npx" : identifier, args: JSON.stringify(registry === "npm" ? ["--offline", "--prefix", "/opt/mcp", identifier, ...args] : args), packageRegistry: registry, packageSpec: spec, environmentNames: array(pkg.environmentVariables).map(v => str(record(v).name)).filter(n => /^[A-Za-z_][A-Za-z0-9_]*$/.test(n)).join(", ") }, notes, version);
      }
    }
  }
  if (!results.length) throw new Error("No supported servers found. Use a registry response, server.json (Streamable HTTP, npm, or PyPI), or mcpServers configuration.");
  if (results.length > 200) throw new Error("Import up to 200 server variants at a time.");
  return results;
}

export async function searchMcpRegistry(base: string, search: string, cursor?: string): Promise<{ items: McpCandidate[]; nextCursor?: string }> {
  const url = new URL(base);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Use HTTPS for registries (HTTP is allowed on localhost).");
  if (url.username || url.password || url.search || url.hash) throw new Error("Registry URL must not contain credentials, query parameters, or fragments.");
  url.pathname = `${url.pathname.replace(/\/$/, "").replace(/\/v0\.1$/, "")}/v0.1/servers`;
  url.searchParams.set("limit", "20"); url.searchParams.set("version", "latest");
  if (search.trim()) url.searchParams.set("search", search.trim());
  if (cursor) url.searchParams.set("cursor", cursor);
  const response = await fetch(url, { credentials: "omit", redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Registry returned HTTP ${response.status}.`);
  const reader = response.body?.getReader(); if (!reader) throw new Error("Registry returned no body.");
  const decoder = new TextDecoder(); let raw = ""; let bytes = 0;
  try { while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 2_000_000) throw new Error("Registry response exceeds 2 MB."); raw += decoder.decode(chunk.value, { stream: true }); } raw += decoder.decode(); }
  finally { await reader.cancel(); }
  const data = record(JSON.parse(raw));
  let items: McpCandidate[] = [];
  if (array(data.servers).length) { try { items = parseMcpImport(raw, base); } catch (e) { if (!(e instanceof Error && e.message.startsWith("No supported"))) throw e; } }
  return { items, nextCursor: str(record(data.metadata).nextCursor) || undefined };
}
