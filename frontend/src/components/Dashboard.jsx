import React from 'react';
import { motion } from 'framer-motion';
import GroundTrackMap from './GroundTrackMap';
import BullseyePlot from './BullseyePlot';
import TelemetryPanel from './TelemetryPanel';
import ManeuverTimeline from './ManeuverTimeline';

/* ── Framer variants ── */
const containerV = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};
const panelV = {
  hidden: { opacity: 0, scale: 0.985 },
  show:   { opacity: 1, scale: 1, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
};

function Dashboard({ snapshot, selectedSatId, onSelectSat }) {
  if (!snapshot) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        color: 'var(--c-text-3)',
      }}>
        <div className="spinner" style={{
          width: 28, height: 28, borderRadius: '50%',
          border: '1.5px solid rgba(255,255,255,0.08)',
          borderTopColor: 'rgba(34,211,238,0.5)',
        }} />
        <p style={{
          fontFamily: 'var(--font-data)',
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--c-text-3)',
        }}>
          Initializing constellation…
        </p>
      </div>
    );
  }

  return (
    <motion.div
      variants={containerV}
      initial="hidden"
      animate="show"
      style={{
        flex: 1,
        minHeight: 0,          /* critical — lets flex child shrink */
        display: 'grid',
        gridTemplateColumns: '1.65fr 1fr',
        gridTemplateRows: '1.25fr 1fr',
        gap: 'var(--gap)',
        padding: 'var(--gap)',
        overflow: 'hidden',    /* never grow past viewport */
      }}
    >
      {/* Ground Track */}
      <Panel
        style={{ gridColumn: '1', gridRow: '1' }}
        icon="🌍"
        title="Ground Track"
        badge={`${snapshot.satellites.length} active`}
        badgeVariant="violet"
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
        style={{ gridColumn: '2', gridRow: '1' }}
        icon="🎯"
        title="Conjunction Bullseye"
        badge={`SAT-${selectedSatId}`}
        badgeVariant="cyan"
      >
        <BullseyePlot
          conjunctions={snapshot.conjunctions}
          selectedSatId={selectedSatId}
          epoch={snapshot.epoch}
        />
      </Panel>

      {/* Telemetry */}
      <Panel
        style={{ gridColumn: '1', gridRow: '2' }}
        icon="📊"
        title="Telemetry"
        badge={`${snapshot.total_fuel_consumed_kg.toFixed(1)} kg used`}
        badgeVariant="amber"
      >
        <TelemetryPanel
          satellites={snapshot.satellites}
          totalFuelConsumed={snapshot.total_fuel_consumed_kg}
          totalCollisionsAvoided={snapshot.total_collisions_avoided}
          queuedManeuversCount={snapshot.queued_maneuvers_count}
          queuedPreemptiveManeuversCount={snapshot.queued_preemptive_maneuvers_count}
          executedPreemptiveManeuversCount={snapshot.executed_preemptive_maneuvers_count}
          closestObjectDistanceM={snapshot.closest_object_distance_m}
          collisionTriggerDistanceM={snapshot.collision_trigger_distance_m}
        />
      </Panel>

      {/* Maneuver Timeline */}
      <Panel
        style={{ gridColumn: '2', gridRow: '2' }}
        icon="⏳"
        title="Maneuver Timeline"
        badge={`${snapshot.maneuver_timeline.length} burns`}
        badgeVariant="rose"
      >
        <ManeuverTimeline
          timeline={snapshot.maneuver_timeline}
          epoch={snapshot.epoch}
          satellites={snapshot.satellites}
          queuedManeuversCount={snapshot.queued_maneuvers_count}
          queuedPreemptiveManeuversCount={snapshot.queued_preemptive_maneuvers_count}
          closestObjectDistanceM={snapshot.closest_object_distance_m}
          collisionTriggerDistanceM={snapshot.collision_trigger_distance_m}
        />
      </Panel>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────
   Panel — premium glassmorphism card
───────────────────────────────────────────── */
function Panel({ children, icon, title, badge, badgeVariant = 'slate', style = {} }) {
  const badgeColours = {
    cyan:   { color: '#67e8f9', bg: 'rgba(34,211,238,0.08)',  border: 'rgba(34,211,238,0.2)' },
    violet: { color: '#c4b5fd', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.2)' },
    rose:   { color: '#fda4af', bg: 'rgba(251,113,133,0.08)', border: 'rgba(251,113,133,0.2)' },
    amber:  { color: '#fcd34d', bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.2)' },
    green:  { color: '#6ee7b7', bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.2)' },
    slate:  { color: '#6b7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.18)' },
  };
  const bc = badgeColours[badgeVariant] || badgeColours.slate;

  return (
    <motion.div
      variants={panelV}
      className="panel-glow"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,        /* allow shrink */
        overflow: 'hidden',
        borderRadius: 'var(--radius)',
        background: 'linear-gradient(145deg, rgba(10,11,20,0.97) 0%, rgba(5,6,12,0.99) 100%)',
        border: '1px solid var(--c-border)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04)',
        transition: 'border-color 0.25s, box-shadow 0.25s',
        ...style,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--c-border-hi)';
        e.currentTarget.style.boxShadow   = '0 8px 32px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.07)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--c-border)';
        e.currentTarget.style.boxShadow   = '0 4px 24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04)';
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 12px',
        borderBottom: '1px solid var(--c-border)',
        flexShrink: 0,
        background: 'rgba(0,0,0,0.35)',
      }}>
        <span style={{ fontSize: 12, opacity: 0.85, lineHeight: 1 }}>{icon}</span>
        <h2 style={{
          flex: 1,
          fontFamily: 'var(--font-ui)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'rgba(240,240,245,0.85)',
          margin: 0,
        }}>
          {title}
        </h2>
        {/* Badge */}
        <span style={{
          fontFamily: 'var(--font-data)',
          fontSize: 9.5,
          color: bc.color,
          background: bc.bg,
          border: `1px solid ${bc.border}`,
          padding: '2px 8px',
          borderRadius: 100,
          whiteSpace: 'nowrap',
          letterSpacing: '0.04em',
        }}>
          {badge}
        </span>
      </div>

      {/* Body — canvas fills this */}
      <div style={{
        flex: 1,
        position: 'relative',
        minHeight: 0,
        overflow: 'hidden',
      }}>
        {children}
      </div>
    </motion.div>
  );
}

export default Dashboard;
