"""In-memory unlocked vault session and on-disk envelope I/O."""

from __future__ import annotations

import json
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from athanor_api.vault.crypto import decrypt_payload, encrypt_payload


@dataclass
class VaultEntry:
    id: str
    name: str
    value: str
    notes: str | None = None
    updated_at: str = ""


@dataclass
class VaultSession:
    entries: dict[str, VaultEntry] = field(default_factory=dict)
    unlocked_at: float = 0.0
    last_active_at: float = 0.0
    passphrase: str = ""

    def touch(self) -> None:
        self.last_active_at = time.monotonic()

    def to_payload(self) -> dict[str, Any]:
        return {
            "schemaVersion": "1.0.0",
            "entries": [
                {
                    "id": entry.id,
                    "name": entry.name,
                    "value": entry.value,
                    "notes": entry.notes,
                    "updatedAt": entry.updated_at,
                }
                for entry in sorted(self.entries.values(), key=lambda item: item.name)
            ],
        }

    @classmethod
    def from_payload(cls, payload: dict[str, Any], passphrase: str) -> VaultSession:
        now = time.monotonic()
        session = cls(unlocked_at=now, last_active_at=now, passphrase=passphrase)
        for raw in payload.get("entries") or []:
            if not isinstance(raw, dict):
                continue
            name = str(raw.get("name") or "").strip()
            if not name:
                continue
            session.entries[name] = VaultEntry(
                id=str(raw.get("id") or f"ve_{uuid.uuid4().hex}"),
                name=name,
                value=str(raw.get("value") or ""),
                notes=str(raw["notes"]) if raw.get("notes") is not None else None,
                updated_at=str(raw.get("updatedAt") or ""),
            )
        return session


class VaultStore:
    """Thread-safe vault file + session holder."""

    def __init__(self, vault_path: Path, idle_ttl_seconds: int) -> None:
        self.vault_path = vault_path
        self.idle_ttl_seconds = idle_ttl_seconds
        self._lock = threading.RLock()
        self._session: VaultSession | None = None

    def exists(self) -> bool:
        return self.vault_path.is_file()

    def _ensure_parent(self) -> None:
        self.vault_path.parent.mkdir(parents=True, exist_ok=True)

    def _read_envelope(self) -> dict[str, Any]:
        raw = json.loads(self.vault_path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raise ValueError("Corrupt vault file")
        return raw

    def _write_envelope(self, envelope: dict[str, Any]) -> None:
        self._ensure_parent()
        tmp = self.vault_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(envelope, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        tmp.replace(self.vault_path)

    def _persist_session(self, session: VaultSession) -> None:
        envelope = encrypt_payload(session.passphrase, session.to_payload())
        self._write_envelope(envelope)

    def _expire_if_idle(self) -> None:
        if self._session is None:
            return
        idle = time.monotonic() - self._session.last_active_at
        if idle > self.idle_ttl_seconds:
            self._session = None

    def status(self) -> dict[str, Any]:
        with self._lock:
            self._expire_if_idle()
            unlocked = self._session is not None
            entry_count = len(self._session.entries) if self._session else 0
            unlocked_until = None
            if self._session is not None:
                unlocked_until = self._session.last_active_at + self.idle_ttl_seconds
            return {
                "exists": self.exists(),
                "unlocked": unlocked,
                "entryCount": entry_count if unlocked else None,
                "unlockedUntil": unlocked_until,
            }

    def init(self, passphrase: str) -> None:
        with self._lock:
            if self.exists():
                raise FileExistsError("Vault already exists")
            if len(passphrase) < 8:
                raise ValueError("Passphrase must be at least 8 characters")
            session = VaultSession(
                unlocked_at=time.monotonic(),
                last_active_at=time.monotonic(),
                passphrase=passphrase,
            )
            self._persist_session(session)
            self._session = session

    def unlock(self, passphrase: str) -> None:
        with self._lock:
            if not self.exists():
                raise FileNotFoundError("Vault does not exist")
            envelope = self._read_envelope()
            try:
                payload = decrypt_payload(passphrase, envelope)
            except Exception as exc:  # noqa: BLE001 — map all crypto failures
                raise PermissionError("Invalid passphrase") from exc
            self._session = VaultSession.from_payload(payload, passphrase)

    def lock(self) -> None:
        with self._lock:
            self._session = None

    def require_session(self) -> VaultSession:
        with self._lock:
            self._expire_if_idle()
            if self._session is None:
                raise PermissionError("Vault is locked")
            self._session.touch()
            return self._session

    def list_entries(self) -> list[dict[str, Any]]:
        session = self.require_session()
        return [
            {
                "id": entry.id,
                "name": entry.name,
                "updatedAt": entry.updated_at,
                "hasValue": bool(entry.value),
            }
            for entry in sorted(session.entries.values(), key=lambda item: item.name)
        ]

    def put_entry(self, name: str, value: str, notes: str | None = None) -> dict[str, Any]:
        clean = name.strip()
        if not clean:
            raise ValueError("Secret name is required")
        if len(clean) > 128:
            raise ValueError("Secret name is too long")
        with self._lock:
            session = self.require_session()
            existing = session.entries.get(clean)
            now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            entry = VaultEntry(
                id=existing.id if existing else f"ve_{uuid.uuid4().hex}",
                name=clean,
                value=value,
                notes=notes,
                updated_at=now,
            )
            session.entries[clean] = entry
            session.touch()
            self._persist_session(session)
            return {
                "id": entry.id,
                "name": entry.name,
                "updatedAt": entry.updated_at,
                "hasValue": bool(entry.value),
            }

    def delete_entry(self, name: str) -> None:
        with self._lock:
            session = self.require_session()
            if name not in session.entries:
                raise KeyError(name)
            del session.entries[name]
            session.touch()
            self._persist_session(session)

    def get_values(self, names: list[str] | None = None) -> dict[str, str]:
        session = self.require_session()
        if names is None:
            return {name: entry.value for name, entry in session.entries.items()}
        result: dict[str, str] = {}
        for name in names:
            entry = session.entries.get(name)
            if entry is not None and entry.value:
                result[name] = entry.value
        return result
