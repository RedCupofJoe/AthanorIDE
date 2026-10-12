from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from athanor_api import marketplace


def test_marketplace_topics_are_local_and_stable(client: TestClient) -> None:
    response = client.get("/api/v1/marketplace/topics")
    assert response.status_code == 200
    assert response.json()[0]["id"] == "agent-frameworks"
    assert len(response.json()) == 10


def test_marketplace_refresh_returns_versioned_snapshot(
    monkeypatch: Any, client: TestClient
) -> None:
    def fake_json(
        url: str, *, method: str = "GET", data: dict[str, object] | None = None
    ) -> object:
        if "registry.npmjs.org/-/v1/search" in url:
            return {
                "objects": [
                    {
                        "package": {
                            "name": "sample-tool",
                            "version": "1.2.3",
                            "description": "Example",
                            "license": "MIT",
                            "links": {"repository": "https://github.com/example/tool"},
                        },
                        "score": {"detail": {"quality": 0.9}},
                    }
                ]
            }
        if url.endswith("/v1/querybatch"):
            assert method == "POST"
            assert data is not None
            return {"results": [{"vulns": []} for _ in data["queries"]]}
        if "/downloads/range/" in url:
            return {"downloads": 1234}
        raise AssertionError(f"Unexpected marketplace request: {url}")

    monkeypatch.setattr(marketplace, "_get_json", fake_json)
    response = client.post("/api/v1/marketplace/refresh")
    assert response.status_code == 200
    payload = response.json()
    assert payload["schemaVersion"] == 1
    assert payload["entries"][0]["version"] == "1.2.3"
    assert payload["entries"][0]["downloads90d"] == 1234
    assert payload["entries"][0]["securityStatus"] == "checked"
    assert payload["entries"][0]["rating"] is None


def test_marketplace_ranking_reweights_missing_metrics() -> None:
    entry = marketplace.MarketplaceEntry(
        id="npm:one",
        topic="mcp-tools",
        name="one",
        description="",
        version="1.0",
        registryUrl="https://registry.npmjs.org/one",
        downloads90d=500,
        securityStatus="checked",
        checkedAt="2026-10-10T00:00:00Z",
    )
    ranked = marketplace._rank([entry])[0]
    assert ranked.score == 1.0
    assert ranked.score_completeness == ["downloads90d", "cveRisk"]


def test_marketplace_advisory_ranges_match_the_exact_npm_package() -> None:
    detail = {
        "affected": [
            {
                "package": {"ecosystem": "npm", "name": "other"},
                "ranges": [{"events": [{"introduced": "1", "fixed": "2"}]}],
            },
            {
                "package": {"ecosystem": "npm", "name": "example"},
                "ranges": [{"events": [{"introduced": "1.2.0"}, {"fixed": "1.2.4"}]}],
            },
        ]
    }
    assert marketplace._affected_versions(detail, "example") == (">=1.2.0, <1.2.4", ["1.2.4"])
