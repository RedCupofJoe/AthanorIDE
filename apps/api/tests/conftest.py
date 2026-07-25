from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from athanor_api.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def contracts_root() -> Path:
    return Path(__file__).resolve().parents[3] / "packages" / "contracts"
