import { ArchitectureNodeSchema, newId, type ArchitectureNode } from "@athanor/contracts";
import { getNodeDefinition } from "@athanor/node-definitions";
import { z } from "zod";

export const BLOCK_TEMPLATE_KEY = "athanor.block-templates.v1";
const TemplateSchema = z.object({
  id: z.string().min(1), name: z.string().min(1).max(120),
  node: ArchitectureNodeSchema,
});
const LibrarySchema = z.object({ version: z.literal(1), templates: z.array(TemplateSchema).max(200) });
export type BlockTemplate = z.infer<typeof TemplateSchema>;

export function parseBlockTemplates(raw: string): BlockTemplate[] {
  if (raw.length > 2_000_000) throw new Error("Template file exceeds 2 MB.");
  const { templates } = LibrarySchema.parse(JSON.parse(raw));
  if (new Set(templates.map(t => t.id)).size !== templates.length) throw new Error("Duplicate template IDs.");
  for (const template of templates) {
    const definition = getNodeDefinition(template.node.type);
    if (!definition) throw new Error(`Unknown block type: ${template.node.type}`);
  }
  return templates;
}

export function createBlockTemplate(node: ArchitectureNode, name = node.name): BlockTemplate {
  const copy = structuredClone(node);
  delete copy.parentMacroId;
  delete copy.deploymentTarget;
  const provenance = node.metadata?.importedFrom;
  copy.metadata = typeof provenance === "string" ? {
    importedFrom: provenance,
    serverVersion: typeof node.metadata?.serverVersion === "string" ? node.metadata.serverVersion : "",
  } : undefined;
  copy.position = { x: 0, y: 0 };
  return { id: newId(), name: name.trim() || node.name, node: copy };
}

export function materializeBlockTemplate(template: BlockTemplate, position: { x: number; y: number }): ArchitectureNode {
  return {
    ...structuredClone(template.node), id: newId(), name: template.name, position,
    parentMacroId: undefined, deploymentTarget: undefined,
    metadata: { ...template.node.metadata, templateId: template.id, templateName: template.name },
  };
}

export function serializeBlockTemplates(templates: BlockTemplate[]): string {
  return JSON.stringify({ version: 1, templates }, null, 2);
}
