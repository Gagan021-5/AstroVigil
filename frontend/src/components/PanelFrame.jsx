import React from 'react';
import { motion } from 'framer-motion';

const panelV = {
  hidden: { opacity: 0, scale: 0.985 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
  },
};

function PanelFrame({
  children,
  icon,
  title,
  badge,
  badgeVariant = 'slate',
  className = '',
  minHeight = 320,
  style = {},
  contentStyle = {},
}) {
  const badgeColours = {
    cyan: { color: '#67e8f9', bg: 'rgba(34,211,238,0.08)', border: 'rgba(34,211,238,0.2)' },
    violet: { color: '#c4b5fd', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.2)' },
    rose: { color: '#fda4af', bg: 'rgba(251,113,133,0.08)', border: 'rgba(251,113,133,0.2)' },
    amber: { color: '#fcd34d', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.2)' },
    green: { color: '#6ee7b7', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.2)' },
    slate: { color: '#6b7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.18)' },
  };
  const bc = badgeColours[badgeVariant] || badgeColours.slate;

  return (
    <motion.section
      variants={panelV}
      initial="hidden"
      animate="show"
      className={`panel-glow ${className}`.trim()}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        minHeight,
        overflow: 'hidden',
        borderRadius: 'var(--radius)',
        background: 'linear-gradient(145deg, rgba(10,11,20,0.97) 0%, rgba(5,6,12,0.99) 100%)',
        border: '1px solid var(--c-border)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04)',
        transition: 'border-color 0.25s, box-shadow 0.25s',
        ...style,
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.borderColor = 'var(--c-border-hi)';
        event.currentTarget.style.boxShadow =
          '0 8px 32px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.07)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.borderColor = 'var(--c-border)';
        event.currentTarget.style.boxShadow =
          '0 4px 24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04)';
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '9px 12px',
          borderBottom: '1px solid var(--c-border)',
          flexShrink: 0,
          background: 'rgba(0,0,0,0.35)',
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontFamily: 'var(--font-data)',
            opacity: 0.9,
            lineHeight: 1,
            color: 'rgba(255,255,255,0.78)',
            letterSpacing: '0.08em',
          }}
        >
          {icon}
        </span>
        <h2
          style={{
            flex: 1,
            fontFamily: 'var(--font-ui)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'rgba(240,240,245,0.85)',
            margin: 0,
          }}
        >
          {title}
        </h2>
        {badge ? (
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 9.5,
              color: bc.color,
              background: bc.bg,
              border: `1px solid ${bc.border}`,
              padding: '2px 8px',
              borderRadius: 100,
              whiteSpace: 'nowrap',
              letterSpacing: '0.04em',
            }}
          >
            {badge}
          </span>
        ) : null}
      </div>

      <div
        style={{
          flex: 1,
          position: 'relative',
          minHeight: 0,
          overflow: 'hidden',
          ...contentStyle,
        }}
      >
        {children}
      </div>
    </motion.section>
  );
}

export default PanelFrame;
