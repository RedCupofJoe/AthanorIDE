"""Sandbox Policy documents shared by export and validation."""

from __future__ import annotations

import re
from typing import Any

import yaml

HOST = re.compile(
    r"(?:localhost|[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*)"
)
MAX_UID = 4294967294


def policy_filename(sandbox_id: str) -> str:
    safe = "".join(ch if ch.isalnum() or ch in "._-" else "-" for ch in sandbox_id) or "sandbox"
    return f"openshell-policy-{safe}.yaml"


def parse_endpoints(raw: str) -> list[tuple[str, int]]:
    endpoints: list[tuple[str, int]] = []
    for part in str(raw).split(","):
        item = part.strip()
        if not item:
            continue
        host, separator, port_text = item.rpartition(":")
        if not separator or not HOST.fullmatch(host) or not port_text.isdigit():
            raise ValueError(item)
        port = int(port_text)
        if not 1 <= port <= 65535:
            raise ValueError(item)
        endpoints.append((host, port))
    return endpoints


def valid_run_as_user(value: str) -> bool:
    if value == "sandbox":
        return True
    if not value.isdigit():
        return False
    number = int(value)
    return 1 <= number <= MAX_UID


def attached_policies(graph: dict[str, Any], sandbox: dict[str, Any]) -> list[dict[str, Any]]:
    ports = {port["id"] for port in sandbox.get("inputs", []) if port.get("name") == "policy"}
    nodes = {node["id"]: node for node in graph["nodes"]}
    return [
        nodes[edge["sourceNodeId"]]
        for edge in graph["edges"]
        if edge["targetNodeId"] == sandbox["id"]
        and edge["targetPortId"] in ports
        and edge["sourceNodeId"] in nodes
        and nodes[edge["sourceNodeId"]]["type"] == "sandbox.policy"
    ]


def effective_network(sandbox: dict[str, Any], policy: dict[str, Any] | None) -> str:
    if policy is not None:
        return str(policy["configuration"].get("network", "none"))
    return str(sandbox["configuration"].get("network", "none"))


def openshell_policy_yaml(config: dict[str, Any]) -> str:
    user = str(config.get("runAsUser", "65532"))
    read_write = ["/tmp", "/dev/null"]
    if not config.get("readOnlyRoot", True):
        read_write.append("/workspace")
    document: dict[str, Any] = {
        "version": 1,
        "filesystem_policy": {
            "include_workdir": True,
            "read_only": ["/usr", "/lib", "/lib64", "/bin", "/etc", "/proc", "/dev/urandom"],
            "read_write": read_write,
        },
        "landlock": {"compatibility": "best_effort"},
        "process": {"run_as_user": user, "run_as_group": user},
    }
    if str(config.get("network", "none")) == "bridge":
        endpoints = parse_endpoints(str(config.get("allowedEndpoints", "")))
        if endpoints:
            document["network_policies"] = {
                "workload": {
                    "name": "workload",
                    "endpoints": [
                        {"host": host, "port": port, "protocol": "tcp"} for host, port in endpoints
                    ],
                    "binaries": [{"path": "/usr/local/bin/python"}],
                }
            }
    return yaml.safe_dump(document, sort_keys=False)
