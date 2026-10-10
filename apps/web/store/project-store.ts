/**
 * Zustand store for the currently open architecture graph.
 * Owns undo/redo history, graph mutations, and debounced local persistence.
 */
import {
  createDefaultInfrastructureTokens,
  createEmptyGraph,
  newId,
  type ArchitectureEdge,
  type ArchitectureGraph,
  type ArchitectureNode,
  type InfrastructureTokenSlot,
} from "@athanor/contracts";
import { createNodeFromDefinition } from "@athanor/node-definitions";
import { create } from "zustand";
import { useSelectionStore } from "./selection-store";
import { useConnectionDraftStore } from "./connection-draft-store";

import { materializeBlockTemplate, type BlockTemplate } from "@/lib/block-templates";
import { evaluateConnection } from "@/lib/graph-utils";
import { buildCollapsedMacro } from "@/lib/macros";
import { loadPersistedGraph, persistGraph } from "@/lib/persistence";
import {
  getActiveProjectId,
  loadProjectGraph,
  setActiveProjectId,
} from "@/lib/project-library";
import {
  syncPortalBusesFromNodes,
  withSyncedPortalPorts,
} from "@/lib/portals";
import {
  defaultSwimlaneBounds,
  findContainingSwimlane,
  type DeploymentKind,
} from "@/lib/swimlanes";

const HISTORY_LIMIT = 50;

interface HistorySnapshot {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  macroBlocks: ArchitectureGraph["macroBlocks"];
  portalBuses: ArchitectureGraph["portalBuses"];
  deploymentEnvironments: ArchitectureGraph["deploymentEnvironments"];
  exportConfiguration: ArchitectureGraph["exportConfiguration"];
  infrastructureTokens: ArchitectureGraph["infrastructureTokens"];
}

interface ProjectStore {
  graph: ArchitectureGraph;
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  connectionError: string | null;
  hydrated: boolean;
  /** Load a specific project (or the active/persisted one when omitted). */
  hydrate: (projectId?: string) => boolean;
  /** Switch the open workspace to another saved project. */
  openProject: (projectId: string) => boolean;
  setProjectName: (name: string) => void;
  replaceGraph: (graph: ArchitectureGraph, recordHistory?: boolean) => void;
  addTemplate: (template: BlockTemplate) => string;
  addNode: (type: string, position?: { x: number; y: number }) => string;
  updateNodePosition: (id: string, position: { x: number; y: number }) => void;
  beginGesture: () => void;
  updateNodePositions: (
    updates: Array<{ id: string; position: { x: number; y: number } }>,
  ) => void;
  updateNodeConfiguration: (id: string, configuration: Record<string, unknown>) => void;
  updateNodeName: (id: string, name: string) => void;
  updateNodeDeploymentTarget: (id: string, deploymentTarget: string | undefined) => void;
  setExportConfiguration: (
    patch: Partial<NonNullable<ArchitectureGraph["exportConfiguration"]>>,
  ) => void;
  setInfrastructureTokens: (tokens: InfrastructureTokenSlot[]) => void;
  upsertInfrastructureToken: (slot: InfrastructureTokenSlot) => void;
  removeInfrastructureToken: (slotId: string) => void;
  deleteSelection: (nodeIds: string[], edgeIds: string[]) => void;
  reconnectPorts: (edgeId: string, params: { sourceNodeId: string; sourcePortId: string; targetNodeId: string; targetPortId: string }) => boolean;
  connectPorts: (params: {
    sourceNodeId: string;
    sourcePortId: string;
    targetNodeId: string;
    targetPortId: string;
  }) => boolean;
  setViewport: (viewport: ArchitectureGraph["viewport"]) => void;
  clearConnectionError: () => void;
  undo: () => void;
  redo: () => void;
  duplicateNodes: (nodeIds: string[]) => void;
  markSaved: () => void;
  collapseSelectionToMacro: (nodeIds: string[], name?: string) => string | null;
  setMacroCollapsed: (macroId: string, collapsed: boolean) => void;
  expandMacro: (macroId: string) => void;
  updateMacroPosition: (macroId: string, position: { x: number; y: number }) => void;
  addSwimlane: (kind?: DeploymentKind, name?: string) => string;
  updateSwimlaneBounds: (
    id: string,
    bounds: { x: number; y: number; width: number; height: number },
  ) => void;
  assignNodesToSwimlanes: (nodeIds: string[]) => void;
}

function touch(graph: ArchitectureGraph): ArchitectureGraph {
  return {
    ...graph,
    project: {
      ...graph.project,
      updatedAt: new Date().toISOString(),
    },
  };
}

function withPortalSync(graph: ArchitectureGraph): ArchitectureGraph {
  const nodes = graph.nodes.map(withSyncedPortalPorts);
  return {
    ...graph,
    nodes,
    portalBuses: syncPortalBusesFromNodes(nodes),
  };
}

function ensureInfrastructureTokens(graph: ArchitectureGraph): ArchitectureGraph {
  if (graph.infrastructureTokens && graph.infrastructureTokens.length > 0) {
    return graph;
  }
  return {
    ...graph,
    infrastructureTokens: createDefaultInfrastructureTokens(),
  };
}

function snapshotOf(graph: ArchitectureGraph): HistorySnapshot {
  return {
    nodes: structuredClone(graph.nodes),
    edges: structuredClone(graph.edges),
    macroBlocks: structuredClone(graph.macroBlocks),
    portalBuses: structuredClone(graph.portalBuses),
    deploymentEnvironments: structuredClone(graph.deploymentEnvironments),
    exportConfiguration: structuredClone(graph.exportConfiguration),
    infrastructureTokens: structuredClone(graph.infrastructureTokens ?? []),
  };
}

function applySnapshot(
  graph: ArchitectureGraph,
  snapshot: HistorySnapshot,
): ArchitectureGraph {
  return touch({
    ...graph,
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    macroBlocks: snapshot.macroBlocks,
    portalBuses: snapshot.portalBuses,
    deploymentEnvironments: snapshot.deploymentEnvironments,
    exportConfiguration: snapshot.exportConfiguration,
    infrastructureTokens: snapshot.infrastructureTokens,
  });
}

function pushHistory(state: ProjectStore): Pick<ProjectStore, "past" | "future"> {
  const nextPast = [...state.past, snapshotOf(state.graph)].slice(-HISTORY_LIMIT);
  return { past: nextPast, future: [] };
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(graph: ArchitectureGraph): void {
  if (typeof window === "undefined") return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistGraph(graph);
  }, 400);
}

function pruneMacros(
  macros: ArchitectureGraph["macroBlocks"],
  remainingNodeIds: Set<string>,
): ArchitectureGraph["macroBlocks"] {
  return macros
    .map((macro) => ({
      ...macro,
      nodeIds: macro.nodeIds.filter((id) => remainingNodeIds.has(id)),
    }))
    .filter((macro) => macro.nodeIds.length > 0);
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  graph: createEmptyGraph("Agent Workspace"),
  past: [],
  future: [],
  connectionError: null,
  hydrated: false,

  hydrate: (projectId) => {
    const targetId = projectId ?? getActiveProjectId() ?? undefined;
    if (targetId) {
      const loaded = loadProjectGraph(targetId);
      if (loaded) {
        setActiveProjectId(loaded.project.id);
        set({
          graph: ensureInfrastructureTokens(withPortalSync(loaded)),
          hydrated: true,
          past: [],
          future: [],
          connectionError: null,
        });
        return true;
      }
      if (projectId) {
        set({ hydrated: true });
        return false;
      }
    }

    const persisted = loadPersistedGraph();
    if (persisted) {
      setActiveProjectId(persisted.project.id);
      set({
        graph: ensureInfrastructureTokens(withPortalSync(persisted)),
        hydrated: true,
        past: [],
        future: [],
        connectionError: null,
      });
      return true;
    }

    set({ hydrated: true });
    return true;
  },

  openProject: (projectId) => {
    const loaded = loadProjectGraph(projectId);
    if (!loaded) return false;
    setActiveProjectId(loaded.project.id);
    set({
      graph: ensureInfrastructureTokens(withPortalSync(loaded)),
      hydrated: true,
      past: [],
      future: [],
      connectionError: null,
    });
    return true;
  },

  setProjectName: (name) => {
    set((state) => {
      const history = pushHistory(state);
      const graph = touch({
        ...state.graph,
        project: { ...state.graph.project, name },
      });
      schedulePersist(graph);
      return { ...history, graph };
    });
  },

  replaceGraph: (graph, recordHistory = true) => {
    set((state) => {
      const history = recordHistory
        ? pushHistory(state)
        : { past: state.past, future: state.future };
      const next = touch(ensureInfrastructureTokens(withPortalSync(graph)));
      schedulePersist(next);
      return { ...history, graph: next, connectionError: null };
    });
  },

  addTemplate: (template) => {
    const node = withSyncedPortalPorts(materializeBlockTemplate(template, { x: 120, y: 120 }));
    set((state) => {
      const graph = touch(withPortalSync({ ...state.graph, nodes: [...state.graph.nodes, node] }));
      schedulePersist(graph);
      return { ...pushHistory(state), graph };
    });
    return node.id;
  },

  addNode: (type, position = { x: 120, y: 120 }) => {
    const node = withSyncedPortalPorts(createNodeFromDefinition(type, position));
    set((state) => {
      const history = pushHistory(state);
      const graph = touch(
        withPortalSync({
          ...state.graph,
          nodes: [...state.graph.nodes, node],
        }),
      );
      schedulePersist(graph);
      return { ...history, graph };
    });
    return node.id;
  },

  updateNodePosition: (id, position) => {
    set((state) => {
      const graph = touch({
        ...state.graph,
        nodes: state.graph.nodes.map((node) =>
          node.id === id ? { ...node, position } : node,
        ),
      });
      schedulePersist(graph);
      return { graph };
    });
  },

  beginGesture: () => {
    set((state) => pushHistory(state));
  },

  updateNodePositions: (updates) => {
    const map = new Map(updates.map((item) => [item.id, item.position]));
    set((state) => {
      const graph = touch({
        ...state.graph,
        nodes: state.graph.nodes.map((node) => {
          const next = map.get(node.id);
          return next ? { ...node, position: next } : node;
        }),
      });
      schedulePersist(graph);
      return { graph };
    });
  },

  updateNodeConfiguration: (id, configuration) => {
    set((state) => {
      const history = pushHistory(state);
      const graph = touch(
        withPortalSync({
          ...state.graph,
          nodes: state.graph.nodes.map((node) =>
            node.id === id
              ? withSyncedPortalPorts({
                  ...node,
                  configuration: { ...node.configuration, ...configuration },
                })
              : node,
          ),
        }),
      );
      schedulePersist(graph);
      return { ...history, graph };
    });
  },

  updateNodeName: (id, name) => {
    set((state) => {
      const history = pushHistory(state);
      const graph = touch({
        ...state.graph,
        nodes: state.graph.nodes.map((node) =>
          node.id === id ? { ...node, name } : node,
        ),
      });
      schedulePersist(graph);
      return { ...history, graph };
    });
  },

  updateNodeDeploymentTarget: (id, deploymentTarget) => {
    set((state) => {
      const history = pushHistory(state);
      const graph = touch({
        ...state.graph,
        nodes: state.graph.nodes.map((node) =>
          node.id === id ? { ...node, deploymentTarget } : node,
        ),
      });
      schedulePersist(graph);
      return { ...history, graph };
    });
  },

  setExportConfiguration: (patch) => {
    set((state) => {
      const history = pushHistory(state);
      const current = state.graph.exportConfiguration ?? {
        includeDockerCompat: false,
        includeKubernetes: false,
        includeOpenShift: false,
        includeTerraform: false,
        includeArgoCd: false,
      };
      const graph = touch({
        ...state.graph,
        exportConfiguration: { ...current, ...patch },
      });
      schedulePersist(graph);
      return { ...history, graph };
    });
  },

  setInfrastructureTokens: (tokens) => {
    set((state) => {
      const history = pushHistory(state);
      const graph = touch({
        ...state.graph,
        infrastructureTokens: tokens,
      });
      schedulePersist(graph);
      return { ...history, graph };
    });
  },

  upsertInfrastructureToken: (slot) => {
    set((state) => {
      const history = pushHistory(state);
      const existing = state.graph.infrastructureTokens ?? [];
      const index = existing.findIndex((item) => item.id === slot.id);
      const next =
        index >= 0
          ? existing.map((item, i) => (i === index ? slot : item))
          : [...existing, slot];
      const graph = touch({
        ...state.graph,
        infrastructureTokens: next,
      });
      schedulePersist(graph);
      return { ...history, graph };
    });
  },

  removeInfrastructureToken: (slotId) => {
    set((state) => {
      const history = pushHistory(state);
      const graph = touch({
        ...state.graph,
        infrastructureTokens: (state.graph.infrastructureTokens ?? []).filter(
          (slot) => slot.id !== slotId,
        ),
      });
      schedulePersist(graph);
      return { ...history, graph };
    });
  },

  deleteSelection: (nodeIds, edgeIds) => {
    const nodeSet = new Set(nodeIds);
    const edgeSet = new Set(edgeIds);
    set((state) => {
      const history = pushHistory(state);
      const nodes = state.graph.nodes.filter((node) => !nodeSet.has(node.id));
      const remainingIds = new Set(nodes.map((node) => node.id));
      const graph = touch(
        withPortalSync({
          ...state.graph,
          nodes,
          edges: state.graph.edges.filter(
            (edge) =>
              !edgeSet.has(edge.id) &&
              !nodeSet.has(edge.sourceNodeId) &&
              !nodeSet.has(edge.targetNodeId),
          ),
          macroBlocks: pruneMacros(state.graph.macroBlocks, remainingIds),
        }),
      );
      schedulePersist(graph);
      return { ...history, graph, connectionError: null };
    });
    const remaining = get().graph;
    const selection = useSelectionStore.getState();
    selection.setSelection(selection.selectedNodeIds.filter(id => remaining.nodes.some(n => n.id === id)), selection.selectedEdgeIds.filter(id => remaining.edges.some(e => e.id === id)));
    useConnectionDraftStore.getState().clearDraft();
  },

  reconnectPorts: (edgeId, params) => {
    const state = get();
    const existing = state.graph.edges.find(edge => edge.id === edgeId);
    if (!existing) return false;
    if (existing.sourceNodeId === params.sourceNodeId && existing.sourcePortId === params.sourcePortId && existing.targetNodeId === params.targetNodeId && existing.targetPortId === params.targetPortId) return true;
    const decision = evaluateConnection({ nodes: state.graph.nodes, edges: state.graph.edges.filter(edge => edge.id !== edgeId), ...params });
    if (!decision.ok) { set({ connectionError: decision.reason }); return false; }
    set(current => {
      const graph = touch({ ...current.graph, edges: current.graph.edges.map(edge => edge.id === edgeId ? { ...edge, ...params } : edge) });
      schedulePersist(graph);
      return { ...pushHistory(current), graph, connectionError: null };
    });
    return true;
  },

  connectPorts: ({ sourceNodeId, sourcePortId, targetNodeId, targetPortId }) => {
    const state = get();
    const decision = evaluateConnection({
      nodes: state.graph.nodes,
      edges: state.graph.edges,
      sourceNodeId,
      sourcePortId,
      targetNodeId,
      targetPortId,
    });
    if (!decision.ok) {
      set({ connectionError: decision.reason });
      return false;
    }
    const edge: ArchitectureEdge = {
      id: newId(),
      sourceNodeId,
      sourcePortId,
      targetNodeId,
      targetPortId,
    };
    set((current) => {
      const history = pushHistory(current);
      const graph = touch({
        ...current.graph,
        edges: [...current.graph.edges, edge],
      });
      schedulePersist(graph);
      return { ...history, graph, connectionError: null };
    });
    return true;
  },

  setViewport: (viewport) => {
    set((state) => {
      const graph = { ...state.graph, viewport };
      schedulePersist(graph);
      return { graph };
    });
  },

  clearConnectionError: () => set({ connectionError: null }),

  undo: () => {
    set((state) => {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      const past = state.past.slice(0, -1);
      const future = [snapshotOf(state.graph), ...state.future].slice(0, HISTORY_LIMIT);
      const graph = applySnapshot(state.graph, previous);
      schedulePersist(graph);
      return { past, future, graph };
    });
  },

  redo: () => {
    set((state) => {
      const next = state.future[0];
      if (!next) return state;
      const future = state.future.slice(1);
      const past = [...state.past, snapshotOf(state.graph)].slice(-HISTORY_LIMIT);
      const graph = applySnapshot(state.graph, next);
      schedulePersist(graph);
      return { past, future, graph };
    });
  },

  duplicateNodes: (nodeIds) => {
    const idSet = new Set(nodeIds);
    set((state) => {
      const selected = state.graph.nodes.filter((node) => idSet.has(node.id));
      if (selected.length === 0) return state;
      const history = pushHistory(state);
      const idMap = new Map<string, string>();
      const clones = selected.map((node) => {
        const newIdValue = newId();
        idMap.set(node.id, newIdValue);
        return {
          ...structuredClone(node),
          id: newIdValue,
          name: `${node.name} copy`,
          position: { x: node.position.x + 40, y: node.position.y + 40 },
          parentMacroId: undefined,
        };
      });
      const clonedEdges = state.graph.edges
        .filter(
          (edge) => idSet.has(edge.sourceNodeId) && idSet.has(edge.targetNodeId),
        )
        .map((edge) => ({
          ...edge,
          id: newId(),
          sourceNodeId: idMap.get(edge.sourceNodeId)!,
          targetNodeId: idMap.get(edge.targetNodeId)!,
        }));
      const graph = touch(
        withPortalSync({
          ...state.graph,
          nodes: [...state.graph.nodes, ...clones],
          edges: [...state.graph.edges, ...clonedEdges],
        }),
      );
      schedulePersist(graph);
      return { ...history, graph };
    });
  },

  markSaved: () => {
    persistGraph(get().graph);
  },

  collapseSelectionToMacro: (nodeIds, name) => {
    const unique = [...new Set(nodeIds)];
    if (unique.length < 2) return null;
    const state = get();
    const selected = state.graph.nodes.filter((node) => unique.includes(node.id));
    if (selected.length < 2) return null;

    const macro = buildCollapsedMacro(
      unique,
      state.graph.nodes,
      state.graph.edges,
      name ?? "Macro Block",
    );

    set((current) => {
      const history = pushHistory(current);
      const graph = touch({
        ...current.graph,
        nodes: current.graph.nodes.map((node) =>
          unique.includes(node.id) ? { ...node, parentMacroId: macro.id } : node,
        ),
        macroBlocks: [...current.graph.macroBlocks, macro],
      });
      schedulePersist(graph);
      return { ...history, graph };
    });
    return macro.id;
  },

  setMacroCollapsed: (macroId, collapsed) => {
    set((state) => {
      const history = pushHistory(state);
      const graph = touch({
        ...state.graph,
        macroBlocks: state.graph.macroBlocks.map((macro) =>
          macro.id === macroId ? { ...macro, collapsed } : macro,
        ),
      });
      schedulePersist(graph);
      return { ...history, graph };
    });
  },

  expandMacro: (macroId) => {
    get().setMacroCollapsed(macroId, false);
  },

  updateMacroPosition: (macroId, position) => {
    set((state) => {
      const graph = touch({
        ...state.graph,
        macroBlocks: state.graph.macroBlocks.map((macro) =>
          macro.id === macroId
            ? {
                ...macro,
                metadata: { ...macro.metadata, position },
              }
            : macro,
        ),
      });
      schedulePersist(graph);
      return { graph };
    });
  },

  addSwimlane: (kind = "LOCAL_WORKSTATION", name) => {
    const id = newId();
    set((state) => {
      const history = pushHistory(state);
      const index = state.graph.deploymentEnvironments.length;
      const lane = {
        id,
        kind,
        name: name ?? kind.replaceAll("_", " "),
        bounds: defaultSwimlaneBounds(index),
      };
      const graph = touch({
        ...state.graph,
        deploymentEnvironments: [...state.graph.deploymentEnvironments, lane],
      });
      schedulePersist(graph);
      return { ...history, graph };
    });
    return id;
  },

  updateSwimlaneBounds: (id, bounds) => {
    set((state) => {
      const graph = touch({
        ...state.graph,
        deploymentEnvironments: state.graph.deploymentEnvironments.map((lane) =>
          lane.id === id ? { ...lane, bounds } : lane,
        ),
      });
      schedulePersist(graph);
      return { graph };
    });
  },

  assignNodesToSwimlanes: (nodeIds) => {
    const idSet = new Set(nodeIds);
    set((state) => {
      const lanes = state.graph.deploymentEnvironments;
      if (lanes.length === 0) return state;
      const graph = touch({
        ...state.graph,
        nodes: state.graph.nodes.map((node) => {
          if (!idSet.has(node.id)) return node;
          const lane = findContainingSwimlane(
            { x: node.position.x + 110, y: node.position.y + 40 },
            lanes,
          );
          if (!lane) {
            return { ...node, deploymentTarget: undefined };
          }
          return { ...node, deploymentTarget: lane.id };
        }),
      });
      schedulePersist(graph);
      return { graph };
    });
  },
}));

export const selectCanUndo = (state: ProjectStore): boolean => state.past.length > 0;
export const selectCanRedo = (state: ProjectStore): boolean => state.future.length > 0;
