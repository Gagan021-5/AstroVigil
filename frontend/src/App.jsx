import React, { useState, useEffect, useCallback, useRef } from 'react';
import Dashboard from './components/Dashboard';
import { fetchSnapshot, simulateStep } from './api';
import './App.css';

function App() {
  const [snapshot, setSnapshot] = useState(null);
  const [simRunning, setSimRunning] = useState(false);
  const [stepSize, setStepSize] = useState(60);
  const [error, setError] = useState(null);
  const [selectedSatId, setSelectedSatId] = useState(0);
  const [fps, setFps] = useState(0);
  const frameCount = useRef(0);
  const lastFpsTime = useRef(Date.now());
  const intervalRef = useRef(null);

  // Load initial snapshot
  useEffect(() => {
    fetchSnapshot()
      .then(setSnapshot)
      .catch(e => setError(e.message));
  }, []);

  // FPS counter
  useEffect(() => {
    const fpsInterval = setInterval(() => {
      const now = Date.now();
      const delta = (now - lastFpsTime.current) / 1000;
      setFps(Math.round(frameCount.current / delta));
      frameCount.current = 0;
      lastFpsTime.current = now;
    }, 1000);
    return () => clearInterval(fpsInterval);
  }, []);

  const runStep = useCallback(async () => {
    try {
      await simulateStep(stepSize);
      const snap = await fetchSnapshot();
      setSnapshot(snap);
      frameCount.current++;
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, [stepSize]);

  const toggleSim = useCallback(() => {
    if (simRunning) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      setSimRunning(false);
    } else {
      setSimRunning(true);
      intervalRef.current = setInterval(runStep, 100);
    }
  }, [simRunning, runStep]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div className="app">
      {/* Header Bar */}
      <header className="app-header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-icon">◉</span>
            <h1>Orbital Insight</h1>
          </div>
          <span className="subtitle">Autonomous Constellation Manager</span>
        </div>

        <div className="header-center">
          <div className="sim-controls">
            <button className="btn btn-step" onClick={runStep} title="Single step">
              ⏭
            </button>
            <button
              className={`btn ${simRunning ? 'btn-stop' : 'btn-play'}`}
              onClick={toggleSim}
            >
              {simRunning ? '⏸ Pause' : '▶ Run'}
            </button>
            <label className="step-label">
              Step:
              <select value={stepSize} onChange={e => setStepSize(Number(e.target.value))}>
                <option value={10}>10s</option>
                <option value={30}>30s</option>
                <option value={60}>60s</option>
                <option value={120}>2m</option>
                <option value={300}>5m</option>
                <option value={600}>10m</option>
              </select>
            </label>
          </div>
        </div>

        <div className="header-right">
          <div className="status-chips">
            <span className="chip chip-epoch">
              T+ {snapshot ? (snapshot.epoch / 3600).toFixed(2) : '0.00'}h
            </span>
            <span className="chip chip-sats">
              🛰 {snapshot ? snapshot.satellites.length : 0}
            </span>
            <span className="chip chip-debris">
              🪨 {snapshot ? Math.floor(snapshot.debris_compressed.length / 4) : 0}
            </span>
            <span className="chip chip-fps">{fps} FPS</span>
          </div>
        </div>
      </header>

      {error && <div className="error-banner">⚠ {error}</div>}

      {/* Dashboard */}
      <Dashboard
        snapshot={snapshot}
        selectedSatId={selectedSatId}
        onSelectSat={setSelectedSatId}
      />
    </div>
  );
}

export default App;
