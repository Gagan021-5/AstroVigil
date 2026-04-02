import importlib
import os
import shutil
import sys
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    temp_root = Path("backend/tests/runtime_tmp")
    temp_root.mkdir(parents=True, exist_ok=True)
    temp_dir = Path(tempfile.mkdtemp(prefix="acm-", dir=temp_root))
    os.environ["ACM_DEFAULT_NUM_SATELLITES"] = "6"
    os.environ["ACM_DEFAULT_NUM_DEBRIS"] = "24"
    os.environ["ACM_SATELLITE_DB_PATH"] = str((temp_dir / "satellites.json").resolve())

    for module_name in [
        "backend.config",
        "backend.data.db",
        "backend.simulation",
        "backend.main",
    ]:
        sys.modules.pop(module_name, None)

    app_module = importlib.import_module("backend.main")

    with TestClient(app_module.app) as test_client:
        yield test_client

    shutil.rmtree(temp_dir, ignore_errors=True)


def test_health_endpoints(client: TestClient):
    api_health = client.get("/api/health")
    assert api_health.status_code == 200
    assert api_health.json()["status"] == "operational"

    root_health = client.get("/health")
    assert root_health.status_code == 200
    assert root_health.json()["status"] == "ok"


def test_legacy_snapshot_and_simulation_step(client: TestClient):
    snapshot = client.get("/api/visualization/snapshot")
    assert snapshot.status_code == 200
    snapshot_body = snapshot.json()
    assert "epoch" in snapshot_body
    assert len(snapshot_body["satellites"]) == 6

    step = client.post("/api/simulate/step", json={"step_seconds": 60})
    assert step.status_code == 200
    assert step.json()["step_seconds"] == 60


def test_bullseye_demo_seeded_into_snapshot(client: TestClient):
    snapshot = client.get("/api/visualization/snapshot")
    assert snapshot.status_code == 200
    snapshot_body = snapshot.json()
    conjunctions = [
        conj for conj in snapshot_body["conjunctions"]
        if conj["satellite_id"] == 0
    ]

    assert len(conjunctions) >= 3
    assert min(conj["miss_distance_m"] for conj in conjunctions) < 1_000.0
    assert max(conj["miss_distance_m"] for conj in conjunctions) < 5_000.0
    assert snapshot_body["kessler_analytics"]["satellite_scores"]
    assert snapshot_body["kessler_analytics"]["density_bins"]


def test_copilot_sitrep_endpoint_returns_text(client: TestClient):
    response = client.get("/api/copilot/sitrep")
    assert response.status_code == 200
    payload = response.json()
    assert payload["model"] == "gemini-2.5-pro"
    assert isinstance(payload["sitrep"], str)
    assert len(payload["sitrep"]) > 20
    assert "input_summary_json" in payload


def test_catalog_routes(client: TestClient):
    satellites = client.get("/api/satellites")
    assert satellites.status_code == 200
    catalog = satellites.json()
    assert len(catalog) >= 2

    catalog_snapshot = client.get("/api/catalog/snapshot")
    assert catalog_snapshot.status_code == 200
    assert "timestamp" in catalog_snapshot.json()

    propagation = client.post(
        "/api/propagation/propagate",
        json={
            "satellite_id": catalog[0]["id"],
            "time_step_sec": 60,
            "duration_hours": 0.1,
        },
    )
    assert propagation.status_code == 200
    assert len(propagation.json()["trajectory"]) > 0

    conjunctions = client.get("/api/conjunction/all", params={"time_window_hours": 0.1})
    assert conjunctions.status_code == 200
    assert isinstance(conjunctions.json(), list)


def test_catalog_maneuver_routes(client: TestClient):
    satellites = client.get("/api/satellites").json()
    sat1 = satellites[0]
    sat2 = satellites[1]

    plan = client.post(
        "/api/maneuver/plan",
        json={
            "sat1_id": sat1["id"],
            "sat2_id": sat2["id"],
            "tca": 0.0,
            "miss_distance_km": 1.5,
            "probability": 0.01,
        },
    )
    assert plan.status_code == 200
    fuel_consumed = plan.json()["fuel_consumed_kg"]

    execute = client.post(
        "/api/maneuver/execute",
        json={"satellite_id": sat1["id"], "fuel_consumed_kg": fuel_consumed},
    )
    assert execute.status_code == 200
    assert execute.json()["status"] == "success"


def test_websocket_snapshot_stream(client: TestClient):
    with client.websocket_connect("/ws/telemetry") as websocket:
        payload = websocket.receive_json()

    assert "timestamp" in payload
    assert "satellites" in payload
