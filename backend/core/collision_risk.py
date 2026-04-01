import time
from typing import Dict, Tuple

import numpy as np

from .conjunction import compute_miss_distance
from .propagator import propagate_rk4, tle_to_state_vector
from ..data import db
from ..models.satellite import Satellite

# Collision risk cache computed at startup (so the frontend poll stays fast).
RISK_CACHE: Dict[str, str] = {}
MIN_MISS_DISTANCE_CACHE_KM: Dict[str, float] = {}
_CACHE_READY: bool = False


def _states_from_catalog(sats: list[Satellite]) -> Tuple[np.ndarray, list[str]]:
    states = []
    valid_ids = []
    for sat in sats:
        sv = sat.state_vector
        if sv is None and sat.tle is not None:
            try:
                sv = tle_to_state_vector(sat.tle)
            except Exception:
                continue
        if sv is None:
            continue

        states.append(
            [
                sv.position.x,
                sv.position.y,
                sv.position.z,
                sv.velocity.x,
                sv.velocity.y,
                sv.velocity.z,
            ]
        )
        valid_ids.append(sat.id)

    if not states:
        return np.zeros((0, 6), dtype=float), []

    return np.asarray(states, dtype=float), valid_ids


def compute_and_store_collision_risk(
    *,
    time_window_hours: float = 24.0,
    dt_sec: float = 60.0,
    critical_km: float = 250.0,
    warning_km: float = 400.0,
) -> Dict[str, str]:
    """
    Computes a simple collision-risk classification by propagating the current catalog
    forward and taking the minimum miss distance each satellite achieves.

    This is intentionally lightweight and cached so `/api/visualization/snapshot`
    remains fast (frontend polls every ~1s).
    """
    global RISK_CACHE, MIN_MISS_DISTANCE_CACHE_KM, _CACHE_READY

    sats = db.get_all_satellites()
    states_array, valid_ids = _states_from_catalog(sats)
    N = len(valid_ids)

    if N < 2:
        RISK_CACHE = {s.id: "safe" for s in sats}
        MIN_MISS_DISTANCE_CACHE_KM = {}
        _CACHE_READY = True
        return RISK_CACHE

    steps = int((time_window_hours * 3600) / dt_sec)
    t0 = time.time()
    trajectories = propagate_rk4(states_array, t0=t0, dt=dt_sec, steps=steps)  # (steps, N, 6)

    # Track each satellite's best (smallest) miss distance against any other.
    min_to_any_km: Dict[str, float] = {sid: float("inf") for sid in valid_ids}

    for i in range(N):
        for j in range(i + 1, N):
            distances_km = compute_miss_distance(trajectories[:, i, :], trajectories[:, j, :])
            min_dist = float(np.min(distances_km))

            si = valid_ids[i]
            sj = valid_ids[j]
            if min_dist < min_to_any_km[si]:
                min_to_any_km[si] = min_dist
            if min_dist < min_to_any_km[sj]:
                min_to_any_km[sj] = min_dist

    RISK_CACHE = {}
    MIN_MISS_DISTANCE_CACHE_KM = {}
    for sid, min_dist in min_to_any_km.items():
        MIN_MISS_DISTANCE_CACHE_KM[sid] = min_dist
        if min_dist <= critical_km:
            RISK_CACHE[sid] = "critical"
        elif min_dist <= warning_km:
            RISK_CACHE[sid] = "warning"
        else:
            RISK_CACHE[sid] = "safe"

    _CACHE_READY = True
    return RISK_CACHE


def is_cache_ready() -> bool:
    return _CACHE_READY


def get_collision_risk(satellite_id: str) -> str:
    return RISK_CACHE.get(satellite_id, "safe")


def get_min_miss_distance_km(satellite_id: str) -> float | None:
    return MIN_MISS_DISTANCE_CACHE_KM.get(satellite_id)

