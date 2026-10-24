"""Measure local graph-validation time at representative editor graph sizes.

Run with `uv run --project apps/api python scripts/benchmark_graph_validation.py`.
Results are informational because wall-clock thresholds vary by hardware and load.
"""

from __future__ import annotations

import copy
import json
import time
from pathlib import Path
from typing import Any

from athanor_api.schemas.graph import ArchitectureGraph
from athanor_api.validation import validate_architecture_graph

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "packages" / "contracts" / "fixtures" / "text-transform.v2.json"


def graph_with_pipeline_count(template: dict[str, Any], count: int) -> ArchitectureGraph:
    """Repeat the real three-node example with uniquely identified nodes and edges."""

    graph = copy.deepcopy(template)
    graph["project"]["id"] = f"benchmark-{count}"
    graph["project"]["name"] = f"Validation benchmark ({count} pipelines)"
    graph["nodes"] = []
    graph["edges"] = []
    for pipeline_index in range(count):
        suffix = f"-{pipeline_index}"
        for original in template["nodes"]:
            node = copy.deepcopy(original)
            node["id"] += suffix
            node["name"] += f" {pipeline_index}"
            graph["nodes"].append(node)
        for original in template["edges"]:
            edge = copy.deepcopy(original)
            edge["id"] += suffix
            edge["sourceNodeId"] += suffix
            edge["targetNodeId"] += suffix
            graph["edges"].append(edge)
    return ArchitectureGraph.model_validate(graph)


def main() -> None:
    template = json.loads(FIXTURE.read_text(encoding="utf-8"))
    for count in (100, 333, 1000):
        graph = graph_with_pipeline_count(template, count)
        started = time.perf_counter()
        issues = validate_architecture_graph(graph)
        duration_ms = (time.perf_counter() - started) * 1000
        print(
            f"nodes={len(graph.nodes):>5} edges={len(graph.edges):>5} "
            f"issues={len(issues):>4} validation_ms={duration_ms:>9.2f}"
        )


if __name__ == "__main__":
    main()
