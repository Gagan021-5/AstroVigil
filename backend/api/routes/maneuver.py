from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import numpy as np
import time

from ...models.satellite import ManeuverPlan, ConjunctionEvent
from ...core.propagator import tle_to_state_vector
from ...core import maneuver as maneuver_logic
from ...data import db

router = APIRouter(prefix="/api/maneuver", tags=["Maneuver"])

@router.post("/plan", response_model=ManeuverPlan)
def plan_maneuver(event: ConjunctionEvent):
    """Plans an avoidance maneuver given a conjunction event."""
    sats = db.get_all_satellites()
    
    # Maneuver the first satellite by default
    target_sat = next((s for s in sats if s.id == event.sat1_id), None)
    if not target_sat:
        raise HTTPException(status_code=404, detail=f"Satellite {event.sat1_id} not found")
        
    sv = target_sat.state_vector
    if not sv and target_sat.tle:
        try:
            sv = tle_to_state_vector(target_sat.tle)
        except Exception:
            raise HTTPException(status_code=500, detail="Cannot parse TLE for target satellite")
            
    if not sv:
        raise HTTPException(status_code=400, detail="Satellite state vector is missing")
        
    state = [
        sv.position.x, sv.position.y, sv.position.z,
        sv.velocity.x, sv.velocity.y, sv.velocity.z
    ]
    
    plan_details = maneuver_logic.plan_avoidance_maneuver(event, state, target_sat.mass_kg)
    
    # Create the Pydantic response
    plan = ManeuverPlan(
        satellite_id=target_sat.id,
        delta_v=plan_details["delta_v"],
        burn_time_sec=plan_details["burn_time_sec"],
        fuel_consumed_kg=plan_details["fuel_consumed_kg"],
        new_trajectory=[] # Trajectory omitted here for brevity
    )
    
    return plan

class ExecuteRequest(BaseModel):
    satellite_id: str
    fuel_consumed_kg: float

@router.post("/execute")
def execute_maneuver(req: ExecuteRequest):
    """Executes a maneuver, deducting fuel from the satellite."""
    sats = db.get_all_satellites()
    target_sat = next((s for s in sats if s.id == req.satellite_id), None)
    
    if not target_sat:
        raise HTTPException(status_code=404, detail="Satellite not found")
        
    target_sat.fuel_kg = max(0.0, target_sat.fuel_kg - req.fuel_consumed_kg)
    db.save_satellites(sats)
    
    return {"status": "success", "remaining_fuel": target_sat.fuel_kg}
