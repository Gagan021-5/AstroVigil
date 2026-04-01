"""
Autonomous Constellation Manager - Orbital Mechanics Engine
RK4 integrator with J2 perturbation for ECI state propagation.
"""
import numpy as np

from .config import MU_EARTH, R_EARTH, J2, OMEGA_EARTH


def j2_acceleration(pos: np.ndarray) -> np.ndarray:
    """
    Compute gravitational acceleration with J2 zonal harmonic perturbation.
    
    Args:
        pos: ECI position vector [x, y, z] in meters
        
    Returns:
        Acceleration vector [ax, ay, az] in m/s^2
    """
    x, y, z = pos
    r = np.linalg.norm(pos)
    r2 = r * r
    r5 = r ** 5
    z2_over_r2 = (z * z) / r2

    # J2 perturbation factor
    factor = 1.5 * J2 * (R_EARTH ** 2) / r2

    # Two-body + J2
    coeff = -MU_EARTH / (r ** 3)

    ax = coeff * x * (1.0 + factor * (1.0 - 5.0 * z2_over_r2))
    ay = coeff * y * (1.0 + factor * (1.0 - 5.0 * z2_over_r2))
    az = coeff * z * (1.0 + factor * (3.0 - 5.0 * z2_over_r2))

    return np.array([ax, ay, az])


def state_derivative(state: np.ndarray) -> np.ndarray:
    """
    Compute the derivative of the state vector [x,y,z,vx,vy,vz].
    
    Returns:
        [vx, vy, vz, ax, ay, az]
    """
    pos = state[:3]
    vel = state[3:6]
    acc = j2_acceleration(pos)
    return np.concatenate([vel, acc])


def rk4_step(state: np.ndarray, dt: float) -> np.ndarray:
    """
    Single step of 4th-order Runge-Kutta integration.
    
    Args:
        state: [x, y, z, vx, vy, vz] in meters and m/s
        dt: time step in seconds
        
    Returns:
        New state vector after dt seconds
    """
    k1 = state_derivative(state)
    k2 = state_derivative(state + 0.5 * dt * k1)
    k3 = state_derivative(state + 0.5 * dt * k2)
    k4 = state_derivative(state + dt * k3)
    return state + (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4)


def propagate(state: np.ndarray, duration: float, dt: float = 10.0) -> np.ndarray:
    """
    Propagate a state vector forward in time using RK4.
    
    Args:
        state: Initial [x, y, z, vx, vy, vz]
        duration: Total propagation time (seconds)
        dt: Integration sub-step size (seconds)
        
    Returns:
        Final state vector
    """
    t = 0.0
    current = state.copy()
    while t < duration:
        step = min(dt, duration - t)
        current = rk4_step(current, step)
        t += step
    return current


def propagate_batch(states: np.ndarray, duration: float, dt: float = 10.0) -> np.ndarray:
    """
    Propagate an array of state vectors (N x 6) forward in time.
    Uses vectorized operations where possible.
    
    Args:
        states: (N, 6) array of state vectors
        duration: Propagation time (seconds)
        dt: Integration sub-step size (seconds)
        
    Returns:
        (N, 6) array of propagated states
    """
    results = np.empty_like(states)
    for i in range(states.shape[0]):
        results[i] = propagate(states[i], duration, dt)
    return results


def eci_to_geodetic(pos: np.ndarray, epoch_s: float = 0.0) -> tuple:
    """
    Convert ECI position to geodetic coordinates (lat, lon, alt).
    
    Args:
        pos: ECI position [x, y, z] in meters
        epoch_s: Time since reference epoch (seconds), used for Earth rotation
        
    Returns:
        (latitude_deg, longitude_deg, altitude_m)
    """
    x, y, z = pos
    r = np.linalg.norm(pos)
    
    # Latitude from Z
    lat_rad = np.arcsin(z / r)
    
    # Longitude: account for Earth rotation
    lon_rad = np.arctan2(y, x) - OMEGA_EARTH * epoch_s
    # Normalize to [-π, π]
    lon_rad = (lon_rad + np.pi) % (2 * np.pi) - np.pi
    
    lat_deg = np.degrees(lat_rad)
    lon_deg = np.degrees(lon_rad)
    alt_m = r - R_EARTH
    
    return lat_deg, lon_deg, alt_m


def geodetic_to_eci(lat_deg: float, lon_deg: float, alt_m: float,
                    epoch_s: float = 0.0) -> np.ndarray:
    """
    Convert geodetic (lat, lon, alt) to ECI position vector.
    
    Returns:
        ECI position [x, y, z] in meters
    """
    lat = np.radians(lat_deg)
    lon = np.radians(lon_deg) + OMEGA_EARTH * epoch_s
    r = R_EARTH + alt_m
    
    x = r * np.cos(lat) * np.cos(lon)
    y = r * np.cos(lat) * np.sin(lon)
    z = r * np.sin(lat)
    
    return np.array([x, y, z])


def generate_trail(state: np.ndarray, epoch_s: float,
                   duration_s: float = 5400.0, sample_interval: float = 60.0,
                   direction: int = 1) -> list:
    """
    Generate a lat/lon trail by propagating forward or backward.
    
    Args:
        state: Current state vector
        epoch_s: Current epoch
        duration_s: Total duration (default 90 min = 5400s)
        sample_interval: Sampling interval in seconds
        direction: +1 for forward, -1 for backward
        
    Returns:
        List of [lat, lon] pairs
    """
    trail = []
    current = state.copy()
    dt_step = direction * sample_interval
    steps = int(duration_s / sample_interval)
    current_epoch = epoch_s
    
    for _ in range(steps):
        current = propagate(current, abs(dt_step), dt=abs(dt_step))
        current_epoch += dt_step
        lat, lon, _ = eci_to_geodetic(current[:3], current_epoch)
        trail.append([round(lat, 4), round(lon, 4)])
    
    return trail
