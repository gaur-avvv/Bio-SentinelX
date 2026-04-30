"""
Bio-SentinelX Urban Flood Prediction API
GIS-integrated ML system for 2500+ micro-hotspot identification
Real-time training + prediction with ward-level Pre-Monsoon Readiness Scores

Production hardening (v2.1.0):
  - JSON structured logging with per-request correlation IDs
  - Per-IP rate limiting via slowapi (60 req/min on predictions)
  - CORS origins locked to CORS_ORIGINS env var (whitelist)
  - Prometheus-compatible /metrics endpoint
  - Startup environment validation
"""

import asyncio
import logging
import os
import time
import uuid
from collections import defaultdict
from contextlib import asynccontextmanager
from typing import Optional

from dotenv import load_dotenv
load_dotenv()  # load .env in local dev (no-op in production)

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, BackgroundTasks, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from pythonjsonlogger import jsonlogger
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from database.db import init_db
from models.schemas import (
    LocationQuery,
    PredictionRequest,
    PredictionResponse,
    TrainingRequest,
    TrainingStatusResponse,
    WardReadinessResponse,
    MicroHotspotResponse,
    BulkPredictionRequest,
    BulkPredictionResponse,
    HealthResponse,
)
from services.data_collector import DataCollector
from services.trainer import ModelTrainer
from services.predictor import FloodPredictor

# ─── Structured JSON Logging ──────────────────────────────────────────────────

def _configure_logging() -> None:
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    handler = logging.StreamHandler()
    formatter = jsonlogger.JsonFormatter(
        fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )
    handler.setFormatter(formatter)
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(getattr(logging, log_level, logging.INFO))
    # Silence noisy third-party loggers
    for noisy in ("uvicorn.access", "httpcore", "httpx", "apscheduler"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


_configure_logging()
logger = logging.getLogger(__name__)

# ─── Environment Validation ───────────────────────────────────────────────────

def _validate_env() -> None:
    """Warn on missing optional vars; fail fast on critical misconfigurations."""
    optional_vars = [
        "DATABASE_URL", "CORS_ORIGINS", "FLOOD_N_JOBS", "LOG_LEVEL",
    ]
    for var in optional_vars:
        if not os.getenv(var):
            logger.warning("Environment variable not set", extra={"variable": var,
                "hint": "Check .env.example for documentation"})

    db_url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./flood_data.db")
    if not (db_url.startswith("sqlite") or db_url.startswith("postgres")):
        raise RuntimeError(
            f"DATABASE_URL has an unrecognised scheme: {db_url!r}. "
            "Expected sqlite+aiosqlite:// or postgresql+asyncpg://"
        )


# ─── Prometheus-compatible Metrics ────────────────────────────────────────────

class _Metrics:
    """Simple in-process counter store — no extra dependency needed."""
    def __init__(self):
        self._counters: dict[str, int] = defaultdict(int)
        self._histograms: dict[str, list[float]] = defaultdict(list)

    def inc(self, name: str, labels: dict | None = None) -> None:
        key = name if not labels else name + "{" + ",".join(f'{k}="{v}"' for k, v in labels.items()) + "}"
        self._counters[key] += 1

    def observe(self, name: str, value: float) -> None:
        self._histograms[name].append(value)

    def to_prometheus(self) -> str:
        lines: list[str] = []
        for key, val in self._counters.items():
            lines.append(f"{key} {val}")
        for name, vals in self._histograms.items():
            if vals:
                lines.append(f"{name}_count {len(vals)}")
                lines.append(f"{name}_sum {sum(vals):.4f}")
        return "\n".join(lines) + "\n"


metrics = _Metrics()

# ─── Rate Limiter (per IP) ────────────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

# ─── Globals ──────────────────────────────────────────────────────────────────

data_collector = DataCollector()
model_trainer = ModelTrainer()
flood_predictor = FloodPredictor()
scheduler = AsyncIOScheduler()
_init_task: Optional[asyncio.Task] = None  # type: ignore[assignment]


# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _init_task

    _validate_env()
    logger.info("Starting Bio-SentinelX Flood Prediction API", extra={"version": "2.1.0"})
    await init_db()

    _init_task = asyncio.create_task(
        model_trainer.auto_initialize(), name="auto_initialize"
    )

    scheduler.add_job(model_trainer.scheduled_retrain, "cron", hour=2, minute=0)
    scheduler.add_job(data_collector.sync_latest_observations, "interval", hours=1)
    scheduler.start()
    logger.info("Scheduler started", extra={"jobs": ["nightly_retrain", "hourly_sync"]})

    yield

    # ── Graceful shutdown ──────────────────────────────────────────────────
    scheduler.shutdown(wait=False)
    logger.info("Scheduler stopped")

    if _init_task is not None and not _init_task.done():
        logger.info("Waiting for background training to finish (max 10 min)")
        try:
            await asyncio.wait_for(_init_task, timeout=600)
            logger.info("Background training completed before shutdown")
        except asyncio.TimeoutError:
            logger.warning("Training did not finish within shutdown window — cancelling")
            _init_task.cancel()
            try:
                await _init_task
            except (asyncio.CancelledError, Exception):
                pass
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.error("Training task raised during shutdown", extra={"error": str(exc)})


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Bio-SentinelX Urban Flood Prediction API",
    description=(
        "GIS-integrated ML engine for urban flood micro-hotspot identification. "
        "Identifies 2,500+ micro-hotspots, generates ward-level Pre-Monsoon "
        "Readiness Scores, and supports real-time nowcasting (30–45 min ahead)."
    ),
    version="2.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── Rate limiter exception handler ────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── CORS ──────────────────────────────────────────────────────────────────────
_raw_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000",
)
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
    max_age=600,
)

# ── Request ID + timing middleware ────────────────────────────────────────────

@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())[:8]
    start = time.monotonic()

    # Attach to log context via a simple thread-local workaround
    old_factory = logging.getLogRecordFactory()

    def record_factory(*args, **kwargs):
        record = old_factory(*args, **kwargs)
        record.request_id = request_id
        return record

    logging.setLogRecordFactory(record_factory)

    try:
        response = await call_next(request)
    finally:
        logging.setLogRecordFactory(old_factory)

    duration_ms = (time.monotonic() - start) * 1000
    response.headers["X-Request-ID"] = request_id

    # Track metrics
    metrics.inc("http_requests_total", {"method": request.method, "status": str(response.status_code)})
    metrics.observe("http_request_duration_ms", duration_ms)

    logger.info(
        "HTTP request",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": round(duration_ms, 2),
        },
    )
    return response


# ─── Metrics ──────────────────────────────────────────────────────────────────

@app.get("/metrics", response_class=PlainTextResponse, tags=["System"],
         summary="Prometheus-compatible metrics")
async def prometheus_metrics():
    """Return Prometheus plaintext metrics for scraping."""
    metrics.inc("metrics_scrapes_total")
    return PlainTextResponse(metrics.to_prometheus(), media_type="text/plain; version=0.0.4")


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    """System health and model status."""
    metrics.inc("health_checks_total")
    status = await model_trainer.get_status()
    return HealthResponse(
        status="healthy",
        model_trained=status["trained"],
        model_accuracy=status.get("accuracy"),
        last_trained=status.get("last_trained"),
        hotspots_mapped=status.get("hotspots_mapped", 0),
        version="2.1.0",
    )


# ─── Training ─────────────────────────────────────────────────────────────────

@app.post("/train", response_model=TrainingStatusResponse, tags=["Training"])
@limiter.limit("5/minute")
async def trigger_training(
    request: Request,
    body: TrainingRequest,
    background_tasks: BackgroundTasks,
):
    """
    Trigger model training for a specific location.
    Rate limited to 5 requests/minute per IP.
    """
    metrics.inc("train_requests_total")
    background_tasks.add_task(
        model_trainer.train_for_location,
        lat=body.latitude,
        lon=body.longitude,
        radius_km=body.radius_km,
        years_back=body.years_back,
    )
    logger.info(
        "Training queued",
        extra={"lat": body.latitude, "lon": body.longitude, "radius_km": body.radius_km},
    )
    return TrainingStatusResponse(
        status="queued",
        message=(
            f"Training queued for ({body.latitude}, {body.longitude}) "
            f"radius={body.radius_km}km, history={body.years_back}y"
        ),
    )


@app.get("/train/status", response_model=TrainingStatusResponse, tags=["Training"])
async def training_status():
    """Get current training job status and metrics."""
    status = await model_trainer.get_status()
    return TrainingStatusResponse(**status)


# ─── Prediction ───────────────────────────────────────────────────────────────

@app.post("/predict", response_model=PredictionResponse, tags=["Prediction"])
@limiter.limit("60/minute")
async def predict_flood(request: Request, body: PredictionRequest):
    """
    Predict flood probability for a single location.
    Rate limited to 60 requests/minute per IP.
    """
    if not await model_trainer.is_trained():
        metrics.inc("predict_errors_total", {"reason": "model_not_trained"})
        raise HTTPException(
            status_code=503,
            detail="Model not yet trained. POST /train first.",
        )
    metrics.inc("predict_requests_total")
    result = await flood_predictor.predict(body)
    return result


@app.post("/predict/bulk", response_model=BulkPredictionResponse, tags=["Prediction"])
@limiter.limit("10/minute")
async def predict_bulk(request: Request, body: BulkPredictionRequest):
    """
    Batch-predict flood probability for multiple locations (up to 500).
    Rate limited to 10 requests/minute per IP.
    """
    if not await model_trainer.is_trained():
        metrics.inc("predict_errors_total", {"reason": "model_not_trained"})
        raise HTTPException(status_code=503, detail="Model not yet trained.")
    metrics.inc("predict_bulk_requests_total")
    results = await flood_predictor.predict_bulk(body.locations)
    return BulkPredictionResponse(predictions=results, total=len(results))


# ─── Micro-Hotspots ───────────────────────────────────────────────────────────

@app.get("/hotspots", response_model=MicroHotspotResponse, tags=["Analysis"])
@limiter.limit("20/minute")
async def get_micro_hotspots(
    request: Request,
    lat: float = Query(..., description="Centre latitude"),
    lon: float = Query(..., description="Centre longitude"),
    radius_km: float = Query(10.0, description="Search radius in km"),
    grid_size_km: float = Query(1.0, description="Grid cell size (0.25–2 km)"),
    min_risk: float = Query(0.5, description="Minimum risk threshold (0–1)"),
):
    """
    Scan the area and return all micro-hotspot grid cells above the risk threshold.
    Rate limited to 20 requests/minute per IP (expensive scan operation).
    """
    if not await model_trainer.is_trained():
        raise HTTPException(status_code=503, detail="Model not yet trained.")
    metrics.inc("hotspot_requests_total")
    hotspots = await flood_predictor.scan_hotspots(
        lat=lat, lon=lon, radius_km=radius_km,
        grid_size_km=grid_size_km, min_risk=min_risk,
    )
    return MicroHotspotResponse(
        centre_lat=lat,
        centre_lon=lon,
        radius_km=radius_km,
        grid_size_km=grid_size_km,
        total_cells_scanned=hotspots["total_cells"],
        hotspots_identified=hotspots["hotspot_count"],
        hotspots=hotspots["hotspots"],
    )


# ─── Ward Readiness ───────────────────────────────────────────────────────────

@app.get("/wards/readiness", response_model=list[WardReadinessResponse], tags=["Analysis"])
@limiter.limit("20/minute")
async def ward_readiness(
    request: Request,
    lat: float = Query(..., description="City centre latitude"),
    lon: float = Query(..., description="City centre longitude"),
    radius_km: float = Query(15.0, description="City radius km"),
):
    """
    Generate Pre-Monsoon Readiness Scores for all wards in the area.
    Rate limited to 20 requests/minute per IP.
    """
    if not await model_trainer.is_trained():
        raise HTTPException(status_code=503, detail="Model not yet trained.")
    metrics.inc("ward_readiness_requests_total")
    wards = await flood_predictor.compute_ward_readiness(lat, lon, radius_km)
    return wards


# ─── Historical Data ──────────────────────────────────────────────────────────

@app.post("/data/ingest", tags=["Data"])
@limiter.limit("5/minute")
async def ingest_location_data(
    request: Request,
    query: LocationQuery,
    background_tasks: BackgroundTasks,
):
    """Trigger historical data ingestion for a location. Rate limited to 5/min per IP."""
    metrics.inc("data_ingest_requests_total")
    background_tasks.add_task(
        data_collector.ingest_historical_data,
        lat=query.latitude,
        lon=query.longitude,
        radius_km=query.radius_km,
        years_back=query.years_back,
    )
    return {"status": "ingestion_queued", "location": {"lat": query.latitude, "lon": query.longitude}}


@app.get("/data/summary", tags=["Data"])
async def data_summary(
    lat: float = Query(...),
    lon: float = Query(...),
    radius_km: float = Query(10.0),
):
    """Return data availability summary for a location."""
    summary = await data_collector.get_data_summary(lat, lon, radius_km)
    return summary


# ─── Nowcasting ───────────────────────────────────────────────────────────────

@app.get("/nowcast", tags=["Prediction"])
@limiter.limit("30/minute")
async def nowcast(
    request: Request,
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    horizon_minutes: int = Query(45, description="Forecast horizon (30–120 min)"),
):
    """
    Real-time flood nowcasting for 30–120 minute horizon.
    Rate limited to 30 requests/minute per IP.
    """
    if not await model_trainer.is_trained():
        raise HTTPException(status_code=503, detail="Model not yet trained.")
    metrics.inc("nowcast_requests_total")
    return await flood_predictor.nowcast(lat, lon, horizon_minutes)
