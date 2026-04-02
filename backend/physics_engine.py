"""
Autonomous Constellation Manager - Orbital Mechanics Engine
RK4 integrator with J2 perturbation for ECI state propagation.
"""
import numpy as np
import pandas as pd

from .config import (
    MU_EARTH,
    R_EARTH,
    J2,
    OMEGA_EARTH,
    KTI_ALTITUDE_BIN_M,
    KTI_CLUSTER_INFLUENCE_M,
)


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


def orbital_altitude_m(position_eci: np.ndarray) -> float:
    """Return the altitude above mean Earth radius for an ECI position vector."""
    return float(np.linalg.norm(position_eci) - R_EARTH)


def analyze_orbital_density(
    debris_states: list,
    bin_size_m: float = KTI_ALTITUDE_BIN_M,
) -> dict:
    """
    Analyze the debris field in fixed altitude shells using Pandas groupby bins.

    Returns:
        {
            "mean_density": float,
            "std_density": float,
            "densest_bin_altitude_m": float | None,
            "densest_bin_count": int,
            "density_bins": [...]
        }
    """
    if not debris_states:
        return {
            "mean_density": 0.0,
            "std_density": 0.0,
            "densest_bin_altitude_m": None,
            "densest_bin_count": 0,
            "density_bins": [],
        }

    debris_altitudes_m = np.array(
        [orbital_altitude_m(np.asarray(state[:3])) for state in debris_states],
        dtype=np.float64,
    )

    density_df = pd.DataFrame({"altitude_m": debris_altitudes_m})
    density_df["bin_start_m"] = (
        np.floor(density_df["altitude_m"] / bin_size_m) * bin_size_m
    )

    grouped = (
        density_df.groupby("bin_start_m")
        .size()
        .rename("threat_count")
        .reset_index()
        .sort_values("bin_start_m")
        .reset_index(drop=True)
    )
    grouped["bin_center_m"] = grouped["bin_start_m"] + (bin_size_m / 2.0)

    mean_density = float(grouped["threat_count"].mean()) if not grouped.empty else 0.0
    std_density = (
        float(grouped["threat_count"].std(ddof=0))
        if len(grouped) > 1 else 0.0
    )
    if std_density < 1e-9:
        grouped["density_zscore"] = 0.0
    else:
        grouped["density_zscore"] = (
            (grouped["threat_count"] - mean_density) / std_density
        )

    densest_row = (
        grouped.sort_values(["threat_count", "bin_start_m"], ascending=[False, True])
        .iloc[0]
    )

    density_bins = [
        {
            "altitude_min_km": round(float(row.bin_start_m) / 1000.0, 2),
            "altitude_max_km": round(float(row.bin_start_m + bin_size_m) / 1000.0, 2),
            "threat_count": int(row.threat_count),
            "density_zscore": round(float(row.density_zscore), 3),
        }
        for row in grouped.itertuples(index=False)
    ]

    return {
        "mean_density": round(mean_density, 3),
        "std_density": round(std_density, 3),
        "densest_bin_altitude_m": float(densest_row.bin_center_m),
        "densest_bin_count": int(densest_row.threat_count),
        "density_bins": density_bins,
        "_grouped_df": grouped,
        "_bin_size_m": bin_size_m,
    }


def calculate_kessler_threat_index(
    satellite_states: dict,
    debris_states: list,
    bin_size_m: float = KTI_ALTITUDE_BIN_M,
) -> dict:
    """
    Compute Kessler Threat Index scores for all satellites.

    The proprietary score blends:
      * local shell density relative to the peak shell
      * weighted proximity to the top three densest debris shells
      * z-score excess of the local shell density
    """
    density_summary = analyze_orbital_density(debris_states, bin_size_m=bin_size_m)
    grouped = density_summary.pop("_grouped_df", None)
    density_summary.pop("_bin_size_m", None)

    if grouped is None or grouped.empty:
        return {
            **density_summary,
            "satellite_scores": [],
        }

    max_density = float(grouped["threat_count"].max()) or 1.0
    mean_density = float(density_summary["mean_density"])
    std_density = float(density_summary["std_density"])
    densest_altitude_m = density_summary["densest_bin_altitude_m"]
    grouped_lookup = grouped.set_index("bin_start_m")

    top_clusters = (
        grouped.sort_values("threat_count", ascending=False)
        .head(min(3, len(grouped)))
        .copy()
    )
    cluster_weight_sum = float(top_clusters["threat_count"].sum()) or 1.0

    satellite_scores = []
    for sat_id, sat_state in satellite_states.items():
        sat_altitude_m = orbital_altitude_m(np.asarray(sat_state[:3]))
        sat_bin_start_m = float(np.floor(sat_altitude_m / bin_size_m) * bin_size_m)

        if sat_bin_start_m in grouped_lookup.index:
            local_count = float(grouped_lookup.at[sat_bin_start_m, "threat_count"])
            local_z = float(grouped_lookup.at[sat_bin_start_m, "density_zscore"])
        else:
            local_count = 0.0
            local_z = 0.0 if std_density < 1e-9 else -mean_density / std_density

        local_density_component = np.clip(local_count / max_density, 0.0, 1.0)

        cluster_proximity_component = 0.0
        for row in top_clusters.itertuples(index=False):
            distance_m = abs(sat_altitude_m - float(row.bin_center_m))
            proximity = max(
                0.0,
                1.0 - min(distance_m, KTI_CLUSTER_INFLUENCE_M) / KTI_CLUSTER_INFLUENCE_M,
            )
            weight = float(row.threat_count) / cluster_weight_sum
            cluster_proximity_component += weight * proximity

        density_excess_component = 0.0
        if std_density >= 1e-9:
            density_excess_component = float(np.clip((local_z + 2.0) / 4.0, 0.0, 1.0))

        kti_score = 100.0 * np.clip(
            (0.5 * local_density_component)
            + (0.35 * cluster_proximity_component)
            + (0.15 * density_excess_component),
            0.0,
            1.0,
        )

        if kti_score > 80.0:
            risk_band = "red"
        elif kti_score >= 50.0:
            risk_band = "yellow"
        else:
            risk_band = "green"

        satellite_scores.append({
            "satellite_id": int(sat_id),
            "altitude_km": round(sat_altitude_m / 1000.0, 2),
            "altitude_bin_km": round((sat_bin_start_m + bin_size_m / 2.0) / 1000.0, 2),
            "local_debris_count": int(local_count),
            "density_zscore": round(local_z, 3),
            "distance_to_peak_km": round(
                abs(sat_altitude_m - float(densest_altitude_m or 0.0)) / 1000.0, 2
            ),
            "kti_score": round(float(kti_score), 1),
            "risk_band": risk_band,
        })

    satellite_scores.sort(key=lambda score: score["satellite_id"])
    density_summary["satellite_scores"] = satellite_scores
    return density_summary
