"""Local secrets vault HTTP routes."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated
from urllib.parse import unquote

from fastapi import APIRouter, Depends, HTTPException, Request

from athanor_api.schemas.api import (
    VaultCoverageRequest,
    VaultCoverageResponse,
    VaultEntriesResponse,
    VaultEntryMeta,
    VaultMaterializeRequest,
    VaultMaterializeResponse,
    VaultPassphraseRequest,
    VaultPutEntryRequest,
    VaultStatusResponse,
)
from athanor_api.settings import settings
from athanor_api.vault import LocalVaultService, get_vault_service

router = APIRouter(prefix="/api/v1/vault", tags=["vault"])


def require_loopback(request: Request) -> None:
    if settings.vault_allow_remote:
        return
    client = request.client
    host = (client.host if client else "") or ""
    if host not in {"127.0.0.1", "::1", "localhost", "testclient"}:
        raise HTTPException(
            status_code=403,
            detail="Local vault is only available from loopback hosts",
        )


def vault_dep() -> LocalVaultService:
    return get_vault_service()


Loopback = Annotated[None, Depends(require_loopback)]
Vault = Annotated[LocalVaultService, Depends(vault_dep)]


def _status_response(status: dict[str, object]) -> VaultStatusResponse:
    return VaultStatusResponse(
        exists=bool(status["exists"]),
        unlocked=bool(status["unlocked"]),
        entryCount=status.get("entryCount"),  # type: ignore[arg-type]
        unlockedUntil=status.get("unlockedUntil"),  # type: ignore[arg-type]
    )


@router.get("/status", response_model=VaultStatusResponse)
async def vault_status(_: Loopback, vault: Vault) -> VaultStatusResponse:
    return _status_response(vault.status())


@router.post("/init", response_model=VaultStatusResponse)
async def vault_init(
    body: VaultPassphraseRequest,
    _: Loopback,
    vault: Vault,
) -> VaultStatusResponse:
    try:
        status = vault.init(body.passphrase)
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _status_response(status)


@router.post("/unlock", response_model=VaultStatusResponse)
async def vault_unlock(
    body: VaultPassphraseRequest,
    _: Loopback,
    vault: Vault,
) -> VaultStatusResponse:
    try:
        status = vault.unlock(body.passphrase)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    return _status_response(status)


@router.post("/lock", response_model=VaultStatusResponse)
async def vault_lock(_: Loopback, vault: Vault) -> VaultStatusResponse:
    return _status_response(vault.lock())


@router.get("/entries", response_model=VaultEntriesResponse)
async def vault_entries(_: Loopback, vault: Vault) -> VaultEntriesResponse:
    try:
        items = vault.list_entries()
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    return VaultEntriesResponse(
        items=[
            VaultEntryMeta(
                id=item["id"],
                name=item["name"],
                updatedAt=item["updatedAt"],
                hasValue=item["hasValue"],
            )
            for item in items
        ]
    )


@router.put("/entries/{name}", response_model=VaultEntryMeta)
async def vault_put_entry(
    name: str,
    body: VaultPutEntryRequest,
    _: Loopback,
    vault: Vault,
) -> VaultEntryMeta:
    try:
        item = vault.put_entry(unquote(name), body.value, notes=body.notes)
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return VaultEntryMeta(
        id=item["id"],
        name=item["name"],
        updatedAt=item["updatedAt"],
        hasValue=item["hasValue"],
    )


@router.delete("/entries/{name}", status_code=204)
async def vault_delete_entry(name: str, _: Loopback, vault: Vault) -> None:
    try:
        vault.delete_entry(unquote(name))
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Secret not found") from exc


@router.post("/coverage", response_model=VaultCoverageResponse)
async def vault_coverage(
    body: VaultCoverageRequest,
    _: Loopback,
    vault: Vault,
) -> VaultCoverageResponse:
    result = vault.coverage(graph=body.graph, names=body.names)
    return VaultCoverageResponse(
        unlocked=bool(result["unlocked"]),
        requested=list(result["requested"]),
        present=list(result["present"]),
        missing=list(result["missing"]),
    )


@router.post("/materialize-env", response_model=VaultMaterializeResponse)
async def vault_materialize_env(
    body: VaultMaterializeRequest,
    _: Loopback,
    vault: Vault,
) -> VaultMaterializeResponse:
    try:
        result = vault.materialize_env(
            path=Path(body.path),
            names=body.names,
            graph=body.graph,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=400, detail=f"Could not write .env: {exc}") from exc
    return VaultMaterializeResponse(
        path=str(result["path"]),
        writtenCount=int(result["writtenCount"]),
        writtenNames=list(result["writtenNames"]),
        missing=list(result["missing"]),
    )
