"""Bounded NL compile pipeline with visible correction audit trail."""

from __future__ import annotations

import json
import logging
from typing import Any

from athanor_api.compiler.ast_security import validate_transform_ast
from athanor_api.compiler.generate import generate_python_source, generate_test_source
from athanor_api.compiler.models import (
    AuditRecord,
    CompileArtifacts,
    CorrectionAttempt,
    SandboxResult,
    TransformationSpec,
)
from athanor_api.compiler.providers import ModelProvider, get_default_provider
from athanor_api.compiler.static_checks import run_mypy_check, run_ruff_check
from athanor_api.sandbox import run_in_sandbox
from athanor_api.settings import settings

logger = logging.getLogger(__name__)


def _expected_output(spec: TransformationSpec, sample: str) -> str:
    expected = sample
    for op in spec.operations:
        if op.op == "uppercase":
            expected = expected.upper()
        elif op.op == "lowercase":
            expected = expected.lower()
        elif op.op == "strip":
            expected = expected.strip()
        elif op.op == "reverse":
            expected = expected[::-1]
        elif op.op == "prefix":
            expected = (op.value or "") + expected
        elif op.op == "suffix":
            expected = expected + (op.value or "")
        elif op.op == "replace":
            expected = expected.replace(op.old or "", op.new or "")
    return expected


def compile_transformation(
    *,
    instruction: str,
    input_schema: dict[str, Any] | None = None,
    output_schema: dict[str, Any] | None = None,
    sample_input: str = "Hello World",
    provenance: list[str] | None = None,
    provider: ModelProvider | None = None,
    max_attempts: int | None = None,
    require_sandbox: bool = False,
) -> CompileArtifacts:
    """Compile NL instruction into validated Python without host execution."""

    active_provider = provider or get_default_provider()
    attempts_limit = max(1, max_attempts or settings.compiler_max_attempts)
    input_schema = input_schema or {"type": "string"}
    output_schema = output_schema or {"type": "string"}

    audit = AuditRecord(
        provider=active_provider.name,
        max_attempts=attempts_limit,
        attempts=[],
        final_status="failed",
        warnings=[],
    )

    spec = active_provider.generate_spec(
        instruction=instruction,
        input_schema=input_schema,
        output_schema=output_schema,
    )
    audit.attempts.append(
        CorrectionAttempt(
            attempt=1,
            stage="provider",
            success=True,
            message="Initial transformation specification generated",
            changed=True,
            details={"operations": [op.model_dump() for op in spec.operations]},
        )
    )

    source = ""
    test_code = ""
    ruff_output = ""
    mypy_output = ""
    sandbox = SandboxResult(status="skipped", reason="not run yet")

    for attempt in range(1, attempts_limit + 1):
        source = generate_python_source(spec, provenance=provenance)
        test_code = generate_test_source(spec, sample_input=sample_input)

        violations = validate_transform_ast(source)
        if violations:
            message = "; ".join(item.message for item in violations)
            audit.attempts.append(
                CorrectionAttempt(
                    attempt=attempt,
                    stage="ast",
                    success=False,
                    message=message,
                    details={
                        "violations": [
                            {
                                "code": item.code,
                                "message": item.message,
                                "lineno": item.lineno,
                            }
                            for item in violations
                        ]
                    },
                )
            )
            if attempt >= attempts_limit:
                break
            spec = active_provider.correct_spec(
                instruction=instruction,
                input_schema=input_schema,
                output_schema=output_schema,
                previous_spec=spec,
                previous_code=source,
                error_stage="ast",
                error_message=message,
            )
            audit.attempts.append(
                CorrectionAttempt(
                    attempt=attempt + 1,
                    stage="provider",
                    success=True,
                    message="Provider produced a corrected specification after AST failure",
                    changed=True,
                )
            )
            continue

        audit.attempts.append(
            CorrectionAttempt(
                attempt=attempt,
                stage="ast",
                success=True,
                message="AST allowlist checks passed",
            )
        )

        ruff = run_ruff_check(source)
        ruff_output = ruff.output
        if not ruff.ok:
            audit.attempts.append(
                CorrectionAttempt(
                    attempt=attempt,
                    stage="ruff",
                    success=False,
                    message=ruff.output or "ruff failed",
                )
            )
            if attempt >= attempts_limit:
                break
            spec = active_provider.correct_spec(
                instruction=instruction,
                input_schema=input_schema,
                output_schema=output_schema,
                previous_spec=spec,
                previous_code=source,
                error_stage="ruff",
                error_message=ruff.output,
            )
            continue
        audit.attempts.append(
            CorrectionAttempt(attempt=attempt, stage="ruff", success=True, message="ruff passed")
        )

        mypy = run_mypy_check(source)
        mypy_output = mypy.output
        if not mypy.ok:
            audit.attempts.append(
                CorrectionAttempt(
                    attempt=attempt,
                    stage="mypy",
                    success=False,
                    message=mypy.output or "mypy failed",
                )
            )
            if attempt >= attempts_limit:
                break
            spec = active_provider.correct_spec(
                instruction=instruction,
                input_schema=input_schema,
                output_schema=output_schema,
                previous_spec=spec,
                previous_code=source,
                error_stage="mypy",
                error_message=mypy.output,
            )
            continue
        audit.attempts.append(
            CorrectionAttempt(attempt=attempt, stage="mypy", success=True, message="mypy passed")
        )

        sandbox = run_in_sandbox(source_code=source, sample_input=sample_input)
        if sandbox.status == "skipped":
            audit.warnings.append(sandbox.reason or "sandbox skipped")
            if require_sandbox:
                audit.attempts.append(
                    CorrectionAttempt(
                        attempt=attempt,
                        stage="sandbox",
                        success=False,
                        message=sandbox.reason or "sandbox required but skipped",
                    )
                )
                break
            audit.attempts.append(
                CorrectionAttempt(
                    attempt=attempt,
                    stage="sandbox",
                    success=True,
                    message=f"sandbox skipped: {sandbox.reason}",
                )
            )
            audit.final_status = "success"
            break

        if sandbox.status != "passed":
            audit.attempts.append(
                CorrectionAttempt(
                    attempt=attempt,
                    stage="sandbox",
                    success=False,
                    message=sandbox.stderr or sandbox.reason or "sandbox failed",
                    details={"exit_code": sandbox.exit_code},
                )
            )
            if attempt >= attempts_limit:
                break
            spec = active_provider.correct_spec(
                instruction=instruction,
                input_schema=input_schema,
                output_schema=output_schema,
                previous_spec=spec,
                previous_code=source,
                error_stage="sandbox",
                error_message=sandbox.stderr or "sandbox failed",
            )
            continue

        try:
            payload = json.loads(sandbox.stdout.strip().splitlines()[-1])
            actual = payload["result"]
            expected = _expected_output(spec, sample_input)
            if actual != expected:
                audit.attempts.append(
                    CorrectionAttempt(
                        attempt=attempt,
                        stage="tests",
                        success=False,
                        message=f"sandbox result {actual!r} != expected {expected!r}",
                    )
                )
                if attempt >= attempts_limit:
                    break
                spec = active_provider.correct_spec(
                    instruction=instruction,
                    input_schema=input_schema,
                    output_schema=output_schema,
                    previous_spec=spec,
                    previous_code=source,
                    error_stage="tests",
                    error_message="sandbox output mismatch",
                )
                continue
        except Exception as exc:  # noqa: BLE001 - fail closed with audit
            audit.attempts.append(
                CorrectionAttempt(
                    attempt=attempt,
                    stage="tests",
                    success=False,
                    message=f"unable to parse sandbox output: {exc}",
                )
            )
            break

        audit.attempts.append(
            CorrectionAttempt(
                attempt=attempt,
                stage="sandbox",
                success=True,
                message="sandbox execution passed",
            )
        )
        audit.attempts.append(
            CorrectionAttempt(
                attempt=attempt,
                stage="tests",
                success=True,
                message="generated expectation matched sandbox output",
            )
        )
        audit.final_status = "success"
        break

    logger.info(
        "compile finished provider=%s status=%s attempts=%s",
        active_provider.name,
        audit.final_status,
        len(audit.attempts),
    )

    return CompileArtifacts(
        spec=spec,
        source_code=source,
        test_code=test_code,
        audit=audit,
        sandbox=sandbox,
        ruff_output=ruff_output,
        mypy_output=mypy_output,
    )


def validate_compiled_source(
    source: str,
    *,
    sample_input: str = "Hello World",
) -> CompileArtifacts:
    """Validate existing source through AST + static checks + sandbox."""

    audit = AuditRecord(
        provider="none",
        max_attempts=1,
        attempts=[],
        final_status="failed",
        warnings=[],
    )
    violations = validate_transform_ast(source)
    if violations:
        message = "; ".join(item.message for item in violations)
        audit.attempts.append(
            CorrectionAttempt(attempt=1, stage="ast", success=False, message=message)
        )
        return CompileArtifacts(
            spec=TransformationSpec(operations=[]),
            source_code=source,
            test_code="",
            audit=audit,
            sandbox=SandboxResult(status="skipped", reason="ast failed"),
        )

    audit.attempts.append(
        CorrectionAttempt(attempt=1, stage="ast", success=True, message="AST allowlist passed")
    )
    ruff = run_ruff_check(source)
    audit.attempts.append(
        CorrectionAttempt(
            attempt=1,
            stage="ruff",
            success=ruff.ok,
            message=ruff.output or ("ruff passed" if ruff.ok else "ruff failed"),
        )
    )
    mypy = run_mypy_check(source)
    audit.attempts.append(
        CorrectionAttempt(
            attempt=1,
            stage="mypy",
            success=mypy.ok,
            message=mypy.output or ("mypy passed" if mypy.ok else "mypy failed"),
        )
    )
    sandbox = run_in_sandbox(source_code=source, sample_input=sample_input)
    audit.attempts.append(
        CorrectionAttempt(
            attempt=1,
            stage="sandbox",
            success=sandbox.status in {"passed", "skipped"},
            message=sandbox.reason or sandbox.stderr or sandbox.status,
        )
    )
    if ruff.ok and mypy.ok and sandbox.status in {"passed", "skipped"}:
        audit.final_status = "success"
        if sandbox.status == "skipped":
            audit.warnings.append(sandbox.reason or "sandbox skipped")

    return CompileArtifacts(
        spec=TransformationSpec(operations=[]),
        source_code=source,
        test_code="",
        audit=audit,
        sandbox=sandbox,
        ruff_output=ruff.output,
        mypy_output=mypy.output,
    )
