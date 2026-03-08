"""
Feature engineering pipeline.

Converts raw PredictionRequest fields into the full FEATURE_COLUMNS vector
expected by the ML model, adding engineered interaction features.
"""

import numpy as np
import pandas as pd
from models.schemas import PredictionRequest
from models.flood_model import FEATURE_COLUMNS


# Runoff curve numbers by LULC × Soil Group (simplified CN lookup)
_CN_TABLE = {
    # (lulc_code, soil_group): CN
    (1, 1): 98, (1, 2): 98, (1, 3): 98, (1, 4): 98,   # Impervious urban
    (2, 1): 77, (2, 2): 85, (2, 3): 90, (2, 4): 92,   # Suburban
    (3, 1): 36, (3, 2): 60, (3, 3): 73, (3, 4): 79,   # Forest
    (4, 1): 67, (4, 2): 77, (4, 3): 83, (4, 4): 87,   # Agriculture
    (5, 1): 30, (5, 2): 48, (5, 3): 65, (5, 4): 73,   # Wetland
}


def _curve_number(lulc: int, soil: int) -> float:
    """SCS Curve Number lookup (default 80 if not in table)."""
    soil_group = min(max(1, soil // 2 + 1), 4)
    return _CN_TABLE.get((lulc, soil_group), 80)


def _runoff_depth_mm(rainfall_mm: float, cn: float) -> float:
    """SCS-CN runoff depth (mm)."""
    if cn <= 0 or rainfall_mm <= 0:
        return 0.0
    S = (25400 / cn) - 254  # retention (mm)
    ia = 0.2 * S            # initial abstraction
    if rainfall_mm <= ia:
        return 0.0
    return (rainfall_mm - ia) ** 2 / (rainfall_mm - ia + S)


def build_feature_vector(req: PredictionRequest) -> pd.DataFrame:
    """
    Build a single-row DataFrame in FEATURE_COLUMNS order.
    """
    base = {
        "rainfall_1h_mm": req.rainfall_1h_mm,
        "rainfall_3h_mm": req.rainfall_3h_mm,
        "rainfall_6h_mm": req.rainfall_6h_mm,
        "rainfall_24h_mm": req.rainfall_24h_mm,
        "rainfall_48h_mm": req.rainfall_48h_mm,
        "rainfall_72h_mm": req.rainfall_72h_mm,
        "rainfall_intensity": req.rainfall_intensity,
        "antecedent_precip_index": req.antecedent_precip_index,
        "elevation_m": req.elevation_m,
        "slope_degrees": req.slope_degrees,
        "aspect_degrees": req.aspect_degrees,
        "curvature": req.curvature,
        "flow_accumulation": req.flow_accumulation,
        "stream_distance_m": req.stream_distance_m,
        "water_body_distance_m": req.water_body_distance_m,
        "soil_type_code": req.soil_type_code,
        "soil_moisture_pct": req.soil_moisture_pct,
        "lulc_code": req.lulc_code,
        "impervious_surface_pct": req.impervious_surface_pct,
        "ndvi": req.ndvi,
        "drainage_capacity_pct": req.drainage_capacity_pct,
        "drain_age_years": req.drain_age_years,
        "drain_condition_score": req.drain_condition_score,
        "pump_stations_count": req.pump_stations_count,
        "sewer_overflow_events_30d": req.sewer_overflow_events_30d,
        "temperature_c": req.temperature_c,
        "humidity_pct": req.humidity_pct,
        "wind_speed_ms": req.wind_speed_ms,
        "wind_direction_deg": req.wind_direction_deg,
        "evapotranspiration_mm": req.evapotranspiration_mm,
        "pressure_hpa": req.pressure_hpa,
        "population_density": req.population_density,
        "building_density_pct": req.building_density_pct,
        "green_space_pct": req.green_space_pct,
        "previous_flood_events_5y": req.previous_flood_events_5y,
        "month": req.month,
        "hour_of_day": req.hour_of_day,
    }

    # ── Engineered features ─────────────────────────────────────────────────
    cn = _curve_number(req.lulc_code, req.soil_type_code)
    runoff_mm = _runoff_depth_mm(req.rainfall_24h_mm, cn)
    runoff_coeff = runoff_mm / max(req.rainfall_24h_mm, 1.0)

    # Ratio of short-term to long-term rainfall (flash flood indicator)
    rain_acc_ratio = req.rainfall_1h_mm / max(req.rainfall_24h_mm, 1.0)

    # Drainage stress: how close to capacity given runoff
    effective_capacity = req.drainage_capacity_pct * req.drain_condition_score / 100
    drainage_stress = min(runoff_coeff / max(effective_capacity, 0.01), 3.0)

    # Terrain vulnerability: low elevation + high flow accumulation + low slope
    terrain_vuln = (
        (1 / max(req.elevation_m + 1, 1)) *
        np.log1p(req.flow_accumulation) *
        (1 / max(req.slope_degrees + 0.1, 0.1))
    )

    # Composite risk index (0–10)
    composite = (
        0.25 * min(req.rainfall_24h_mm / 100, 1.0) * 10 +
        0.20 * drainage_stress * 10 / 3 +
        0.20 * (req.soil_moisture_pct / 100) * 10 +
        0.15 * min(terrain_vuln, 1.0) * 10 +
        0.10 * (req.impervious_surface_pct / 100) * 10 +
        0.10 * (req.previous_flood_events_5y / max(req.previous_flood_events_5y + 1, 1)) * 10
    )

    base.update(
        {
            "rain_accumulation_ratio": round(rain_acc_ratio, 6),
            "runoff_coefficient": round(runoff_coeff, 6),
            "drainage_stress": round(drainage_stress, 6),
            "terrain_vulnerability": round(float(terrain_vuln), 6),
            "composite_risk_index": round(composite, 6),
        }
    )

    return pd.DataFrame([base])[FEATURE_COLUMNS]


def build_feature_dataframe(requests: list[PredictionRequest]) -> pd.DataFrame:
    """Build a multi-row DataFrame for batch prediction."""
    frames = [build_feature_vector(r) for r in requests]
    return pd.concat(frames, ignore_index=True)


def engineer_training_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Apply the same feature engineering to a training DataFrame
    that already contains the raw columns.
    """
    cn = df.apply(
        lambda r: _curve_number(int(r["lulc_code"]), int(r["soil_type_code"])), axis=1
    )
    runoff = df.apply(
        lambda r: _runoff_depth_mm(r["rainfall_24h_mm"], _curve_number(
            int(r["lulc_code"]), int(r["soil_type_code"])
        )),
        axis=1,
    )

    df = df.copy()
    df["runoff_coefficient"] = runoff / df["rainfall_24h_mm"].clip(lower=1)
    df["rain_accumulation_ratio"] = df["rainfall_1h_mm"] / df["rainfall_24h_mm"].clip(lower=1)
    effective_cap = df["drainage_capacity_pct"] * df["drain_condition_score"] / 100
    df["drainage_stress"] = (df["runoff_coefficient"] / effective_cap.clip(lower=0.01)).clip(upper=3)
    df["terrain_vulnerability"] = (
        1 / (df["elevation_m"] + 1) *
        np.log1p(df["flow_accumulation"]) *
        1 / (df["slope_degrees"] + 0.1)
    ).clip(upper=5)

    df["composite_risk_index"] = (
        0.25 * (df["rainfall_24h_mm"] / 100).clip(upper=1) * 10 +
        0.20 * df["drainage_stress"] * 10 / 3 +
        0.20 * (df["soil_moisture_pct"] / 100) * 10 +
        0.15 * df["terrain_vulnerability"].clip(upper=1) * 10 +
        0.10 * (df["impervious_surface_pct"] / 100) * 10 +
        0.10 * (df["previous_flood_events_5y"] / (df["previous_flood_events_5y"] + 1)) * 10
    )

    return df[FEATURE_COLUMNS]
