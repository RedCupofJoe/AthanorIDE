import anyio
import pytest
from fastapi.testclient import TestClient

from athanor_api import main


def test_health_ok(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["schemaVersion"] == "1.0.0"
    assert "X-Correlation-ID" in response.headers


def test_health_preserves_correlation_id(client: TestClient) -> None:
    response = client.get(
        "/api/v1/health",
        headers={"X-Correlation-ID": "test-correlation-123"},
    )
    assert response.headers["X-Correlation-ID"] == "test-correlation-123"


def test_node_definitions_empty(client: TestClient) -> None:
    response = client.get("/api/v1/node-definitions")
    assert response.status_code == 200
    types = [item["type"] for item in response.json()["items"]]
    assert "foundation.text_input" in types
    assert "foundation.portal_input" in types
    assert "fine_tuning.lora_trainer" in types
    assert "model.predictive" in types
    assert len(types) == 60


@pytest.mark.anyio
async def test_background_worker_fails_fast_when_pool_is_full(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FullLimiter:
        def acquire_nowait(self) -> None:
            raise anyio.WouldBlock

    monkeypatch.setattr(main, "CPU_WORK_LIMITER", FullLimiter())
    with pytest.raises(main.WorkerCapacityError):
        await main.run_cpu_bound(lambda: None)


def test_api_returns_retryable_busy_response_when_worker_pool_is_full(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    class FullLimiter:
        def acquire_nowait(self) -> None:
            raise anyio.WouldBlock

    monkeypatch.setattr(main, "CPU_WORK_LIMITER", FullLimiter())
    response = client.post("/api/v1/marketplace/refresh")
    assert response.status_code == 503
    assert response.headers["Retry-After"] == "2"
    assert response.json()["error"] == "worker_capacity"
