from fastapi.testclient import TestClient


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
    assert len(types) == 59
