# AstroVigil - Project Debris

Autonomous Constellation Manager for LEO debris avoidance, conjunction monitoring, and blackout-aware maneuver planning.

AstroVigil couples a FastAPI simulation backend with a React + Vite mission UI. It propagates a 50-satellite constellation through a 10,000-object debris field, detects close approaches with a KD-tree, verifies evasive burns with a 90-minute look-ahead tree, and now exposes route-based mission pages so the UI stays readable across laptops and smaller screens.

## Highlights

- RK4 orbital propagation with J2 perturbation in ECI space
- KD-tree conjunction detection across 50 satellites and 10,000 debris objects
- 90-minute recursive look-ahead tree for multi-threat evasion verification
- Ground-station LOS tracking with blackout-aware pre-emptive burn uploads
- Kessler Threat Index (KTI) and orbital density analytics
- Gemini-powered FDO Copilot SitRep endpoint with safe local fallback mode
- Route-based mission UI: `Dashboard`, `Flight Ops`, and `Intel`

## What's New

### Route-based UI
The mission UI is no longer forced into one oversized screen.

New client routes:

| Route | Purpose |
|---|---|
| `/dashboard` | Ground track, conjunction bullseye, and a clean mission summary |
| `/flight-ops` | Telemetry and maneuver timeline |
| `/intel` | Kessler analytics and the FDO Copilot |

The FastAPI app now serves the SPA correctly for those routes, so direct refreshes like `http://localhost:8000/flight-ops` work in Docker too.

### Kessler Threat Index (KTI)
AstroVigil now bins debris into 10 km altitude shells, computes mean density and standard deviation, and assigns each satellite a proprietary `0-100` KTI score based on shell crowding and proximity to the densest clusters.

The Intel page displays:

- active satellite KTI score
- green / yellow / red risk bands
- densest altitude shell
- top debris density shells

### FDO Copilot
A new backend endpoint is available:

- `GET /api/copilot/sitrep`

It compresses live sim state into a lightweight JSON summary including:

- active collisions
- closest conjunctions
- fuel posture
- upcoming blackout risks
- queued blackout uploads
- highest KTI scores

That payload is sent to `gemini-2.5-pro` with the AstroVigil system prompt. If no API key is configured, the endpoint falls back to a local 3-sentence operational summary so the UI still works.

### Blackout-aware look-ahead maneuvering
The maneuver pipeline supports:

- primary collision detection
- recursive delta-v refinement if a secondary threat appears on the proposed path
- LOS checks to ground stations at conjunction time
- pre-emptive upload of both evasion and recovery burns when the conjunction falls in blackout
- 10-second signal latency accounting

## UI Pages

### `/dashboard`
Best for situational awareness.

Includes:

- Ground Track map
- Conjunction Bullseye
- Mission Summary cards for the selected satellite, fuel, threat distance, KTI, and burn queue

### `/flight-ops`
Best for active operations and burn review.

Includes:

- Telemetry panel
- Maneuver Timeline

### `/intel`
Best for strategic planning and orbital risk assessment.

Includes:

- Kessler Analytics
- FDO Copilot panel with `Generate SitRep`

## Quick Start

### Option A: Docker

Make sure Docker Desktop is running, then from the repo root:

```bash
docker compose up --build
```

Main URLs:

| Interface | URL |
|---|---|
| Mission UI | http://localhost:8000/dashboard |
| Flight Ops | http://localhost:8000/flight-ops |
| Intel | http://localhost:8000/intel |
| API Docs | http://localhost:8000/docs |
| Health | http://localhost:8000/api/health |

### Option B: Local Dev

Backend:

```bash
pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Or use the unified launcher:

```bash
python dev.py --full
```

## Gemini / Copilot Setup

To enable real Gemini SitReps instead of fallback mode, set one of these environment variables before starting the backend:

```bash
GEMINI_API_KEY=your_key_here
```

or

```bash
GOOGLE_API_KEY=your_key_here
```

Optional model override:

```bash
ACM_COPILOT_MODEL=gemini-2.5-pro
```

Docker already passes these variables through from your environment via `docker-compose.yml`.

## Backend API

### `POST /api/simulate/step`
Advance the simulation and run conjunction / maneuver logic.

Example body:

```json
{ "step_seconds": 60 }
```

### `GET /api/visualization/snapshot`
Returns the live mission snapshot used by the UI.

Includes:

- satellites
- compressed debris field
- conjunctions
- maneuver timeline
- Kessler analytics
- fleet fuel and collision totals

### `GET /api/copilot/sitrep`
Generates a concise 3-sentence operator summary.

Returned fields:

- `provider`
- `model`
- `available`
- `generated_at_epoch`
- `sitrep`
- `input_summary_json`

### `POST /api/maneuver/schedule`
Schedule manual maneuver requests.

### `POST /api/telemetry`
Inject external telemetry state vectors.

## Core Intelligence

### Look-Ahead Tree
When a primary conjunction crosses the collision threshold, AstroVigil computes an evasion delta-v and simulates the proposed post-burn path 90 minutes forward. If a secondary threat appears, the delta-v is recursively adjusted until the path is verified safe or the recursion cap is reached.

### LOS and Blackout Planning
AstroVigil evaluates line-of-sight from every satellite to configured ground stations using station latitude, longitude, altitude, and elevation masks. If a conjunction happens in blackout, the system schedules the evasion burn and recovery burn early, while the spacecraft is still in contact with the last available station.

### KTI Analytics
Debris are grouped into altitude bins, density statistics are computed, and each satellite is scored against the densest orbital shells so operators can identify crowding risk before conjunctions become immediate.

### FDO Copilot
The copilot translates dense mission state into fast human-readable operator guidance, highlighting fuel issues, imminent conjunctions, blackout risks, and high-KTI satellites.

## Project Structure

```text
astrovigil/
|-- backend/
|   |-- main.py
|   |-- config.py
|   |-- copilot.py
|   |-- simulation.py
|   |-- physics_engine.py
|   |-- fuel_model.py
|   |-- spatial_indexer.py
|   |-- legacy_models.py
|   `-- requirements.txt
|-- frontend/
|   |-- src/
|   |   |-- App.jsx
|   |   |-- api.js
|   |   `-- components/
|   |       |-- Dashboard.jsx
|   |       |-- OperationsPage.jsx
|   |       |-- IntelligencePage.jsx
|   |       |-- GroundTrackMap.jsx
|   |       |-- BullseyePlot.jsx
|   |       |-- TelemetryPanel.jsx
|   |       |-- ManeuverTimeline.jsx
|   |       |-- KesslerAnalytics.jsx
|   |       |-- CopilotPanel.jsx
|   |       |-- MissionSummary.jsx
|   |       `-- PanelFrame.jsx
|   `-- package.json
|-- docker-compose.yml
|-- Dockerfile
`-- README.md
```

## Notes

- The seeded close-approach demo keeps the Bullseye visibly active for the selected satellite.
- If `GEMINI_API_KEY` is not configured, the Copilot panel still works in fallback mode.
- Do not run `python dev.py` and `docker compose up` against the same port at the same time.

## License

MIT
