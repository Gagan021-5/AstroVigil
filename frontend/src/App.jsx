import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Dashboard from './components/Dashboard';
import { fetchSnapshot, simulateStep } from './api';
import './App.css';

function App() {
  const [snapshot, setSnapshot]           = useState(null);
  const [simRunning, setSimRunning]       = useState(false);
  const [stepSize, setStepSize]           = useState(60);
  const [error, setError]                 = useState(null);
  const [selectedSatId, setSelectedSatId] = useState(0);
  const [fps, setFps]                     = useState(0);
  const frameCount  = useRef(0);
  const lastFpsTime = useRef(Date.now());
  const intervalRef = useRef(null);

  useEffect(() => {
    fetchSnapshot().then(setSnapshot).catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const now   = Date.now();
      const delta = (now - lastFpsTime.current) / 1000;
      setFps(Math.round(frameCount.current / delta));
      frameCount.current  = 0;
      lastFpsTime.current = now;
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      fetchSnapshot()
        .then(snap => { setSnapshot(snap); setError(null); frameCount.current++; })
        .catch(e => setError(e.message));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const runStep = useCallback(async () => {
    try {
      await simulateStep(stepSize);
      const snap = await fetchSnapshot();
      setSnapshot(snap);
      frameCount.current++;
      setError(null);
    } catch (e) { setError(e.message); }
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

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const epoch    = snapshot ? (snapshot.epoch / 3600).toFixed(2) : '0.00';
  const numSats  = snapshot ? snapshot.satellites.length : 0;
  const numDebris = snapshot ? Math.floor(snapshot.debris_compressed.length / 4) : 0;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
      background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(34,211,238,0.04) 0%, transparent 60%), radial-gradient(ellipse 55% 40% at 90% 110%, rgba(167,139,250,0.04) 0%, transparent 55%), var(--c-bg)',
    }}>

      {/* Subtle scan-line overlay */}
      <div className="scanline" aria-hidden="true" />

      {/* ── Header ── */}
      <header style={{
        flexShrink: 0,
        height: 'var(--header-h)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        gap: '12px',
        background: 'rgba(3,5,8,0.92)',
        backdropFilter: 'blur(24px)',
        borderBottom: '1px solid var(--c-border)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.03), 0 4px 20px rgba(0,0,0,0.4)',
        zIndex: 50,
        overflow: 'hidden',
      }}>

        {/* Left — Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <div className="orb" style={{
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--c-cyan)',
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: 'var(--font-ui)',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.2em',
            color: 'var(--c-text-1)',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}>
            Orbital Insight
          </span>
          <div style={{ width: 1, height: 14, background: 'var(--c-border)', flexShrink: 0 }} />
          <span style={{
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            color: 'var(--c-text-3)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            display: 'var(--subtitle-display, block)',
          }}>
            Autonomous Constellation Manager
          </span>
        </div>

        {/* Centre — Step & Play controls (compact pill) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(255,255,255,0.025)',
          border: '1px solid var(--c-border)',
          borderRadius: 8,
          padding: '0 8px',
          height: 32,
          flexShrink: 0,
        }}>
          {/* Step size */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontFamily: 'var(--font-data)', fontSize: 9, color: 'var(--c-text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Δt
            </span>
            <select
              value={stepSize}
              onChange={e => setStepSize(Number(e.target.value))}
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 11,
                background: 'transparent',
                color: 'var(--c-text-1)',
                border: 'none',
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none',
                paddingRight: 14,
                backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2352526a%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0 top 52%',
                backgroundSize: '0.45rem auto',
              }}
            >
              {[[10,'10s'],[30,'30s'],[60,'60s'],[120,'2m'],[300,'5m'],[600,'10m']].map(([v,l]) => (
                <option key={v} value={v} style={{ background: '#090b12' }}>{l}</option>
              ))}
            </select>
          </label>

          <div style={{ width: 1, height: 16, background: 'var(--c-border)' }} />

          {/* Step once */}
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={runStep}
            title="Single step"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 6,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--c-border)',
              color: 'var(--c-text-2)',
              cursor: 'pointer',
              fontSize: 11,
              transition: 'all 0.18s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; e.currentTarget.style.color = 'var(--c-text-1)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--c-text-2)'; }}
          >⏭</motion.button>

          {/* Play / Pause */}
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={toggleSim}
            style={{
              position: 'relative',
              overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 12px',
              height: 26, borderRadius: 6,
              fontFamily: 'var(--font-data)',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'all 0.25s',
              ...(simRunning ? {
                background: 'rgba(251,113,133,0.08)',
                border: '1px solid rgba(251,113,133,0.22)',
                color: '#fda4af',
                boxShadow: '0 0 12px rgba(251,113,133,0.12)',
              } : {
                background: 'rgba(52,211,153,0.08)',
                border: '1px solid rgba(52,211,153,0.22)',
                color: '#6ee7b7',
                boxShadow: '0 0 12px rgba(52,211,153,0.12)',
              }),
            }}
          >
            {simRunning && (
              <span className="sim-running-bar" style={{
                position: 'absolute', inset: 0, width: '35%',
                background: 'linear-gradient(90deg, transparent, rgba(251,113,133,0.18), transparent)',
              }} />
            )}
            <span style={{ position: 'relative' }}>
              {simRunning ? 'PAUSE' : '▶ RUN'}
            </span>
          </motion.button>
        </div>

        {/* Right — Status chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <Chip variant="cyan"   label={`T+ ${epoch}h`} />
          <Chip variant="violet" label={`🛰 ${numSats}`} />
          <Chip variant="amber"  label={`🪨 ${numDebris}`} />
          <Chip variant="slate"  label={`${fps} fps`} mono />
        </div>

      </header>

      {/* ── Error banner ── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{
              overflow: 'hidden',
              background: 'rgba(251,113,133,0.08)',
              borderBottom: '1px solid rgba(251,113,133,0.2)',
              color: '#fda4af',
              fontFamily: 'var(--font-data)',
              fontSize: 11,
              padding: '4px 16px',
              letterSpacing: '0.04em',
              flexShrink: 0,
            }}
          >
            ⚠ {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Dashboard ── */}
      <Dashboard
        snapshot={snapshot}
        selectedSatId={selectedSatId}
        onSelectSat={setSelectedSatId}
      />
    </div>
  );
}

/* ── Chip ── */
function Chip({ variant = 'slate', label, mono }) {
  const styles = {
    cyan:   'badge-cyan',
    violet: 'badge-violet',
    rose:   'badge-rose',
    amber:  'badge-amber',
    green:  'badge-green',
    slate:  'badge-slate',
  };
  return (
    <div
      className={styles[variant]}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 22, padding: '0 9px', borderRadius: 100,
        border: '1px solid',
        fontFamily: mono ? 'var(--font-data)' : 'var(--font-ui)',
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: '0.05em',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </div>
  );
}

export default App;