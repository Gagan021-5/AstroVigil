import numpy as np
from typing import List, Dict, Any

def compute_miss_distance(traj1: np.ndarray, traj2: np.ndarray) -> np.ndarray:
    """
    Computes the distance between two trajectories over time.
    traj1, traj2: np.ndarray of shape (steps, 6) or (steps, 3).
    Returns distances: np.ndarray of shape (steps,).
    """
    # Slice only the x,y,z components if velocity is included
    pos1 = traj1[:, 0:3] if traj1.shape[1] == 6 else traj1
    pos2 = traj2[:, 0:3] if traj2.shape[1] == 6 else traj2
    
    diff = pos1 - pos2
    distances = np.linalg.norm(diff, axis=1)
    return distances

def find_tca(times: np.ndarray, distances: np.ndarray, window_hours: float) -> tuple[float, float, int]:
    """
    Finds the Time of Closest Approach (TCA).
    times: array of simulation times (seconds)
    distances: array of miss distances between sat1 and sat2 (km)
    window_hours: threshold timeframe
    
    Returns (tca_seconds, min_distance_km, index)
    """
    min_idx = np.argmin(distances)
    min_distance = distances[min_idx]
    tca = times[min_idx]
    
    # We only care if TCA is within our window
    max_t = times[0] + window_hours * 3600
    if tca > max_t:
        return -1, float('inf'), -1
        
    return tca, min_distance, min_idx

def collision_probability(miss_distance: float, combined_covariance_trace: float = 1.0) -> float:
    """
    Computes a simplified collision probability using a 2D isotropic Gaussian assumption 
    (Alfriend-Akella simplified model).
    
    miss_distance: the closest approach distance in km.
    combined_covariance_trace: approximation of spatial uncertainty spread (km^2).
    """
    # Hard object radius sum (e.g. 5 meters + 5 meters = 0.01 km)
    hard_body_radius_km = 0.01 
    
    if miss_distance > 50.0:
        return 0.0 # Effectively zero beyond 50km
        
    # Standard 2D Gaussian probability density integral approx
    exponent = -(miss_distance**2) / (2 * combined_covariance_trace)
    prob_density = np.exp(exponent)
    
    area = np.pi * (hard_body_radius_km**2)
    prob = (area / (2 * np.pi * combined_covariance_trace)) * prob_density
    
    return float(prob)
