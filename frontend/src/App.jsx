import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import IntelligencePage from './components/IntelligencePage';
import OperationsPage from './components/OperationsPage';
import { fetchSnapshot, simulateStep } from './api';
import './App.css';

const ROUTES = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    title: 'Mission Overview',
    description: 'Track orbital geometry and active conjunctions without crowding the workspace.',
  },
  {
    path: '/flight-ops',
    label: 'Flight Ops',
    title: 'Flight Operations',
    description: 'Watch fuel posture, queued maneuvers, and blackout-aware scheduling in one place.',
  },
  {
    path: '/intel',
    label: 'Intel',
    title: 'Threat Intelligence',
    description: 'Review Kessler crowding signals and generate strategic SitReps from the FDO Copilot.',
  },
];

function App() {
  const location = useLocation();
  const [snapshot, setSnapshot] = useState(null);
  const [simRunning, setSimRunning] = useState(false);
  const [stepSize, setStepSize] = useState(60);
  const [error, setError] = useState(null);
  const [selectedSatId, setSelectedSatId] = useState(0);
  const [fps, setFps] = useState(0);
  const frameCount = useRef(0);
  const lastFpsTime = useRef(Date.now());
  const intervalRef = useRef(null);

  useEffect(() => {
    fetchSnapshot().then(setSnapshot).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const delta = (now - lastFpsTime.current) / 1000;
      setFps(Math.round(frameCount.current / delta));
      frameCount.current = 0;
      lastFpsTime.current = now;
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      fetchSnapshot()
        .then((snap) => {
          setSnapshot(snap);
          setError(null);
          frameCount.current += 1;
        })
        .catch((e) => setError(e.message));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const runStep = useCallback(async () => {
    try {
      await simulateStep(stepSize);
      const snap = await fetchSnapshot();
      setSnapshot(snap);
      frameCount.current += 1;
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

  useEffect(
    () => () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    },
    []
  );

  const pageMeta = useMemo(
    () => ROUTES.find((route) => route.path === location.pathname) ?? ROUTES[0],
    [location.pathname]
  );

  const selectedSatellite = useMemo(
    () => snapshot?.satellites.find((satellite) => satellite.id === selectedSatId) ?? null,
    [snapshot, selectedSatId]
  );

  const selectedKti = useMemo(
    () =>
      snapshot?.kessler_analytics?.satellite_scores?.find(
        (score) => score.satellite_id === selectedSatId
      ) ?? null,
    [snapshot, selectedSatId]
  );

  const epoch = snapshot ? (snapshot.epoch / 3600).toFixed(2) : '0.00';
  const numSats = snapshot ? snapshot.satellites.length : 0;
  const numDebris = snapshot ? Math.floor(snapshot.debris_compressed.length / 4) : 0;

  return (
    <div className="app-shell">
      <div className="scanline" aria-hidden="true" />

      <header className="app-header">
        <div className="app-header__row">
          <div className="app-brand">
            <div className="orb app-brand__orb" />
            <div className="app-brand__copy">
              <span className="app-brand__title">Orbital Insight</span>
              <span className="app-brand__subtitle">Autonomous Constellation Manager</span>
            </div>
          </div>

          <nav className="app-nav" aria-label="Primary navigation">
            {ROUTES.map((route) => (
              <NavLink
                key={route.path}
                to={route.path}
                className={({ isActive }) =>
                  `app-nav__link${isActive ? ' app-nav__link--active' : ''}`
                }
              >
                {route.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="app-header__row app-header__row--controls">
          <div className="app-toolbar">
            <label className="app-toolbar__control">
              <span>Delta t</span>
              <select
                value={stepSize}
                onChange={(e) => setStepSize(Number(e.target.value))}
                className="app-toolbar__select"
              >
                {[
                  [10, '10s'],
                  [30, '30s'],
                  [60, '60s'],
                  [120, '2m'],
                  [300, '5m'],
                  [600, '10m'],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <button type="button" className="app-toolbar__button" onClick={runStep}>
              Step
            </button>

            <button
              type="button"
              className={`app-toolbar__button app-toolbar__button--run${
                simRunning ? ' is-running' : ''
              }`}
              onClick={toggleSim}
            >
              {simRunning ? 'Pause' : 'Run'}
            </button>
          </div>

          <div className="app-badges">
            <Chip variant="cyan" label={`T+ ${epoch}h`} />
            <Chip variant="violet" label={`${numSats} sats`} />
            <Chip variant="amber" label={`${numDebris} debris`} />
            <Chip variant="green" label={`SAT-${selectedSatId}`} />
            <Chip
              variant={
                selectedKti?.risk_band === 'red'
                  ? 'rose'
                  : selectedKti?.risk_band === 'yellow'
                    ? 'amber'
                    : 'slate'
              }
              label={selectedKti ? `KTI ${selectedKti.kti_score.toFixed(1)}` : 'KTI --'}
              mono
            />
            <Chip variant="slate" label={`${fps} fps`} mono />
          </div>
        </div>
      </header>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="app-error"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <main className="app-main">
        <section className="page-intro">
          <div>
            <p className="page-intro__eyebrow">{pageMeta.label}</p>
            <h1 className="page-intro__title">{pageMeta.title}</h1>
            <p className="page-intro__description">{pageMeta.description}</p>
          </div>

          <div className="page-intro__stats">
            <RouteStat
              label="Focused Satellite"
              value={`SAT-${selectedSatId}`}
              detail={
                selectedSatellite
                  ? `${(selectedSatellite.alt / 1000).toFixed(1)} km altitude`
                  : 'Awaiting live state'
              }
              tone="#67e8f9"
            />
            <RouteStat
              label="Fuel Remaining"
              value={
                selectedSatellite ? `${selectedSatellite.fuel_remaining_kg.toFixed(1)} kg` : 'N/A'
              }
              detail="Live propulsion reserve"
              tone="#6ee7b7"
            />
            <RouteStat
              label="Mission Pressure"
              value={formatDistance(snapshot?.closest_object_distance_m)}
              detail="Nearest tracked object"
              tone="#fbbf24"
            />
          </div>
        </section>

        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="route-stage"
          >
            <Routes location={location}>
              <Route
                path="/dashboard"
                element={
                  <Dashboard
                    snapshot={snapshot}
                    selectedSatId={selectedSatId}
                    onSelectSat={setSelectedSatId}
                  />
                }
              />
              <Route
                path="/flight-ops"
                element={<OperationsPage snapshot={snapshot} selectedSatId={selectedSatId} />}
              />
              <Route
                path="/intel"
                element={<IntelligencePage snapshot={snapshot} selectedSatId={selectedSatId} />}
              />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function RouteStat({ label, value, detail, tone }) {
  return (
    <div className="route-stat">
      <span className="route-stat__label">{label}</span>
      <span className="route-stat__value" style={{ color: tone }}>
        {value}
      </span>
      <span className="route-stat__detail">{detail}</span>
    </div>
  );
}

function Chip({ variant = 'slate', label, mono = false }) {
  const styles = {
    cyan: 'badge-cyan',
    violet: 'badge-violet',
    rose: 'badge-rose',
    amber: 'badge-amber',
    green: 'badge-green',
    slate: 'badge-slate',
  };

  return <div className={`${styles[variant]} app-chip${mono ? ' app-chip--mono' : ''}`}>{label}</div>;
}

function formatDistance(distanceM) {
  if (distanceM == null) return 'N/A';
  if (distanceM >= 1000) return `${(distanceM / 1000).toFixed(1)} km`;
  return `${distanceM.toFixed(0)} m`;
}

export default App;
