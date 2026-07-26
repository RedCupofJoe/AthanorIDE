"""Athanor local secrets vault (encrypted at rest, names-only in graphs)."""

from athanor_api.vault.service import LocalVaultService, get_vault_service

__all__ = ["LocalVaultService", "get_vault_service"]
