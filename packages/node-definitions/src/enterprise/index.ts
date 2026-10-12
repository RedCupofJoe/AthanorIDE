/** Enterprise lineage nodes: policy guardrail, audit log, identity reference. */
import { portTemplate, type NodeDefinition } from "../types.js";

export const policyGuardrailDefinition: NodeDefinition = {
  type: "enterprise.policy_guardrail",
  displayName: "Policy Guardrail",
  description:
    "Policy Guardrail declares content allow/deny rules on a STRING path—block, redact, or warn. Connect text or prompt payloads through it before agents or egress nodes, and author policyName plus rules in the inspector. It makes safety policy part of the architecture rather than an afterthought in application code.",
  category: "enterprise",
  version: "1.0.0",
  icon: "shield",
  exportKind: "enterprise",
  inputs: [
    portTemplate("text", "input", "STRING"),
    portTemplate("identityContext", "input", "STRING", { required: false }),
  ],
  outputs: [
    portTemplate("text", "output", "STRING"),
    portTemplate("event", "output", "EVENT", { required: false }),
  ],
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
    "Best used on user-facing or regulated flows where PII, medical, or egress controls must be explicit. Enforcement runs in the deployed runtime, not the IDE. Place it immediately before external HTTP or agent calls when you need a clear compliance boundary on the canvas.",
};

export const auditLogDefinition: NodeDefinition = {
  type: "enterprise.audit_log",
  displayName: "Audit Log",
  description:
    "Audit Log is a compliance sink that accepts EVENT inputs and records sink, retention, and payload-inclusion lineage. Connect agent events or other EVENT producers into it to show where decisions are retained. It has no outputs—its purpose is documenting the audit trail in the architecture.",
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
    "Use it whenever regulated workflows need a declared audit destination such as SIEM, file, or stdout sinks with explicit retention. Connect EVENT producers from agents, harnesses, or orchestration nodes to show where decisions are retained in the architecture. The IDE does not write events during Run — export records sink choice, retention days, and payload policy for compliance review. Keep includePayload false unless you have a clear retention, access, and redaction plan for sensitive event content.",
};

export const identityReferenceDefinition: NodeDefinition = {
  type: "enterprise.identity_reference",
  displayName: "Identity Reference",
  description:
    "Identity Reference documents an IdP client with public identifiers only—provider, clientId, and issuer—emitting a STRING identity handle. Place it where authentication context enters the architecture and connect to consumers that need to know which IdP the system trusts. Validation rejects embedded credentials.",
  category: "enterprise",
  version: "1.0.0",
  icon: "fingerprint",
  exportKind: "enterprise",
  inputs: [portTemplate("secret", "input", "STRING", { required: false })],
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
    "Best used in enterprise apps that integrate OIDC/SAML/LDAP and must show identity boundaries on the canvas. Never paste client secrets—use Secret Reference and the local vault for values. Prefer this over encoding IdP details only in deployment YAML so architects can review trust relationships visually.",
};

export const primaryVectorDbsDefinition: NodeDefinition = {
  type: "enterprise.primary_vector_dbs",
  displayName: "Primary DB + Dedicated Vector DB",
  description:
    "Primary DB + Dedicated Vector DB records an enterprise data topology: a transactional primary (PostgreSQL, MySQL, or MariaDB) paired with a dedicated vector store (Qdrant, Weaviate, or Milvus). Configure endpoints and secret names, then use the primary and vector STRING outputs to show how application services depend on each store.",
  category: "enterprise",
  version: "1.0.0",
  icon: "boxes",
  exportKind: "enterprise",
  inputs: [],
  outputs: [
    portTemplate("primary", "output", "STRING"),
    portTemplate("vector", "output", "STRING"),
  ],
  configurationFields: [
    {
      key: "primaryDb",
      label: "Primary database",
      description: "System of record for structured / transactional data.",
      type: "select",
      required: true,
      defaultValue: "postgresql",
      options: ["postgresql", "mysql", "mariadb"],
    },
    {
      key: "vectorDb",
      label: "Dedicated vector database",
      description: "Specialized store for embeddings and similarity search.",
      type: "select",
      required: true,
      defaultValue: "qdrant",
      options: ["qdrant", "weaviate", "milvus"],
    },
    {
      key: "primaryEndpointUri",
      label: "Primary DB endpoint URI",
      description: "Host URI for the primary database (no passwords).",
      type: "string",
      required: false,
      defaultValue: "postgresql://127.0.0.1:5432/app",
    },
    {
      key: "vectorEndpointUri",
      label: "Vector DB endpoint URI",
      description: "Host URI for the vector database (no API keys).",
      type: "string",
      required: false,
      defaultValue: "http://127.0.0.1:6333",
    },
    {
      key: "primarySecretName",
      label: "Primary DB secret name",
      description: "Name of a secret for primary DB credentials (never paste the password).",
      type: "string",
      required: false,
      defaultValue: "",
    },
    {
      key: "vectorSecretName",
      label: "Vector DB secret name",
      description: "Name of a secret for vector DB credentials (never paste the key).",
      type: "string",
      required: false,
      defaultValue: "",
    },
  ],
  documentation:
    "Use this when you deliberately split OLTP from vector search for scale, compliance, or team ownership. Prefer PostgreSQL + pgvector Big Block when a single database should hold both relational data and embeddings. Always reference credentials by secret name; never embed passwords or API keys in the graph.",
};

export const ENTERPRISE_NODE_DEFINITIONS: readonly NodeDefinition[] = [
  policyGuardrailDefinition,
  auditLogDefinition,
  identityReferenceDefinition,
  primaryVectorDbsDefinition,
] as const;
