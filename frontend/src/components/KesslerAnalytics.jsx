import React, { useMemo } from 'react';

function KesslerAnalytics({ analytics, selectedSatId }) {
  const activeScore = useMemo(
    () => analytics?.satellite_scores?.find((score) => score.satellite_id === selectedSatId),
    [analytics, selectedSatId]
  );

  const topBins = useMemo(() => {
    if (!analytics?.density_bins) return [];
    return [...analytics.density_bins]
      .sort((a, b) => b.threat_count - a.threat_count)
      .slice(0, 10);
  }, [analytics]);

  const maxCount = Math.max(...topBins.map((bin) => bin.threat_count), 1);

  const bandStyles = {
    red: { color: '#fb7185', bg: 'rgba(225,29,72,0.10)', border: 'rgba(225,29,72,0.28)' },
    yellow: { color: '#fbbf24', bg: 'rgba(217,119,6,0.10)', border: 'rgba(217,119,6,0.28)' },
    green: { color: '#6ee7b7', bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.26)' },
  };

  const activeBand = bandStyles[activeScore?.risk_band || 'green'];

  if (!analytics) {
    return null;
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      padding: 12,
      background: 'radial-gradient(circle at top right, rgba(251,191,36,0.05), transparent 35%), #050505',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.2fr 0.8fr',
        gap: 10,
        minHeight: 0,
      }}>
        <div style={{
          borderRadius: 12,
          border: `1px solid ${activeBand.border}`,
          background: activeBand.bg,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: 120,
        }}>
          <div style={{
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            color: 'rgba(255,255,255,0.55)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}>
            Active Satellite KTI
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
          }}>
            <span style={{
              fontFamily: 'var(--font-data)',
              fontSize: 42,
              lineHeight: 1,
              color: activeBand.color,
            }}>
              {activeScore ? activeScore.kti_score.toFixed(1) : '0.0'}
            </span>
            <span style={{
              fontFamily: 'var(--font-ui)',
              fontSize: 12,
              color: activeBand.color,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              {activeScore?.risk_band || 'green'}
            </span>
          </div>
          <div style={{
            fontFamily: 'var(--font-ui)',
            fontSize: 12,
            color: 'rgba(255,255,255,0.72)',
            lineHeight: 1.5,
          }}>
            <div>{`SAT-${selectedSatId} altitude: ${activeScore?.altitude_km?.toFixed?.(1) ?? '0.0'} km`}</div>
            <div>{`Local shell debris: ${activeScore?.local_debris_count ?? 0}`}</div>
            <div>{`Distance to peak shell: ${activeScore?.distance_to_peak_km?.toFixed?.(1) ?? '0.0'} km`}</div>
          </div>
        </div>

        <div style={{
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.02)',
          padding: 12,
          display: 'grid',
          gridTemplateRows: 'repeat(3, 1fr)',
          gap: 8,
        }}>
          <Metric
            label="Mean Density"
            value={analytics.mean_density.toFixed(2)}
            tone="#fbbf24"
          />
          <Metric
            label="Density Sigma"
            value={analytics.std_density.toFixed(2)}
            tone="#67e8f9"
          />
          <Metric
            label="Densest Shell"
            value={
              analytics.densest_bin_altitude_km == null
                ? 'N/A'
                : `${analytics.densest_bin_altitude_km.toFixed(1)} km`
            }
            tone="#c4b5fd"
          />
        </div>
      </div>

      <div style={{
        flex: 1,
        minHeight: 0,
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.02)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        overflow: 'hidden',
      }}>
        <div style={{
          fontFamily: 'var(--font-data)',
          fontSize: 10,
          color: 'rgba(255,255,255,0.55)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}>
          Top Debris Density Shells (10 km bins)
        </div>

        <div style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          paddingRight: 4,
        }}>
          {topBins.map((bin) => (
            <div key={`${bin.altitude_min_km}-${bin.altitude_max_km}`} style={{ display: 'grid', gap: 4 }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                fontFamily: 'var(--font-data)',
                fontSize: 11,
              }}>
                <span style={{ color: 'rgba(255,255,255,0.78)' }}>
                  {`${bin.altitude_min_km.toFixed(0)}-${bin.altitude_max_km.toFixed(0)} km`}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.52)' }}>
                  {`${bin.threat_count} threats`}
                </span>
              </div>
              <div style={{
                height: 8,
                borderRadius: 999,
                background: 'rgba(255,255,255,0.05)',
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${(bin.threat_count / maxCount) * 100}%`,
                  height: '100%',
                  borderRadius: 999,
                  background: bin.density_zscore > 1
                    ? 'linear-gradient(90deg, #fb7185, #fbbf24)'
                    : 'linear-gradient(90deg, #67e8f9, #c4b5fd)',
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }) {
  return (
    <div style={{
      borderRadius: 10,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.05)',
      padding: '10px 11px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
    }}>
      <span style={{
        fontFamily: 'var(--font-data)',
        fontSize: 10,
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'var(--font-data)',
        fontSize: 18,
        color: tone,
      }}>
        {value}
      </span>
    </div>
  );
}

export default KesslerAnalytics;
