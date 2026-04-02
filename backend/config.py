"""
Autonomous Constellation Manager - Physical Constants & Configuration
"""
import os


def _int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _str_env(name: str, default: str) -> str:
    value = os.getenv(name)
    if value is None:
        return default
    value = value.strip()
    return value or default


# --- Earth Parameters ---
MU_EARTH = 3.986004418e14       # Earth gravitational parameter (m^3/s^2)
R_EARTH = 6_371_000.0           # Earth mean radius (m)
J2 = 1.08263e-3                 # J2 zonal harmonic coefficient
OMEGA_EARTH = 7.2921159e-5      # Earth rotation rate (rad/s)

# --- Spacecraft Parameters ---
WET_MASS_KG = 550.0             # Initial wet mass per satellite (kg)
DRY_MASS_KG = 450.0             # Dry mass (structural, no fuel)
ISP_S = 300.0                   # Specific impulse (seconds)
G0 = 9.80665                    # Standard gravity (m/s^2)
MAX_DELTA_V = 15.0              # Maximum delta-v per single burn (m/s)
COOLDOWN_S = 600.0              # Thermal cooldown between burns (seconds)
SIGNAL_LATENCY_S = 10.0         # Ground-to-satellite signal latency (seconds)

# --- Collision Detection ---
COLLISION_THRESHOLD_M = 100.0   # Miss distance for collision alert (meters)
RISK_RED_M = 1_000.0            # Red risk threshold (meters)
RISK_YELLOW_M = 5_000.0         # Yellow risk threshold (meters)

# --- Simulation Defaults ---
DEFAULT_NUM_SATELLITES = _int_env("ACM_DEFAULT_NUM_SATELLITES", 50)
DEFAULT_NUM_DEBRIS = _int_env("ACM_DEFAULT_NUM_DEBRIS", 10_000)
DEFAULT_STEP_SECONDS = 60.0
ENABLE_BULLSEYE_DEMO = _bool_env("ACM_ENABLE_BULLSEYE_DEMO", True)
BULLSEYE_DEMO_SAT_ID = _int_env("ACM_BULLSEYE_DEMO_SAT_ID", 0)
KTI_ALTITUDE_BIN_M = 10_000.0
KTI_CLUSTER_INFLUENCE_M = 200_000.0
COPILOT_MODEL = _str_env("ACM_COPILOT_MODEL", "gemini-2.5-pro")

# --- Ground Stations (lat_deg, lon_deg, min_elevation_deg) ---
GROUND_STATIONS = [
    {"name": "Goldstone", "lat": 35.4267, "lon": -116.8900, "min_elev": 5.0},
    {"name": "Canberra", "lat": -35.4014, "lon": 148.9817, "min_elev": 5.0},
    {"name": "Madrid", "lat": 40.4314, "lon": -4.2481, "min_elev": 5.0},
    {"name": "Svalbard", "lat": 78.2307, "lon": 15.3897, "min_elev": 5.0},
    {"name": "Singapore", "lat": 1.3521, "lon": 103.8198, "min_elev": 5.0},
    {"name": "McMurdo", "lat": -77.8419, "lon": 166.6863, "min_elev": 5.0},
    {"name": "Bangalore", "lat": 12.9716, "lon": 77.5946, "min_elev": 5.0},
    {"name": "Kourou", "lat": 5.2369, "lon": -52.7684, "min_elev": 5.0},
]

# --- Orbital Altitude Ranges (m) for initialization ---
LEO_MIN_ALT = 400_000.0         # 400 km
LEO_MAX_ALT = 1_200_000.0       # 1200 km

# --- Predictive Multi-Threat Avoidance ---
LOOKAHEAD_DURATION_S = 5_400.0  # 90-minute forward look-ahead window
LOOKAHEAD_SAMPLE_S = 60.0       # Sampling interval for look-ahead path (seconds)
MAX_RECURSION_DEPTH = 5         # Maximum recursive delta-v refinement passes
EVASION_DV_BASE = 0.5           # Base delta-v step for evasion candidate (m/s)
LOS_SEARCH_STEP_S = 30.0        # Step size for LOS window search (seconds)
