"""
Autonomous Constellation Manager - Fuel & Propulsion Model
Tsiolkovsky equation, cooldown enforcement, ground station line-of-sight,
and pre-emptive blackout window search.
"""
import numpy as np
from typing import Optional, Tuple
from .config import (
    ISP_S, G0, MAX_DELTA_V, COOLDOWN_S, SIGNAL_LATENCY_S,
    GROUND_STATIONS, R_EARTH, OMEGA_EARTH, LOS_SEARCH_STEP_S,
    LOOKAHEAD_DURATION_S
)
from .physics_engine import eci_to_geodetic, propagate


# ─── Propulsion Physics ──────────────────────────────────────────────────────

def tsiolkovsky_fuel_consumed(delta_v: float, mass_before: float) -> float:
    """
    Calculate fuel mass consumed for a given delta-v using Tsiolkovsky equation.

    Δm = m₀ * (1 - e^(-Δv / (Isp * g₀)))

    Args:
        delta_v: Magnitude of velocity change (m/s)
        mass_before: Spacecraft mass before burn (kg)

    Returns:
        Fuel mass consumed (kg)
    """
    ve = ISP_S * G0  # Effective exhaust velocity
    mass_ratio = np.exp(-delta_v / ve)
    return mass_before * (1.0 - mass_ratio)


# ─── Ground Station Visibility ───────────────────────────────────────────────

def _elevation_from_station(sat_lat: float, sat_lon: float, sat_alt: float,
                              gs: dict) -> float:
    """
    Compute elevation angle (degrees) of satellite as seen from a ground station.
    Uses spherical Earth approximation.
    """
    dlat = np.radians(sat_lat - gs["lat"])
    dlon = np.radians(sat_lon - gs["lon"])
    lat1 = np.radians(gs["lat"])
    lat2 = np.radians(sat_lat)

    a = (np.sin(dlat / 2) ** 2 +
         np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2)
    central_angle = 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))

    r_sat = R_EARTH + sat_alt
    elevation = np.arctan2(
        np.cos(central_angle) - R_EARTH / r_sat,
        np.sin(central_angle)
    )
    return np.degrees(elevation)


def has_line_of_sight(sat_pos_eci: np.ndarray, epoch_s: float) -> bool:
    """
    Check if the satellite has line-of-sight to at least one ground station
    using minimum elevation angle constraint.

    Args:
        sat_pos_eci: Satellite ECI position [x, y, z] (meters)
        epoch_s: Current epoch (seconds)

    Returns:
        True if satellite is visible from at least one ground station
    """
    sat_lat, sat_lon, sat_alt = eci_to_geodetic(sat_pos_eci, epoch_s)
    for gs in GROUND_STATIONS:
        if _elevation_from_station(sat_lat, sat_lon, sat_alt, gs) >= gs["min_elev"]:
            return True
    return False


def get_visible_station(sat_pos_eci: np.ndarray, epoch_s: float) -> Optional[str]:
    """
    Return the name of the first ground station with line-of-sight, or None if
    the satellite is in a blackout zone.

    Args:
        sat_pos_eci: Satellite ECI position [x, y, z] (meters)
        epoch_s: Current epoch (seconds)

    Returns:
        Station name string, or None if in blackout
    """
    sat_lat, sat_lon, sat_alt = eci_to_geodetic(sat_pos_eci, epoch_s)
    for gs in GROUND_STATIONS:
        if _elevation_from_station(sat_lat, sat_lon, sat_alt, gs) >= gs["min_elev"]:
            return gs["name"]
    return None


def find_next_los_window(
    sat_state: np.ndarray,
    state_epoch: float,
    start_epoch: float,
    earliest_epoch: Optional[float] = None,
    search_duration_s: float = LOOKAHEAD_DURATION_S,
    step_s: float = LOS_SEARCH_STEP_S
) -> Tuple[Optional[float], Optional[float], Optional[str]]:
    """
    Walk *backward* from start_epoch to find the last LOS window before that epoch.
    Used to determine when a pre-emptive blackout burn uplink must be sent.

    Algorithm:
      1. Walk backward from (start_epoch - SIGNAL_LATENCY_S) in step_s decrements.
      2. At each sample, propagate the satellite state backward and check LOS.
      3. Return the first (most recent, closest-to-collision) epoch with LOS.

    Args:
        sat_state: Current satellite ECI state [x,y,z,vx,vy,vz]
        state_epoch: Epoch corresponding to sat_state
        start_epoch: The epoch of the impending event (collision time)
        earliest_epoch: Do not search earlier than this epoch. Defaults to
            max(state_epoch, start_epoch - search_duration_s).
        search_duration_s: How far back in time to search
        step_s: Backward step size in seconds

    Returns:
        (uplink_epoch, window_epoch, station_name) or (None, None, None) if no window found.
        uplink_epoch already accounts for SIGNAL_LATENCY_S so the command arrives in time.
    """
    latest_epoch = start_epoch - SIGNAL_LATENCY_S
    if latest_epoch < 0:
        return None, None, None

    earliest_allowed = max(
        state_epoch,
        start_epoch - search_duration_s,
        0.0,
    )
    if earliest_epoch is not None:
        earliest_allowed = max(earliest_allowed, earliest_epoch)

    if latest_epoch < earliest_allowed:
        return None, None, None

    span = latest_epoch - earliest_allowed
    n_steps = int(np.ceil(span / step_s)) if span > 0 else 0

    for i in range(n_steps + 1):
        check_epoch = max(earliest_allowed, latest_epoch - i * step_s)
        dt_from_state = check_epoch - state_epoch
        check_state = propagate(sat_state, dt_from_state, dt=min(step_s, 10.0))
        station = get_visible_station(check_state[:3], check_epoch)
        if station is not None:
            # Found the most-recent LOS window before the blackout + latency margin
            return check_epoch, check_epoch, station

    return None, None, None


# ─── Burn Validation & Application ──────────────────────────────────────────

def validate_burn(delta_v_vec: np.ndarray, satellite: dict,
                  burn_epoch: float, current_epoch: float) -> tuple:
    """
    Validate a burn command against all operational constraints.

    Args:
        delta_v_vec: [dvx, dvy, dvz] in m/s
        satellite: Satellite state dict with keys:
            fuel_remaining_kg, last_burn_epoch, mass_kg, state (6-vec)
        burn_epoch: Scheduled burn time
        current_epoch: Current simulation time

    Returns:
        (is_valid: bool, rejection_reason: str or None)
    """
    dv_mag = np.linalg.norm(delta_v_vec)

    if dv_mag > MAX_DELTA_V:
        return False, f"Delta-V {dv_mag:.2f} m/s exceeds max {MAX_DELTA_V} m/s"

    if dv_mag < 1e-9:
        return False, "Zero delta-v burn"

    fuel_needed = tsiolkovsky_fuel_consumed(dv_mag, satellite["mass_kg"])
    if fuel_needed > satellite["fuel_remaining_kg"]:
        return False, (f"Insufficient fuel: need {fuel_needed:.2f} kg, "
                       f"have {satellite['fuel_remaining_kg']:.2f} kg")

    last_burn = satellite.get("last_burn_epoch", -1e12)
    time_since_last = burn_epoch - last_burn
    if time_since_last < COOLDOWN_S:
        remaining = COOLDOWN_S - time_since_last
        return False, f"Thermal cooldown active: {remaining:.0f}s remaining"

    if burn_epoch < current_epoch + SIGNAL_LATENCY_S:
        return False, f"Burn time too soon: requires {SIGNAL_LATENCY_S}s signal latency"

    if not has_line_of_sight(satellite["state"][:3], burn_epoch):
        return False, "No line-of-sight to any ground station"

    return True, None


def apply_burn(satellite: dict, delta_v_vec: np.ndarray,
               burn_epoch: float) -> dict:
    """
    Apply a burn to a satellite, updating velocity, fuel, and mass.

    Args:
        satellite: Satellite state dict (mutated in place)
        delta_v_vec: [dvx, dvy, dvz] in m/s
        burn_epoch: Time of burn execution

    Returns:
        Updated satellite dict
    """
    dv_mag = np.linalg.norm(delta_v_vec)
    fuel_used = tsiolkovsky_fuel_consumed(dv_mag, satellite["mass_kg"])

    # Apply instantaneous delta-v
    satellite["state"][3] += delta_v_vec[0]
    satellite["state"][4] += delta_v_vec[1]
    satellite["state"][5] += delta_v_vec[2]

    # Update fuel & mass
    satellite["fuel_remaining_kg"] -= fuel_used
    satellite["mass_kg"] -= fuel_used
    satellite["last_burn_epoch"] = burn_epoch
    satellite["total_fuel_consumed_kg"] = (
        satellite.get("total_fuel_consumed_kg", 0) + fuel_used
    )

    return satellite
