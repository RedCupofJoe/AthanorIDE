/** Enterprise lineage nodes: policy guardrail, audit log, identity reference. */
import { portTemplate, type NodeDefinition } from "../types.js";

export const policyGuardrailDefinition: NodeDefinition = {
  type: "enterprise.policy_guardrail",
  displayName: "Policy Guardrail",
  description: "Applies allow/deny policy rules to prompt or text payloads.",
  category: "enterprise",
  version: "1.0.0",
  icon: "shield",
  exportKind: "enterprise",
  inputs: [portTemplate("text", "input", "STRING")],
  outputs: [portTemplate("text", "output", "STRING")],
  configurationFields: [
    {
      key: "policyName",
      label: "Policy name",
      description: "Stable policy identifier.",
      type: "string",
      required: true,
      defaultValue: "default-content-policy",
    },
    {
      key: "mode",
      label: "Mode",
      description: "How violations are handled.",
      type: "select",
      required: true,
      defaultValue: "block",
      options: ["block", "redact", "warn"],
    },
    {
      key: "rules",
      label: "Rules",
      description: "Human-readable or structured policy rules.",
      type: "text",
      required: true,
      defaultValue: "- Block PII exfiltration\n- Warn on medical advice",
    },
  ],
  documentation:
    "Policy Guardrail captures enterprise content policy lineage. Enforcement runs in the deployed runtime, not the IDE.",
};

export const auditLogDefinition: NodeDefinition = {
  type: "enterprise.audit_log",
  displayName: "Audit Log",
  description: "Records decision or event lineage for compliance review.",
  category: "enterprise",
  version: "1.0.0",
  icon: "scroll-text",
  exportKind: "enterprise",
  inputs: [portTemplate("event", "input", "EVENT")],
  outputs: [],
  configurationFields: [
    {
      key: "sink",
      label: "Sink",
      description: "Where audit events are written.",
      type: "select",
      required: true,
      defaultValue: "stdout",
      options: ["stdout", "file", "siem"],
    },
    {
      key: "retentionDays",
      label: "Retention days",
      description: "How long events should be retained.",
      type: "number",
      required: true,
      defaultValue: 90,
    },
    {
      key: "includePayload",
      label: "Include payload",
      description: "Whether event payloads are retained (may contain sensitive data).",
      type: "boolean",
      required: true,
      defaultValue: false,
    },
  ],
  documentation:
    "Audit Log is a lineage sink for compliance. It does not write audit events during IDE execution.",
};

export const identityReferenceDefinition: NodeDefinition = {
  type: "enterprise.identity_reference",
  displayName: "Identity Reference",
  description: "References an identity provider client without embedding credentials.",
  category: "enterprise",
  version: "1.0.0",
  icon: "fingerprint",
  exportKind: "enterprise",
  inputs: [],
  outputs: [portTemplate("identity", "output", "STRING")],
  configurationFields: [
    {
      key: "provider",
      label: "Provider",
      description: "Identity provider kind.",
      type: "select",
      required: true,
      defaultValue: "oidc",
      options: ["oidc", "saml", "ldap", "api-key"],
    },
    {
      key: "clientId",
      label: "Client id",
      description: "Public client or application identifier.",
      type: "string",
      required: true,
      defaultValue: "athanor-app",
    },
    {
      key: "issuer",
      label: "Issuer",
      description: "IdP issuer URL or realm.",
      type: "string",
      required: true,
      defaultValue: "https://idp.example.com/realms/app",
    },
  ],
  documentation:
    "Identity Reference stores only public identifiers. Never embed client secrets or passwords in the graph.",
};

export const ENTERPRISE_NODE_DEFINITIONS: readonly NodeDefinition[] = [
  policyGuardrailDefinition,
  auditLogDefinition,
  identityReferenceDefinition,
] as const;
