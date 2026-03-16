import React from 'react';
import { motion } from 'framer-motion';
import GroundTrackMap from './GroundTrackMap';
import BullseyePlot from './BullseyePlot';
import TelemetryPanel from './TelemetryPanel';
import ManeuverTimeline from './ManeuverTimeline';

/* ── animation variants ── */
const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};
const panelVariants = {
  hidden: { opacity: 0, y: 15, scale: 0.99 },
  show:   { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

function Dashboard({ snapshot, selectedSatId, onSelectSat }) {
  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4 text-zinc-500">
        <div className="spinner w-8 h-8 rounded-full border border-zinc-800 border-t-zinc-400" />
        <p className="font-['DM_Mono'] text-[11px] tracking-widest uppercase">Initializing constellation…</p>
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="grid flex-1 gap-3 p-3 overflow-y-auto lg:overflow-hidden grid-cols-1 lg:grid-cols-[1.65fr_1fr] lg:grid-rows-[1.2fr_1fr]"
    >
      {/* Ground Track */}
      <Panel
        className="min-h-[400px] lg:col-start-1 lg:col-end-2 lg:row-start-1 lg:row-end-2"
        icon="🌍"
        title="Ground Track"
        badge={`${snapshot.satellites.length} active`}
      >
        <GroundTrackMap
          satellites={snapshot.satellites}
          debrisCompressed={snapshot.debris_compressed}
          epoch={snapshot.epoch}
          selectedSatId={selectedSatId}
          onSelectSat={onSelectSat}
        />
      </Panel>

      {/* Conjunction Bullseye */}
      <Panel
        className="min-h-[300px] lg:col-start-2 lg:col-end-3 lg:row-start-1 lg:row-end-2"
        icon="🎯"
        title="Conjunction Bullseye"
        badge={`SAT-${selectedSatId}`}
      >
        <BullseyePlot
          conjunctions={snapshot.conjunctions}
          selectedSatId={selectedSatId}
        />
      </Panel>

      {/* Telemetry */}
      <Panel
        className="min-h-[300px] lg:col-start-1 lg:col-end-2 lg:row-start-2 lg:row-end-3"
        icon="📊"
        title="Telemetry"
        badge={`${snapshot.total_fuel_consumed_kg.toFixed(1)} kg used`}
      >
        <TelemetryPanel
          satellites={snapshot.satellites}
          totalFuelConsumed={snapshot.total_fuel_consumed_kg}
          totalCollisionsAvoided={snapshot.total_collisions_avoided}
        />
      </Panel>

      {/* Maneuver Timeline */}
      <Panel
        className="min-h-[300px] lg:col-start-2 lg:col-end-3 lg:row-start-2 lg:row-end-3"
        icon="⏳"
        title="Maneuver Timeline"
        badge={`${snapshot.maneuver_timeline.length} burns`}
      >
        <ManeuverTimeline
          timeline={snapshot.maneuver_timeline}
          epoch={snapshot.epoch}
          satellites={snapshot.satellites}
        />
      </Panel>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────
   Panel — Minimalist & Premium Chrome
───────────────────────────────────────────── */
function Panel({ children, icon, title, badge, className = '' }) {
  return (
    <motion.div
      variants={panelVariants}
      className={`relative flex flex-col bg-[#050505] border border-white/10 rounded-xl overflow-hidden shadow-lg transition-colors duration-300 hover:border-white/20 ${className}`}
    >
      {/* Subtle top inner glow */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent z-10" />

      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-white/5 shrink-0 bg-[#0a0a0a]">
        <span className="text-sm opacity-80">{icon}</span>
        <h2 className="flex-1 font-['Syne'] text-[12px] font-medium tracking-wider text-zinc-300">
          {title}
        </h2>
        <span className="font-['DM_Mono'] text-[10px] text-zinc-400 bg-white/5 px-2 py-0.5 rounded-[4px] border border-white/5">
          {badge}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 relative min-h-0 overflow-hidden bg-black/50">
        {children}
      </div>
    </motion.div>
  );
}

export default Dashboard;