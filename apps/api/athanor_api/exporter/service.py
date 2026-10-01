"""Export service: validate graph, render files, return manifest."""

from __future__ import annotations

import base64
import hashlib
import io
import logging
import time
import zipfile
from dataclasses import dataclass
from pathlib import Path

from athanor_api.exporter.ir import ExportIR, build_export_ir
from athanor_api.exporter.render import render_export_files
from athanor_api.exporter.validate_output import GeneratedFileIssue, validate_generated_files
from athanor_api.schemas.graph import ArchitectureGraph, ValidationIssue
from athanor_api.validation import validate_architecture_graph

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ManifestEntry:
    path: str
    bytes: int
    sha256: str


@dataclass(frozen=True)
class ExportResult:
    project_slug: str
    files: dict[str, str]
    manifest: list[ManifestEntry]
    duration_ms: float
    ir: ExportIR
    validation_issues: list[ValidationIssue]
    generation_issues: list[GeneratedFileIssue]
    archive_base64: str


class ExportError(Exception):
    def __init__(
        self,
        message: str,
        *,
        validation_issues: list[ValidationIssue] | None = None,
        generation_issues: list[GeneratedFileIssue] | None = None,
    ) -> None:
        super().__init__(message)
        self.validation_issues = validation_issues or []
        self.generation_issues = generation_issues or []


def _manifest_for(files: dict[str, str]) -> list[ManifestEntry]:
    entries: list[ManifestEntry] = []
    for path in sorted(files):
        encoded = files[path].encode("utf-8")
        entries.append(
            ManifestEntry(
                path=path,
                bytes=len(encoded),
                sha256=hashlib.sha256(encoded).hexdigest(),
            )
        )
    return entries


def build_zip_archive(files: dict[str, str]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(files):
            info = zipfile.ZipInfo(filename=path)
            # Fixed timestamp keeps ZIP bytes deterministic across exports.
            info.date_time = (2026, 7, 24, 0, 0, 0)
            if (path.startswith("scripts/") and path.endswith(".sh")) or path == "bin/cli.mjs":
                info.external_attr = (0o755 & 0xFFFF) << 16
            archive.writestr(info, files[path].encode("utf-8"))
    return buffer.getvalue()


def export_architecture_graph(
    graph: ArchitectureGraph,
    *,
    export_format: str = "code",
    include_docker_compat: bool = False,
    include_kubernetes: bool = False,
    include_openshift: bool = False,
    include_terraform: bool = False,
    project_slug: str | None = None,
    allow_invalid: bool = False,
) -> ExportResult:
    started = time.perf_counter()
    validation_issues = validate_architecture_graph(graph)
    errors = [issue for issue in validation_issues if issue.severity == "error"]
    if errors and not allow_invalid:
        raise ExportError(
            "Cannot export a graph with validation errors",
            validation_issues=validation_issues,
        )

    ir = build_export_ir(
        graph,
        include_docker_compat=include_docker_compat,
        include_kubernetes=include_kubernetes,
        include_openshift=include_openshift,
        include_terraform=include_terraform,
        project_slug=project_slug,
    )
    try:
        files = render_export_files(ir, export_format)
    except ValueError as exc:
        raise ExportError(str(exc), validation_issues=validation_issues) from exc
    generation_issues = validate_generated_files(files)
    if generation_issues:
        raise ExportError(
            "Generated export failed output validation",
            validation_issues=validation_issues,
            generation_issues=generation_issues,
        )

    archive = build_zip_archive(files)
    duration_ms = (time.perf_counter() - started) * 1000
    manifest = _manifest_for(files)
    logger.info(
        "export complete duration_ms=%.2f file_count=%s slug=%s",
        duration_ms,
        len(files),
        ir.project_slug,
    )
    return ExportResult(
        project_slug=ir.project_slug,
        files=files,
        manifest=manifest,
        duration_ms=round(duration_ms, 3),
        ir=ir,
        validation_issues=validation_issues,
        generation_issues=generation_issues,
        archive_base64=base64.b64encode(archive).decode("ascii"),
    )


def write_export_to_directory(result: ExportResult, destination: str) -> None:
    root = Path(destination)
    for path, content in result.files.items():
        target = root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        if (path.startswith("scripts/") and path.endswith(".sh")) or path == "bin/cli.mjs":
            target.chmod(0o755)
