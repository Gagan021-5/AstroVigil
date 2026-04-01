from pydantic import BaseModel, Field
from typing import List, Optional

class Vector3(BaseModel):
    x: float
    y: float
    z: float

class TLE(BaseModel):
    line1: str
    line2: str

class StateVector(BaseModel):
    position: Vector3  # km
    velocity: Vector3  # km/s

class Satellite(BaseModel):
    id: str
    name: Optional[str] = None
    tle: Optional[TLE] = None
    state_vector: Optional[StateVector] = None
    mass_kg: float = 1000.0
    cross_section_m2: float = 2.0
    fuel_kg: float = 100.0

class OrbitPoint(BaseModel):
    t: float  # seconds since epoch
    x: float
    y: float
    z: float
    vx: float
    vy: float
    vz: float

class ConjunctionEvent(BaseModel):
    sat1_id: str
    sat2_id: str
    tca: float  # Time of closest approach (seconds since epoch or absolute timestamp)
    miss_distance_km: float
    probability: float

class ManeuverPlan(BaseModel):
    satellite_id: str
    delta_v: Vector3  # km/s
    burn_time_sec: float
    fuel_consumed_kg: float
    new_trajectory: List[OrbitPoint]
