# 🛰️ Autonomous Constellation Manager (ACM)

> Centralized brain for managing a fleet of **50+ active satellites** navigating a debris field of **10,000+ objects** with real-time collision avoidance, orbital mechanics simulation, and an operational 2D dashboard.

![Python](https://img.shields.io/badge/Python-3.11-blue?logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi)
![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react)
![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite)
![Docker](https://img.shields.io/badge/Docker-Ubuntu_22.04-2496ED?logo=docker)

---

## 📋 Table of Contents

- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Dashboard Modules](#dashboard-modules)
- [Physics Engine](#physics-engine)
- [Project Structure](#project-structure)
- [Configuration](#configuration)

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  "Orbital Insight"                   │
│              React + Vite + Canvas/WebGL             │
│  ┌──────────────┐  ┌──────────────┐                 │
│  │ Ground Track  │  │  Bullseye    │                 │
│  │ Map (Mercator)│  │  Plot (Polar)│                 │
│  ├──────────────┤  ├──────────────┤                 │
│  │  Telemetry   │  │  Maneuver    │                 │
│  │  Heatmaps    │  │  Timeline    │                 │
│  └──────────────┘  └──────────────┘                 │
└──────────────────────┬──────────────────────────────┘
                       │ REST API (JSON)
┌──────────────────────┴──────────────────────────────┐
│               FastAPI Backend (:8000)                │
│  ┌─────────────┐ ┌──────────┐ ┌───────────────┐    │
│  │ RK4 + J2    │ │ KD-Tree  │ │ Tsiolkovsky   │    │
│  │ Propagator  │ │ Indexer  │ │ Fuel Model    │    │
│  └─────────────┘ └──────────┘ └───────────────┘    │
│  ┌──────────────────────────────────────────────┐   │
│  │      Simulation World State Manager          │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer         | Technology                     | Purpose                                      |
| ------------- | ------------------------------ | -------------------------------------------- |
| **Backend**   | Python 3.11 + FastAPI          | REST API, physics engine, simulation loop     |
| **Physics**   | NumPy + SciPy                  | RK4 integration, KD-Tree spatial indexing     |
| **Frontend**  | React 18 + Vite 5              | Dashboard SPA                                |
| **Rendering** | HTML5 Canvas (2D)              | 60 FPS ground track, polar plots, Gantt chart |
| **Infra**     | Docker (ubuntu:22.04)          | Containerized deployment                     |

---

## Quick Start

### Option 1: Docker (Recommended)

```bash
# Build and run
docker-compose up --build

# Access the dashboard
open http://localhost:8000
```

### Option 2: Local Development

**Backend:**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Frontend (separate terminal):**
```bash
cd frontend
npm install
npm run dev
```

Dashboard: `http://localhost:5173` (proxies API to `:8000`)  
API docs: `http://localhost:8000/docs`

---

## API Reference

### `POST /api/telemetry`
Asynchronously ingest ECI state vectors for all tracked objects.

```json
{
  "epoch": 0.0,
  "states": [
    {
      "object_id": 0,
      "object_type": "satellite",
      "x": 7000000, "y": 0, "z": 0,
      "vx": 0, "vy": 7546, "vz": 0
    }
  ]
}
```

### `POST /api/maneuver/schedule`
Schedule burn commands with validation (fuel, cooldown, LOS, latency).

```json
{
  "burns": [
    {
      "satellite_id": 0,
      "burn_time": 1000.0,
      "delta_vx": 1.0,
      "delta_vy": 0.0,
      "delta_vz": 0.0
    }
  ]
}
```

### `POST /api/simulate/step`
Advance simulation, execute maneuvers, detect collisions.

```json
{ "step_seconds": 60.0 }
```

### `GET /api/visualization/snapshot`
Returns full constellation state with compressed debris array `[ID, Lat, Lon, Alt, ...]`.

---

## Dashboard Modules

### 🌍 Ground Track Map
Mercator projection with real-time satellite markers, 90-minute historical trails (fading opacity), 90-minute predicted trajectory lines (dashed), and a dynamic **terminator line** (day/night shadow overlay).

### 🎯 Conjunction Bullseye Plot
Polar chart centered on a selected satellite. Debris plotted by **TCA** (radial) and **approach vector** (angle). Risk color-coding:
- 🔴 **Red** — miss distance < 1 km (Critical)
- 🟡 **Yellow** — miss distance < 5 km (Warning)
- 🟢 **Green** — miss distance > 5 km (Safe)

### ⛽ Telemetry Heatmaps
Per-satellite fuel gauges with color gradients, fleet efficiency stats (fuel consumed vs. collisions avoided), and a fuel distribution histogram.

### 📅 Maneuver Timeline
Gantt-style scheduler with burn blocks, 600-second cooldown windows (hatched), conflict flags (red triangles), and a NOW marker.

---

## Physics Engine

### Orbital Propagation
- **Integrator:** 4th-Order Runge-Kutta (RK4)
- **Perturbation:** J2 zonal harmonic (Earth oblateness)
- **State vector:** 6-DOF ECI [x, y, z, vx, vy, vz]

### Propulsion Model
- **Equation:** Tsiolkovsky rocket equation `Δm = m₀(1 - e^(-Δv/(Isp·g₀)))`
- **Isp:** 300 s (monopropellant)
- **Wet mass:** 550 kg | **Dry mass:** 450 kg
- **Max Δv:** 15 m/s per burn
- **Cooldown:** 600 s mandatory between burns

### Collision Detection
- **Algorithm:** SciPy cKDTree for O(N log N) spatial queries
- **Threshold:** 100 m miss distance
- **TCA:** Linear closest approach approximation

### Operational Constraints
- 10-second signal latency for command uplink
- Line-of-sight validation via ground station elevation angles
- 8 ground stations: Goldstone, Canberra, Madrid, Svalbard, Singapore, McMurdo, Bangalore, Kourou

---

## Project Structure

```
NSH/
├── Dockerfile              # Ubuntu 22.04 multi-stage build
├── docker-compose.yml      # Single-service deployment
├── README.md
├── backend/
│   ├── requirements.txt    # Python dependencies
│   ├── main.py             # FastAPI app + 4 API endpoints
│   ├── config.py           # Physical constants & ground stations
│   ├── models.py           # Pydantic request/response schemas
│   ├── physics_engine.py   # RK4 integrator with J2 perturbation
│   ├── fuel_model.py       # Tsiolkovsky equation & burn validation
│   ├── spatial_indexer.py  # KD-Tree collision detection
│   └── simulation.py       # World state manager
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx / App.css
        ├── index.css
        ├── api.js
        └── components/
            ├── Dashboard.jsx / .css
            ├── GroundTrackMap.jsx / .css
            ├── BullseyePlot.jsx / .css
            ├── TelemetryPanel.jsx / .css
            └── ManeuverTimeline.jsx / .css
```

---

## Configuration

Key constants in `backend/config.py`:

| Parameter              | Value        | Description                        |
| ---------------------- | ------------ | ---------------------------------- |
| `MU_EARTH`             | 3.986×10¹⁴  | Earth gravitational parameter      |
| `J2`                   | 1.08263×10⁻³ | J2 perturbation coefficient        |
| `WET_MASS_KG`          | 550.0 kg     | Initial satellite mass             |
| `ISP_S`                | 300.0 s      | Specific impulse                   |
| `MAX_DELTA_V`          | 15.0 m/s     | Maximum burn delta-v               |
| `COOLDOWN_S`           | 600 s        | Thermal cooldown between burns     |
| `COLLISION_THRESHOLD`  | 100 m        | Miss distance alert threshold      |
| `SIGNAL_LATENCY_S`     | 10 s         | Command uplink latency             |

---

## License

MIT License — Built for orbital operations research and education.
