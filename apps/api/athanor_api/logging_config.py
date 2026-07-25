"""Structured logging helpers with correlation IDs."""

from __future__ import annotations

import logging
import sys
from contextvars import ContextVar
from typing import Any

correlation_id_var: ContextVar[str | None] = ContextVar("correlation_id", default=None)


class CorrelationFilter(logging.Filter):
    """Inject correlation_id into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.correlation_id = correlation_id_var.get() or "-"
        return True


def configure_logging() -> None:
    """Configure structured-ish stdout logging once."""

    root = logging.getLogger()
    if any(isinstance(f, CorrelationFilter) for h in root.handlers for f in h.filters):
        return

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt=(
                "%(asctime)s level=%(levelname)s correlation_id=%(correlation_id)s "
                "logger=%(name)s message=%(message)s"
            )
        )
    )
    handler.addFilter(CorrelationFilter())

    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)


def bind_correlation_id(correlation_id: str) -> None:
    correlation_id_var.set(correlation_id)


def log_extra(**kwargs: Any) -> dict[str, Any]:
    return kwargs
