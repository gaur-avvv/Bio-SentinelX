"""
Pydantic schemas for request/response models.
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator


# ─── Inputs ───────────────────────────────────────────────────────────────────

class LocationQuery(BaseModel):
    latitude: float = Field(..., ge=-90, le=90, description="Decimal degrees latitude")
    longitude: float = Field(..., ge=-180, le=180, description="Decimal degrees longitude")
    radius_km: float = Field(10.0, ge=0.5, le=100.0, description="Radius in km")
    years_back: int = Field(10, ge=1, le=30, description="Years of historical data to pull")


class TrainingRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    radius_km: float = Field(15.0, ge=1.0, le=100.0)
    years_back: int = Field(10, ge=1, le=30)
    model_type: str = Field(
        "ensemble",
        description="Model type: 'rf' (Random Forest), 'xgb' (XGBoost), 'ensemble', 'lstm'",
    )


class PredictionRequest(BaseModel):
    """All hydro-meteorological & terrain factors affecting flood probability."""

    # Location
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    ward_id: Optional[str] = Field(None, description="Ward identifier for scoring")

    # Rainfall factors
    rainfall_1h_mm: float = Field(0.0, ge=0, description="Rainfall last 1 hour (mm)")
    rainfall_3h_mm: float = Field(0.0, ge=0, description="Rainfall last 3 hours (mm)")
    rainfall_6h_mm: float = Field(0.0, ge=0, description="Rainfall last 6 hours (mm)")
    rainfall_24h_mm: float = Field(0.0, ge=0, description="Rainfall last 24 hours (mm)")
    rainfall_48h_mm: float = Field(0.0, ge=0, description="Rainfall last 48 hours (mm)")
    rainfall_72h_mm: float = Field(0.0, ge=0, description="Rainfall last 72 hours (mm)")
    rainfall_intensity: float = Field(0.0, ge=0, description="Intensity mm/hr (peak)")
    antecedent_precip_index: float = Field(
        0.0, ge=0, description="API: weighted sum of prior-day rainfall"
    )
    # ─ River discharge (GloFAS) ───────────────────────────────────────────
    river_discharge_m3s: float = Field(
        0.0, ge=0, description="Observed/forecast GloFAS river discharge (m³/s)"
    )
    discharge_anomaly_ratio: float = Field(
        0.0, ge=0, description="Discharge / historical P50 (>1=above median, >4=extreme)"
    )

    # Terrain
    elevation_m: float = Field(0.0, description="DEM elevation in metres")
    slope_degrees: float = Field(0.0, ge=0, le=90, description="Surface slope °")
    aspect_degrees: float = Field(0.0, ge=0, le=360, description="Slope aspect °")
    curvature: float = Field(0.0, description="Surface curvature (positive=convex)")
    flow_accumulation: float = Field(0.0, ge=0, description="Upstream contributing area (cells)")
    stream_distance_m: float = Field(500.0, ge=0, description="Distance to nearest stream (m)")
    water_body_distance_m: float = Field(1000.0, ge=0, description="Distance to water body (m)")

    # Soil & Land Use
    soil_type_code: int = Field(2, ge=1, le=8, description="USDA hydrologic soil group 1-8")
    soil_moisture_pct: float = Field(30.0, ge=0, le=100, description="Current soil moisture %")
    lulc_code: int = Field(
        1, ge=1, le=10,
        description="Land use: 1=Urban, 2=Suburban, 3=Forest, 4=Agriculture, 5=Wetland, …",
    )
    impervious_surface_pct: float = Field(
        50.0, ge=0, le=100, description="% impervious cover in grid cell"
    )
    ndvi: float = Field(0.3, ge=-1, le=1, description="Normalized Difference Vegetation Index")

    # Drainage infrastructure
    drainage_capacity_pct: float = Field(
        70.0, ge=0, le=100, description="% of design capacity currently available"
    )
    drain_age_years: int = Field(20, ge=0, le=100, description="Average drain age (years)")
    drain_condition_score: float = Field(
        0.7, ge=0, le=1.0, description="Structural condition 0–1 (1=perfect)"
    )
    pump_stations_count: int = Field(0, ge=0, description="Active pump stations in 1km radius")
    sewer_overflow_events_30d: int = Field(
        0, ge=0, description="Overflow events in last 30 days"
    )

    # Meteorological
    temperature_c: float = Field(25.0, description="Air temperature °C")
    humidity_pct: float = Field(60.0, ge=0, le=100, description="Relative humidity %")
    wind_speed_ms: float = Field(5.0, ge=0, description="Wind speed m/s")
    wind_direction_deg: float = Field(180.0, ge=0, le=360, description="Wind direction °")
    evapotranspiration_mm: float = Field(
        3.0, ge=0, description="Daily evapotranspiration (mm)"
    )
    pressure_hpa: float = Field(1013.0, ge=800, le=1100, description="Barometric pressure hPa")

    # Derived & contextual
    population_density: float = Field(
        5000.0, ge=0, description="Population per km² in ward"
    )
    building_density_pct: float = Field(
        40.0, ge=0, le=100, description="% area covered by buildings"
    )
    green_space_pct: float = Field(
        15.0, ge=0, le=100, description="% area as parks/green space"
    )
    previous_flood_events_5y: int = Field(
        0, ge=0, description="Historical flood events in last 5 years"
    )
    month: int = Field(6, ge=1, le=12, description="Calendar month (1–12)")
    hour_of_day: int = Field(12, ge=0, le=23, description="Hour of day (UTC)")

    @field_validator("rainfall_intensity", mode="before")
    @classmethod
    def compute_intensity(cls, v, info):
        if v == 0 and info.data.get("rainfall_1h_mm", 0) > 0:
            return info.data["rainfall_1h_mm"]
        return v


class BulkPredictionRequest(BaseModel):
    locations: List[PredictionRequest] = Field(..., max_length=500)


# ─── Outputs ──────────────────────────────────────────────────────────────────

class RiskLevel(str):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    SAFE = "SAFE"


READINESS_GRADES = {
    "A": "Safe – Minimal risk, infrastructure adequate",
    "B": "Low – Minor preparatory actions advised",
    "C": "Medium – Deploy precautionary resources",
    "D": "High – Immediate mobilisation required",
    "F": "Critical – Evacuation / emergency response",
}


class PredictionResponse(BaseModel):
    latitude: float
    longitude: float
    flood_probability: float = Field(..., description="0–1 probability")
    flood_risk_level: str = Field(..., description="SAFE / LOW / MEDIUM / HIGH / CRITICAL")
    estimated_inundation_depth_m: float = Field(..., description="Expected water depth (m)")
    predicted_flood_onset_minutes: Optional[float] = Field(
        None, description="Minutes until flooding (nowcast mode)"
    )
    confidence: float = Field(..., description="Model confidence 0–1")
    contributing_factors: dict = Field(..., description="SHAP-style factor contributions")
    recommendation: str
    timestamp: datetime


class BulkPredictionResponse(BaseModel):
    predictions: List[PredictionResponse]
    total: int
    high_risk_count: int = 0
    critical_count: int = 0


class HotspotCell(BaseModel):
    lat: float
    lon: float
    cell_id: str
    flood_probability: float
    risk_level: str
    inundation_depth_m: float
    dominant_factor: str
    area_km2: float


class MicroHotspotResponse(BaseModel):
    centre_lat: float
    centre_lon: float
    radius_km: float
    grid_size_km: float
    total_cells_scanned: int
    hotspots_identified: int
    hotspots: List[HotspotCell]


class WardReadinessResponse(BaseModel):
    ward_id: str
    ward_name: Optional[str]
    lat: float
    lon: float
    readiness_grade: str = Field(..., description="A/B/C/D/F")
    readiness_description: str
    flood_probability: float
    risk_score: float = Field(..., description="Composite 0–100")
    inundation_risk_score: float
    drainage_health_score: float
    infrastructure_exposure_score: float
    recommended_actions: List[str]
    pre_position_resources: List[str]
    hotspot_count_in_ward: int


class TrainingStatusResponse(BaseModel):
    status: str
    message: Optional[str] = None
    trained: Optional[bool] = None
    accuracy: Optional[float] = None
    f1_score: Optional[float] = None
    roc_auc: Optional[float] = None
    last_trained: Optional[datetime] = None
    training_samples: Optional[int] = None
    hotspots_mapped: Optional[int] = None
    feature_importances: Optional[dict] = None


class HealthResponse(BaseModel):
    status: str
    model_trained: bool
    model_accuracy: Optional[float]
    last_trained: Optional[datetime]
    hotspots_mapped: int
    version: str
