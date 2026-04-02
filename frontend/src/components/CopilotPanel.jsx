import React, { useState } from 'react';
import { fetchCopilotSitrep } from '../api';

function CopilotPanel({ epoch }) {
  const [sitrep, setSitrep] = useState('');
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generateSitrep = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchCopilotSitrep();
      setSitrep(response.sitrep);
      setProvider(response.provider);
      setModel(response.model);
      setAvailable(response.available);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      padding: 12,
      background: 'radial-gradient(circle at top left, rgba(103,232,249,0.06), transparent 32%), #050505',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}>
          <span style={{
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            color: 'rgba(255,255,255,0.55)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}>
            Gemini Strategic Briefing
          </span>
          <span style={{
            fontFamily: 'var(--font-ui)',
            fontSize: 12,
            color: 'rgba(255,255,255,0.7)',
          }}>
            {`Snapshot T+${(epoch / 60).toFixed(1)}m`}
          </span>
        </div>

        <button
          onClick={generateSitrep}
          disabled={loading}
          style={{
            borderRadius: 10,
            border: '1px solid rgba(103,232,249,0.25)',
            background: loading
              ? 'rgba(103,232,249,0.08)'
              : 'linear-gradient(135deg, rgba(103,232,249,0.12), rgba(196,181,253,0.12))',
            color: '#e0f2fe',
            fontFamily: 'var(--font-data)',
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding: '10px 14px',
            cursor: loading ? 'progress' : 'pointer',
          }}
        >
          {loading ? 'Generating...' : 'Generate SitRep'}
        </button>
      </div>

      <div style={{
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
      }}>
        <Tag label={provider || 'Awaiting request'} tone={available ? '#67e8f9' : '#fbbf24'} />
        <Tag label={model || 'gemini-2.5-pro'} tone="#c4b5fd" />
        <Tag label={available ? 'AI online' : 'Fallback mode'} tone={available ? '#6ee7b7' : '#fb7185'} />
      </div>

      <div style={{
        flex: 1,
        minHeight: 0,
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.02)',
        padding: 14,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: sitrep || error ? 'flex-start' : 'center',
      }}>
        {error ? (
          <div style={{
            color: '#fda4af',
            fontFamily: 'var(--font-ui)',
            fontSize: 14,
            lineHeight: 1.7,
          }}>
            {error}
          </div>
        ) : sitrep ? (
          <div style={{
            color: 'rgba(255,255,255,0.82)',
            fontFamily: 'var(--font-ui)',
            fontSize: 15,
            lineHeight: 1.8,
            whiteSpace: 'pre-wrap',
          }}>
            {sitrep}
          </div>
        ) : (
          <div style={{
            color: 'rgba(255,255,255,0.56)',
            fontFamily: 'var(--font-ui)',
            fontSize: 14,
            lineHeight: 1.7,
          }}>
            Generate a SitRep to summarize fuel posture, conjunction pressure, blackout exposure, and KTI-driven orbital crowding for the operator.
          </div>
        )}
      </div>
    </div>
  );
}

function Tag({ label, tone }) {
  return (
    <span style={{
      borderRadius: 999,
      border: `1px solid ${tone}33`,
      background: `${tone}14`,
      color: tone,
      fontFamily: 'var(--font-data)',
      fontSize: 10,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      padding: '5px 9px',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

export default CopilotPanel;
