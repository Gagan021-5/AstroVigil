import numpy as np
import copy

from .propagator import MU

def compute_fuel_cost(delta_v: float, mass: float, isp: float = 300.0) -> float:
    """
    Using Tsiolkovsky rocket equation to compute fuel mass consumed.
    delta_v: velocity change magnitude in km/s
    mass: initial mass of the satellite in kg
    isp: specific impulse of the thruster in seconds (default ~300s for bipropellant)
    
    Returns: fuel consumed in kg
    """
    g0 = 0.00980665 # standard gravity in km/s^2
    effective_exhaust_velocity = isp * g0
    
    # m_f = m_i * (1 - e^(-dv / v_e))
    mass_ratio = np.exp(-delta_v / effective_exhaust_velocity)
    final_mass = mass * mass_ratio
    fuel_consumed = mass - final_mass
    
    return float(fuel_consumed)

def hohmann_transfer(r1: float, r2: float) -> tuple[float, float, float]:
    """
    Computes Delta-V budget for a Hohmann transfer.
    r1: initial circular orbit radius (km)
    r2: target circular orbit radius (km)
    
    Returns: (total_delta_v, delta_v_1, delta_v_2) in km/s
    """
    # Velocity of initial and final circular orbits
    v1 = np.sqrt(MU / r1)
    v2 = np.sqrt(MU / r2)
    
    # Velocity at periapsis and apoapsis of transfer ellipse
    a_transfer = (r1 + r2) / 2.0
    v_per = np.sqrt(MU * (2.0 / r1 - 1.0 / a_transfer))
    v_apo = np.sqrt(MU * (2.0 / r2 - 1.0 / a_transfer))
    
    # Impulse 1
    dv1 = abs(v_per - v1)
    # Impulse 2
    dv2 = abs(v2 - v_apo)
    
    total_dv = dv1 + dv2
    return float(total_dv), float(dv1), float(dv2)

def plan_avoidance_maneuver(conjunction_event, sat_state, sat_mass: float) -> dict:
    """
    Given a conjunction, plans an evasion maneuver by slightly raising the semi-major axis.
    sat_state: [x,y,z, vx,vy,vz]
    
    Returns a dict containing delta_v vector, total_dv magnitude, and fuel consumed.
    """
    pos = np.array(sat_state[0:3])
    vel = np.array(sat_state[3:6])
    
    r = np.linalg.norm(pos)
    v = np.linalg.norm(vel)
    
    # Simplified collision avoidance logic:
    # We raise our altitude radially by ~2 km at TCA by burning prograde right now.
    
    # Let's say we want to push the semi-major axis a bit
    # Specifically, just add a generic prograde impulse of 1 m/s (0.001 km/s)
    # This is a very common small debris avoidance burn
    
    prograde_dir = vel / v
    dv_magnitude_km_s = 0.001 # 1 m/s
    
    dv_vector = prograde_dir * dv_magnitude_km_s
    
    fuel_cost = compute_fuel_cost(dv_magnitude_km_s, sat_mass)
    
    return {
        "delta_v": {
            "x": float(dv_vector[0]),
            "y": float(dv_vector[1]),
            "z": float(dv_vector[2])
        },
        "total_dv_km_s": dv_magnitude_km_s,
        "fuel_consumed_kg": fuel_cost,
        "burn_time_sec": 10.0 # Assuming a 10-second burn duration
    }
