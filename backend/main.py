"""
Autonomous Constellation Manager - FastAPI Application
REST API endpoints for constellation management.
"""
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from models import (
    TelemetryPayload, TelemetryResponse,
    ManeuverScheduleRequest, ManeuverScheduleResponse, BurnResult,
    SimulationStepRequest, SimulationStepResponse, CollisionEvent,
    VisualizationSnapshot, SatelliteSnapshot, ConjunctionInfo, ManeuverBlock,
)
from simulation import SimulationWorld


# ─── Global simulation state ─────────────────────────────────────────
world = SimulationWorld()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize simulation on startup."""
    world.initialize_default()
    print(f"[ACM] Initialized: {len(world.satellites)} satellites, "
          f"{len(world.debris)} debris objects")
    yield
    print("[ACM] Shutting down.")


# ─── App Setup ────────────────────────────────────────────────────────
app = FastAPI(
    title="Autonomous Constellation Manager",
    description="Centralized brain for satellite fleet management and collision avoidance",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── API Endpoints ───────────────────────────────────────────────────

@app.post("/api/telemetry", response_model=TelemetryResponse)
async def ingest_telemetry(payload: TelemetryPayload):
    """
    Asynchronously parse high-frequency ECI state vectors for all objects.
    Accepts batch telemetry updates with position and velocity data.
    """
    result = world.ingest_telemetry(payload.epoch, payload.states)
    return TelemetryResponse(**result)


@app.post("/api/maneuver/schedule", response_model=ManeuverScheduleResponse)
async def schedule_maneuvers(request: ManeuverScheduleRequest):
    """
    Accept an array of evasion and recovery burns.
    Validates each burn against fuel, cooldown, line-of-sight, and latency constraints.
    Delta-v applied instantaneously at the exact burn time.
    """
    results = world.schedule_maneuvers(request.burns)
    
    burn_results = [BurnResult(**r) for r in results]
    scheduled = sum(1 for r in burn_results if r.accepted)
    rejected = len(burn_results) - scheduled
    
    return ManeuverScheduleResponse(
        scheduled=scheduled,
        rejected=rejected,
        results=burn_results,
    )


@app.post("/api/simulate/step", response_model=SimulationStepResponse)
async def simulate_step(request: SimulationStepRequest):
    """
    Advance the simulation time by `step_seconds`.
    Integrates physics (RK4 + J2), executes scheduled maneuvers,
    and returns detected collision events.
    """
    result = world.step(request.step_seconds)
    
    collisions = [CollisionEvent(**c) for c in result["collisions_detected"]]
    
    return SimulationStepResponse(
        current_epoch=result["current_epoch"],
        step_seconds=result["step_seconds"],
        satellites_propagated=result["satellites_propagated"],
        debris_propagated=result["debris_propagated"],
        maneuvers_executed=result["maneuvers_executed"],
        collisions_detected=collisions,
    )


@app.get("/api/visualization/snapshot", response_model=VisualizationSnapshot)
async def get_visualization_snapshot():
    """
    Return the current state of the constellation.
    Debris cloud data compressed into flattened array [ID, Lat, Lon, Alt].
    """
    snap = world.get_snapshot()
    
    return VisualizationSnapshot(
        epoch=snap["epoch"],
        satellites=[SatelliteSnapshot(**s) for s in snap["satellites"]],
        debris_compressed=snap["debris_compressed"],
        conjunctions=[ConjunctionInfo(**c) for c in snap["conjunctions"]],
        maneuver_timeline=[ManeuverBlock(**m) for m in snap["maneuver_timeline"]],
        total_fuel_consumed_kg=snap["total_fuel_consumed_kg"],
        total_collisions_avoided=snap["total_collisions_avoided"],
    )


@app.get("/api/health")
async def health():
    return {
        "status": "operational",
        "satellites": len(world.satellites),
        "debris": len(world.debris),
        "epoch": world.epoch,
    }


# ─── Serve static frontend if built ──────────────────────────────────
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
