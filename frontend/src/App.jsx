import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Dashboard from './components/Dashboard';
import { fetchSnapshot, simulateStep } from './api';
import './App.css';

function App() {
  const [snapshot, setSnapshot]         = useState(null);
  const [simRunning, setSimRunning]     = useState(false);
  const [stepSize, setStepSize]         = useState(60);
  const [error, setError]               = useState(null);
  const [selectedSatId, setSelectedSatId] = useState(0);
  const [fps, setFps]                   = useState(0);
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
      frameCount.current = 0;
      lastFpsTime.current = now;
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
    <div className="flex flex-col h-full bg-[#020408]"
         style={{ background: 'radial-gradient(ellipse 90% 40% at 50% -5%, rgba(34,211,238,0.045) 0%, transparent 55%), radial-gradient(ellipse 60% 35% at 85% 105%, rgba(129,140,248,0.04) 0%, transparent 55%), #020408' }}>

      {/* ── Header ── */}
      <header className="flex-none w-full h-16 bg-[#000000]/80 backdrop-blur-2xl border-b border-white/[0.04] z-50">
        <div className="flex items-center justify-between w-full h-full px-5 lg:px-8 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          
          {/* Left: Logo + subtitle */}
          <div className="flex items-center gap-6 shrink-0 mr-8">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)] shrink-0" />
              <h1 className="font-['Syne'] text-[15px] lg:text-[16px] font-bold tracking-[0.2em] text-[#ededed] uppercase mt-0.5">
                Orbital Insight
              </h1>
            </div>
            {/* Divider + Subtitle only visible on larger screens */}
            <div className="hidden lg:flex items-center gap-6">
              <div className="w-px h-4 bg-white/[0.1]" />
              <span className="font-['DM_Mono'] text-[11px] text-[#71717a] tracking-[0.1em] uppercase">
                Autonomous Constellation Manager
              </span>
            </div>
          </div>

          {/* Right: Controls + Chips */}
          <div className="flex items-center gap-6 shrink-0">
            
            {/* Sim controls */}
            <div className="flex items-center gap-3">
              
              <label className="flex items-center gap-2 font-['DM_Mono'] text-[10px] text-zinc-500 tracking-[0.05em] uppercase">
                <span>Step</span>
                <select
                  value={stepSize}
                  onChange={e => setStepSize(Number(e.target.value))}
                  className="font-['DM_Mono'] text-[11px] bg-transparent border border-white/[0.08] text-zinc-300 rounded px-2.5 py-1.5 cursor-pointer outline-none hover:border-white/[0.2] transition-colors appearance-none pr-5"
                  style={{ backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23A1A1AA%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right .35rem top 50%', backgroundSize: '.5rem auto' }}
                >
                  {[ [10,'10s'], [30,'30s'], [60,'60s'], [120,'2m'], [300,'5m'], [600,'10m'] ].map(([v,l]) => (
                    <option key={v} value={v} className="bg-[#0a0a0a]">{l}</option>
                  ))}
                </select>
              </label>

              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={runStep}
                title="Single step"
                className="flex items-center justify-center w-8 h-8 rounded border border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:bg-white/[0.08] hover:text-white transition-all text-[14px]"
              >⏭</motion.button>

              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={toggleSim}
                className={`relative overflow-hidden flex items-center justify-center px-4 h-8 rounded border font-['DM_Mono'] text-[10px] font-medium tracking-[0.1em] uppercase transition-all duration-300
                  ${simRunning
                    ? 'border-rose-500/20 text-rose-400 bg-rose-500/[0.03] hover:bg-rose-500/[0.08]'
                    : 'border-emerald-500/20 text-emerald-400 bg-emerald-500/[0.03] hover:bg-emerald-500/[0.08]'
                  }`}
              >
                {simRunning && (
                  <span className="absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-rose-500/10 to-transparent animate-pulse" />
                )}
                <span>{simRunning ? 'PAUSE' : 'RUN'}</span>
              </motion.button>
            </div>

            {/* Vertical divider */}
            <div className="hidden sm:block w-px h-5 bg-white/[0.08]" />

            {/* Status chips */}
            <div className="flex items-center gap-2">
              <Chip color="cyan"   label={`T+ ${epoch}h`} />
              <Chip color="blue"   label={`🛰 ${numSats}`} />
              <Chip color="orange" label={`🪨 ${numDebris}`} />
              <Chip color="slate"  label={`${fps} FPS`} mono />
            </div>

          </div>
        </div>
      </header>

      {/* ── Error banner ── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-red-500/10 border-b border-red-500/25 text-red-400 font-['DM_Mono'] text-[11px] px-5 py-1.5 tracking-wide"
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

/* ── Reusable status chip ── */
function Chip({ color, label, mono }) {
  const palette = {
    cyan:   'text-cyan-400 shadow-[inset_0_0_8px_rgba(34,211,238,0.1)]',
    blue:   'text-blue-400 shadow-[inset_0_0_8px_rgba(96,165,250,0.1)]',
    orange: 'text-orange-400 shadow-[inset_0_0_8px_rgba(251,146,60,0.1)]',
    slate:  'text-zinc-500 shadow-[inset_0_0_8px_rgba(113,113,122,0.1)]',
  };
  return (
    <div className={`flex items-center justify-center h-[26px] px-2.5 rounded-full bg-[#050505] border border-white/[0.06] ${palette[color]} transition-colors hover:border-white/[0.12]`}>
      <span className={`${mono ? "font-['DM_Mono']" : "font-['Syne']"} text-[9.5px] font-semibold tracking-[0.06em] whitespace-nowrap`}>
        {label}
      </span>
    </div>
  );
}

export default App;