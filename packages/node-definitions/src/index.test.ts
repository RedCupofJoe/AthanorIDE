import { describe, expect, it } from "vitest";

import {
  createNodeFromDefinition,
  getNodeDefinition,
  listNodeDefinitions,
  listNodeDefinitionsByCategory,
  requiredConfigKeys,
} from "./index.js";

describe("node definitions catalog", () => {
  it("includes foundation through big-blocks categories", () => {
    const types = listNodeDefinitions().map((definition) => definition.type);
    expect(types).toContain("foundation.text_input");
    expect(types).toContain("enterprise.identity_reference");
    expect(types).toContain("big_blocks.ai_gateway");
    expect(types).toContain("big_blocks.agentic_harness");
    expect(types).toContain("big_blocks.video_chunking_ic_lora");
    expect(types).toContain("big_blocks.web_to_markdown");
    expect(types).toContain("big_blocks.postgres_pgvector");
    expect(types).toContain("big_blocks.guardrail_builder");
    expect(types).toContain("enterprise.primary_vector_dbs");
    expect(types).toHaveLength(40);
  });

  it("creates a text input node with STRING output", () => {
    const node = createNodeFromDefinition("foundation.text_input", { x: 10, y: 20 });
    expect(node.type).toBe("foundation.text_input");
    expect(node.position).toEqual({ x: 10, y: 20 });
    expect(node.outputs[0]?.contractType).toBe("STRING");
    expect(node.configuration).toHaveProperty("value");
  });

  it("looks up definitions by type and exposes export metadata", () => {
    expect(getNodeDefinition("foundation.python_transform")?.displayName).toBe(
      "Python Transformation",
    );
    expect(getNodeDefinition("foundation.secret_reference")?.exportKind).toBe(
      "secret_reference",
    );
    expect(requiredConfigKeys(getNodeDefinition("fine_tuning.lora_trainer")!)).toContain(
      "baseModel",
    );
    expect(getNodeDefinition("vision.vision_model")?.exportKind).toBe("vision");
    expect(getNodeDefinition("multi_agent.agent")?.exportKind).toBe("multi_agent");
    expect(getNodeDefinition("enterprise.policy_guardrail")?.exportKind).toBe("enterprise");
    expect(getNodeDefinition("big_blocks.ai_gateway")?.exportKind).toBe("big_blocks");
    expect(requiredConfigKeys(getNodeDefinition("big_blocks.agentic_harness")!)).toContain(
      "harness",
    );
  });

  it("groups fine-tuning nodes by category", () => {
    const fineTuning = listNodeDefinitionsByCategory("fine-tuning");
    expect(fineTuning.map((item) => item.type)).toEqual([
      "fine_tuning.dataset_loader",
      "fine_tuning.lora_trainer",
    ]);
  });

  it("groups vision, multi-agent, and enterprise categories", () => {
    expect(listNodeDefinitionsByCategory("vision").map((item) => item.type)).toEqual([
      "vision.image_input",
      "vision.image_preprocessor",
      "vision.vision_model",
    ]);
    expect(listNodeDefinitionsByCategory("multi-agent").map((item) => item.type)).toEqual([
      "multi_agent.agent",
      "multi_agent.tool_definition",
      "multi_agent.mcp_server",
    ]);
    expect(listNodeDefinitionsByCategory("enterprise").map((item) => item.type)).toEqual([
      "enterprise.policy_guardrail",
      "enterprise.audit_log",
      "enterprise.identity_reference",
      "enterprise.primary_vector_dbs",
    ]);
  });

  it("creates JSON input and LoRA trainer with typed ports", () => {
    const jsonNode = createNodeFromDefinition("foundation.json_input", { x: 0, y: 0 });
    expect(jsonNode.outputs[0]?.contractType).toBe("STRING");
    const lora = createNodeFromDefinition("fine_tuning.lora_trainer", { x: 0, y: 0 });
    expect(lora.inputs[0]?.contractType).toBe("DATASET");
    expect(lora.outputs[0]?.contractType).toBe("MODEL_WEIGHTS");
    expect(lora.configuration.rank).toBe(8);
  });

  it("groups big-blocks with shared cloud + template fields", () => {
    const blocks = listNodeDefinitionsByCategory("big-blocks");
    expect(blocks).toHaveLength(18);
    const gateway = createNodeFromDefinition("big_blocks.ai_gateway", { x: 0, y: 0 });
    expect(gateway.configuration.openSourceStack).toBe("litellm");
    expect(gateway.configuration).toHaveProperty("customTemplate");
    expect(gateway.configuration.useCustomTemplate).toBe(false);
    const harness = createNodeFromDefinition("big_blocks.agentic_harness", { x: 0, y: 0 });
    expect(harness.configuration.harness).toBe("goose");
    const webMd = createNodeFromDefinition("big_blocks.web_to_markdown", { x: 0, y: 0 });
    expect(webMd.configuration.openSourceStack).toBe("markitdown");
    expect(webMd.outputs[0]?.contractType).toBe("STRING");
    const pg = createNodeFromDefinition("big_blocks.postgres_pgvector", { x: 0, y: 0 });
    expect(pg.configuration.openSourceStack).toBe("postgresql-pgvector");
    const guardrail = createNodeFromDefinition("big_blocks.guardrail_builder", {
      x: 0,
      y: 0,
    });
    expect(guardrail.configuration.systemPromptPosture).toBe("standard");
    expect(guardrail.configuration.vectorStore).toBe("chromadb");
    expect(guardrail.outputs[0]?.contractType).toBe("STRING");
    expect(guardrail.outputs[1]?.name).toBe("reasoningDocument");
    const dualDb = createNodeFromDefinition("enterprise.primary_vector_dbs", { x: 0, y: 0 });
    expect(dualDb.configuration.primaryDb).toBe("postgresql");
    expect(dualDb.configuration.vectorDb).toBe("qdrant");
  });

  it("attaches recommended adjacent feeds for every catalog node", () => {
    for (const definition of listNodeDefinitions()) {
      expect(definition.recommendedAdjacent).toBeDefined();
      const adjacent = definition.recommendedAdjacent!;
      for (const type of [...adjacent.feedsIn, ...adjacent.feedsOut]) {
        expect(getNodeDefinition(type)?.displayName).toBeTruthy();
      }
    }
    const text = getNodeDefinition("foundation.text_input");
    expect(text?.recommendedAdjacent?.feedsOut).toContain("foundation.prompt_template");
    expect(text?.recommendedAdjacent?.feedsIn).toEqual([]);
  });
});
