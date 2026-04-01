import numpy as np
from sgp4.api import Satrec, WGS84

from ..models.satellite import TLE, StateVector, Vector3

# Earth gravitational parameter [km^3/s^2]
MU = 398600.4418
# Earth equatorial radius [km]
R_E = 6378.137
# J2 perturbation term coefficient
J2 = 1.08262668e-3

def tle_to_state_vector(tle: TLE) -> StateVector:
    """Parses a TLE and returns the state vector (position, velocity) at the TLE epoch using SGP4."""
    sat = Satrec.twoline2rv(tle.line1, tle.line2)
    
    # We evaluate at the epoch it was defining by passing its own dates back
    # sgp4 takes [days since 1949 Dec 31 00:00:00] for jd, fr
    # jd, fr = sat.jdsatepoch, sat.jdsatepochF (not directly exposed easily in all versions)
    # the simplest way for current epoch is 0 minutes since epoch:
    e, r, v = sat.sgp4(sat.jdsatepoch, sat.jdsatepochF)
    
    if e != 0:
        raise ValueError(f"SGP4 error {e} processing TLE")
        
    return StateVector(
        position=Vector3(x=r[0], y=r[1], z=r[2]),
        velocity=Vector3(x=v[0], y=v[1], z=v[2])
    )

def _j2_acceleration(positions):
    """
    Computes acceleration due to Earth's central gravity and J2 perturbation.
    positions: numpy array of shape (N, 3), [x, y, z] in km.
    Returns accelerations: numpy array of shape (N, 3), [ax, ay, az] in km/s^2.
    """
    r = np.linalg.norm(positions, axis=1)
    
    # Precompute common terms
    r2 = r**2
    r3 = r**3
    r5 = r**5
    z2 = positions[:, 2]**2
    
    # Central gravity
    a = -MU * positions / r3[:, np.newaxis]
    
    # J2 Perturbation
    j2_term = (1.5 * J2 * MU * R_E**2) / r5
    
    ax_j2 = j2_term * (positions[:, 0] / r2) * (5 * (z2 / r2) - 1)
    ay_j2 = j2_term * (positions[:, 1] / r2) * (5 * (z2 / r2) - 1)
    az_j2 = j2_term * (positions[:, 2] / r2) * (5 * (z2 / r2) - 3)
    
    a_j2 = np.column_stack((ax_j2, ay_j2, az_j2))
    
    return a + a_j2

def propagate_rk4(initial_states, t0, dt, steps):
    """
    Propagates multiple satellites forward in time using 4th order Runge Kutta.
    
    `initial_states`: numpy array of shape (N, 6) containing [x,y,z, vx,vy,vz].
    `t0`: initial time (seconds)
    `dt`: time step (seconds)
    `steps`: number of steps to simulate
    
    Returns a numpy array of shape (steps, N, 6) with the trajectory.
    """
    N = initial_states.shape[0]
    trajectories = np.empty((steps, N, 6))
    trajectories[0] = initial_states
    
    current_state = initial_states.copy()
    
    def derivative(state):
        d_state = np.zeros_like(state)
        # dx/dt = v
        d_state[:, 0:3] = state[:, 3:6]
        # dv/dt = a
        d_state[:, 3:6] = _j2_acceleration(state[:, 0:3])
        return d_state

    for i in range(1, steps):
        k1 = derivative(current_state)
        k2 = derivative(current_state + 0.5 * dt * k1)
        k3 = derivative(current_state + 0.5 * dt * k2)
        k4 = derivative(current_state + dt * k3)
        
        current_state = current_state + (dt / 6.0) * (k1 + 2 * k2 + 2 * k3 + k4)
        trajectories[i] = current_state
        
    return trajectories
