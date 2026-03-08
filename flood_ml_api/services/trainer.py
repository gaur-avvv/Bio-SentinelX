"""
Model Trainer Service

Orchestrates data collection → feature engineering → model training.
Supports single-location training and scheduled global retraining.
"""

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Optional, Dict, Any

import pandas as pd

from models.flood_model import get_model, FloodMLModel
from services.data_collector import DataCollector
from services.feature_engineering import engineer_training_features

logger = logging.getLogger(__name__)
_training_lock = asyncio.Lock()
# One dedicated thread for blocking sklearn/xgboost training so it never
# steals threads from FastAPI's default executor or other background tasks.
_train_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="flood_train")


class ModelTrainer:
    def __init__(self):
        self._collector = DataCollector()
        self._status: Dict[str, Any] = {
            "status": "idle",
            "message": "No training run yet",
            "trained": False,
        }

    # ──────────────────────────────────────────────────────────────────────────
    # Initialisation

    async def auto_initialize(self):
        """
        On startup: if no model exists, train on a default Indian metro location
        using synthetic data so the API is immediately functional.
        """
        model = get_model()
        if not model.is_trained:
            logger.info("No trained model found – running auto-initialisation on Mumbai coordinates")
            await self.train_for_location(
                lat=19.0760, lon=72.8777,   # Mumbai
                radius_km=20.0,
                years_back=10,
            )

    # ──────────────────────────────────────────────────────────────────────────
    # Training

    async def train_for_location(
        self,
        lat: float,
        lon: float,
        radius_km: float = 15.0,
        years_back: int = 10,
    ):
        """Pull data and train/retrain the global ML model for this location."""
        async with _training_lock:
            self._status = {
                "status": "running",
                "message": f"Fetching data for ({lat:.4f}, {lon:.4f})",
                "trained": get_model().is_trained,
            }
            try:
                # 1. Collect
                logger.info("Step 1/3: Data collection")
                raw_df = await self._collector.ingest_historical_data(
                    lat, lon, radius_km, years_back
                )
                self._status["message"] = f"Data ready: {len(raw_df):,} records – engineering features"

                # 2. Feature engineering
                logger.info("Step 2/3: Feature engineering on %d rows", len(raw_df))
                feature_df = engineer_training_features(raw_df)
                y_flood = raw_df["flood_occurred"].astype(int)
                y_depth = raw_df["inundation_depth_m"].fillna(0).clip(0, 5)

                # Filter rows where all feature columns are available
                valid_mask = feature_df.notna().all(axis=1)
                feature_df = feature_df[valid_mask]
                y_flood = y_flood[valid_mask]
                y_depth = y_depth[valid_mask]

                self._status["message"] = (
                    f"Training on {len(feature_df):,} samples "
                    f"({y_flood.sum()} flood events, {(~y_flood.astype(bool)).sum()} non-flood)"
                )

                # 3. Train
                logger.info("Step 3/3: Training ML model")
                model: FloodMLModel = get_model()
                meta = await asyncio.get_event_loop().run_in_executor(
                    _train_executor, model.train, feature_df, y_flood, y_depth
                )
                meta.location_lat = lat
                meta.location_lon = lon
                meta.hotspots_mapped = await self._estimate_hotspot_count(
                    lat, lon, radius_km
                )

                self._status = {
                    "status": "completed",
                    "message": "Training complete",
                    "trained": True,
                    "accuracy": meta.accuracy,
                    "f1_score": meta.f1,
                    "roc_auc": meta.roc_auc,
                    "last_trained": meta.last_trained,
                    "training_samples": meta.training_samples,
                    "hotspots_mapped": meta.hotspots_mapped,
                    "feature_importances": meta.feature_importances,
                }
                logger.info(
                    "✅ Training done: acc=%.3f  f1=%.3f  auc=%.3f",
                    meta.accuracy, meta.f1, meta.roc_auc,
                )

            except Exception as e:
                logger.exception("Training failed: %s", e)
                self._status = {
                    "status": "failed",
                    "message": f"Training failed: {e}",
                    "trained": get_model().is_trained,
                }

    async def scheduled_retrain(self):
        """Nightly scheduled job: retrain on all ingested locations."""
        logger.info("🔄 Scheduled retrain starting…")
        try:
            from database.db import get_session
            from sqlalchemy import select, distinct
            from database.models import LocationCache
            async with get_session() as session:
                result = await session.execute(
                    select(distinct(LocationCache.lat), LocationCache.lon)
                )
                locations = result.all()
            if not locations:
                logger.info("No locations in cache – skipping retrain")
                return
            # Retrain on first (primary) location – extend to all in production
            lat, lon = locations[0]
            await self.train_for_location(lat, lon)
        except Exception as e:
            logger.error("Scheduled retrain failed: %s", e)

    # ──────────────────────────────────────────────────────────────────────────
    # Status

    async def get_status(self) -> Dict[str, Any]:
        model = get_model()
        if model.is_trained:
            m = model.metadata
            return {
                "status": self._status.get("status", "completed"),
                "message": self._status.get("message", "Model ready"),
                "trained": True,
                "accuracy": m.accuracy,
                "f1_score": m.f1,
                "roc_auc": m.roc_auc,
                "last_trained": m.last_trained,
                "training_samples": m.training_samples,
                "hotspots_mapped": m.hotspots_mapped,
                "feature_importances": m.feature_importances,
            }
        return self._status

    async def is_trained(self) -> bool:
        return get_model().is_trained

    # ──────────────────────────────────────────────────────────────────────────
    # Helpers

    async def _estimate_hotspot_count(
        self, lat: float, lon: float, radius_km: float
    ) -> int:
        """Estimate hotspot count based on radius (1 km² grid cells)."""
        area = 3.14159 * radius_km ** 2
        return max(0, int(area * 2.5))  # ~2.5 hotspots per km²
