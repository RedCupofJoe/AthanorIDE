"""Heuristics for detecting embedded credentials in free-text config fields.

Used by validation (reject) and export (redact) so Big Block custom templates
never ship raw tokens into architecture docs.
"""

from __future__ import annotations

import re

# Assignment-style secret keys commonly pasted into YAML/JSON overrides.
_SECRET_ASSIGNMENT = re.compile(
    r"(?i)\b(api[_-]?key|client[_-]?secret|private[_-]?key|access[_-]?token|"
    r"secret[_-]?value|password|auth[_-]?token)\b\s*[:=]\s*['\"]?[^\s'\"]{8,}",
)

# Authorization headers and common vendor token prefixes.
_BEARER_OR_TOKEN = re.compile(
    r"(?i)(\bBearer\s+[A-Za-z0-9\-_\.]{12,}"
    r"|\bsk-[A-Za-z0-9]{16,}"
    r"|\bghp_[A-Za-z0-9]{20,}"
    r"|\bxox[baprs]-[A-Za-z0-9-]{10,})",
)

# Long high-entropy-looking token blobs (base64/hex-ish).
_LONG_TOKEN = re.compile(r"(?<![A-Za-z0-9_\-/=+])[A-Za-z0-9_\-/=+]{48,}(?![A-Za-z0-9_\-/=+])")

_REDACTED = "[REDACTED]"


def text_contains_embedded_secret(text: str) -> bool:
    """Return True when free text looks like it embeds a credential value."""

    if not text or not text.strip():
        return False
    if _SECRET_ASSIGNMENT.search(text):
        return True
    if _BEARER_OR_TOKEN.search(text):
        return True
    # Avoid flagging short comment templates; only long opaque blobs.
    for match in _LONG_TOKEN.finditer(text):
        candidate = match.group(0)
        # Skip pure lowercase words / paths that happen to be long.
        if candidate.count("/") >= 2:
            continue
        has_digit = any(ch.isdigit() for ch in candidate)
        has_upper = any(ch.isupper() for ch in candidate)
        if has_digit and (has_upper or "-" in candidate or "_" in candidate):
            return True
    return False


def redact_embedded_secrets(text: str) -> str:
    """Replace secret-like spans with a placeholder for safe export."""

    if not text:
        return text
    redacted = _SECRET_ASSIGNMENT.sub(
        lambda m: f"{m.group(1)}: {_REDACTED}",
        text,
    )
    redacted = _BEARER_OR_TOKEN.sub(_REDACTED, redacted)

    def _replace_long(match: re.Match[str]) -> str:
        candidate = match.group(0)
        if candidate.count("/") >= 2:
            return candidate
        has_digit = any(ch.isdigit() for ch in candidate)
        has_upper = any(ch.isupper() for ch in candidate)
        if has_digit and (has_upper or "-" in candidate or "_" in candidate):
            return _REDACTED
        return candidate

    return _LONG_TOKEN.sub(_replace_long, redacted)
