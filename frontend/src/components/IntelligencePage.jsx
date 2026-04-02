import React from 'react';
import CopilotPanel from './CopilotPanel';
import KesslerAnalytics from './KesslerAnalytics';
import PanelFrame from './PanelFrame';

function IntelligencePage({ snapshot, selectedSatId }) {
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
        Loading threat intelligence...
      </div>
    );
  }

  return (
    <div className="page-grid page-grid--intel">
      <PanelFrame
        icon="KTI"
        title="Kessler Analytics"
        badge={
          snapshot.kessler_analytics.densest_bin_altitude_km == null
            ? 'Peak N/A'
            : `Peak ${snapshot.kessler_analytics.densest_bin_altitude_km.toFixed(0)} km`
        }
        badgeVariant="amber"
        minHeight={520}
      >
        <KesslerAnalytics
          analytics={snapshot.kessler_analytics}
          selectedSatId={selectedSatId}
        />
      </PanelFrame>

      <PanelFrame
        icon="FDO"
        title="FDO Copilot"
        badge="Gemini 2.5 Pro"
        badgeVariant="cyan"
        minHeight={520}
      >
        <CopilotPanel epoch={snapshot.epoch} />
      </PanelFrame>
    </div>
  );
}

export default IntelligencePage;
