import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyGraph } from "@athanor/contracts";
import { useProjectStore as store } from "./project-store";
import { useSelectionStore } from "./selection-store";
import { useConnectionDraftStore } from "./connection-draft-store";

function add(type: string) { const id = store.getState().addNode(type); return store.getState().graph.nodes.find(n => n.id === id)!; }
function pair(a: ReturnType<typeof add>, b: ReturnType<typeof add>) { return { sourceNodeId: a.id, sourcePortId: a.outputs[0]!.id, targetNodeId: b.id, targetPortId: b.inputs[0]!.id }; }
beforeEach(() => { store.setState({ graph: createEmptyGraph("test"), past: [], future: [], connectionError: null, hydrated: true }); useSelectionStore.getState().clearSelection(); });
describe("canvas graph integrity", () => {
  it("reconnects atomically and undo restores the original wire", () => {
    const a = add("foundation.text_input"), b = add("foundation.output_viewer"), c = add("foundation.output_viewer");
    store.getState().connectPorts(pair(a, b));
    const original = store.getState().graph.edges[0]!;
    expect(store.getState().reconnectPorts(original.id, pair(a, c))).toBe(true);
    expect(store.getState().graph.edges[0]).toMatchObject({ ...pair(a, c), id: original.id });
    store.getState().undo(); expect(store.getState().graph.edges).toEqual([original]);
  });
  it("preserves the old wire after invalid reconnect and rejects duplicate multi-port edges", () => {
    const a = add("agent.tool"), b = add("mcp.server"), c = add("foundation.output_viewer");
    expect(store.getState().connectPorts(pair(a, b))).toBe(true);
    const edges = store.getState().graph.edges;
    expect(store.getState().connectPorts(pair(a, b))).toBe(false);
    expect(store.getState().reconnectPorts(edges[0]!.id, pair(a, c))).toBe(false);
    expect(store.getState().graph.edges).toEqual(edges);
  });
  it("deletes selected nodes and incident wires together, cleans selection, and restores them in one undo", () => {
    const a = add("foundation.text_input"), b = add("foundation.output_viewer"), c = add("foundation.output_viewer");
    store.getState().connectPorts(pair(a, b)); store.getState().connectPorts(pair(a, c));
    const graph = store.getState().graph;
    useSelectionStore.getState().setSelection([a.id], [graph.edges[0]!.id]);
    useConnectionDraftStore.getState().setDraft({ nodeId: a.id, handleId: a.outputs[0]!.id, handleType: "source", contractType: "STRING" });
    store.getState().deleteSelection([a.id], [graph.edges[0]!.id]);
    expect(store.getState().graph.nodes).toHaveLength(2); expect(store.getState().graph.edges).toHaveLength(0);
    expect(useSelectionStore.getState().selectedNodeIds).toEqual([]);
    expect(useSelectionStore.getState().selectedEdgeIds).toEqual([]);
    store.getState().undo(); expect(store.getState().graph.nodes).toEqual(graph.nodes); expect(store.getState().graph.edges).toEqual(graph.edges);
  });
  it("does not notify subscribers when selection is unchanged", () => {
    const before = useSelectionStore.getState(); before.setSelection([], []);
    expect(useSelectionStore.getState()).toBe(before);
  });
});
