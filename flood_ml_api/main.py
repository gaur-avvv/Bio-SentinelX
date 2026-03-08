"""
Bio-SentinelX Urban Flood Prediction API
GIS-integrated ML system for 2500+ micro-hotspot identification
Real-time training + prediction with ward-level Pre-Monsoon Readiness Scores
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, BackgroundTasks, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ─── Globals ──────────────────────────────────────────────────────────────────
data_collector = DataCollector()
model_trainer = ModelTrainer()
flood_predictor = FloodPredictor()
scheduler = AsyncIOScheduler()

# Keep a reference so we can cancel / await during graceful shutdown
_init_task: Optional[asyncio.Task] = None  # type: ignore[assignment]


# ─── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _init_task

    logger.info("🚀 Starting Bio-SentinelX Flood Prediction API…")
    await init_db()

    # Auto-train on startup if no model exists – store the task so we can
    # await / cancel it cleanly on shutdown instead of being killed mid-train.
    _init_task = asyncio.create_task(
        model_trainer.auto_initialize(), name="auto_initialize"
    )

    # Schedule nightly retraining (02:00 UTC) and hourly data sync
    scheduler.add_job(model_trainer.scheduled_retrain, "cron", hour=2, minute=0)
    scheduler.add_job(data_collector.sync_latest_observations, "interval", hours=1)
    scheduler.start()
    logger.info("⏰ Scheduler started: nightly retrain + hourly data sync")

    yield

    # ── Graceful shutdown ──────────────────────────────────────────────────
    scheduler.shutdown(wait=False)
    logger.info("🛑 Scheduler stopped")

    if _init_task is not None and not _init_task.done():
        logger.info(
            "⏳ Waiting for background training to finish (max 10 min)…"
        )
        try:
            await asyncio.wait_for(_init_task, timeout=600)
            logger.info("✅ Background training completed before shutdown")
        except asyncio.TimeoutError:
            logger.warning(
                "⚠️  Training did not finish within shutdown window – cancelling"
            )
            _init_task.cancel()
            try:
                await _init_task
            except (asyncio.CancelledError, Exception):
                pass
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.error("Training task raised during shutdown: %s", exc)


# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Bio-SentinelX Urban Flood Prediction API",
    description=(
        "GIS-integrated ML engine for urban flood micro-hotspot identification. "
        "Identifies 2,500+ micro-hotspots, generates ward-level Pre-Monsoon "
        "Readiness Scores, and supports real-time nowcasting (30–45 min ahead)."
    ),
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Health ───────────────────────────────────────────────────────────────────
@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    """System health and model status."""
    status = await model_trainer.get_status()
    return HealthResponse(
        status="healthy",
        model_trained=status["trained"],
        model_accuracy=status.get("accuracy"),
        last_trained=status.get("last_trained"),
        hotspots_mapped=status.get("hotspots_mapped", 0),
        version="2.0.0",
    )


# ─── Training ─────────────────────────────────────────────────────────────────
@app.post("/train", response_model=TrainingStatusResponse, tags=["Training"])
async def trigger_training(
    request: TrainingRequest,
    background_tasks: BackgroundTasks,
):
    """
    Trigger model training for a specific location.
    Pulls historical rainfall, DEM, LULC, soil, and drainage data,
    then trains a Random Forest + gradient-boosted ensemble.
    """
    background_tasks.add_task(
        model_trainer.train_for_location,
        lat=request.latitude,
        lon=request.longitude,
        radius_km=request.radius_km,
        years_back=request.years_back,
    )
    return TrainingStatusResponse(
        status="queued",
        message=f"Training queued for ({request.latitude}, {request.longitude}) "
                f"radius={request.radius_km}km, history={request.years_back}y",
    )


@app.get("/train/status", response_model=TrainingStatusResponse, tags=["Training"])
async def training_status():
    """Get current training job status and metrics."""
    status = await model_trainer.get_status()
    return TrainingStatusResponse(**status)


# ─── Prediction ───────────────────────────────────────────────────────────────
@app.post("/predict", response_model=PredictionResponse, tags=["Prediction"])
async def predict_flood(request: PredictionRequest):
    """
    Predict flood probability for a single location using all hydro factors:
    rainfall, elevation, slope, soil moisture, drainage capacity,
    LULC, impervious ratio, proximity to water bodies, and antecedent
    precipitation index.
    """
    if not await model_trainer.is_trained():
        raise HTTPException(
            status_code=503,
            detail="Model not yet trained. POST /train first.",
        )
    result = await flood_predictor.predict(request)
    return result


@app.post("/predict/bulk", response_model=BulkPredictionResponse, tags=["Prediction"])
async def predict_bulk(request: BulkPredictionRequest):
    """
    Batch-predict flood probability for multiple locations (up to 500).
    Ideal for grid-based micro-hotspot scanning of a city.
    """
    if not await model_trainer.is_trained():
        raise HTTPException(status_code=503, detail="Model not yet trained.")
    results = await flood_predictor.predict_bulk(request.locations)
    return BulkPredictionResponse(predictions=results, total=len(results))


# ─── Micro-Hotspots ───────────────────────────────────────────────────────────
@app.get("/hotspots", response_model=MicroHotspotResponse, tags=["Analysis"])
async def get_micro_hotspots(
    lat: float = Query(..., description="Centre latitude"),
    lon: float = Query(..., description="Centre longitude"),
    radius_km: float = Query(10.0, description="Search radius in km"),
    grid_size_km: float = Query(1.0, description="Grid cell size (0.25–2 km)"),
    min_risk: float = Query(0.5, description="Minimum risk threshold (0–1)"),
):
    """
    Scan the area and return all micro-hotspot grid cells above the risk threshold.
    Supports 1×1 km grids (default) down to 250m for high-resolution mapping.
    """
    if not await model_trainer.is_trained():
        raise HTTPException(status_code=503, detail="Model not yet trained.")
    hotspots = await flood_predictor.scan_hotspots(
        lat=lat,
        lon=lon,
        radius_km=radius_km,
        grid_size_km=grid_size_km,
        min_risk=min_risk,
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
async def ward_readiness(
    lat: float = Query(..., description="City centre latitude"),
    lon: float = Query(..., description="City centre longitude"),
    radius_km: float = Query(15.0, description="City radius km"),
):
    """
    Generate Pre-Monsoon Readiness Scores for all wards in the area.
    Returns A/B/C/D ranking based on predicted inundation depth,
    drainage health, and critical infrastructure exposure.
    """
    if not await model_trainer.is_trained():
        raise HTTPException(status_code=503, detail="Model not yet trained.")
    wards = await flood_predictor.compute_ward_readiness(lat, lon, radius_km)
    return wards


# ─── Historical Data ──────────────────────────────────────────────────────────
@app.post("/data/ingest", tags=["Data"])
async def ingest_location_data(
    query: LocationQuery,
    background_tasks: BackgroundTasks,
):
    """
    Trigger historical data ingestion for a location (rainfall, DEM, LULC, soil).
    Runs in the background; check /train/status for completion.
    """
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
async def nowcast(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    horizon_minutes: int = Query(45, description="Forecast horizon (30–120 min)"),
):
    """
    Real-time flood nowcasting for 30–120 minute horizon.
    Combines latest rainfall radar data with the ML model for rapid predictions.
    """
    if not await model_trainer.is_trained():
        raise HTTPException(status_code=503, detail="Model not yet trained.")
    return await flood_predictor.nowcast(lat, lon, horizon_minutes)
