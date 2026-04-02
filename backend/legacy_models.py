"""
Autonomous Constellation Manager - Pydantic Request/Response Models
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum


# ─── Enums ────────────────────────────────────────────────────────────
class ObjectType(str, Enum):
    SATELLITE = "satellite"
    DEBRIS = "debris"


class RiskLevel(str, Enum):
    GREEN = "green"
    YELLOW = "yellow"
    RED = "red"


# ─── Telemetry ────────────────────────────────────────────────────────
class StateVector(BaseModel):
    """ECI state vector for a single object."""
    object_id: int
    object_type: ObjectType = ObjectType.DEBRIS
    x: float = Field(..., description="ECI X position (m)")
    y: float = Field(..., description="ECI Y position (m)")
    z: float = Field(..., description="ECI Z position (m)")
    vx: float = Field(..., description="ECI X velocity (m/s)")
    vy: float = Field(..., description="ECI Y velocity (m/s)")
    vz: float = Field(..., description="ECI Z velocity (m/s)")


class TelemetryPayload(BaseModel):
    """Batch telemetry upload for all tracked objects."""
    epoch: float = Field(..., description="Epoch time (seconds since J2000)")
    states: List[StateVector]


class TelemetryResponse(BaseModel):
    ingested: int
    satellites: int
    debris: int


# ─── Maneuver ─────────────────────────────────────────────────────────
class BurnCommand(BaseModel):
    """A single burn command for a satellite."""
    satellite_id: int
    burn_time: float = Field(..., description="Scheduled burn epoch (s since J2000)")
    delta_vx: float = Field(0.0, description="Delta-V X component (m/s)")
    delta_vy: float = Field(0.0, description="Delta-V Y component (m/s)")
    delta_vz: float = Field(0.0, description="Delta-V Z component (m/s)")


class ManeuverScheduleRequest(BaseModel):
    burns: List[BurnCommand]


class BurnResult(BaseModel):
    satellite_id: int
    burn_time: float
    accepted: bool
    rejection_reason: Optional[str] = None
    fuel_remaining_kg: Optional[float] = None


class ManeuverScheduleResponse(BaseModel):
    scheduled: int
    rejected: int
    results: List[BurnResult]


# ─── Simulation ───────────────────────────────────────────────────────
class SimulationStepRequest(BaseModel):
    step_seconds: float = Field(60.0, gt=0, description="Time step in seconds")


class CollisionEvent(BaseModel):
    object_a_id: int
    object_b_id: int
    miss_distance_m: float
    tca: float
    risk_level: RiskLevel


class SimulationStepResponse(BaseModel):
    current_epoch: float
    step_seconds: float
    satellites_propagated: int
    debris_propagated: int
    maneuvers_executed: int
    collisions_detected: List[CollisionEvent]
    avoidance_burns_scheduled: int = 0
    blackout_preemptive_count: int = 0


# ─── Visualization ────────────────────────────────────────────────────
class SatelliteSnapshot(BaseModel):
    id: int
    lat: float
    lon: float
    alt: float
    vx: float
    vy: float
    vz: float
    fuel_remaining_kg: float
    last_burn_epoch: Optional[float] = None
    cooldown_remaining_s: float = 0.0
    trail: List[List[float]] = Field(default_factory=list,
        description="Historical [[lat,lon], ...] last 90 min")
    predicted: List[List[float]] = Field(default_factory=list,
        description="Predicted [[lat,lon], ...] next 90 min")


class ConjunctionInfo(BaseModel):
    satellite_id: int
    debris_id: int
    miss_distance_m: float
    tca: float
    bearing_deg: float
    risk_level: RiskLevel


class ManeuverBlock(BaseModel):
    satellite_id: int
    burn_start: float
    burn_end: float
    cooldown_end: float
    delta_v_mag: float
    conflicts: bool = False
    blackout_preemptive: bool = False  # True = burn was pre-emptively uplinked from last LOS window
    preempt_station: Optional[str] = None  # Ground station used for early uplink


class VisualizationSnapshot(BaseModel):
    epoch: float
    satellites: List[SatelliteSnapshot]
    debris_compressed: List[float] = Field(
        default_factory=list,
        description="Flattened [ID, Lat, Lon, Alt, ID, Lat, Lon, Alt, ...]")
    conjunctions: List[ConjunctionInfo] = Field(default_factory=list)
    maneuver_timeline: List[ManeuverBlock] = Field(default_factory=list)
    total_fuel_consumed_kg: float = 0.0
    total_collisions_avoided: int = 0
    queued_maneuvers_count: int = 0
    queued_preemptive_maneuvers_count: int = 0
    executed_preemptive_maneuvers_count: int = 0
    closest_object_distance_m: Optional[float] = None
    collision_trigger_distance_m: float = 100.0
