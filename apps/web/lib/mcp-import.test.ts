import { describe, expect, it, vi, afterEach } from "vitest";
import { parseMcpImport, searchMcpRegistry } from "./mcp-import";

afterEach(() => vi.unstubAllGlobals());
describe("MCP metadata import", () => {
  it("discards URL credentials and header values but retains a token reference", () => {
    const [item] = parseMcpImport(JSON.stringify({ mcpServers: { docs: { url: "https://user:password@example.com/mcp?api_key=private&region=us", headers: { Authorization: "Bearer private" } } } }));
    expect(item?.template.node.configuration).toMatchObject({ endpoint: "https://example.com/mcp?region=us", secretName: "DOCS_TOKEN", allowedTools: "", requiresApproval: true });
    expect(JSON.stringify(item?.template)).not.toContain("private");
    expect(JSON.stringify(item?.template)).not.toContain("password");
  });
  it("maps registry packages to pinned isolated commands and preserves provenance", () => {
    const [item] = parseMcpImport(JSON.stringify({ server: { name: "org.example/docs", version: "2.0.0", packages: [{ registryType: "npm", identifier: "@example/docs", version: "1.2.3", transport: { type: "stdio" }, environmentVariables: [{ name: "API_KEY", value: "private" }] }] } }), "https://registry.example.org");
    expect(item?.template.node.type).toBe("mcp.stdio");
    expect(item?.template.node.configuration).toMatchObject({ command: "npx", packageSpec: "@example/docs@1.2.3", environmentNames: "API_KEY" });
    expect(item?.template.node.metadata?.importedFrom).toBe("https://registry.example.org");
    expect(JSON.stringify(item)).not.toContain("private");
  });
  it("refuses executable URLs and oversized manifests", () => {
    expect(() => parseMcpImport('{"mcpServers":{"x":{"url":"javascript:alert(1)"}}}')).toThrow(/HTTP/);
    expect(() => parseMcpImport(" ".repeat(2_000_001))).toThrow(/2 MB/);
  });
  it("supports compatible registries and opaque pagination cursors", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ servers: [], metadata: { nextCursor: "next+page" } })));
    vi.stubGlobal("fetch", fetch);
    const page = await searchMcpRegistry("https://example.org/catalog", "docs", "previous/page");
    const url = fetch.mock.calls[0]![0] as URL;
    expect(url.pathname).toBe("/catalog/v0.1/servers");
    expect(url.searchParams.get("cursor")).toBe("previous/page");
    expect(page.nextCursor).toBe("next+page");
    expect(fetch.mock.calls[0]![1]).toMatchObject({ credentials: "omit", redirect: "error" });
  });
});
