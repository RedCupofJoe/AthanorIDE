#!/usr/bin/env python3
"""Set up AthanorIDE's local Qwen2.5-7B-Instruct endpoint on Linux with NVIDIA CUDA."""

from __future__ import annotations

import argparse
import csv
import fcntl
import hashlib
import io
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

MODEL_ID = "qwen2.5-7b-instruct"
MODEL_REPO = "Qwen/Qwen2.5-7B-Instruct-GGUF"
MODEL_REVISION = "bb5d59e06d9551d752d08b292a50eb208b07ab1f"
MODEL_FILES = {
    "qwen2.5-7b-instruct-q4_k_m-00001-of-00002.gguf": (
        3_993_201_344,
        "dfce12e3862a5283ccfb88221b48480e58745165de856439950d0f22590580db",
    ),
    "qwen2.5-7b-instruct-q4_k_m-00002-of-00002.gguf": (
        689_872_288,
        "539cf93f78e887edea1c04e2d7d8cdaca9d01dae9c9025bcb8accbe29df3d72a",
    ),
}
MODEL_FILENAME = next(iter(MODEL_FILES))
SERVICE = "athanor-model.service"
MARKER = "# Managed by AthanorIDE scripts/setup-model-endpoint.py"


def run(args: list[str], *, env: dict[str, str] | None = None) -> str:
    result = subprocess.run(args, env=env, text=True, capture_output=True, check=False)
    if result.returncode:
        raise RuntimeError(
            f"{' '.join(args)} failed:\n{result.stderr or result.stdout}"
        )
    return result.stdout


def verified(path: Path, size: int, expected_sha256: str) -> bool:
    if not path.is_file() or path.stat().st_size != size:
        return False
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(8 * 1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest() == expected_sha256


def ensure_model(path: Path, *, no_download: bool) -> None:
    size, sha256 = MODEL_FILES[path.name]
    if path.exists():
        print(f"Verifying existing model: {path}", flush=True)
        if not verified(path, size, sha256):
            raise RuntimeError(
                f"Existing model failed SHA-256 verification; left unchanged: {path}"
            )
        return
    if no_download:
        raise RuntimeError(
            f"Model missing: {path}. Local weights are required by default (--no-download). "
            "Use --model-dir with both cached shards, or --download to fetch them."
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_suffix(".gguf.part")
    offset = partial.stat().st_size if partial.exists() else 0
    if offset > size:
        raise RuntimeError(
            f"Partial file is too large. Move it aside and retry: {partial}"
        )
    if shutil.disk_usage(path.parent).free < size - offset + 256 * 1024 * 1024:
        raise RuntimeError(
            "Not enough free space for the model and 256 MiB of headroom."
        )
    if offset < size:
        print(
            f"Downloading {path.name} ({offset:,}/{size:,} bytes)...",
            flush=True,
        )
        # Retain completed bytes on interruption. A failed request is resumed on the next run.
        headers = {"Range": f"bytes={offset}-"} if offset else {}
        url = (
            f"https://huggingface.co/{MODEL_REPO}/resolve/{MODEL_REVISION}/{path.name}"
        )
        request = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(request, timeout=60) as response:
            if offset:
                expected = f"bytes {offset}-{size - 1}/{size}"
                if (
                    response.status != 206
                    or response.headers.get("Content-Range") != expected
                ):
                    raise RuntimeError(
                        "Download server did not honor resume; partial file preserved."
                    )
            elif response.status != 200:
                raise RuntimeError(f"Unexpected download status: {response.status}")
            last_report = time.monotonic()
            with partial.open("ab" if offset else "wb") as destination:
                while chunk := response.read(8 * 1024 * 1024):
                    if offset + len(chunk) > size:
                        raise RuntimeError("Download exceeds the expected model size.")
                    destination.write(chunk)
                    offset += len(chunk)
                    if time.monotonic() - last_report >= 10:
                        print(f"Downloaded {offset:,}/{size:,} bytes", flush=True)
                        last_report = time.monotonic()
    print("Checking official SHA-256 checksum...", flush=True)
    if not verified(partial, size, sha256):
        if partial.stat().st_size < size:
            raise RuntimeError("Download incomplete; rerun this script to resume.")
        raise RuntimeError(
            f"Checksum mismatch. Move this partial file aside before retrying: {partial}"
        )
    partial.replace(path)


def choose_gpu(selection: str | None) -> tuple[str, str]:
    output = run(
        [
            "nvidia-smi",
            "--query-gpu=index,uuid,memory.total,name",
            "--format=csv,noheader,nounits",
        ]
    )
    devices = [
        tuple(part.strip() for part in row) for row in csv.reader(io.StringIO(output))
    ]
    if selection is not None:
        devices = [device for device in devices if selection in device[:2]]
    if not devices:
        raise RuntimeError(
            "No matching NVIDIA GPU found. --gpu accepts an index or full GPU UUID."
        )
    _, gpu_uuid, _, name = max(devices, key=lambda device: int(device[2]))
    return gpu_uuid, name


def runtime_command(binary: str | None, gpu_uuid: str) -> list[str]:
    candidate = binary or str(Path.home() / ".llama-app/llama")
    resolved = shutil.which(candidate)
    if not resolved and not binary:
        resolved = shutil.which("llama") or shutil.which("llama-server")
    if not resolved:
        raise RuntimeError(
            "Install a CUDA-enabled llama.cpp runtime from "
            "https://github.com/ggml-org/llama.cpp/releases, then pass --llama-bin PATH."
        )
    # Preserve the executable name: the unified launcher can use argv[0] to dispatch.
    command = [os.path.abspath(resolved)]
    if not Path(resolved).name.startswith("llama-server"):
        command.append("serve")
    environment = {**os.environ, "CUDA_VISIBLE_DEVICES": gpu_uuid}
    devices = run([*command, "--list-devices"], env=environment)
    if "CUDA0:" not in devices:
        raise RuntimeError(
            "The selected runtime cannot use CUDA0. Use a CUDA build of llama.cpp."
        )
    help_text = run([*command, "--help"], env=environment)
    for flag in ("--jinja", "--no-webui"):
        if flag not in help_text:
            raise RuntimeError(
                f"The selected runtime lacks {flag}; update your CUDA runtime."
            )
    return command


def unit_quote(value: str) -> str:
    if any(character in value for character in "\n\r\0"):
        raise ValueError("Service paths and arguments cannot contain newlines or NUL.")
    return (
        '"' + value.replace("\\", "\\\\").replace('"', '\\"').replace("%", "%%") + '"'
    )


def service_text(command: list[str], model: Path, gpu_uuid: str, port: int) -> str:
    arguments = [
        *command,
        "--model",
        str(model),
        "--alias",
        MODEL_ID,
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
        "--device",
        "CUDA0",
        "--gpu-layers",
        "99",
        "--flash-attn",
        "on",
        "--ctx-size",
        "32768",
        "--parallel",
        "1",
        "--jinja",
        "--temp",
        "0.7",
        "--top-p",
        "0.8",
        "--top-k",
        "20",
        "--min-p",
        "0",
        "--n-predict",
        "4096",
        "--no-webui",
    ]
    # ':' disables systemd environment substitution in ExecStart (no shell is involved).
    return f"""{MARKER}
[Unit]
Description=AthanorIDE Qwen2.5-7B-Instruct local tool-calling endpoint
StartLimitIntervalSec=0

[Service]
Type=simple
Environment={unit_quote("CUDA_VISIBLE_DEVICES=" + gpu_uuid)}
ExecStart=:{" ".join(unit_quote(argument) for argument in arguments)}
Restart=on-failure
RestartSec=15
TimeoutStopSec=30
NoNewPrivileges=true
UMask=0077

[Install]
WantedBy=default.target
"""


def atomic_write(path: Path, content: str) -> bool:
    if path.exists() and not path.is_symlink() and path.read_text() == content:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w", dir=path.parent, delete=False
    ) as temporary:
        temporary.write(content)
    try:
        os.replace(temporary.name, path)
    finally:
        Path(temporary.name).unlink(missing_ok=True)
    return True


def get_json(
    base: str, route: str, body: dict | None = None, *, timeout: int = 60
) -> dict:
    # Local checks must not go through an inherited HTTP proxy.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        base + route, data=data, headers={"Content-Type": "application/json"}
    )
    with opener.open(request, timeout=timeout) as response:
        return json.load(response)


def check_endpoint(port: int) -> None:
    base = f"http://127.0.0.1:{port}"
    if get_json(base, "/health")["status"] != "ok":
        raise RuntimeError("The model endpoint is not healthy.")
    if MODEL_ID not in [model["id"] for model in get_json(base, "/v1/models")["data"]]:
        raise RuntimeError(f"The endpoint does not advertise {MODEL_ID}.")

    def chat(messages: list[dict], **kwargs: object) -> dict:
        return get_json(
            base,
            "/v1/chat/completions",
            {
                "model": MODEL_ID,
                "temperature": 0,
                "max_tokens": 2048,
                "messages": messages,
                **kwargs,
            },
        )["choices"][0]["message"]

    plain = chat([{"role": "user", "content": "Reply with the single word READY."}])
    if "READY" not in (plain.get("content") or ""):
        raise RuntimeError("Chat check did not return READY.")
    messages = [
        {
            "role": "system",
            "content": "Use add_numbers for arithmetic, then report the tool result.",
        },
        {"role": "user", "content": "What is 19 plus 23?"},
    ]
    tools = [
        {
            "type": "function",
            "function": {
                "name": "add_numbers",
                "description": "Add two integers.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "a": {"type": "integer"},
                        "b": {"type": "integer"},
                    },
                    "required": ["a", "b"],
                    "additionalProperties": False,
                },
            },
        }
    ]
    message = chat(messages, tools=tools, tool_choice="auto")
    calls = message.get("tool_calls") or []
    if len(calls) != 1 or calls[0]["function"]["name"] != "add_numbers":
        raise RuntimeError(
            "The model did not return the expected structured tool call."
        )
    call = calls[0]
    arguments = json.loads(call["function"]["arguments"])
    if arguments not in ({"a": 19, "b": 23}, {"a": 23, "b": 19}):
        raise RuntimeError("The model returned incorrect tool arguments.")
    messages.extend(
        [
            {
                "role": "assistant",
                "content": message.get("content") or "",
                "tool_calls": calls,
            },
            {"role": "tool", "tool_call_id": call["id"], "content": '{"sum":42}'},
        ]
    )
    answer = chat(messages, tools=tools, tool_choice="auto")
    if "42" not in (answer.get("content") or "") or answer.get("tool_calls"):
        raise RuntimeError(
            "The model did not consume the tool result and return the sum."
        )
    print(
        "PASS: health, model discovery, chat, and a complete tool-call round trip.",
        flush=True,
    )


def service_owns_port(port: int) -> bool:
    """Avoid treating an unrelated server's successful health check as our own."""
    pid = run(
        ["systemctl", "--user", "show", "--property=MainPID", "--value", SERVICE]
    ).strip()
    if not pid.isdigit() or pid == "0":
        return False
    address = f"0100007F:{port:04X}"
    inodes = {
        row[9]
        for line in Path("/proc/net/tcp").read_text().splitlines()[1:]
        if len(row := line.split()) > 9 and row[1] == address and row[3] == "0A"
    }
    for descriptor in (Path("/proc") / pid / "fd").glob("*"):
        try:
            if os.readlink(descriptor) in {f"socket:[{inode}]" for inode in inodes}:
                return True
        except FileNotFoundError:
            continue
    return False


def install(args: argparse.Namespace) -> None:
    if sys.platform != "linux":
        raise RuntimeError(
            "This setup script requires Linux, NVIDIA CUDA, and systemd --user."
        )
    if os.geteuid() == 0:
        raise RuntimeError("Run this script as your desktop user, without sudo.")
    run(["systemctl", "--user", "show", "--property=Version"])
    gpu_uuid, gpu_name = choose_gpu(args.gpu)
    command = runtime_command(args.llama_bin, gpu_uuid)
    model = args.model_dir.expanduser().resolve() / MODEL_FILENAME
    config_home = Path(
        os.environ.get("XDG_CONFIG_HOME", str(Path.home() / ".config"))
    ).expanduser()
    config_dir = config_home / "athanor"
    unit = config_home / "systemd/user" / SERVICE
    unit_text = service_text(command, model, gpu_uuid, args.port)
    if unit.exists():
        existing = unit.read_text()
        legacy = (
            "Description=AthanorIDE Qwen3-8B local tool-calling endpoint" in existing
            and "ExecStart=%h/AthanorIDE/.tools/local-model/serve.sh" in existing
        )
        if MARKER not in existing and not legacy:
            raise RuntimeError(f"Refusing to overwrite an unrelated service: {unit}")
    print(f"GPU: {gpu_name} ({gpu_uuid})\nModel: {model}\nService: {unit}", flush=True)
    if args.dry_run:
        print(
            "Dry run: no files changed, no downloads, no service restart.\n" + unit_text
        )
        return
    config_dir.mkdir(parents=True, exist_ok=True)
    with (config_dir / "model-endpoint.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        active = (
            subprocess.run(
                ["systemctl", "--user", "is-active", "--quiet", SERVICE],
                check=False,
            ).returncode
            == 0
        )
        try:
            with socket.create_connection(("127.0.0.1", args.port), timeout=1):
                listening = True
        except OSError:
            listening = False
        if listening:
            if not active or not unit.exists() or not service_owns_port(args.port):
                raise RuntimeError(
                    f"Port {args.port} is already in use by another service."
                )
            # Do not stop an unrelated listener while updating our own service.
            get_json(f"http://127.0.0.1:{args.port}", "/health", timeout=5)
        # Keep shard filenames intact: resolving the HF cache symlink to a blob
        # would prevent llama.cpp from locating the second shard.
        for filename in MODEL_FILES:
            ensure_model(model.parent / filename, no_download=not args.download)
        changed = atomic_write(unit, unit_text)
        run(["systemctl", "--user", "daemon-reload"])
        # Also migrate the previous setup's enable symlink from the checkout.
        run(["systemctl", "--user", "enable", "--force", SERVICE])
        if changed or not active:
            run(["systemctl", "--user", "restart", SERVICE])
        else:
            print(
                "Service configuration unchanged; keeping the current process.",
                flush=True,
            )
        base = f"http://127.0.0.1:{args.port}"
        deadline = time.monotonic() + 120
        while True:
            try:
                if get_json(base, "/health", timeout=2).get(
                    "status"
                ) == "ok" and service_owns_port(args.port):
                    break
            except (OSError, ValueError):
                pass
            if time.monotonic() >= deadline:
                raise RuntimeError(
                    f"Model startup timed out. Inspect: journalctl --user -u {SERVICE} -n 50"
                )
            time.sleep(2)
        check_endpoint(args.port)
        atomic_write(
            config_dir / "model-endpoint.json",
            json.dumps(
                {
                    "endpoint": base + "/v1/chat/completions",
                    "base_url": base + "/v1",
                    "model": MODEL_ID,
                    "model_path": str(model),
                    "model_files": {
                        name: {"size": size, "sha256": digest}
                        for name, (size, digest) in MODEL_FILES.items()
                    },
                    "model_revision": MODEL_REVISION,
                    "gpu_uuid": gpu_uuid,
                    "service": SERVICE,
                    "context_tokens": 32768,
                    "recommended_max_tokens": 4096,
                    "useToken": False,
                },
                indent=2,
            )
            + "\n",
        )
    print(f"""
Endpoint ready: {base}/v1/chat/completions
Model ID: {MODEL_ID}
Config: {config_dir / "model-endpoint.json"}
Restart: systemctl --user restart {SERVICE}
Stop:    systemctl --user stop {SERVICE}
Logs:    journalctl --user -u {SERVICE} -f

In AthanorIDE, save the endpoint and model ID under Assistant settings.
Turn OFF Use API token. This endpoint needs neither an API key nor a local vault.
The model binds only to 127.0.0.1.
""")


def default_model_dir() -> Path:
    drive = (
        Path("/run/media")
        / Path.home().name
        / "model-repo/llm-models/Qwen2.5-7B-Instruct-GGUF"
    )
    cache_home = Path(os.environ.get("XDG_CACHE_HOME", str(Path.home() / ".cache")))
    hf_home = Path(os.environ.get("HF_HOME", str(cache_home / "huggingface")))
    hub = Path(os.environ.get("HF_HUB_CACHE", str(hf_home / "hub")))
    cached = hub / "models--Qwen--Qwen2.5-7B-Instruct-GGUF/snapshots" / MODEL_REVISION
    for directory in (drive, cached):
        if all((directory / filename).is_file() for filename in MODEL_FILES):
            return directory
    return drive


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    default_dir = default_model_dir()
    parser.add_argument(
        "--model-dir",
        type=Path,
        default=default_dir,
        help=f"Weight directory (default: {default_dir})",
    )
    parser.add_argument(
        "--llama-bin",
        help="CUDA-enabled llama or llama-server executable (default: discover existing runtime)",
    )
    parser.add_argument(
        "--gpu", help="NVIDIA GPU index or UUID (default: GPU with the most total VRAM)"
    )
    parser.add_argument(
        "--port", type=int, default=8081, help="Loopback listener port (default: 8081)"
    )
    download = parser.add_mutually_exclusive_group()
    download.add_argument(
        "--no-download",
        dest="download",
        action="store_false",
        help="Require existing, verified model weights (default)",
    )
    download.add_argument(
        "--download",
        action="store_true",
        help="Allow downloading missing pinned model shards",
    )
    parser.set_defaults(download=False)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate prerequisites and print the service without changing anything",
    )
    mode.add_argument(
        "--check-only",
        action="store_true",
        help="Test the existing endpoint without installing or changing anything",
    )
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("--port must be between 1024 and 65535")
    try:
        if args.check_only:
            check_endpoint(args.port)
        else:
            install(args)
    except (OSError, RuntimeError, ValueError, KeyError, IndexError) as error:
        print(f"Setup failed: {error}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print(
            "Interrupted; partial downloads are retained for the next run.",
            file=sys.stderr,
        )
        return 130
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
