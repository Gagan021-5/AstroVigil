"""
Autonomous Constellation Manager - Spatial Indexer
KD-Tree based collision detection and conjunction analysis.
"""
import numpy as np
from scipy.spatial import cKDTree
from config import COLLISION_THRESHOLD_M, RISK_RED_M, RISK_YELLOW_M


def classify_risk(distance_m: float) -> str:
    """Classify risk level based on miss distance."""
    if distance_m < RISK_RED_M:
        return "red"
    elif distance_m < RISK_YELLOW_M:
        return "yellow"
    return "green"


class SpatialIndexer:
    """
    Efficient spatial indexing for collision detection using SciPy cKDTree.
    Provides O(N log N) nearest-neighbor queries instead of O(N²) brute force.
    """
    
    def __init__(self):
        self.tree = None
        self.positions = None
        self.object_ids = None
        self.velocities = None
    
    def build_index(self, positions: np.ndarray, object_ids: np.ndarray,
                    velocities: np.ndarray = None):
        """
        Build the KD-Tree from current positions.
        
        Args:
            positions: (N, 3) array of ECI positions in meters
            object_ids: (N,) array of object IDs
            velocities: (N, 3) array of ECI velocities in m/s (optional)
        """
        self.positions = positions
        self.object_ids = object_ids
        self.velocities = velocities
        self.tree = cKDTree(positions)
    
    def detect_collisions(self, sat_positions: np.ndarray,
                          sat_ids: np.ndarray,
                          threshold_m: float = COLLISION_THRESHOLD_M) -> list:
        """
        Detect potential collisions between satellites and all indexed objects.
        
        Args:
            sat_positions: (M, 3) array of satellite ECI positions
            sat_ids: (M,) array of satellite IDs
            threshold_m: Collision threshold distance (meters)
            
        Returns:
            List of collision event dicts
        """
        if self.tree is None:
            return []
        
        collisions = []
        
        for i in range(sat_positions.shape[0]):
            # Query all objects within threshold
            indices = self.tree.query_ball_point(sat_positions[i], threshold_m)
            
            for idx in indices:
                obj_id = int(self.object_ids[idx])
                # Skip self-detection
                if obj_id == int(sat_ids[i]):
                    continue
                
                dist = np.linalg.norm(sat_positions[i] - self.positions[idx])
                collisions.append({
                    "object_a_id": int(sat_ids[i]),
                    "object_b_id": obj_id,
                    "miss_distance_m": round(float(dist), 2),
                    "tca": 0.0,  # Updated by TCA calculation
                    "risk_level": classify_risk(dist),
                })
        
        return collisions
    
    def find_conjunctions(self, sat_pos: np.ndarray, sat_vel: np.ndarray,
                          sat_id: int, max_range_m: float = RISK_YELLOW_M,
                          epoch_s: float = 0.0) -> list:
        """
        Find conjunction events for a specific satellite.
        Returns objects within max_range, with TCA and bearing.
        
        Args:
            sat_pos: (3,) satellite ECI position
            sat_vel: (3,) satellite ECI velocity
            sat_id: Satellite ID
            max_range_m: Search radius (meters)
            epoch_s: Current epoch for TCA calculation
            
        Returns:
            List of conjunction info dicts
        """
        if self.tree is None:
            return []
        
        indices = self.tree.query_ball_point(sat_pos, max_range_m)
        conjunctions = []
        
        for idx in indices:
            obj_id = int(self.object_ids[idx])
            if obj_id == sat_id:
                continue
            
            rel_pos = self.positions[idx] - sat_pos
            dist = np.linalg.norm(rel_pos)
            
            # Compute TCA (Time of Closest Approach)
            if self.velocities is not None:
                rel_vel = self.velocities[idx] - sat_vel
                tca = self._compute_tca(rel_pos, rel_vel)
            else:
                tca = 0.0
            
            # Bearing angle (in the orbital plane, projected)
            bearing = self._compute_bearing(rel_pos, sat_vel)
            
            conjunctions.append({
                "debris_id": obj_id,
                "miss_distance_m": round(float(dist), 2),
                "tca": round(float(epoch_s + tca), 2),
                "bearing_deg": round(float(bearing), 2),
                "risk_level": classify_risk(dist),
            })
        
        # Sort by miss distance (closest first)
        conjunctions.sort(key=lambda c: c["miss_distance_m"])
        return conjunctions
    
    def _compute_tca(self, rel_pos: np.ndarray, rel_vel: np.ndarray) -> float:
        """
        Compute Time of Closest Approach using linear approximation.
        TCA = -dot(rel_pos, rel_vel) / dot(rel_vel, rel_vel)
        """
        v_dot_v = np.dot(rel_vel, rel_vel)
        if v_dot_v < 1e-12:
            return 0.0
        tca = -np.dot(rel_pos, rel_vel) / v_dot_v
        return max(0.0, tca)  # Only future approaches
    
    def _compute_bearing(self, rel_pos: np.ndarray,
                         sat_vel: np.ndarray) -> float:
        """
        Compute bearing angle of debris relative to satellite velocity vector.
        Returns angle in degrees [0, 360).
        """
        # Project relative position onto the plane perpendicular to velocity
        vel_norm = np.linalg.norm(sat_vel)
        if vel_norm < 1e-12:
            return 0.0
        
        vel_hat = sat_vel / vel_norm
        
        # Create a reference frame: vel_hat, and two perpendicular axes
        # Use cross product with z-axis to get perpendicular
        z_hat = np.array([0, 0, 1])
        if abs(np.dot(vel_hat, z_hat)) > 0.99:
            z_hat = np.array([1, 0, 0])
        
        right = np.cross(vel_hat, z_hat)
        right /= np.linalg.norm(right)
        up = np.cross(right, vel_hat)
        
        # Project rel_pos onto right and up
        x_proj = np.dot(rel_pos, right)
        y_proj = np.dot(rel_pos, up)
        
        angle = np.degrees(np.arctan2(y_proj, x_proj)) % 360
        return angle
