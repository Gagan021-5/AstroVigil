from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import numpy as np
import time

from ...models.satellite import OrbitPoint
from ...core.propagator import tle_to_state_vector, propagate_rk4
from ...data import db
from ...core.collision_risk import get_collision_risk

router = APIRouter(prefix="/api", tags=["Propagator"])

class PropagationRequest(BaseModel):
    satellite_id: str
    time_step_sec: float = 60.0 # Default 1 minute step
    duration_hours: float = 2.0 # Default propagate 2 hours

@router.post("/propagation/propagate")
def propagate_orbit(req: PropagationRequest):
    """Propagates a single satellite orbit using RK4 with J2 perturbation."""
    sats = db.get_all_satellites()
    sat = next((s for s in sats if s.id == req.satellite_id), None)
    
    if not sat:
        raise HTTPException(status_code=404, detail="Satellite not found")
        
    if not sat.state_vector and not sat.tle:
        raise HTTPException(status_code=400, detail="Satellite has no TLE or StateVector")
        
    # Get StateVector (Compute from TLE if missing)
    sv = sat.state_vector
    if not sv:
        try:
            sv = tle_to_state_vector(sat.tle)
            sat.state_vector = sv
            # Optionally update db here, but keeping stateless for this request
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"TLE conversion failed: {str(e)}")

    initial_state = np.array([[
        sv.position.x, sv.position.y, sv.position.z,
        sv.velocity.x, sv.velocity.y, sv.velocity.z
    ]])

    steps = int((req.duration_hours * 3600) / req.time_step_sec)
    if steps <= 0:
        raise HTTPException(status_code=400, detail="Duration must be positive")
        
    t0 = time.time()
    trajectories = propagate_rk4(initial_state, t0=t0, dt=req.time_step_sec, steps=steps)

    # Format output
    result = []
    current_time = t0
    for i in range(steps):
        state = trajectories[i, 0] # N=1, satellite 0
        result.append(OrbitPoint(
            t=current_time,
            x=state[0], y=state[1], z=state[2],
            vx=state[3], vy=state[4], vz=state[5]
        ))
        current_time += req.time_step_sec

    return {"trajectory": result}


def build_snapshot_payload() -> dict:
    """
    Shared snapshot dict for GET /api/catalog/snapshot and /ws/telemetry.
    Matches frontend Snapshot: ISO timestamp string, satellites, debris_cloud.
    """
    sats = db.get_all_satellites()
    t_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    snapshot_sats = []
    for sat in sats:
        sv = sat.state_vector
        if not sv and sat.tle:
            try:
                sv = tle_to_state_vector(sat.tle)
            except Exception:
                pass

        snapshot_sats.append(
            {
                "id": sat.id,
                "name": sat.name,
                "position": sv.position.model_dump() if sv else {"x": 0, "y": 0, "z": 0},
                "velocity": sv.velocity.model_dump() if sv else {"x": 0, "y": 0, "z": 0},
                "status": "nominal",
                "fuel": sat.fuel_kg / 5000.0,
                "collisionRisk": get_collision_risk(sat.id),
                "mass_kg": sat.mass_kg,
                "cross_section_m2": sat.cross_section_m2,
            }
        )

    return {
        "timestamp": t_iso,
        "satellites": snapshot_sats,
        "debris_cloud": [],
    }


@router.get("/catalog/snapshot")
def get_snapshot():
    """
    Returns current positions of all catalog satellites.
    If a satellite only has a TLE, it is converted to a StateVector first.
    """
    return build_snapshot_payload()
