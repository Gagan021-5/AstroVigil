"""
Autonomous Constellation Manager - Fuel & Propulsion Model
Tsiolkovsky equation, cooldown enforcement, ground station line-of-sight.
"""
import numpy as np
from config import (
    ISP_S, G0, MAX_DELTA_V, COOLDOWN_S, SIGNAL_LATENCY_S,
    GROUND_STATIONS, R_EARTH, OMEGA_EARTH
)
from physics_engine import eci_to_geodetic


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
    fuel_consumed = mass_before * (1.0 - mass_ratio)
    return fuel_consumed


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
    
    # Check delta-v limit
    if dv_mag > MAX_DELTA_V:
        return False, f"Delta-V {dv_mag:.2f} m/s exceeds max {MAX_DELTA_V} m/s"
    
    if dv_mag < 1e-9:
        return False, "Zero delta-v burn"
    
    # Check fuel availability
    fuel_needed = tsiolkovsky_fuel_consumed(dv_mag, satellite["mass_kg"])
    if fuel_needed > satellite["fuel_remaining_kg"]:
        return False, (f"Insufficient fuel: need {fuel_needed:.2f} kg, "
                       f"have {satellite['fuel_remaining_kg']:.2f} kg")
    
    # Check cooldown
    last_burn = satellite.get("last_burn_epoch", -1e12)
    time_since_last = burn_epoch - last_burn
    if time_since_last < COOLDOWN_S:
        remaining = COOLDOWN_S - time_since_last
        return False, (f"Thermal cooldown active: {remaining:.0f}s remaining")
    
    # Check signal latency (burn must be scheduled at least SIGNAL_LATENCY_S in future)
    if burn_epoch < current_epoch + SIGNAL_LATENCY_S:
        return False, (f"Burn time too soon: requires {SIGNAL_LATENCY_S}s signal latency")
    
    # Check line-of-sight to at least one ground station
    if not has_line_of_sight(satellite["state"][:3], burn_epoch):
        return False, "No line-of-sight to any ground station"
    
    return True, None


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
        # Compute great-circle angular separation
        dlat = np.radians(sat_lat - gs["lat"])
        dlon = np.radians(sat_lon - gs["lon"])
        lat1 = np.radians(gs["lat"])
        lat2 = np.radians(sat_lat)
        
        a = (np.sin(dlat / 2) ** 2 +
             np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2)
        central_angle = 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))
        
        # Elevation angle from ground station
        # Using spherical earth approximation
        r_sat = R_EARTH + sat_alt
        elevation = np.arctan2(
            np.cos(central_angle) - R_EARTH / r_sat,
            np.sin(central_angle)
        )
        elevation_deg = np.degrees(elevation)
        
        if elevation_deg >= gs["min_elev"]:
            return True
    
    return False


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
    satellite["total_fuel_consumed_kg"] = satellite.get("total_fuel_consumed_kg", 0) + fuel_used
    
    return satellite
