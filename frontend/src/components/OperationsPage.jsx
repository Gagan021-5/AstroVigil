import React from 'react';
import ManeuverTimeline from './ManeuverTimeline';
import PanelFrame from './PanelFrame';
import TelemetryPanel from './TelemetryPanel';

function OperationsPage({ snapshot, selectedSatId }) {
  if (!snapshot) {
    return (
      <div
        style={{
          minHeight: 360,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--c-text-3)',
          fontFamily: 'var(--font-data)',
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
        }}
      >
        Loading flight operations...
      </div>
    );
  }

  return (
    <div className="page-grid page-grid--operations">
      <PanelFrame
        icon="TEL"
        title="Telemetry"
        badge={`${snapshot.total_fuel_consumed_kg.toFixed(1)} kg used`}
        badgeVariant="amber"
        minHeight={520}
      >
        <TelemetryPanel
          satellites={snapshot.satellites}
          conjunctions={snapshot.conjunctions}
          selectedSatId={selectedSatId}
          epoch={snapshot.epoch}
          totalFuelConsumed={snapshot.total_fuel_consumed_kg}
          totalCollisionsAvoided={snapshot.total_collisions_avoided}
          queuedManeuversCount={snapshot.queued_maneuvers_count}
          queuedPreemptiveManeuversCount={snapshot.queued_preemptive_maneuvers_count}
          executedPreemptiveManeuversCount={snapshot.executed_preemptive_maneuvers_count}
          closestObjectDistanceM={snapshot.closest_object_distance_m}
          collisionTriggerDistanceM={snapshot.collision_trigger_distance_m}
        />
      </PanelFrame>

      <PanelFrame
        icon="MAN"
        title="Maneuver Timeline"
        badge={`${snapshot.maneuver_timeline.length} burns`}
        badgeVariant="rose"
        minHeight={520}
      >
        <ManeuverTimeline
          timeline={snapshot.maneuver_timeline}
          conjunctions={snapshot.conjunctions}
          selectedSatId={selectedSatId}
          epoch={snapshot.epoch}
          satellites={snapshot.satellites}
          queuedManeuversCount={snapshot.queued_maneuvers_count}
          queuedPreemptiveManeuversCount={snapshot.queued_preemptive_maneuvers_count}
          closestObjectDistanceM={snapshot.closest_object_distance_m}
          collisionTriggerDistanceM={snapshot.collision_trigger_distance_m}
        />
      </PanelFrame>
    </div>
  );
}

export default OperationsPage;
