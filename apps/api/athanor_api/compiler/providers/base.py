"""Model provider abstraction for the NL compiler."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from athanor_api.compiler.models import TransformationSpec


class ModelProvider(ABC):
    """Abstract inference provider (local, Ollama, vLLM, OpenAI-compatible, mock)."""

    name: str

    @abstractmethod
    def generate_spec(
        self,
        *,
        instruction: str,
        input_schema: dict[str, Any],
        output_schema: dict[str, Any],
    ) -> TransformationSpec:
        """Create an intermediate transformation specification."""

    @abstractmethod
    def correct_spec(
        self,
        *,
        instruction: str,
        input_schema: dict[str, Any],
        output_schema: dict[str, Any],
        previous_spec: TransformationSpec,
        previous_code: str,
        error_stage: str,
        error_message: str,
    ) -> TransformationSpec:
        """Produce a corrected specification after a visible validation failure."""
