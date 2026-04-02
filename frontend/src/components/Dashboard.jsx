import React from 'react';
import GroundTrackMap from './GroundTrackMap';
import BullseyePlot from './BullseyePlot';
import MissionSummary from './MissionSummary';
import PanelFrame from './PanelFrame';

function Dashboard({ snapshot, selectedSatId, onSelectSat }) {
  if (!snapshot) {
    return (
      <div
        style={{
          minHeight: 360,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          color: 'var(--c-text-3)',
        }}
      >
        <div
          className="spinner"
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: '1.5px solid rgba(255,255,255,0.08)',
            borderTopColor: 'rgba(34,211,238,0.5)',
          }}
        />
        <p
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--c-text-3)',
          }}
        >
          Initializing constellation...
        </p>
      </div>
    );
  }

  return (
    <div className="page-grid page-grid--overview">
      <PanelFrame
        className="page-panel page-panel--map"
        icon="MAP"
        title="Ground Track"
        badge={`${snapshot.satellites.length} active`}
        badgeVariant="violet"
        minHeight={500}
      >
        <GroundTrackMap
          satellites={snapshot.satellites}
          debrisCompressed={snapshot.debris_compressed}
          epoch={snapshot.epoch}
          selectedSatId={selectedSatId}
          onSelectSat={onSelectSat}
        />
      </PanelFrame>

      <PanelFrame
        className="page-panel page-panel--side"
        icon="TCA"
        title="Conjunction Bullseye"
        badge={`SAT-${selectedSatId}`}
        badgeVariant="cyan"
        minHeight={500}
      >
        <BullseyePlot
          conjunctions={snapshot.conjunctions}
          selectedSatId={selectedSatId}
          epoch={snapshot.epoch}
        />
      </PanelFrame>

      <PanelFrame
        className="page-panel page-panel--full"
        icon="OPS"
        title="Mission Summary"
        badge={`Closest ${formatDistance(snapshot.closest_object_distance_m)}`}
        badgeVariant="green"
        minHeight={260}
      >
        <MissionSummary snapshot={snapshot} selectedSatId={selectedSatId} />
      </PanelFrame>
    </div>
  );
}

function formatDistance(distanceM) {
  if (distanceM == null) return 'N/A';
  if (distanceM >= 1000) return `${(distanceM / 1000).toFixed(1)} km`;
  return `${distanceM.toFixed(0)} m`;
}

export default Dashboard;
