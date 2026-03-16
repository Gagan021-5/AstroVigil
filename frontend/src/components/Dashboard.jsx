import React from 'react';
import GroundTrackMap from './GroundTrackMap';
import BullseyePlot from './BullseyePlot';
import TelemetryPanel from './TelemetryPanel';
import ManeuverTimeline from './ManeuverTimeline';
import './Dashboard.css';

function Dashboard({ snapshot, selectedSatId, onSelectSat }) {
  if (!snapshot) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner" />
        <p>Initializing constellation…</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="panel panel-map" id="ground-track-panel">
        <div className="panel-header">
          <span className="panel-icon">🌍</span>
          <h2>Ground Track Map</h2>
          <span className="panel-badge">{snapshot.satellites.length} active</span>
        </div>
        <div className="panel-body">
          <GroundTrackMap
            satellites={snapshot.satellites}
            debrisCompressed={snapshot.debris_compressed}
            epoch={snapshot.epoch}
            selectedSatId={selectedSatId}
            onSelectSat={onSelectSat}
          />
        </div>
      </div>

      <div className="panel panel-bullseye" id="bullseye-panel">
        <div className="panel-header">
          <span className="panel-icon">🎯</span>
          <h2>Conjunction Bullseye</h2>
          <span className="panel-badge">SAT-{selectedSatId}</span>
        </div>
        <div className="panel-body">
          <BullseyePlot
            conjunctions={snapshot.conjunctions}
            selectedSatId={selectedSatId}
          />
        </div>
      </div>

      <div className="panel panel-telemetry" id="telemetry-panel">
        <div className="panel-header">
          <span className="panel-icon">⛽</span>
          <h2>Telemetry Heatmaps</h2>
          <span className="panel-badge">
            {snapshot.total_fuel_consumed_kg.toFixed(1)} kg used
          </span>
        </div>
        <div className="panel-body">
          <TelemetryPanel
            satellites={snapshot.satellites}
            totalFuelConsumed={snapshot.total_fuel_consumed_kg}
            totalCollisionsAvoided={snapshot.total_collisions_avoided}
          />
        </div>
      </div>

      <div className="panel panel-timeline" id="timeline-panel">
        <div className="panel-header">
          <span className="panel-icon">📅</span>
          <h2>Maneuver Timeline</h2>
          <span className="panel-badge">
            {snapshot.maneuver_timeline.length} burns
          </span>
        </div>
        <div className="panel-body">
          <ManeuverTimeline
            timeline={snapshot.maneuver_timeline}
            epoch={snapshot.epoch}
            satellites={snapshot.satellites}
          />
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
