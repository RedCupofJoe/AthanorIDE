/** React Flow nodeTypes map for architecture, macro, and swimlane nodes. */
import type { NodeTypes } from "@xyflow/react";

import { FoundationNode } from "./FoundationNode";
import { MacroBlockNode } from "./MacroBlockNode";
import { SwimlaneNode } from "./SwimlaneNode";

export const architectureNodeTypes = {
  architecture: FoundationNode,
  macro: MacroBlockNode,
  swimlane: SwimlaneNode,
} satisfies NodeTypes;
