from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
import numpy as np

from ...models.satellite import ConjunctionEvent
from ...core.propagator import tle_to_state_vector, propagate_rk4
from ...core.conjunction import compute_miss_distance, find_tca, collision_probability
from ...data import db
import time

router = APIRouter(prefix="/api/conjunction", tags=["Conjunction"])

class AssessRequest(BaseModel):
    satellite_id: str
    time_window_hours: float = 24.0

def _get_states(satellites):
    states = []
    valid_ids = []
    for sat in satellites:
        sv = sat.state_vector
        if not sv and sat.tle:
            try:
                sv = tle_to_state_vector(sat.tle)
            except:
                continue
        if sv:
            states.append([
                sv.position.x, sv.position.y, sv.position.z,
                sv.velocity.x, sv.velocity.y, sv.velocity.z
            ])
            valid_ids.append(sat.id)
            
    return np.array(states), valid_ids

@router.post("/assess", response_model=List[ConjunctionEvent])
def assess_satellite_risk(req: AssessRequest):
    """Assesses conjunction risk for a specific satellite against all others within a time frame."""
    sats = db.get_all_satellites()
    target_idx = next((i for i, s in enumerate(sats) if s.id == req.satellite_id), -1)
    
    if target_idx == -1:
        raise HTTPException(status_code=404, detail="Satellite not found")
        
    states_array, valid_ids = _get_states(sats)
    
    try:
        t_target_idx = valid_ids.index(req.satellite_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Satellite lacks valid state for projection")
        
    # Propagate all satellites
    dt = 60.0
    steps = int((req.time_window_hours * 3600) / dt)
    t0 = time.time()
    
    trajectories = propagate_rk4(states_array, t0, dt, steps)
    times = t0 + np.arange(steps) * dt
    
    events = []
    target_trajectory = trajectories[:, t_target_idx, :]
    
    for i, other_id in enumerate(valid_ids):
        if i == t_target_idx:
            continue
            
        other_trajectory = trajectories[:, i, :]
        distances = compute_miss_distance(target_trajectory, other_trajectory)
        tca, min_dist, _ = find_tca(times, distances, req.time_window_hours)
        
        if tca != -1 and min_dist < 400.0:  # Hackathon demo: show any close approach within threshold
            prob = collision_probability(min_dist)
            events.append(ConjunctionEvent(
                sat1_id=req.satellite_id,
                sat2_id=other_id,
                tca=tca,
                miss_distance_km=float(min_dist),
                probability=prob
            ))
            
    return events

@router.get("/all", response_model=List[ConjunctionEvent])
def get_all_conjunctions(time_window_hours: float = 24.0):
    """Assess all pairs in the catalog (N^2 complexity, but N is small here)."""
    sats = db.get_all_satellites()
    states_array, valid_ids = _get_states(sats)
    
    dt = 60.0
    steps = int((time_window_hours * 3600) / dt)
    t0 = time.time()
    
    trajectories = propagate_rk4(states_array, t0, dt, steps)
    times = t0 + np.arange(steps) * dt
    
    events = []
    N = len(valid_ids)
    
    # Check upper triangle
    for i in range(N):
        for j in range(i + 1, N):
            traj_i = trajectories[:, i, :]
            traj_j = trajectories[:, j, :]
            distances = compute_miss_distance(traj_i, traj_j)
            tca, min_dist, _ = find_tca(times, distances, time_window_hours)
            
            if tca != -1 and min_dist < 400.0: # Hackathon demo: show any close approach within threshold
                prob = collision_probability(min_dist)
                events.append(ConjunctionEvent(
                    sat1_id=valid_ids[i],
                    sat2_id=valid_ids[j],
                    tca=tca,
                    miss_distance_km=float(min_dist),
                    probability=prob
                ))
    
    return events
