"""
SQLAlchemy ORM models for flood observation data.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import Float, Integer, String, DateTime, Boolean, Index
from sqlalchemy.orm import Mapped, mapped_column

from database.db import Base


class ObservationRecord(Base):
    """Hourly hydro-meteorological observation for a location."""

    __tablename__ = "observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lat: Mapped[float] = mapped_column(Float, nullable=False, index=True)
    lon: Mapped[float] = mapped_column(Float, nullable=False, index=True)
    date_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    # Core fields
    rainfall_1h_mm: Mapped[float] = mapped_column(Float, default=0.0)
    rainfall_24h_mm: Mapped[float] = mapped_column(Float, default=0.0)
    river_discharge_m3s: Mapped[float] = mapped_column(Float, default=0.0)
    discharge_anomaly_ratio: Mapped[float] = mapped_column(Float, default=0.0)
    flood_occurred: Mapped[int] = mapped_column(Integer, default=0)
    inundation_depth_m: Mapped[float] = mapped_column(Float, default=0.0)

    # Composite index for fast geo+time lookups
    __table_args__ = (
        Index("ix_obs_latlon_time", "lat", "lon", "date_time"),
    )


class LocationCache(Base):
    """Tracks which locations have been ingested, for scheduler."""

    __tablename__ = "location_cache"

    lat: Mapped[float] = mapped_column(Float, primary_key=True)
    lon: Mapped[float] = mapped_column(Float, primary_key=True)
    last_synced: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    data_source: Mapped[str] = mapped_column(String(50), default="open-meteo")
    total_records: Mapped[int] = mapped_column(Integer, default=0)


class FloodEvent(Base):
    """Verified historical flood events (from municipal records / news)."""

    __tablename__ = "flood_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    event_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    ward_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    inundation_depth_m: Mapped[float] = mapped_column(Float, default=0.0)
    area_flooded_km2: Mapped[float] = mapped_column(Float, default=0.0)
    duration_hours: Mapped[float] = mapped_column(Float, default=1.0)
    source: Mapped[str] = mapped_column(String(200), default="synthetic")
    verified: Mapped[bool] = mapped_column(Boolean, default=False)

    __table_args__ = (
        Index("ix_flood_latlon", "lat", "lon"),
    )
