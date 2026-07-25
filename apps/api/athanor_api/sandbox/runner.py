"""Rootless Podman sandbox for executing compiled transforms."""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from athanor_api.compiler.models import SandboxResult
from athanor_api.settings import settings

HARNESS = """\
import json
import pathlib
import importlib.util

work = pathlib.Path("/work")
spec = importlib.util.spec_from_file_location("transform", work / "transform.py")
if spec is None or spec.loader is None:
    raise SystemExit("unable to load transform module")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
payload = json.loads((work / "input.json").read_text(encoding="utf-8"))
result = module.transform(payload["value"])
print(json.dumps({"result": result}))
"""


def run_in_sandbox(
    *,
    source_code: str,
    sample_input: str,
    timeout_seconds: int | None = None,
) -> SandboxResult:
    """Execute generated transform code in an isolated rootless container.

    Generated code is never executed on the application host interpreter.
    """

    if shutil.which("podman") is None:
        return SandboxResult(
            status="skipped",
            reason="podman not available on PATH",
        )

    timeout = timeout_seconds or settings.sandbox_timeout_seconds
    started = time.perf_counter()

    with tempfile.TemporaryDirectory(prefix="athanor-sandbox-") as tmp:
        work = Path(tmp)
        (work / "transform.py").write_text(source_code, encoding="utf-8")
        (work / "harness.py").write_text(HARNESS, encoding="utf-8")
        (work / "input.json").write_text(
            json.dumps({"value": sample_input}, sort_keys=True),
            encoding="utf-8",
        )
        # Ensure the containerized nobody user can read the workspace.
        work.chmod(0o755)
        for path in work.iterdir():
            path.chmod(0o644)

        command = [
            "podman",
            "run",
            "--rm",
            "--network",
            "none",
            "--read-only",
            "--user",
            "65534:65534",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--memory",
            settings.sandbox_memory,
            "--cpus",
            settings.sandbox_cpus,
            "--pids-limit",
            str(settings.sandbox_pids_limit),
            "--timeout",
            str(timeout),
            "-v",
            f"{work}:/work:ro,Z",
            settings.sandbox_image,
            "python",
            "/work/harness.py",
        ]

        try:
            completed = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                timeout=timeout + 5,
            )
        except subprocess.TimeoutExpired as exc:
            return SandboxResult(
                status="failed",
                stdout=(exc.stdout or "") if isinstance(exc.stdout, str) else "",
                stderr="sandbox execution timed out",
                exit_code=None,
                duration_ms=(time.perf_counter() - started) * 1000,
                reason="timeout",
            )

        duration_ms = (time.perf_counter() - started) * 1000
        stderr = completed.stderr or ""
        stdout = completed.stdout or ""

        if completed.returncode != 0:
            infrastructure_markers = (
                "cannot connect to the podman socket",
                "cannot connect to",
                "mkdir /var/lib/containers",
                "executable file not found",
                "no container runtime",
            )
            if completed.returncode in {125, 126, 127} and any(
                marker in stderr.casefold() for marker in infrastructure_markers
            ):
                return SandboxResult(
                    status="skipped",
                    stdout=stdout,
                    stderr=stderr,
                    exit_code=completed.returncode,
                    duration_ms=duration_ms,
                    reason="podman unavailable in this environment",
                )
            # Permission errors on host storage also mean the sandbox cannot run here.
            if "mkdir /var/lib/containers" in stderr.casefold():
                return SandboxResult(
                    status="skipped",
                    stdout=stdout,
                    stderr=stderr,
                    exit_code=completed.returncode,
                    duration_ms=duration_ms,
                    reason="podman unavailable in this environment",
                )
            return SandboxResult(
                status="failed",
                stdout=stdout,
                stderr=stderr,
                exit_code=completed.returncode,
                duration_ms=duration_ms,
                reason="non-zero exit",
            )

        try:
            payload = json.loads((completed.stdout or "").strip().splitlines()[-1])
            if "result" not in payload:
                raise ValueError("missing result")
        except (json.JSONDecodeError, IndexError, ValueError) as exc:
            return SandboxResult(
                status="failed",
                stdout=completed.stdout or "",
                stderr=f"invalid sandbox output: {exc}",
                exit_code=completed.returncode,
                duration_ms=duration_ms,
                reason="invalid_output",
            )

        return SandboxResult(
            status="passed",
            stdout=completed.stdout or "",
            stderr=completed.stderr or "",
            exit_code=0,
            duration_ms=duration_ms,
        )
