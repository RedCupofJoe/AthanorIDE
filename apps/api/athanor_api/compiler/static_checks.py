"""Static analysis helpers (ruff/mypy) — analysis only, no transform execution."""

from __future__ import annotations

import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class StaticCheckResult:
    ok: bool
    tool: str
    output: str


def run_ruff_check(source: str) -> StaticCheckResult:
    with tempfile.TemporaryDirectory(prefix="athanor-ruff-") as tmp:
        path = Path(tmp) / "transform.py"
        path.write_text(source, encoding="utf-8")
        completed = subprocess.run(
            [sys.executable, "-m", "ruff", "check", "--select", "E,F,B", str(path)],
            check=False,
            capture_output=True,
            text=True,
        )
        output = (completed.stdout or "") + (completed.stderr or "")
        if "No module named ruff" in output:
            return StaticCheckResult(ok=True, tool="ruff", output="ruff not installed; skipped")
        return StaticCheckResult(ok=completed.returncode == 0, tool="ruff", output=output.strip())


def run_mypy_check(source: str) -> StaticCheckResult:
    with tempfile.TemporaryDirectory(prefix="athanor-mypy-") as tmp:
        path = Path(tmp) / "transform.py"
        path.write_text(source, encoding="utf-8")
        completed = subprocess.run(
            [
                sys.executable,
                "-m",
                "mypy",
                "--strict",
                "--ignore-missing-imports",
                str(path),
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        output = (completed.stdout or "") + (completed.stderr or "")
        if "No module named mypy" in output:
            return StaticCheckResult(ok=True, tool="mypy", output="mypy not installed; skipped")
        return StaticCheckResult(ok=completed.returncode == 0, tool="mypy", output=output.strip())
