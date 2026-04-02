import React, { useMemo } from 'react';

function MissionSummary({ snapshot, selectedSatId }) {
  const selectedSatellite = useMemo(
    () => snapshot.satellites.find((satellite) => satellite.id === selectedSatId) ?? snapshot.satellites[0],
    [snapshot.satellites, selectedSatId]
  );

  const selectedThreat = useMemo(
    () =>
      snapshot.conjunctions
        .filter((conjunction) => conjunction.satellite_id === selectedSatId)
        .sort((a, b) => a.miss_distance_m - b.miss_distance_m)[0] ?? null,
    [snapshot.conjunctions, selectedSatId]
  );

  const selectedKti = useMemo(
    () =>
      snapshot.kessler_analytics.satellite_scores.find(
        (score) => score.satellite_id === selectedSatId
      ) ?? null,
    [snapshot.kessler_analytics.satellite_scores, selectedSatId]
  );

  const cards = [
    {
      label: 'Selected Vehicle',
      value: `SAT-${selectedSatId}`,
      detail: selectedSatellite
        ? `${(selectedSatellite.alt / 1000).toFixed(1)} km altitude`
        : 'Awaiting telemetry',
      tone: '#67e8f9',
    },
    {
      label: 'Fuel Reserve',
      value: selectedSatellite ? `${selectedSatellite.fuel_remaining_kg.toFixed(1)} kg` : 'N/A',
      detail: 'Current propellant remaining',
      tone: '#6ee7b7',
    },
    {
      label: 'Nearest Threat',
      value: selectedThreat ? formatDistance(selectedThreat.miss_distance_m) : 'Clear',
      detail: selectedThreat
        ? `OBJ-${selectedThreat.debris_id} at ${selectedThreat.bearing_deg.toFixed(0)} deg`
        : 'No selected conjunctions inside 5 km',
      tone: selectedThreat?.risk_level === 'red' ? '#fb7185' : '#fbbf24',
    },
    {
      label: 'KTI Posture',
      value: selectedKti ? selectedKti.kti_score.toFixed(1) : 'N/A',
      detail: selectedKti
        ? `${selectedKti.risk_band.toUpperCase()} band near ${selectedKti.altitude_bin_km.toFixed(0)} km shell`
        : 'No density score available',
      tone:
        selectedKti?.risk_band === 'red'
          ? '#fb7185'
          : selectedKti?.risk_band === 'yellow'
            ? '#fbbf24'
            : '#6ee7b7',
    },
    {
      label: 'Burn Queue',
      value: `${snapshot.queued_maneuvers_count} queued`,
      detail: `${snapshot.queued_preemptive_maneuvers_count} blackout pre-uploads`,
      tone: '#c4b5fd',
    },
    {
      label: 'Fleet Totals',
      value: `${snapshot.total_collisions_avoided} avoided`,
      detail: `${snapshot.total_fuel_consumed_kg.toFixed(1)} kg total fuel used`,
      tone: '#ffffff',
    },
  ];

  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: 14,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
        gap: 12,
        alignContent: 'start',
        background:
          'radial-gradient(circle at top left, rgba(103,232,249,0.05), transparent 28%), radial-gradient(circle at bottom right, rgba(167,139,250,0.05), transparent 32%)',
      }}
    >
      {cards.map((card) => (
        <div
          key={card.label}
          style={{
            borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(255,255,255,0.025)',
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minHeight: 126,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 10,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.48)',
            }}
          >
            {card.label}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 28,
              lineHeight: 1,
              color: card.tone,
            }}
          >
            {card.value}
          </span>
          <span
            style={{
              color: 'rgba(240,240,245,0.68)',
              fontSize: 12,
              lineHeight: 1.55,
            }}
          >
            {card.detail}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatDistance(distanceM) {
  if (distanceM == null) return 'N/A';
  if (distanceM >= 1000) return `${(distanceM / 1000).toFixed(1)} km`;
  return `${distanceM.toFixed(0)} m`;
}

export default MissionSummary;
