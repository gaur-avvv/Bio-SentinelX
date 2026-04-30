"""
Unit tests for Pydantic v2 schema validators.
No running app required — pure in-process validation.
"""

import pytest
from pydantic import ValidationError

import os
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test_schemas.db")

from models.schemas import (
    PredictionRequest,
    BulkPredictionRequest,
    TrainingRequest,
    LocationQuery,
)


# ─── PredictionRequest ────────────────────────────────────────────────────────

class TestPredictionRequest:
    BASE = {"latitude": 19.076, "longitude": 72.877}

    def test_valid_minimal(self):
        req = PredictionRequest(**self.BASE)
        assert req.latitude == 19.076
        assert req.longitude == 72.877

    def test_defaults_are_sane(self):
        req = PredictionRequest(**self.BASE)
        assert 0 <= req.drainage_capacity_pct <= 100
        assert 0 <= req.soil_moisture_pct <= 100
        assert req.month == 6  # default

    def test_latitude_out_of_range_raises(self):
        with pytest.raises(ValidationError):
            PredictionRequest(latitude=91.0, longitude=72.877)

    def test_longitude_out_of_range_raises(self):
        with pytest.raises(ValidationError):
            PredictionRequest(latitude=19.0, longitude=181.0)

    def test_negative_rainfall_raises(self):
        with pytest.raises(ValidationError):
            PredictionRequest(**self.BASE, rainfall_24h_mm=-1.0)

    def test_soil_moisture_over_100_raises(self):
        with pytest.raises(ValidationError):
            PredictionRequest(**self.BASE, soil_moisture_pct=101.0)

    def test_month_out_of_range_raises(self):
        with pytest.raises(ValidationError):
            PredictionRequest(**self.BASE, month=13)

    def test_intensity_auto_computed(self):
        """If rainfall_intensity=0 but rainfall_1h_mm>0, it should be auto-filled."""
        req = PredictionRequest(**self.BASE, rainfall_1h_mm=25.0)
        assert req.rainfall_intensity == 25.0

    def test_optional_ward_id(self):
        req = PredictionRequest(**self.BASE, ward_id="WARD-001")
        assert req.ward_id == "WARD-001"

    def test_all_rainfall_fields_accepted(self):
        req = PredictionRequest(
            **self.BASE,
            rainfall_1h_mm=10.0,
            rainfall_3h_mm=25.0,
            rainfall_6h_mm=40.0,
            rainfall_24h_mm=80.0,
            rainfall_48h_mm=120.0,
            rainfall_72h_mm=150.0,
        )
        assert req.rainfall_72h_mm == 150.0


# ─── BulkPredictionRequest ────────────────────────────────────────────────────

class TestBulkPredictionRequest:
    SINGLE = {"latitude": 19.076, "longitude": 72.877}

    def test_valid_single_location(self):
        req = BulkPredictionRequest(locations=[self.SINGLE])
        assert len(req.locations) == 1

    def test_valid_multiple_locations(self):
        locs = [{"latitude": 19.0 + i * 0.01, "longitude": 72.877} for i in range(10)]
        req = BulkPredictionRequest(locations=locs)
        assert len(req.locations) == 10

    def test_over_500_raises(self):
        locs = [{"latitude": 19.0, "longitude": 72.877}] * 501
        with pytest.raises(ValidationError):
            BulkPredictionRequest(locations=locs)


# ─── TrainingRequest ──────────────────────────────────────────────────────────

class TestTrainingRequest:
    def test_valid_defaults(self):
        req = TrainingRequest(latitude=19.076, longitude=72.877)
        assert req.radius_km == 15.0
        assert req.years_back == 10
        assert req.model_type == "ensemble"

    def test_invalid_model_type_accepted(self):
        # model_type is a free-form string — any value passes schema
        req = TrainingRequest(latitude=19.076, longitude=72.877, model_type="custom")
        assert req.model_type == "custom"

    def test_years_back_out_of_range_raises(self):
        with pytest.raises(ValidationError):
            TrainingRequest(latitude=19.076, longitude=72.877, years_back=31)

    def test_radius_too_large_raises(self):
        with pytest.raises(ValidationError):
            TrainingRequest(latitude=19.076, longitude=72.877, radius_km=200.0)


# ─── LocationQuery ────────────────────────────────────────────────────────────

class TestLocationQuery:
    def test_valid(self):
        q = LocationQuery(latitude=12.97, longitude=77.59)
        assert q.radius_km == 10.0  # default
        assert q.years_back == 10   # default

    def test_radius_too_small_raises(self):
        with pytest.raises(ValidationError):
            LocationQuery(latitude=12.97, longitude=77.59, radius_km=0.1)

    def test_radius_too_large_raises(self):
        with pytest.raises(ValidationError):
            LocationQuery(latitude=12.97, longitude=77.59, radius_km=101.0)
