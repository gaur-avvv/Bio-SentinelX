"""
Core flood prediction ML model.

Architecture: Stacked ensemble
  - Random Forest (interpretable, handles missing data)
  - XGBoost (high accuracy on tabular hydro data)
  - LightGBM (fast, handles large grids)
  - Meta-learner: Logistic Regression (calibrated probabilities)

Training targets:
  - Binary: flood / no-flood (threshold ~10cm inundation)
  - Regression: inundation depth (metres)
"""

import logging
import os
import pickle
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor, StackingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    roc_auc_score,
    mean_absolute_error,
)
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer

try:
    import xgboost as xgb
    XGB_AVAILABLE = True
except ImportError:
    XGB_AVAILABLE = False

try:
    import lightgbm as lgb
    LGB_AVAILABLE = True
except ImportError:
    LGB_AVAILABLE = False

logger = logging.getLogger(__name__)

# ── Parallelism budget ────────────────────────────────────────────────────────
# n_jobs=-1 inside a StackingClassifier whose base estimators also use n_jobs=-1
# multiplies thread count across CV folds → RAM spike → OOM on Codespace.
# Cap at 2 leaf-level threads; StackingClassifier itself is serial (n_jobs=1)
# so folds never run simultaneously.  Override with FLOOD_N_JOBS env var.
_N_JOBS: int = int(os.environ.get("FLOOD_N_JOBS", "2"))

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "saved_models")
os.makedirs(MODEL_DIR, exist_ok=True)

CLASSIFIER_PATH = os.path.join(MODEL_DIR, "flood_classifier.pkl")
REGRESSOR_PATH = os.path.join(MODEL_DIR, "depth_regressor.pkl")
METADATA_PATH = os.path.join(MODEL_DIR, "metadata.pkl")

# All features in canonical order (must match feature_engineering output)
FEATURE_COLUMNS = [
    "rainfall_1h_mm", "rainfall_3h_mm", "rainfall_6h_mm",
    "rainfall_24h_mm", "rainfall_48h_mm", "rainfall_72h_mm",
    "rainfall_intensity", "antecedent_precip_index",
    # ── River discharge (GloFAS ensemble) ────────────────────────────────────
    # river_discharge_m3s : raw observed/forecast median discharge (m³/s)
    # discharge_anomaly_ratio : discharge / historical_p50. >1 = above median,
    #                           >2 = significant, >4 = extreme.
    # These two features provide the model with real hydrograph state,
    # dramatically improving flood detection in catchment-driven events.
    "river_discharge_m3s", "discharge_anomaly_ratio",
    "elevation_m", "slope_degrees", "aspect_degrees", "curvature",
    "flow_accumulation", "stream_distance_m", "water_body_distance_m",
    "soil_type_code", "soil_moisture_pct", "lulc_code",
    "impervious_surface_pct", "ndvi",
    "drainage_capacity_pct", "drain_age_years", "drain_condition_score",
    "pump_stations_count", "sewer_overflow_events_30d",
    "temperature_c", "humidity_pct", "wind_speed_ms",
    "wind_direction_deg", "evapotranspiration_mm", "pressure_hpa",
    "population_density", "building_density_pct", "green_space_pct",
    "previous_flood_events_5y", "month", "hour_of_day",
    # Engineered
    "rain_accumulation_ratio", "runoff_coefficient", "drainage_stress",
    "terrain_vulnerability", "composite_risk_index",
]


@dataclass
class ModelMetadata:
    trained: bool = False
    accuracy: float = 0.0
    f1: float = 0.0
    roc_auc: float = 0.0
    mae_depth: float = 0.0
    last_trained: Optional[datetime] = None
    training_samples: int = 0
    hotspots_mapped: int = 0
    feature_importances: dict = field(default_factory=dict)
    location_lat: Optional[float] = None
    location_lon: Optional[float] = None


class FloodMLModel:
    """
    Stacked ensemble classifier for flood probability + depth regressor.
    """

    def __init__(self):
        self.classifier: Optional[Pipeline] = None
        self.depth_regressor: Optional[Pipeline] = None
        self.metadata = ModelMetadata()
        self._load_if_exists()

    # ──────────────────────────────────────────────────────────────────────────
    # Build

    def _build_classifier(self) -> Pipeline:
        estimators = [
            (
                "rf",
                RandomForestClassifier(
                    n_estimators=100,
                    max_depth=20,
                    min_samples_split=10,
                    class_weight="balanced",
                    random_state=42,
                    n_jobs=_N_JOBS,            # capped – see _N_JOBS constant
                ),
            ),
        ]
        if XGB_AVAILABLE:
            estimators.append(
                (
                    "xgb",
                    xgb.XGBClassifier(
                        n_estimators=100,
                        learning_rate=0.1,
                        max_depth=5,
                        subsample=0.8,
                        colsample_bytree=0.8,
                        scale_pos_weight=3,
                        eval_metric="logloss",
                        random_state=42,
                        n_jobs=_N_JOBS,
                        nthread=_N_JOBS,       # XGBoost thread cap
                    ),
                )
            )
        if LGB_AVAILABLE:
            estimators.append(
                (
                    "lgb",
                    lgb.LGBMClassifier(
                        n_estimators=100,
                        learning_rate=0.1,
                        num_leaves=31,
                        class_weight="balanced",
                        random_state=42,
                        n_jobs=_N_JOBS,
                        num_threads=_N_JOBS,   # LightGBM thread cap
                        verbose=-1,
                    ),
                )
            )

        stacking = StackingClassifier(
            estimators=estimators,
            final_estimator=LogisticRegression(C=1.0, max_iter=1000),
            cv=StratifiedKFold(n_splits=3, shuffle=True, random_state=42),
            stack_method="predict_proba",
            # n_jobs=1: folds run serially; base estimators already use _N_JOBS
            # threads each, so parallel folds would multiply RAM consumption.
            n_jobs=1,
        )

        # cv=2: one less calibration fit per model
        calibrated = CalibratedClassifierCV(stacking, method="isotonic", cv=2)

        return Pipeline(
            steps=[
                ("imputer", SimpleImputer(strategy="median")),
                ("scaler", StandardScaler()),
                ("model", calibrated),
            ]
        )

    def _build_depth_regressor(self) -> Pipeline:
        base = RandomForestRegressor(
            n_estimators=100,
            max_depth=15,
            random_state=42,
            n_jobs=_N_JOBS,
        )
        if XGB_AVAILABLE:
            base = xgb.XGBRegressor(
                n_estimators=100,
                learning_rate=0.1,
                max_depth=5,
                subsample=0.8,
                random_state=42,
                n_jobs=_N_JOBS,
                nthread=_N_JOBS,
            )
        return Pipeline(
            steps=[
                ("imputer", SimpleImputer(strategy="median")),
                ("scaler", StandardScaler()),
                ("model", base),
            ]
        )

    # ──────────────────────────────────────────────────────────────────────────
    # Train

    # Maximum rows used for training – keeps wall-clock time predictable on
    # resource-constrained cloud instances (≈3–5 min for the stacked ensemble).
    _MAX_TRAIN_ROWS = 50_000

    def train(self, X: pd.DataFrame, y_flood: pd.Series, y_depth: pd.Series) -> ModelMetadata:
        """Train both classifier and depth regressor, return metrics."""
        logger.info("Training flood classifier on %d samples…", len(X))

        # Sub-sample large datasets to keep training time bounded.
        if len(X) > self._MAX_TRAIN_ROWS:
            logger.info(
                "Dataset too large (%d rows) – stratified sub-sampling to %d rows",
                len(X), self._MAX_TRAIN_ROWS,
            )
            from sklearn.model_selection import train_test_split
            X, _, y_flood, _, y_depth, _ = train_test_split(
                X, y_flood, y_depth,
                train_size=self._MAX_TRAIN_ROWS,
                stratify=y_flood,
                random_state=42,
            )

        X_clean = X[FEATURE_COLUMNS].copy()

        # ── Classifier ──
        self.classifier = self._build_classifier()
        self.classifier.fit(X_clean, y_flood.values)

        preds = self.classifier.predict(X_clean)
        probs = self.classifier.predict_proba(X_clean)[:, 1]

        acc = accuracy_score(y_flood, preds)
        f1 = f1_score(y_flood, preds, zero_division=0)
        auc = roc_auc_score(y_flood, probs) if y_flood.nunique() > 1 else 0.5

        logger.info("Classifier: acc=%.3f  f1=%.3f  auc=%.3f", acc, f1, auc)

        # ── Depth Regressor ──
        self.depth_regressor = self._build_depth_regressor()
        flood_mask = (y_flood == 1).values
        if flood_mask.sum() > 10:
            self.depth_regressor.fit(X_clean[flood_mask], y_depth.values[flood_mask])
            depth_preds = self.depth_regressor.predict(X_clean[flood_mask])
            mae = mean_absolute_error(y_depth.values[flood_mask], depth_preds)
        else:
            # Fallback: train on all with depth=0 for no-flood
            self.depth_regressor.fit(X_clean, y_depth.values)
            mae = mean_absolute_error(y_depth, self.depth_regressor.predict(X_clean))

        logger.info("Depth regressor MAE: %.3f m", mae)

        # ── Feature importances (RF only) ──
        # Pipeline: imputer → scaler → model (CalibratedClassifierCV)
        # CalibratedClassifierCV(cv=2) stores *fitted* clones in
        # .calibrated_classifiers_[fold].estimator  (a fitted StackingClassifier)
        # StackingClassifier.estimators_ → [(name, fitted_estimator), …]
        try:
            calibrated_cv = self.classifier.named_steps["model"]
            stacking = calibrated_cv.calibrated_classifiers_[0].estimator
            rf_model = stacking.estimators_[0][1]   # ('rf', RandomForestClassifier)
            importances = dict(zip(FEATURE_COLUMNS, rf_model.feature_importances_))
        except Exception as exc:
            logger.debug("Feature importances unavailable: %s", exc)
            importances = {}

        self.metadata = ModelMetadata(
            trained=True,
            accuracy=round(acc, 4),
            f1=round(f1, 4),
            roc_auc=round(auc, 4),
            mae_depth=round(mae, 4),
            last_trained=datetime.utcnow(),
            training_samples=len(X),
            feature_importances={
                k: round(float(v), 6)
                for k, v in sorted(importances.items(), key=lambda x: -x[1])[:15]
            },
        )
        self._save()
        return self.metadata

    # ──────────────────────────────────────────────────────────────────────────
    # Predict

    def predict(self, X: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Returns:
          - flood_prob  (N,)  0–1
          - flood_class (N,)  0 or 1
          - depth_pred  (N,)  metres
        """
        if self.classifier is None:
            raise RuntimeError("Model not trained.")

        X_clean = X[FEATURE_COLUMNS].copy()
        flood_prob = self.classifier.predict_proba(X_clean)[:, 1]
        flood_class = (flood_prob >= 0.5).astype(int)

        depth_pred = np.zeros(len(X))
        flood_mask = flood_class == 1
        if flood_mask.any() and self.depth_regressor is not None:
            ml_depth = np.maximum(0, self.depth_regressor.predict(X_clean[flood_mask]))

            # Physics fallback: SCS rational method
            # Uses the same formula as training label generation so the result
            # is always physically plausible even when the ML regressor
            # under-predicts (e.g. out-of-distribution drainage_capacity values).
            r24 = X_clean.loc[flood_mask, "rainfall_24h_mm"].values
            drain = X_clean.loc[flood_mask, "drainage_capacity_pct"].values
            cond  = X_clean.loc[flood_mask, "drain_condition_score"].values
            effective_cap = (drain * cond) / 100.0
            physics_depth = np.clip(
                r24 / 100.0 * np.maximum(0.0, 1.0 - effective_cap), 0.0, 3.0
            )

            # Blend: take the larger of ML and physics, scaled by flood probability
            depth_pred[flood_mask] = np.maximum(ml_depth, physics_depth * flood_prob[flood_mask])

        return flood_prob, flood_class, depth_pred

    # ──────────────────────────────────────────────────────────────────────────
    # Persistence

    def _save(self):
        with open(CLASSIFIER_PATH, "wb") as f:
            pickle.dump(self.classifier, f)
        with open(REGRESSOR_PATH, "wb") as f:
            pickle.dump(self.depth_regressor, f)
        with open(METADATA_PATH, "wb") as f:
            pickle.dump(self.metadata, f)
        logger.info("Model saved to %s", MODEL_DIR)

    def _load_if_exists(self):
        if all(os.path.exists(p) for p in [CLASSIFIER_PATH, REGRESSOR_PATH, METADATA_PATH]):
            try:
                with open(CLASSIFIER_PATH, "rb") as f:
                    self.classifier = pickle.load(f)
                with open(REGRESSOR_PATH, "rb") as f:
                    self.depth_regressor = pickle.load(f)
                with open(METADATA_PATH, "rb") as f:
                    self.metadata = pickle.load(f)
                logger.info(
                    "Loaded existing model (acc=%.3f, trained=%s)",
                    self.metadata.accuracy,
                    self.metadata.last_trained,
                )
            except Exception as e:
                logger.warning("Failed to load saved model: %s", e)
                self.metadata = ModelMetadata()

    @property
    def is_trained(self) -> bool:
        return self.metadata.trained and self.classifier is not None


# Singleton
_model_instance: Optional[FloodMLModel] = None


def get_model() -> FloodMLModel:
    global _model_instance
    if _model_instance is None:
        _model_instance = FloodMLModel()
    return _model_instance
