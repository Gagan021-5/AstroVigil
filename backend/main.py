"""
Autonomous Constellation Manager - FastAPI Application
Merged legacy simulation endpoints plus the new modular catalog/orbit routes.
"""
import asyncio
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Allow direct execution like `python backend/main.py` or IDE "Run File".
if __package__ in (None, ""):
    repo_root = Path(__file__).resolve().parent.parent
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))

from backend.api.routes import conjunction, maneuver, propagator, satellites
from backend.api.routes.propagator import build_snapshot_payload
from backend.core.collision_risk import compute_and_store_collision_risk
from backend.data import db
from backend.legacy_models import (
    BurnResult,
    CollisionEvent,
    ConjunctionInfo,
    ManeuverBlock,
    ManeuverScheduleRequest,
    ManeuverScheduleResponse,
    SatelliteSnapshot,
    SimulationStepRequest,
    SimulationStepResponse,
    TelemetryPayload,
    TelemetryResponse,
    VisualizationSnapshot,
)
from backend.simulation import SimulationWorld


world = SimulationWorld()


@asynccontextmanager
async def lifespan(app: FastAPI):
    world.initialize_default()
    db.init_db()
    compute_and_store_collision_risk()
    yield


app = FastAPI(
    title="Autonomous Constellation Manager",
    description="Centralized brain for satellite fleet management and collision avoidance",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/telemetry", response_model=TelemetryResponse)
async def ingest_telemetry(payload: TelemetryPayload):
    result = world.ingest_telemetry(payload.epoch, payload.states)
    return TelemetryResponse(**result)


@app.post("/api/maneuver/schedule", response_model=ManeuverScheduleResponse)
async def schedule_maneuvers(request: ManeuverScheduleRequest):
    results = world.schedule_maneuvers(request.burns)

    burn_results = [BurnResult(**result) for result in results]
    scheduled = sum(1 for result in burn_results if result.accepted)
    rejected = len(burn_results) - scheduled

    return ManeuverScheduleResponse(
        scheduled=scheduled,
        rejected=rejected,
        results=burn_results,
    )


@app.post("/api/simulate/step", response_model=SimulationStepResponse)
async def simulate_step(request: SimulationStepRequest):
    result = world.step(request.step_seconds)
    collisions = [CollisionEvent(**collision) for collision in result["collisions_detected"]]

    return SimulationStepResponse(
        current_epoch=result["current_epoch"],
        step_seconds=result["step_seconds"],
        satellites_propagated=result["satellites_propagated"],
        debris_propagated=result["debris_propagated"],
        maneuvers_executed=result["maneuvers_executed"],
        collisions_detected=collisions,
        avoidance_burns_scheduled=result.get("avoidance_burns_scheduled", 0),
        blackout_preemptive_count=result.get("blackout_preemptive_count", 0),
    )


@app.get("/api/visualization/snapshot", response_model=VisualizationSnapshot)
async def get_visualization_snapshot():
    snap = world.get_snapshot()
    return VisualizationSnapshot(
        epoch=snap["epoch"],
        satellites=[SatelliteSnapshot(**satellite) for satellite in snap["satellites"]],
        debris_compressed=snap["debris_compressed"],
        conjunctions=[ConjunctionInfo(**c) for c in snap["conjunctions"]],
        maneuver_timeline=[
            ManeuverBlock(
                satellite_id=m["satellite_id"],
                burn_start=m["burn_start"],
                burn_end=m["burn_end"],
                cooldown_end=m["cooldown_end"],
                delta_v_mag=m["delta_v_mag"],
                conflicts=m.get("conflicts", False),
                blackout_preemptive=m.get("blackout_preemptive", False),
                preempt_station=m.get("preempt_station"),
            )
            for m in snap["maneuver_timeline"]
        ],
        total_fuel_consumed_kg=snap["total_fuel_consumed_kg"],
        total_collisions_avoided=snap["total_collisions_avoided"],
        queued_maneuvers_count=snap.get("queued_maneuvers_count", 0),
        queued_preemptive_maneuvers_count=snap.get("queued_preemptive_maneuvers_count", 0),
        executed_preemptive_maneuvers_count=snap.get("executed_preemptive_maneuvers_count", 0),
        closest_object_distance_m=snap.get("closest_object_distance_m"),
        collision_trigger_distance_m=snap.get("collision_trigger_distance_m", 100.0),
    )


@app.get("/api/health")
async def api_health():
    return {
        "status": "operational",
        "satellites": len(world.satellites),
        "debris": len(world.debris),
        "epoch": world.epoch,
    }


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "version": "1.0.0",
        "catalog_satellites": len(db.get_all_satellites()),
    }


@app.websocket("/ws/telemetry")
async def telemetry_ws(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            await websocket.send_json(build_snapshot_payload())
            await asyncio.sleep(1.0)
    except WebSocketDisconnect:
        pass


app.include_router(satellites.router)
app.include_router(propagator.router)
app.include_router(conjunction.router)
app.include_router(maneuver.router)


frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")


if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
