"""
Autonomous Constellation Manager - Simulation World State Manager
Manages all satellites, debris, maneuver queue, and simulation clock.
"""
import numpy as np
from typing import Dict, List, Optional
from config import (
    MU_EARTH, R_EARTH, WET_MASS_KG, DRY_MASS_KG, COOLDOWN_S,
    DEFAULT_NUM_SATELLITES, DEFAULT_NUM_DEBRIS,
    LEO_MIN_ALT, LEO_MAX_ALT, COLLISION_THRESHOLD_M
)
from physics_engine import (
    propagate, propagate_batch, eci_to_geodetic, generate_trail
)
from fuel_model import validate_burn, apply_burn
from spatial_indexer import SpatialIndexer


class SimulationWorld:
    """
    Central world state for the constellation simulation.
    """
    
    def __init__(self):
        self.epoch: float = 0.0  # seconds since J2000
        self.satellites: Dict[int, dict] = {}
        self.debris: Dict[int, dict] = {}
        self.maneuver_queue: List[dict] = []
        self.maneuver_history: List[dict] = []
        self.indexer = SpatialIndexer()
        self.collisions_avoided: int = 0
        self._initialized = False
    
    def initialize_default(self, num_sats: int = DEFAULT_NUM_SATELLITES,
                           num_debris: int = DEFAULT_NUM_DEBRIS):
        """
        Initialize with random satellites and debris in LEO.
        """
        np.random.seed(42)
        
        # Generate satellites
        for i in range(num_sats):
            alt = np.random.uniform(LEO_MIN_ALT, LEO_MAX_ALT)
            state = self._random_circular_orbit(alt, i)
            self.satellites[i] = {
                "id": i,
                "state": state,
                "mass_kg": WET_MASS_KG,
                "fuel_remaining_kg": WET_MASS_KG - DRY_MASS_KG,
                "total_fuel_consumed_kg": 0.0,
                "last_burn_epoch": -1e12,
                "trail_history": [],   # [(lat, lon), ...]
                "trail_epoch": [],     # epoch at each trail point
            }
        
        # Generate debris
        for i in range(num_debris):
            obj_id = 1000 + i
            alt = np.random.uniform(LEO_MIN_ALT, LEO_MAX_ALT)
            state = self._random_circular_orbit(alt, obj_id)
            self.debris[obj_id] = {
                "id": obj_id,
                "state": state,
            }
        
        self._initialized = True
    
    def _random_circular_orbit(self, alt_m: float, seed_offset: int) -> np.ndarray:
        """
        Generate a random near-circular orbit at the given altitude.
        Returns ECI state vector [x, y, z, vx, vy, vz].
        """
        r = R_EARTH + alt_m
        v = np.sqrt(MU_EARTH / r)  # Circular orbit velocity
        
        # Random inclination (0-100 deg), RAAN, and true anomaly
        inc = np.radians(np.random.uniform(0, 100))
        raan = np.radians(np.random.uniform(0, 360))
        ta = np.radians(np.random.uniform(0, 360))
        
        # Position in perifocal frame
        x_pf = r * np.cos(ta)
        y_pf = r * np.sin(ta)
        vx_pf = -v * np.sin(ta)
        vy_pf = v * np.cos(ta)
        
        # Rotation to ECI (simplified: only RAAN and inclination)
        cos_O, sin_O = np.cos(raan), np.sin(raan)
        cos_i, sin_i = np.cos(inc), np.sin(inc)
        
        x = cos_O * x_pf - sin_O * cos_i * y_pf
        y = sin_O * x_pf + cos_O * cos_i * y_pf
        z = sin_i * y_pf
        
        vx = cos_O * vx_pf - sin_O * cos_i * vy_pf
        vy = sin_O * vx_pf + cos_O * cos_i * vy_pf
        vz = sin_i * vy_pf
        
        return np.array([x, y, z, vx, vy, vz], dtype=np.float64)
    
    def ingest_telemetry(self, epoch: float, states: list) -> dict:
        """
        Ingest telemetry state vectors. Creates or updates objects.
        """
        self.epoch = epoch
        sat_count = 0
        debris_count = 0
        
        for sv in states:
            state_vec = np.array([sv.x, sv.y, sv.z, sv.vx, sv.vy, sv.vz],
                                 dtype=np.float64)
            
            if sv.object_type == "satellite":
                if sv.object_id in self.satellites:
                    self.satellites[sv.object_id]["state"] = state_vec
                else:
                    self.satellites[sv.object_id] = {
                        "id": sv.object_id,
                        "state": state_vec,
                        "mass_kg": WET_MASS_KG,
                        "fuel_remaining_kg": WET_MASS_KG - DRY_MASS_KG,
                        "total_fuel_consumed_kg": 0.0,
                        "last_burn_epoch": -1e12,
                        "trail_history": [],
                        "trail_epoch": [],
                    }
                sat_count += 1
            else:
                self.debris[sv.object_id] = {
                    "id": sv.object_id,
                    "state": state_vec,
                }
                debris_count += 1
        
        if not self._initialized:
            self._initialized = True
        
        return {"ingested": sat_count + debris_count,
                "satellites": sat_count, "debris": debris_count}
    
    def schedule_maneuvers(self, burns: list) -> list:
        """
        Validate and schedule an array of burn commands.
        """
        results = []
        
        for burn in burns:
            sat = self.satellites.get(burn.satellite_id)
            if sat is None:
                results.append({
                    "satellite_id": burn.satellite_id,
                    "burn_time": burn.burn_time,
                    "accepted": False,
                    "rejection_reason": f"Satellite {burn.satellite_id} not found",
                    "fuel_remaining_kg": None,
                })
                continue
            
            dv_vec = np.array([burn.delta_vx, burn.delta_vy, burn.delta_vz])
            valid, reason = validate_burn(dv_vec, sat, burn.burn_time, self.epoch)
            
            if valid:
                self.maneuver_queue.append({
                    "satellite_id": burn.satellite_id,
                    "burn_time": burn.burn_time,
                    "delta_v": dv_vec,
                })
                # Sort queue by burn time
                self.maneuver_queue.sort(key=lambda m: m["burn_time"])
                
                results.append({
                    "satellite_id": burn.satellite_id,
                    "burn_time": burn.burn_time,
                    "accepted": True,
                    "rejection_reason": None,
                    "fuel_remaining_kg": sat["fuel_remaining_kg"],
                })
            else:
                results.append({
                    "satellite_id": burn.satellite_id,
                    "burn_time": burn.burn_time,
                    "accepted": False,
                    "rejection_reason": reason,
                    "fuel_remaining_kg": sat["fuel_remaining_kg"],
                })
        
        return results
    
    def step(self, step_seconds: float) -> dict:
        """
        Advance simulation by step_seconds:
        1. Propagate all objects
        2. Execute scheduled maneuvers within this time window
        3. Detect collisions
        4. Update trails
        """
        if not self._initialized:
            self.initialize_default()
        
        target_epoch = self.epoch + step_seconds
        maneuvers_executed = 0
        
        # ── Execute maneuvers that fall within this step ──
        while (self.maneuver_queue and
               self.maneuver_queue[0]["burn_time"] <= target_epoch):
            m = self.maneuver_queue.pop(0)
            sat = self.satellites.get(m["satellite_id"])
            if sat is not None:
                # Propagate satellite to exact burn time
                dt_to_burn = m["burn_time"] - self.epoch
                if dt_to_burn > 0:
                    sat["state"] = propagate(sat["state"], dt_to_burn)
                
                apply_burn(sat, m["delta_v"], m["burn_time"])
                maneuvers_executed += 1
                
                dv_mag = float(np.linalg.norm(m["delta_v"]))
                self.maneuver_history.append({
                    "satellite_id": m["satellite_id"],
                    "burn_start": m["burn_time"],
                    "burn_end": m["burn_time"],  # Instantaneous
                    "cooldown_end": m["burn_time"] + COOLDOWN_S,
                    "delta_v_mag": round(dv_mag, 4),
                })
        
        # ── Propagate all satellites ──
        for sat in self.satellites.values():
            sat["state"] = propagate(sat["state"], step_seconds)
            # Record trail point
            lat, lon, _ = eci_to_geodetic(sat["state"][:3], target_epoch)
            sat["trail_history"].append([round(lat, 4), round(lon, 4)])
            sat["trail_epoch"].append(target_epoch)
            # Keep only ~90 minutes of trail at 60s intervals
            max_trail = 90
            if len(sat["trail_history"]) > max_trail:
                sat["trail_history"] = sat["trail_history"][-max_trail:]
                sat["trail_epoch"] = sat["trail_epoch"][-max_trail:]
        
        # ── Propagate all debris ──
        for deb in self.debris.values():
            deb["state"] = propagate(deb["state"], step_seconds, dt=step_seconds)
        
        # ── Build spatial index and detect collisions ──
        all_positions = []
        all_ids = []
        all_velocities = []
        
        for deb in self.debris.values():
            all_positions.append(deb["state"][:3])
            all_ids.append(deb["id"])
            all_velocities.append(deb["state"][3:6])
        
        for sat in self.satellites.values():
            all_positions.append(sat["state"][:3])
            all_ids.append(sat["id"])
            all_velocities.append(sat["state"][3:6])
        
        all_positions = np.array(all_positions) if all_positions else np.empty((0, 3))
        all_ids = np.array(all_ids) if all_ids else np.empty(0)
        all_velocities = np.array(all_velocities) if all_velocities else np.empty((0, 3))
        
        self.indexer.build_index(all_positions, all_ids, all_velocities)
        
        # Detect collisions for satellites only
        sat_positions = np.array([s["state"][:3] for s in self.satellites.values()])
        sat_ids = np.array([s["id"] for s in self.satellites.values()])
        
        collisions = []
        if sat_positions.size > 0:
            collisions = self.indexer.detect_collisions(
                sat_positions, sat_ids, COLLISION_THRESHOLD_M
            )
        
        self.epoch = target_epoch
        
        return {
            "current_epoch": self.epoch,
            "step_seconds": step_seconds,
            "satellites_propagated": len(self.satellites),
            "debris_propagated": len(self.debris),
            "maneuvers_executed": maneuvers_executed,
            "collisions_detected": collisions,
        }
    
    def get_snapshot(self) -> dict:
        """
        Build a visualization snapshot of current world state.
        """
        if not self._initialized:
            self.initialize_default()
        
        satellites_out = []
        for sat in self.satellites.values():
            lat, lon, alt = eci_to_geodetic(sat["state"][:3], self.epoch)
            cooldown_remaining = max(
                0.0,
                COOLDOWN_S - (self.epoch - sat.get("last_burn_epoch", -1e12))
            )
            
            # Generate predicted trail (forward 90 min)
            predicted = generate_trail(
                sat["state"], self.epoch,
                duration_s=5400, sample_interval=60, direction=1
            )
            
            satellites_out.append({
                "id": sat["id"],
                "lat": round(lat, 4),
                "lon": round(lon, 4),
                "alt": round(alt, 2),
                "vx": round(float(sat["state"][3]), 2),
                "vy": round(float(sat["state"][4]), 2),
                "vz": round(float(sat["state"][5]), 2),
                "fuel_remaining_kg": round(sat["fuel_remaining_kg"], 2),
                "last_burn_epoch": sat.get("last_burn_epoch"),
                "cooldown_remaining_s": round(cooldown_remaining, 1),
                "trail": sat["trail_history"][-90:],
                "predicted": predicted,
            })
        
        # Compress debris into flattened array [ID, Lat, Lon, Alt, ...]
        debris_compressed = []
        for deb in self.debris.values():
            lat, lon, alt = eci_to_geodetic(deb["state"][:3], self.epoch)
            debris_compressed.extend([
                deb["id"],
                round(lat, 3),
                round(lon, 3),
                round(alt, 0),
            ])
        
        # Conjunctions for all satellites
        conjunctions = []
        for sat in self.satellites.values():
            conjs = self.indexer.find_conjunctions(
                sat["state"][:3], sat["state"][3:6],
                sat["id"], epoch_s=self.epoch
            )
            conjunctions.extend(conjs[:10])  # Top 10 per satellite
        
        # Maneuver timeline
        timeline = []
        for mh in self.maneuver_history[-200:]:
            # Check for conflicts with other burns
            conflicts = False
            for other in self.maneuver_history:
                if other["satellite_id"] == mh["satellite_id"] and other is not mh:
                    if (other["burn_start"] < mh["cooldown_end"] and
                            other["burn_start"] > mh["burn_start"]):
                        conflicts = True
                        break
            
            timeline.append({
                "satellite_id": mh["satellite_id"],
                "burn_start": mh["burn_start"],
                "burn_end": mh["burn_end"],
                "cooldown_end": mh["cooldown_end"],
                "delta_v_mag": mh["delta_v_mag"],
                "conflicts": conflicts,
            })
        
        total_fuel = sum(
            s.get("total_fuel_consumed_kg", 0) for s in self.satellites.values()
        )
        
        return {
            "epoch": self.epoch,
            "satellites": satellites_out,
            "debris_compressed": debris_compressed,
            "conjunctions": conjunctions,
            "maneuver_timeline": timeline,
            "total_fuel_consumed_kg": round(total_fuel, 2),
            "total_collisions_avoided": self.collisions_avoided,
        }
