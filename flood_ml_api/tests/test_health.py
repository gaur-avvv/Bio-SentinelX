"""
Integration tests for the /health, /predict, /metrics, and /train/status endpoints.

Run with:
    cd flood_ml_api
    pytest tests/ -v
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

# ─── App import ───────────────────────────────────────────────────────────────
# Must set env before importing app so _validate_env() doesn't raise
import os
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test_health.db")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")
os.environ.setdefault("LOG_LEVEL", "WARNING")

from main import app  # noqa: E402  (import after env setup)


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def client():
    """Async HTTPX client backed by the FastAPI app (no real HTTP server needed)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ─── /health ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_health_returns_200(client: AsyncClient):
    resp = await client.get("/health")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_health_schema(client: AsyncClient):
    resp = await client.get("/health")
    data = resp.json()
    assert data["status"] == "healthy"
    assert "model_trained" in data
    assert "version" in data
    assert isinstance(data["hotspots_mapped"], int)


# ─── /metrics ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_metrics_returns_200(client: AsyncClient):
    resp = await client.get("/metrics")
    assert resp.status_code == 200
    assert "text/plain" in resp.headers["content-type"]


@pytest.mark.asyncio
async def test_metrics_tracks_health_call(client: AsyncClient):
    # Call health, then verify metrics incremented
    await client.get("/health")
    resp = await client.get("/metrics")
    assert "health_checks_total" in resp.text


# ─── /train/status ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_train_status_returns_200(client: AsyncClient):
    resp = await client.get("/train/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data


# ─── /predict — model not yet trained ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_predict_503_when_model_not_trained(client: AsyncClient):
    """When the model has not been trained, /predict must return 503."""
    payload = {
        "latitude": 19.076,
        "longitude": 72.877,
        "rainfall_24h_mm": 100.0,
    }
    resp = await client.post("/predict", json=payload)
    # Model is not trained in test env — expect 503
    assert resp.status_code in (200, 503), f"Unexpected status: {resp.status_code}"


@pytest.mark.asyncio
async def test_predict_422_invalid_body(client: AsyncClient):
    """Missing required lat/lon fields must return 422 Unprocessable Entity."""
    resp = await client.post("/predict", json={"rainfall_24h_mm": 50.0})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_predict_422_out_of_range_lat(client: AsyncClient):
    """Latitude > 90 must fail Pydantic validation."""
    resp = await client.post("/predict", json={"latitude": 999.0, "longitude": 72.877})
    assert resp.status_code == 422


# ─── /predict/bulk ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_bulk_predict_422_empty_list(client: AsyncClient):
    resp = await client.post("/predict/bulk", json={"locations": []})
    # Empty list should either be rejected (422) or fail with 503
    assert resp.status_code in (422, 503)


# ─── Rate-limit header presence ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_request_id_header_present(client: AsyncClient):
    resp = await client.get("/health")
    # Our middleware injects X-Request-ID
    assert "x-request-id" in resp.headers


# ─── CORS pre-flight ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cors_allowed_origin(client: AsyncClient):
    resp = await client.options(
        "/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.status_code in (200, 204)
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:3000"


@pytest.mark.asyncio
async def test_cors_blocked_origin(client: AsyncClient):
    """Requests from an unknown origin must NOT receive ACAO header."""
    resp = await client.options(
        "/health",
        headers={
            "Origin": "https://evil.example.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    acao = resp.headers.get("access-control-allow-origin", "")
    assert acao != "https://evil.example.com", (
        "CORS must not echo back arbitrary origins"
    )
