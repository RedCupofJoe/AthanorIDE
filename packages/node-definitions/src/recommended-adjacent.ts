/**
 * Curated recommended adjacent nodes for the inspector.
 * feedsIn = typical upstream sources; feedsOut = typical downstream consumers.
 */
export interface RecommendedAdjacent {
  readonly feedsIn: readonly string[];
  readonly feedsOut: readonly string[];
}

/** Explicit recommendations keyed by node type. */
export const RECOMMENDED_ADJACENT: Readonly<Record<string, RecommendedAdjacent>> = {
  "foundation.text_input": {
    feedsIn: [],
    feedsOut: [
      "foundation.prompt_template",
      "foundation.python_transform",
      "foundation.http_request",
      "foundation.output_viewer",
      "enterprise.policy_guardrail",
    ],
  },
  "foundation.json_input": {
    feedsIn: [],
    feedsOut: [
      "foundation.python_transform",
      "foundation.http_request",
      "multi_agent.tool_definition",
      "foundation.output_viewer",
    ],
  },
  "foundation.prompt_template": {
    feedsIn: ["foundation.text_input", "foundation.python_transform", "foundation.portal_input"],
    feedsOut: [
      "multi_agent.agent",
      "big_blocks.agentic_harness",
      "big_blocks.ai_gateway",
      "vision.vision_model",
    ],
  },
  "foundation.python_transform": {
    feedsIn: [
      "foundation.text_input",
      "foundation.json_input",
      "foundation.http_request",
      "big_blocks.web_to_markdown",
    ],
    feedsOut: [
      "foundation.prompt_template",
      "foundation.output_viewer",
      "enterprise.policy_guardrail",
      "foundation.http_request",
    ],
  },
  "foundation.http_request": {
    feedsIn: ["foundation.text_input", "foundation.json_input", "foundation.python_transform"],
    feedsOut: [
      "foundation.python_transform",
      "foundation.output_viewer",
      "enterprise.policy_guardrail",
    ],
  },
  "foundation.output_viewer": {
    feedsIn: [
      "foundation.python_transform",
      "foundation.http_request",
      "foundation.text_input",
      "big_blocks.autorag",
      "enterprise.policy_guardrail",
    ],
    feedsOut: [],
  },
  "foundation.portal_input": {
    feedsIn: [],
    feedsOut: [
      "foundation.python_transform",
      "foundation.prompt_template",
      "multi_agent.agent",
      "foundation.output_viewer",
    ],
  },
  "foundation.portal_output": {
    feedsIn: [
      "foundation.python_transform",
      "multi_agent.agent",
      "foundation.http_request",
      "enterprise.policy_guardrail",
    ],
    feedsOut: [],
  },
  "foundation.environment_variable": {
    feedsIn: [],
    feedsOut: [
      "foundation.http_request",
      "fine_tuning.dataset_loader",
      "big_blocks.model_runtime",
    ],
  },
  "foundation.secret_reference": {
    feedsIn: [],
    feedsOut: [
      "foundation.http_request",
      "big_blocks.ai_gateway",
      "big_blocks.model_runtime",
      "enterprise.identity_reference",
    ],
  },
  "fine_tuning.dataset_loader": {
    feedsIn: [
      "big_blocks.web_to_markdown",
      "big_blocks.video_chunking_ic_lora",
      "big_blocks.local_s3_bucket",
    ],
    feedsOut: ["fine_tuning.lora_trainer", "big_blocks.autorag", "big_blocks.graphrag"],
  },
  "fine_tuning.lora_trainer": {
    feedsIn: ["fine_tuning.dataset_loader", "big_blocks.video_chunking_ic_lora"],
    feedsOut: ["big_blocks.model_runtime", "big_blocks.local_s3_bucket"],
  },
  "vision.image_input": {
    feedsIn: [],
    feedsOut: [
      "vision.image_preprocessor",
      "vision.vision_model",
      "big_blocks.image_classifier",
      "big_blocks.multimodal_rag",
    ],
  },
  "vision.image_preprocessor": {
    feedsIn: ["vision.image_input"],
    feedsOut: ["vision.vision_model", "big_blocks.image_classifier"],
  },
  "vision.vision_model": {
    feedsIn: [
      "vision.image_preprocessor",
      "vision.image_input",
      "foundation.prompt_template",
    ],
    feedsOut: ["foundation.output_viewer", "multi_agent.agent", "foundation.python_transform"],
  },
  "multi_agent.agent": {
    feedsIn: [
      "foundation.prompt_template",
      "multi_agent.tool_definition",
      "multi_agent.mcp_server",
      "enterprise.policy_guardrail",
    ],
    feedsOut: [
      "enterprise.audit_log",
      "foundation.output_viewer",
      "big_blocks.simple_ui_chatbot",
    ],
  },
  "multi_agent.tool_definition": {
    feedsIn: ["foundation.json_input"],
    feedsOut: ["multi_agent.agent", "big_blocks.agentic_harness"],
  },
  "multi_agent.mcp_server": {
    feedsIn: [],
    feedsOut: ["multi_agent.agent", "big_blocks.agentic_harness"],
  },
  "enterprise.policy_guardrail": {
    feedsIn: [
      "foundation.text_input",
      "foundation.python_transform",
      "big_blocks.guardrail_builder",
      "foundation.prompt_template",
    ],
    feedsOut: [
      "multi_agent.agent",
      "foundation.http_request",
      "foundation.output_viewer",
      "enterprise.audit_log",
    ],
  },
  "enterprise.audit_log": {
    feedsIn: [
      "multi_agent.agent",
      "enterprise.policy_guardrail",
      "big_blocks.agentic_harness",
    ],
    feedsOut: [],
  },
  "enterprise.identity_reference": {
    feedsIn: ["foundation.secret_reference"],
    feedsOut: [
      "foundation.http_request",
      "big_blocks.simple_ui_chatbot",
      "enterprise.policy_guardrail",
    ],
  },
  "enterprise.primary_vector_dbs": {
    feedsIn: [],
    feedsOut: [
      "big_blocks.autorag",
      "big_blocks.graphrag",
      "big_blocks.multimodal_rag",
      "multi_agent.agent",
    ],
  },
  "big_blocks.ai_gateway": {
    feedsIn: ["foundation.prompt_template", "foundation.secret_reference"],
    feedsOut: [
      "big_blocks.simple_ui_chatbot",
      "big_blocks.agentic_harness",
      "big_blocks.model_runtime",
    ],
  },
  "big_blocks.graphrag": {
    feedsIn: [
      "fine_tuning.dataset_loader",
      "big_blocks.web_to_markdown",
      "foundation.text_input",
    ],
    feedsOut: [
      "foundation.output_viewer",
      "big_blocks.simple_ui_chatbot",
      "multi_agent.agent",
    ],
  },
  "big_blocks.autorag": {
    feedsIn: [
      "fine_tuning.dataset_loader",
      "big_blocks.web_to_markdown",
      "big_blocks.postgres_pgvector",
      "foundation.text_input",
    ],
    feedsOut: [
      "foundation.output_viewer",
      "big_blocks.simple_ui_chatbot",
      "multi_agent.agent",
    ],
  },
  "big_blocks.local_s3_bucket": {
    feedsIn: ["fine_tuning.lora_trainer", "big_blocks.video_chunking_ic_lora"],
    feedsOut: ["fine_tuning.dataset_loader", "big_blocks.autorag"],
  },
  "big_blocks.simple_ui_chatbot": {
    feedsIn: [
      "big_blocks.model_runtime",
      "big_blocks.ai_gateway",
      "foundation.prompt_template",
      "multi_agent.agent",
    ],
    feedsOut: ["big_blocks.agentic_harness"],
  },
  "big_blocks.simple_ui_multimodal": {
    feedsIn: ["big_blocks.model_runtime", "big_blocks.ai_gateway"],
    feedsOut: [
      "big_blocks.multimodal_rag",
      "big_blocks.image_classifier",
      "big_blocks.voice_to_text",
      "multi_agent.agent",
    ],
  },
  "big_blocks.model_runtime": {
    feedsIn: ["fine_tuning.lora_trainer", "foundation.secret_reference"],
    feedsOut: [
      "big_blocks.simple_ui_chatbot",
      "big_blocks.ai_gateway",
      "big_blocks.agentic_harness",
      "big_blocks.guardrail_builder",
    ],
  },
  "big_blocks.image_classifier": {
    feedsIn: ["vision.image_input", "big_blocks.simple_ui_multimodal"],
    feedsOut: ["foundation.output_viewer", "multi_agent.agent", "foundation.python_transform"],
  },
  "big_blocks.voice_to_text": {
    feedsIn: ["big_blocks.simple_ui_multimodal"],
    feedsOut: [
      "big_blocks.audio_to_rag",
      "foundation.prompt_template",
      "foundation.output_viewer",
    ],
  },
  "big_blocks.sound_classifier": {
    feedsIn: ["big_blocks.simple_ui_multimodal"],
    feedsOut: ["foundation.output_viewer", "multi_agent.agent"],
  },
  "big_blocks.agentic_harness": {
    feedsIn: [
      "foundation.prompt_template",
      "multi_agent.tool_definition",
      "multi_agent.mcp_server",
      "big_blocks.model_runtime",
      "enterprise.policy_guardrail",
    ],
    feedsOut: [
      "enterprise.audit_log",
      "foundation.output_viewer",
      "big_blocks.simple_ui_chatbot",
    ],
  },
  "big_blocks.video_to_rag": {
    feedsIn: ["foundation.text_input"],
    feedsOut: [
      "foundation.output_viewer",
      "big_blocks.simple_ui_chatbot",
      "multi_agent.agent",
    ],
  },
  "big_blocks.audio_to_rag": {
    feedsIn: ["big_blocks.voice_to_text", "foundation.text_input"],
    feedsOut: [
      "foundation.output_viewer",
      "big_blocks.simple_ui_chatbot",
      "multi_agent.agent",
    ],
  },
  "big_blocks.multimodal_rag": {
    feedsIn: [
      "foundation.text_input",
      "vision.image_input",
      "big_blocks.simple_ui_multimodal",
      "big_blocks.postgres_pgvector",
    ],
    feedsOut: [
      "foundation.output_viewer",
      "big_blocks.simple_ui_chatbot",
      "multi_agent.agent",
    ],
  },
  "big_blocks.video_chunking_ic_lora": {
    feedsIn: [],
    feedsOut: [
      "fine_tuning.lora_trainer",
      "fine_tuning.dataset_loader",
      "big_blocks.local_s3_bucket",
    ],
  },
  "big_blocks.web_to_markdown": {
    feedsIn: ["foundation.text_input"],
    feedsOut: [
      "big_blocks.autorag",
      "big_blocks.graphrag",
      "fine_tuning.dataset_loader",
      "foundation.python_transform",
      "big_blocks.guardrail_builder",
    ],
  },
  "big_blocks.postgres_pgvector": {
    feedsIn: [
      "big_blocks.web_to_markdown",
      "foundation.text_input",
      "fine_tuning.dataset_loader",
    ],
    feedsOut: [
      "big_blocks.autorag",
      "big_blocks.multimodal_rag",
      "multi_agent.agent",
    ],
  },
  "big_blocks.guardrail_builder": {
    feedsIn: [
      "big_blocks.web_to_markdown",
      "foundation.text_input",
      "big_blocks.model_runtime",
      "foundation.secret_reference",
    ],
    feedsOut: [
      "enterprise.policy_guardrail",
      "big_blocks.agentic_harness",
      "multi_agent.agent",
      "foundation.output_viewer",
    ],
  },
};

export function getRecommendedAdjacent(type: string): RecommendedAdjacent {
  return RECOMMENDED_ADJACENT[type] ?? { feedsIn: [], feedsOut: [] };
}
