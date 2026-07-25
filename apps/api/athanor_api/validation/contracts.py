"""Contract compatibility helpers mirrored from packages/contracts."""

from __future__ import annotations

from athanor_api.schemas.graph import ContractType


def are_contracts_compatible(source: ContractType, target: ContractType) -> bool:
    if source == target:
        return True
    if source == ContractType.ANY or target == ContractType.ANY:
        return True
    return False


def contract_compatibility_reason(source: ContractType, target: ContractType) -> str | None:
    if are_contracts_compatible(source, target):
        return None
    return (
        f"Contract mismatch: output {source.value} cannot connect to input {target.value}. "
        "Use an adapter node or matching port types."
    )
