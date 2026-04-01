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
      className="grid flex-1 gap-4 p-4 md:gap-6 md:p-6 overflow-y-auto lg:overflow-hidden grid-cols-1 lg:grid-cols-[1.6fr_1fr] lg:grid-rows-[1.3fr_1fr]"
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
      className={`relative flex flex-col bg-gradient-to-br from-[#0a0a0d] to-[#040405] border border-white/[0.08] rounded-2xl overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.6)] backdrop-blur-3xl transition-all duration-300 hover:border-white/[0.2] hover:shadow-[0_8px_32px_rgba(0,0,0,0.8)] group ${className}`}
    >
      {/* Subtle top inner glow */}
      <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/10 to-transparent z-10 opacity-60 group-hover:opacity-100 transition-opacity duration-300" />
      {/* Subtle left edge accent on hover */}
      <div className="absolute left-0 inset-y-0 w-[1.5px] bg-gradient-to-b from-transparent via-cyan-400/20 to-transparent z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.04] shrink-0 bg-[#000000]/40">
        <span className="text-[13px] opacity-80 filter drop-shadow-[0_0_6px_rgba(255,255,255,0.2)]">{icon}</span>
        <h2 className="flex-1 font-['Syne'] text-[13px] font-semibold tracking-[0.15em] text-[#e4e4e7] uppercase">
          {title}
        </h2>
        <span className="font-['DM_Mono'] text-[10px] text-zinc-300 bg-white/[0.05] px-2.5 py-1 rounded-md border border-white/[0.08] shadow-inner tracking-wider">
          {badge}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 relative min-h-0 overflow-hidden bg-black/20">
        {children}
      </div>
    </motion.div>
  );
}

export default Dashboard;