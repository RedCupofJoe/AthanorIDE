"""Encrypt/decrypt vault payloads with Argon2id + ChaCha20-Poly1305."""

from __future__ import annotations

import base64
import json
import os
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import ChaCha20Poly1305
from cryptography.hazmat.primitives.kdf.argon2 import Argon2id

SCHEMA_VERSION = "1.0.0"
# Reasonable interactive params for a local workstation vault.
_ARGON2_MEMORY_KIB = 64 * 1024
_ARGON2_ITERATIONS = 3
_ARGON2_PARALLELISM = 2
_KEY_LEN = 32
_SALT_LEN = 16
_NONCE_LEN = 12


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _unb64(data: str) -> bytes:
    return base64.b64decode(data.encode("ascii"))


def derive_key(passphrase: str, salt: bytes) -> bytes:
    kdf = Argon2id(
        salt=salt,
        length=_KEY_LEN,
        iterations=_ARGON2_ITERATIONS,
        lanes=_ARGON2_PARALLELISM,
        memory_cost=_ARGON2_MEMORY_KIB,
    )
    return kdf.derive(passphrase.encode("utf-8"))


def encrypt_payload(passphrase: str, payload: dict[str, Any]) -> dict[str, Any]:
    salt = os.urandom(_SALT_LEN)
    key = derive_key(passphrase, salt)
    nonce = os.urandom(_NONCE_LEN)
    plaintext = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ciphertext = ChaCha20Poly1305(key).encrypt(nonce, plaintext, None)
    return {
        "schemaVersion": SCHEMA_VERSION,
        "kdf": "argon2id",
        "kdfParams": {
            "m": _ARGON2_MEMORY_KIB,
            "t": _ARGON2_ITERATIONS,
            "p": _ARGON2_PARALLELISM,
            "salt": _b64(salt),
        },
        "cipher": "chacha20poly1305",
        "nonce": _b64(nonce),
        "ciphertext": _b64(ciphertext),
    }


def decrypt_payload(passphrase: str, envelope: dict[str, Any]) -> dict[str, Any]:
    if envelope.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError("Unsupported vault envelope schema")
    params = envelope.get("kdfParams") or {}
    salt = _unb64(str(params["salt"]))
    memory = int(params.get("m", _ARGON2_MEMORY_KIB))
    iterations = int(params.get("t", _ARGON2_ITERATIONS))
    parallelism = int(params.get("p", _ARGON2_PARALLELISM))
    kdf = Argon2id(
        salt=salt,
        length=_KEY_LEN,
        iterations=iterations,
        lanes=parallelism,
        memory_cost=memory,
    )
    key = kdf.derive(passphrase.encode("utf-8"))
    nonce = _unb64(str(envelope["nonce"]))
    ciphertext = _unb64(str(envelope["ciphertext"]))
    plaintext = ChaCha20Poly1305(key).decrypt(nonce, ciphertext, None)
    decoded: dict[str, Any] = json.loads(plaintext.decode("utf-8"))
    return decoded
