# ADR 0011: Local secrets vault

## Status

Accepted

## Context

Architecture graphs must never embed secret values (names only via Secret Reference, infrastructure tokens, and `tokenSecretName`). Locally run exported apps still need real credentials in a `.env` or process environment. Users asked for an in-product vault to store and inject those values for local runs.

## Decision

1. Ship an **Athanor local vault** owned by the API process (not HashiCorp Vault).
2. Persist values in an encrypted file under `$ATHANOR_DATA_DIR/vault/` using Argon2id + ChaCha20-Poly1305, unlocked by a user passphrase for a session TTL.
3. Keep graphs name-only; the browser never stores decrypted values in `localStorage` or undo history.
4. Vault HTTP APIs are loopback-only by default; responses never echo secret values.
5. **Materialize** writes a local `.env` for compose / `run-local.sh`; export ZIPs still forbid `.env`.
6. IDE **Run** continues to redact Secret Reference outputs (ADR 0007).

## Consequences

- Toolbar **Local vault** manages init/unlock/entries/coverage/materialize.
- `provider: "vault"` on secret slots means the Athanor local vault for local-first workflows.
- Lost passphrase requires destroying and recreating the vault (no recovery of values).
