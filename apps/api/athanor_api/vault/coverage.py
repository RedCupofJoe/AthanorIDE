"""Collect secret names referenced by an architecture graph."""

from __future__ import annotations

from athanor_api.schemas.graph import ArchitectureGraph


def collect_graph_secret_names(graph: ArchitectureGraph) -> list[str]:
    names: set[str] = set()

    for slot in graph.infrastructure_tokens:
        name = slot.secret_name.strip()
        if name:
            names.add(name)

    for node in graph.nodes:
        config = node.configuration
        if node.type == "foundation.secret_reference":
            raw = config.get("secretName", "")
            if isinstance(raw, str) and raw.strip():
                names.add(raw.strip())
        for key in ("tokenSecretName", "primarySecretName", "vectorSecretName"):
            raw = config.get(key, "")
            if isinstance(raw, str) and raw.strip():
                names.add(raw.strip())

    return sorted(names)
