"""Models for IDE graph execution / debug inspection."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ExecutionStep(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    node_id: str = Field(alias="nodeId")
    node_name: str = Field(alias="nodeName")
    node_type: str = Field(alias="nodeType")
    status: Literal["ok", "skipped", "error"]
    inputs: dict[str, str] = Field(default_factory=dict)
    outputs: dict[str, str] = Field(default_factory=dict)
    message: str | None = None
    duration_ms: float = Field(alias="durationMs", default=0.0)


class EdgePayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    edge_id: str = Field(alias="edgeId")
    source_node_id: str = Field(alias="sourceNodeId")
    target_node_id: str = Field(alias="targetNodeId")
    value: str
    contract_type: str = Field(alias="contractType")


class ExecutionResult(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    status: Literal["success", "partial", "failed"]
    duration_ms: float = Field(alias="durationMs")
    steps: list[ExecutionStep]
    edge_payloads: list[EdgePayload] = Field(default_factory=list, alias="edgePayloads")
    final_outputs: list[dict[str, Any]] = Field(default_factory=list, alias="finalOutputs")
    validation_issue_count: int = Field(default=0, alias="validationIssueCount")
