"""
Autonomous Constellation Manager - Simulation World State Manager
Manages all satellites, debris, maneuver queue, and simulation clock.

Advanced features:
  * Predictive Multi-Threat Avoidance  — Look-Ahead Tree with recursive delta-v
                                          refinement over a 90-min forward window.
  * Blackout Zone Anticipation         — Pre-emptive uplink of evasion burns via
                                          the last available ground station LOS
                                          window before a coverage blackout.
"""
import copy
import numpy as np
from typing import Dict, List, Optional, Tuple

from .config import (
    MU_EARTH, R_EARTH, WET_MASS_KG, DRY_MASS_KG, COOLDOWN_S,
    DEFAULT_NUM_SATELLITES, DEFAULT_NUM_DEBRIS,
    LEO_MIN_ALT, LEO_MAX_ALT, COLLISION_THRESHOLD_M,
    LOOKAHEAD_DURATION_S, LOOKAHEAD_SAMPLE_S,
    MAX_RECURSION_DEPTH, EVASION_DV_BASE, SIGNAL_LATENCY_S,
    ENABLE_BULLSEYE_DEMO, BULLSEYE_DEMO_SAT_ID,
)
from .physics_engine import (
    propagate, propagate_batch, eci_to_geodetic, generate_trail,
    calculate_kessler_threat_index,
)
from .fuel_model import (
    validate_burn, apply_burn, has_line_of_sight,
    get_visible_station, find_next_los_window,
    tsiolkovsky_fuel_consumed,
)
from .spatial_indexer import SpatialIndexer


class SimulationWorld:
    """
    Central world state for the constellation simulation.
    """

    def __init__(self):
        self.epoch: float = 0.0          # seconds since J2000
        self.satellites: Dict[int, dict] = {}
        self.debris: Dict[int, dict] = {}
        self.maneuver_queue: List[dict] = []
        self.maneuver_history: List[dict] = []
        self.indexer = SpatialIndexer()
        self.collisions_avoided: int = 0
        self._initialized = False

    # ─────────────────────────────────────────────────────────────────────────
    # Initialization
    # ─────────────────────────────────────────────────────────────────────────

    def initialize_default(self, num_sats: int = DEFAULT_NUM_SATELLITES,
                           num_debris: int = DEFAULT_NUM_DEBRIS):
        """Initialize with random satellites and debris in LEO."""
        np.random.seed(42)

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
                "trail_history": [],
                "trail_epoch": [],
            }

        for i in range(num_debris):
            obj_id = 1000 + i
            alt = np.random.uniform(LEO_MIN_ALT, LEO_MAX_ALT)
            state = self._random_circular_orbit(alt, obj_id)
            self.debris[obj_id] = {
                "id": obj_id,
                "state": state,
            }

        if ENABLE_BULLSEYE_DEMO:
            self._seed_bullseye_demo(BULLSEYE_DEMO_SAT_ID)

        self._initialized = True

    def _random_circular_orbit(self, alt_m: float, seed_offset: int) -> np.ndarray:
        """Generate a random near-circular orbit at the given altitude."""
        r = R_EARTH + alt_m
        v = np.sqrt(MU_EARTH / r)

        inc  = np.radians(np.random.uniform(0, 100))
        raan = np.radians(np.random.uniform(0, 360))
        ta   = np.radians(np.random.uniform(0, 360))

        x_pf  = r * np.cos(ta);  y_pf = r * np.sin(ta)
        vx_pf = -v * np.sin(ta); vy_pf = v * np.cos(ta)

        cos_O, sin_O = np.cos(raan), np.sin(raan)
        cos_i, sin_i = np.cos(inc),  np.sin(inc)

        x  = cos_O * x_pf  - sin_O * cos_i * y_pf
        y  = sin_O * x_pf  + cos_O * cos_i * y_pf
        z  = sin_i * y_pf
        vx = cos_O * vx_pf - sin_O * cos_i * vy_pf
        vy = sin_O * vx_pf + cos_O * cos_i * vy_pf
        vz = sin_i * vy_pf

        return np.array([x, y, z, vx, vy, vz], dtype=np.float64)

    def _rotate_about_axis(
        self, vector: np.ndarray, axis: np.ndarray, angle_rad: float
    ) -> np.ndarray:
        """Rotate a vector around an axis using Rodrigues' rotation formula."""
        axis_norm = np.linalg.norm(axis)
        if axis_norm < 1e-12 or abs(angle_rad) < 1e-12:
            return vector.copy()

        axis_hat = axis / axis_norm
        cos_theta = np.cos(angle_rad)
        sin_theta = np.sin(angle_rad)
        return (
            vector * cos_theta
            + np.cross(axis_hat, vector) * sin_theta
            + axis_hat * np.dot(axis_hat, vector) * (1.0 - cos_theta)
        )

    def _build_demo_debris_state(
        self, sat_state: np.ndarray, along_track_m: float, cross_track_m: float
    ) -> np.ndarray:
        """
        Create a nearby debris state around a satellite for the bullseye demo.

        The debris is phase-shifted along the same orbit, then optionally tilted
        slightly out of plane so the bullseye markers spread around the plot.
        """
        pos = sat_state[:3].copy()
        vel = sat_state[3:6].copy()

        orbit_normal = np.cross(pos, vel)
        pos_norm = np.linalg.norm(pos)
        if pos_norm < 1e-12 or np.linalg.norm(orbit_normal) < 1e-12:
            return sat_state.copy()

        phase_angle = along_track_m / pos_norm
        demo_pos = self._rotate_about_axis(pos, orbit_normal, phase_angle)
        demo_vel = self._rotate_about_axis(vel, orbit_normal, phase_angle)

        if abs(cross_track_m) > 0.0:
            track_axis = demo_vel
            tilt_angle = cross_track_m / np.linalg.norm(demo_pos)
            demo_pos = self._rotate_about_axis(demo_pos, track_axis, tilt_angle)
            demo_vel = self._rotate_about_axis(demo_vel, track_axis, tilt_angle)

        return np.array([*demo_pos, *demo_vel], dtype=np.float64)

    def _seed_bullseye_demo(self, target_sat_id: int) -> None:
        """
        Place a deterministic close-approach cluster around a chosen satellite.

        These demo debris objects stay inside the 5 km bullseye gate but remain
        comfortably outside the 100 m collision trigger.
        """
        sat = self.satellites.get(target_sat_id)
        if sat is None:
            return

        demo_specs = [
            {"id": 1000, "along_track_m": 700.0, "cross_track_m": 250.0},
            {"id": 1001, "along_track_m": -2100.0, "cross_track_m": 900.0},
            {"id": 1002, "along_track_m": 3600.0, "cross_track_m": -1200.0},
        ]

        for spec in demo_specs:
            self.debris[spec["id"]] = {
                "id": spec["id"],
                "state": self._build_demo_debris_state(
                    sat["state"],
                    spec["along_track_m"],
                    spec["cross_track_m"],
                ),
            }

    # ─────────────────────────────────────────────────────────────────────────
    # Telemetry Ingestion
    # ─────────────────────────────────────────────────────────────────────────

    def ingest_telemetry(self, epoch: float, states: list) -> dict:
        """Ingest telemetry state vectors. Creates or updates objects."""
        self.epoch = epoch
        sat_count = debris_count = 0

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
                self.debris[sv.object_id] = {"id": sv.object_id, "state": state_vec}
                debris_count += 1

        if not self._initialized:
            self._initialized = True

        return {"ingested": sat_count + debris_count,
                "satellites": sat_count, "debris": debris_count}

    # ─────────────────────────────────────────────────────────────────────────
    # Manual Maneuver Scheduling
    # ─────────────────────────────────────────────────────────────────────────

    def schedule_maneuvers(self, burns: list) -> list:
        """Validate and schedule an array of burn commands."""
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

    # ─────────────────────────────────────────────────────────────────────────
    # Predictive Evasion — Private Helpers
    # ─────────────────────────────────────────────────────────────────────────

    def _compute_evasion_dv(
        self, sat_state: np.ndarray, debris_state: np.ndarray, scale: float = 1.0
    ) -> np.ndarray:
        """
        Compute a candidate evasion delta-v vector for a satellite threatened by
        a debris object.

        Strategy: apply a radial (outward) impulse scaled by `scale`.  The radial
        direction points from Earth's centre through the satellite.

        Args:
            sat_state:   Satellite ECI state [x,y,z,vx,vy,vz]
            debris_state: Debris  ECI state [x,y,z,vx,vy,vz]
            scale:       Multiplier applied to the base delta-v magnitude

        Returns:
            delta-v vector [dvx, dvy, dvz] in m/s
        """
        pos = sat_state[:3]
        r_hat = pos / (np.linalg.norm(pos) + 1e-12)  # unit radial (outward)
        dv_mag = EVASION_DV_BASE * scale
        return r_hat * dv_mag

    def _sample_future_path(
        self, sat_state: np.ndarray, duration_s: float = LOOKAHEAD_DURATION_S,
        sample_interval: float = LOOKAHEAD_SAMPLE_S
    ) -> list:
        """
        Propagate sat_state forward and collect sampled states.

        Returns:
            List of (6,) numpy arrays along the trajectory.
        """
        path = []
        current = sat_state.copy()
        t = 0.0
        while t < duration_s:
            step = min(sample_interval, duration_s - t)
            current = propagate(current, step, dt=min(step, 10.0))
            path.append(current.copy())
            t += step
        return path

    def _verify_safe_path(
        self,
        sat_state: np.ndarray,
        dv_candidate: np.ndarray,
        depth: int = 0,
        rotation_angle_deg: float = 0.0,
    ) -> Tuple[bool, np.ndarray]:
        """
        Recursively verify that a proposed evasion delta-v leads to a 90-min
        collision-free trajectory.  If a secondary threat is detected, rotate/
        scale the delta-v vector and try again (up to MAX_RECURSION_DEPTH).

        Args:
            sat_state:          Current satellite ECI state
            dv_candidate:       Proposed delta-v vector [dvx, dvy, dvz] m/s
            depth:              Current recursion depth (0 = first attempt)
            rotation_angle_deg: Cumulative rotation applied to the dv vector

        Returns:
            (is_safe: bool, verified_dv: np.ndarray)
        """
        if depth > MAX_RECURSION_DEPTH:
            return False, dv_candidate

        # Tentative post-burn state
        tentative = sat_state.copy()
        tentative[3:6] += dv_candidate

        # Sample the future path
        path = self._sample_future_path(tentative)
        is_safe, threat_step, min_dist = self.indexer.query_path_safety(path)

        if is_safe:
            return True, dv_candidate

        # ── Secondary threat detected — adjust delta-v ──
        # Strategy 1: scale up (increase separation clearance)
        scaled_dv = dv_candidate * (1.0 + 0.5 * (depth + 1))
        dv_mag = np.linalg.norm(scaled_dv)
        from .config import MAX_DELTA_V  # local import to avoid circular
        if dv_mag <= MAX_DELTA_V:
            return self._verify_safe_path(
                sat_state, scaled_dv, depth + 1, rotation_angle_deg
            )

        # Strategy 2: rotate delta-v 45° around the orbit normal (cross-track)
        pos = sat_state[:3]
        vel = sat_state[3:6]
        orbit_normal = np.cross(pos, vel)
        norm_len = np.linalg.norm(orbit_normal)
        if norm_len > 1e-12:
            orbit_normal /= norm_len
            theta = np.radians(45.0 * (depth + 1))
            # Rodrigues' rotation formula
            rotated = (
                dv_candidate * np.cos(theta)
                + np.cross(orbit_normal, dv_candidate) * np.sin(theta)
                + orbit_normal * np.dot(orbit_normal, dv_candidate) * (1 - np.cos(theta))
            )
            if np.linalg.norm(rotated) <= MAX_DELTA_V:
                return self._verify_safe_path(
                    sat_state, rotated, depth + 1,
                    rotation_angle_deg + 45.0 * (depth + 1)
                )

        return False, dv_candidate  # Could not find safe vector

    def _schedule_avoidance_burn(
        self,
        sat: dict,
        dv_vec: np.ndarray,
        decision_epoch: float,
        collision_epoch: float,
        avoidance_burns: list,
        blackout_preemptive_count_ref: list,
    ):
        """
        Schedule a verified evasion burn (and optional recovery burn), taking
        into account whether the satellite will be in a ground station blackout
        at the time of the collision.

        If in blackout:
          * Find the last LOS window BEFORE the collision (walking backward).
          * Schedule both the evasion burn and a recovery burn from that window,
            respecting SIGNAL_LATENCY_S.
        If in coverage:
          * Schedule the evasion burn at epoch + SIGNAL_LATENCY_S.

        Args:
            sat:                        Satellite state dict (mutated here)
            dv_vec:                     Verified evasion delta-v vector
            decision_epoch:             Epoch when this scheduling decision is made
            collision_epoch:            Predicted collision time
            avoidance_burns:            Accumulator list for the step() return value
            blackout_preemptive_count_ref: Single-element list used as a mutable int ref
        """
        sat_id = sat["id"]
        dv_mag = float(np.linalg.norm(dv_vec))

        # Check LOS at collision time
        collision_state = propagate(
            sat["state"], collision_epoch - decision_epoch, dt=10.0
        )
        station_at_collision = get_visible_station(collision_state[:3], collision_epoch)
        is_blackout = station_at_collision is None

        if is_blackout:
            # Walk backward from collision_epoch to find last LOS window
            uplink_epoch, window_epoch, station_name = find_next_los_window(
                sat["state"],
                decision_epoch,
                collision_epoch,
                earliest_epoch=decision_epoch,
            )
            if uplink_epoch is None:
                # No LOS window found in search range — cannot uplink; skip
                return

            burn_epoch = uplink_epoch            # Upload burn here
            preemptive = True
            preempt_station = station_name
            blackout_preemptive_count_ref[0] += 1
        else:
            burn_epoch = decision_epoch + SIGNAL_LATENCY_S
            preemptive = False
            preempt_station = None

        # Validate fuel before scheduling
        fuel_needed = tsiolkovsky_fuel_consumed(dv_mag, sat["mass_kg"])
        if fuel_needed > sat["fuel_remaining_kg"]:
            return  # Out of fuel — cannot maneuver

        # Cooldown check
        time_since_burn = burn_epoch - sat.get("last_burn_epoch", -1e12)
        if time_since_burn < COOLDOWN_S:
            return  # Still in cooldown

        # Queue the evasion burn
        self.maneuver_queue.append({
            "satellite_id": sat_id,
            "burn_time": burn_epoch,
            "delta_v": dv_vec,
            "blackout_preemptive": preemptive,
            "preempt_station": preempt_station,
        })

        # Queue a recovery burn (half the evasion dv, opposite direction)
        recovery_epoch = burn_epoch + COOLDOWN_S + 10.0  # After cooldown
        recovery_dv = -dv_vec * 0.5
        recovery_fuel = tsiolkovsky_fuel_consumed(
            float(np.linalg.norm(recovery_dv)), sat["mass_kg"] - fuel_needed
        )
        if recovery_fuel <= sat["fuel_remaining_kg"] - fuel_needed:
            self.maneuver_queue.append({
                "satellite_id": sat_id,
                "burn_time": recovery_epoch,
                "delta_v": recovery_dv,
                "blackout_preemptive": preemptive,
                "preempt_station": preempt_station,
            })

        self.maneuver_queue.sort(key=lambda m: m["burn_time"])
        self.collisions_avoided += 1

        avoidance_burns.append({
            "satellite_id": sat_id,
            "burn_epoch": burn_epoch,
            "delta_v_mag": dv_mag,
            "blackout_preemptive": preemptive,
            "preempt_station": preempt_station,
        })

    # ─────────────────────────────────────────────────────────────────────────
    # Main Simulation Step
    # ─────────────────────────────────────────────────────────────────────────

    def step(self, step_seconds: float) -> dict:
        """
        Advance simulation by step_seconds:
          1. Execute scheduled maneuvers within this time window
          2. Propagate all objects
          3. Build spatial index & detect primary collisions
          4. For each collision: run Look-Ahead Tree to find safe evasion delta-v
          5. Check blackout status and schedule burn (pre-emptively if needed)
          6. Update trails
        """
        if not self._initialized:
            self.initialize_default()

        target_epoch = self.epoch + step_seconds
        maneuvers_executed = 0

        # ── 1. Execute queued maneuvers within this step ──
        while (self.maneuver_queue and
               self.maneuver_queue[0]["burn_time"] <= target_epoch):
            m = self.maneuver_queue.pop(0)
            sat = self.satellites.get(m["satellite_id"])
            if sat is not None:
                dt_to_burn = m["burn_time"] - self.epoch
                if dt_to_burn > 0:
                    sat["state"] = propagate(sat["state"], dt_to_burn)
                apply_burn(sat, m["delta_v"], m["burn_time"])
                maneuvers_executed += 1

                dv_mag = float(np.linalg.norm(m["delta_v"]))
                self.maneuver_history.append({
                    "satellite_id": m["satellite_id"],
                    "burn_start":  m["burn_time"],
                    "burn_end":    m["burn_time"],
                    "cooldown_end": m["burn_time"] + COOLDOWN_S,
                    "delta_v_mag": round(dv_mag, 4),
                    "blackout_preemptive": m.get("blackout_preemptive", False),
                    "preempt_station":     m.get("preempt_station"),
                })

        # ── 2. Propagate all satellites ──
        for sat in self.satellites.values():
            sat["state"] = propagate(sat["state"], step_seconds)
            lat, lon, _ = eci_to_geodetic(sat["state"][:3], target_epoch)
            sat["trail_history"].append([round(lat, 4), round(lon, 4)])
            sat["trail_epoch"].append(target_epoch)
            max_trail = 90
            if len(sat["trail_history"]) > max_trail:
                sat["trail_history"] = sat["trail_history"][-max_trail:]
                sat["trail_epoch"]   = sat["trail_epoch"][-max_trail:]

        # ── 3. Propagate all debris ──
        for deb in self.debris.values():
            deb["state"] = propagate(deb["state"], step_seconds, dt=step_seconds)

        # ── 4. Build spatial index ──
        all_positions  = []
        all_ids        = []
        all_velocities = []

        for deb in self.debris.values():
            all_positions.append(deb["state"][:3])
            all_ids.append(deb["id"])
            all_velocities.append(deb["state"][3:6])

        for sat in self.satellites.values():
            all_positions.append(sat["state"][:3])
            all_ids.append(sat["id"])
            all_velocities.append(sat["state"][3:6])

        all_positions  = np.array(all_positions)  if all_positions  else np.empty((0, 3))
        all_ids        = np.array(all_ids)         if all_ids        else np.empty(0)
        all_velocities = np.array(all_velocities)  if all_velocities else np.empty((0, 3))

        self.indexer.build_index(all_positions, all_ids, all_velocities)

        # ── 5. Detect primary collisions ──
        sat_positions = np.array([s["state"][:3] for s in self.satellites.values()])
        sat_ids       = np.array([s["id"]        for s in self.satellites.values()])

        collisions: list = []
        if sat_positions.size > 0:
            collisions = self.indexer.detect_collisions(
                sat_positions, sat_ids, COLLISION_THRESHOLD_M
            )

        # ── 6. Predictive Multi-Threat Avoidance + Blackout Pre-emption ──
        avoidance_burns: list = []
        blackout_preemptive_count_ref = [0]

        # Build a quick lookup: debris_id -> debris_state
        debris_by_id = {d["id"]: d["state"] for d in self.debris.values()}

        # De-duplicate: one evasion per (sat_id, debris_id) pair per step
        handled_pairs: set = set()

        for collision in collisions:
            sat_id    = collision["object_a_id"]
            debris_id = collision["object_b_id"]
            pair_key  = (sat_id, debris_id)

            if pair_key in handled_pairs:
                continue
            handled_pairs.add(pair_key)

            sat = self.satellites.get(sat_id)
            if sat is None:
                continue

            # Skip if cooldown is active
            cooldown_remaining = (
                COOLDOWN_S - (target_epoch - sat.get("last_burn_epoch", -1e12))
            )
            if cooldown_remaining > 0:
                continue

            debris_state = debris_by_id.get(debris_id)
            if debris_state is None:
                # Could be another satellite — use a generic outward impulse
                debris_state = np.zeros(6)

            # Candidate evasion delta-v (radial outward)
            dv_candidate = self._compute_evasion_dv(sat["state"], debris_state)

            # Run Look-Ahead Tree to confirm safety over 90 minutes
            is_safe, verified_dv = self._verify_safe_path(sat["state"], dv_candidate)

            if not is_safe:
                # Could not find a safe path — log but do not schedule
                continue

            # Estimate approximate collision epoch (current + TCA from indexer)
            tca_offset = collision.get("tca", 0.0)
            collision_epoch = target_epoch + max(tca_offset, SIGNAL_LATENCY_S + 1)

            self._schedule_avoidance_burn(
                sat, verified_dv, target_epoch, collision_epoch,
                avoidance_burns, blackout_preemptive_count_ref
            )

        self.epoch = target_epoch

        return {
            "current_epoch":      self.epoch,
            "step_seconds":       step_seconds,
            "satellites_propagated": len(self.satellites),
            "debris_propagated":  len(self.debris),
            "maneuvers_executed": maneuvers_executed,
            "collisions_detected": collisions,
            "avoidance_burns_scheduled": len(avoidance_burns),
            "blackout_preemptive_count": blackout_preemptive_count_ref[0],
        }

    def _build_index_from_current_state(self) -> None:
        """Rebuild the KD-tree index from the current world state."""
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

        self.indexer.build_index(
            np.array(all_positions) if all_positions else np.empty((0, 3)),
            np.array(all_ids) if all_ids else np.empty(0),
            np.array(all_velocities) if all_velocities else np.empty((0, 3)),
        )

    def _current_collision_events(self) -> list:
        """Detect collision-threshold events at the current epoch."""
        sat_positions = np.array([sat["state"][:3] for sat in self.satellites.values()])
        sat_ids = np.array([sat["id"] for sat in self.satellites.values()])
        if sat_positions.size == 0:
            return []
        return self.indexer.detect_collisions(
            sat_positions,
            sat_ids,
            COLLISION_THRESHOLD_M,
        )

    def _compute_kessler_analytics(self) -> dict:
        """Compute orbital-density bins and per-satellite KTI scores."""
        analytics = calculate_kessler_threat_index(
            satellite_states={sat_id: sat["state"] for sat_id, sat in self.satellites.items()},
            debris_states=[deb["state"] for deb in self.debris.values()],
        )
        densest_altitude_m = analytics.pop("densest_bin_altitude_m", None)
        analytics["densest_bin_altitude_km"] = (
            round(float(densest_altitude_m) / 1000.0, 2)
            if densest_altitude_m is not None else None
        )
        return analytics

    def _collect_blackout_risks(self, conjunctions: Optional[list] = None) -> list:
        """Flag conjunctions whose TCA appears to occur during a comms blackout."""
        conjunctions = conjunctions if conjunctions is not None else []
        grouped: Dict[int, dict] = {}
        for conjunction in conjunctions:
            sat_id = conjunction["satellite_id"]
            current = grouped.get(sat_id)
            if current is None or conjunction["miss_distance_m"] < current["miss_distance_m"]:
                grouped[sat_id] = conjunction

        blackout_risks = []
        for sat_id, conjunction in grouped.items():
            sat = self.satellites.get(sat_id)
            if sat is None:
                continue

            event_epoch = max(self.epoch, float(conjunction.get("tca", self.epoch)))
            dt_to_event = max(0.0, event_epoch - self.epoch)
            future_state = propagate(sat["state"], dt_to_event, dt=10.0)
            station_name = get_visible_station(future_state[:3], event_epoch)
            if station_name is None:
                blackout_risks.append({
                    "satellite_id": sat_id,
                    "event_epoch": round(event_epoch, 2),
                    "miss_distance_m": round(float(conjunction["miss_distance_m"]), 2),
                    "risk_level": conjunction["risk_level"],
                    "reason": "No ground station line-of-sight at conjunction time",
                })

        blackout_risks.sort(key=lambda item: item["miss_distance_m"])
        return blackout_risks

    def build_copilot_state(self) -> dict:
        """Compress the current world state into a lightweight operator summary."""
        snapshot = self.get_snapshot()
        collisions = self._current_collision_events()
        conjunctions = sorted(
            snapshot["conjunctions"],
            key=lambda conjunction: conjunction["miss_distance_m"],
        )
        blackout_risks = self._collect_blackout_risks(conjunctions)
        kessler_analytics = snapshot["kessler_analytics"]

        low_fuel = sorted(
            [
                {
                    "satellite_id": sat["id"],
                    "fuel_remaining_kg": round(float(sat["fuel_remaining_kg"]), 2),
                    "kti_score": next(
                        (
                            score["kti_score"]
                            for score in kessler_analytics["satellite_scores"]
                            if score["satellite_id"] == sat["id"]
                        ),
                        0.0,
                    ),
                }
                for sat in snapshot["satellites"]
            ],
            key=lambda sat: sat["fuel_remaining_kg"],
        )[:5]

        queued_blackout_uploads = [
            {
                "satellite_id": maneuver["satellite_id"],
                "burn_time": round(float(maneuver["burn_time"]), 2),
                "preempt_station": maneuver.get("preempt_station"),
            }
            for maneuver in self.maneuver_queue
            if maneuver.get("blackout_preemptive")
        ][:5]

        return {
            "epoch": round(float(snapshot["epoch"]), 2),
            "active_collisions": collisions[:5],
            "closest_conjunctions": conjunctions[:5],
            "fuel_levels": low_fuel,
            "upcoming_blackouts": blackout_risks[:5],
            "queued_blackout_uploads": queued_blackout_uploads,
            "kti_scores": sorted(
                kessler_analytics["satellite_scores"],
                key=lambda score: score["kti_score"],
                reverse=True,
            )[:8],
        }

    # ─────────────────────────────────────────────────────────────────────────
    # Visualization Snapshot
    # ─────────────────────────────────────────────────────────────────────────

    def get_snapshot(self) -> dict:
        """Build a visualization snapshot of current world state."""
        if not self._initialized:
            self.initialize_default()
        self._build_index_from_current_state()

        satellites_out = []
        for sat in self.satellites.values():
            lat, lon, alt = eci_to_geodetic(sat["state"][:3], self.epoch)
            cooldown_remaining = max(
                0.0,
                COOLDOWN_S - (self.epoch - sat.get("last_burn_epoch", -1e12))
            )
            predicted = generate_trail(
                sat["state"], self.epoch,
                duration_s=5400, sample_interval=60, direction=1
            )
            satellites_out.append({
                "id":  sat["id"],
                "lat": round(lat, 4),
                "lon": round(lon, 4),
                "alt": round(alt, 2),
                "vx":  round(float(sat["state"][3]), 2),
                "vy":  round(float(sat["state"][4]), 2),
                "vz":  round(float(sat["state"][5]), 2),
                "fuel_remaining_kg":   round(sat["fuel_remaining_kg"], 2),
                "last_burn_epoch":     sat.get("last_burn_epoch"),
                "cooldown_remaining_s": round(cooldown_remaining, 1),
                "trail":     sat["trail_history"][-90:],
                "predicted": predicted,
            })

        debris_compressed = []
        for deb in self.debris.values():
            lat, lon, alt = eci_to_geodetic(deb["state"][:3], self.epoch)
            debris_compressed.extend([
                deb["id"], round(lat, 3), round(lon, 3), round(alt, 0),
            ])

        conjunctions = []
        for sat in self.satellites.values():
            conjs = self.indexer.find_conjunctions(
                sat["state"][:3], sat["state"][3:6],
                sat["id"], epoch_s=self.epoch
            )
            conjunctions.extend(conjs[:10])

        kessler_analytics = self._compute_kessler_analytics()

        closest_object_distance_m: Optional[float] = None
        if self.indexer.positions is not None and self.indexer.object_ids is not None:
            nearest = []
            for sat in self.satellites.values():
                deltas = self.indexer.positions - sat["state"][:3]
                distances = np.linalg.norm(deltas, axis=1)
                mask = self.indexer.object_ids != sat["id"]
                if np.any(mask):
                    nearest.append(float(np.min(distances[mask])))
            if nearest:
                closest_object_distance_m = min(nearest)

        # Maneuver timeline (last 200 entries)
        timeline = []
        for mh in self.maneuver_history[-200:]:
            conflicts = False
            for other in self.maneuver_history:
                if other["satellite_id"] == mh["satellite_id"] and other is not mh:
                    if (other["burn_start"] < mh["cooldown_end"] and
                            other["burn_start"] > mh["burn_start"]):
                        conflicts = True
                        break

            timeline.append({
                "satellite_id":       mh["satellite_id"],
                "burn_start":         mh["burn_start"],
                "burn_end":           mh["burn_end"],
                "cooldown_end":       mh["cooldown_end"],
                "delta_v_mag":        mh["delta_v_mag"],
                "conflicts":          conflicts,
                "blackout_preemptive": mh.get("blackout_preemptive", False),
                "preempt_station":    mh.get("preempt_station"),
            })

        total_fuel = sum(
            s.get("total_fuel_consumed_kg", 0) for s in self.satellites.values()
        )

        return {
            "epoch":                 self.epoch,
            "satellites":            satellites_out,
            "debris_compressed":     debris_compressed,
            "conjunctions":          conjunctions,
            "maneuver_timeline":     timeline,
            "kessler_analytics":     kessler_analytics,
            "total_fuel_consumed_kg": round(total_fuel, 2),
            "total_collisions_avoided": self.collisions_avoided,
            "queued_maneuvers_count": len(self.maneuver_queue),
            "queued_preemptive_maneuvers_count": sum(
                1 for m in self.maneuver_queue if m.get("blackout_preemptive")
            ),
            "executed_preemptive_maneuvers_count": sum(
                1 for m in self.maneuver_history if m.get("blackout_preemptive")
            ),
            "closest_object_distance_m": (
                round(closest_object_distance_m, 2)
                if closest_object_distance_m is not None else None
            ),
            "collision_trigger_distance_m": COLLISION_THRESHOLD_M,
        }
