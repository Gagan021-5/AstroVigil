/**
 * ACM API Client - Fetch wrappers for backend endpoints
 */

const API_BASE = '/api';

export async function fetchSnapshot() {
  const res = await fetch(`${API_BASE}/visualization/snapshot`);
  if (!res.ok) throw new Error(`Snapshot failed: ${res.status}`);
  return res.json();
}

export async function simulateStep(stepSeconds = 60) {
  const res = await fetch(`${API_BASE}/simulate/step`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step_seconds: stepSeconds }),
  });
  if (!res.ok) throw new Error(`Simulation step failed: ${res.status}`);
  return res.json();
}

export async function ingestTelemetry(epoch, states) {
  const res = await fetch(`${API_BASE}/telemetry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ epoch, states }),
  });
  if (!res.ok) throw new Error(`Telemetry ingest failed: ${res.status}`);
  return res.json();
}

export async function scheduleManeuvers(burns) {
  const res = await fetch(`${API_BASE}/maneuver/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ burns }),
  });
  if (!res.ok) throw new Error(`Maneuver schedule failed: ${res.status}`);
  return res.json();
}

export async function fetchCopilotSitrep() {
  const res = await fetch(`${API_BASE}/copilot/sitrep`);
  if (!res.ok) throw new Error(`Copilot SitRep failed: ${res.status}`);
  return res.json();
}
