import React, { useRef, useEffect, useCallback } from 'react';
import './BullseyePlot.css';

/**
 * Conjunction Bullseye Plot — Canvas polar chart.
 * Plots debris around a selected satellite with TCA as radial distance
 * and approach vector angle. Color-coded by risk level.
 */
function BullseyePlot({ conjunctions, selectedSatId }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const cx = W / 2;
    const cy = H / 2;
    const maxR = Math.min(W, H) * 0.42;

    // ── Background ──
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    // ── Concentric distance rings ──
    const rings = [
      { r: 0.2, label: '1 km', color: 'rgba(248, 113, 113, 0.3)' },
      { r: 0.6, label: '5 km', color: 'rgba(251, 191, 36, 0.2)' },
      { r: 1.0, label: '5+ km', color: 'rgba(52, 211, 153, 0.12)' },
    ];

    rings.forEach(ring => {
      const r = ring.r * maxR;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = ring.color.replace(/[\d.]+\)/, '0.06)');
      ctx.fill();

      // Label
      ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
      ctx.font = '9px Inter, sans-serif';
      ctx.fillText(ring.label, cx + r + 4, cy - 4);
    });

    // ── Cross-hairs ──
    ctx.strokeStyle = 'rgba(99, 179, 237, 0.1)';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy); ctx.stroke();

    // ── Compass labels ──
    ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('0°', cx, cy - maxR - 6);
    ctx.fillText('180°', cx, cy + maxR + 14);
    ctx.textAlign = 'left';
    ctx.fillText('90°', cx + maxR + 6, cy + 4);
    ctx.textAlign = 'right';
    ctx.fillText('270°', cx - maxR - 6, cy + 4);
    ctx.textAlign = 'left';

    // ── Center marker (selected satellite) ──
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#22d3ee';
    ctx.fill();
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(34, 211, 238, 0.8)';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillText(`SAT-${selectedSatId}`, cx + 12, cy - 10);

    // ── Plot conjunction debris ──
    if (conjunctions && conjunctions.length > 0) {
      // Filter for this satellite's conjunctions (or show all if backend already filtered)
      const conjs = conjunctions;

      conjs.forEach(c => {
        // Map miss distance to radial position
        // <1km → inner ring, <5km → mid ring, else → outer ring
        let rNorm;
        if (c.miss_distance_m < 1000) {
          rNorm = (c.miss_distance_m / 1000) * 0.2;
        } else if (c.miss_distance_m < 5000) {
          rNorm = 0.2 + ((c.miss_distance_m - 1000) / 4000) * 0.4;
        } else {
          rNorm = 0.6 + Math.min((c.miss_distance_m - 5000) / 10000, 0.4);
        }

        const r = rNorm * maxR;
        const angle = (c.bearing_deg - 90) * Math.PI / 180; // 0° = top
        const px = cx + r * Math.cos(angle);
        const py = cy + r * Math.sin(angle);

        // Risk color
        let color, glowColor;
        switch (c.risk_level) {
          case 'red':
            color = '#f87171'; glowColor = 'rgba(248, 113, 113, 0.4)'; break;
          case 'yellow':
            color = '#fbbf24'; glowColor = 'rgba(251, 191, 36, 0.3)'; break;
          default:
            color = '#34d399'; glowColor = 'rgba(52, 211, 153, 0.2)';
        }

        // Glow
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fillStyle = glowColor;
        ctx.fill();

        // Marker
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Label for close ones
        if (c.miss_distance_m < 3000) {
          ctx.fillStyle = color;
          ctx.font = '8px JetBrains Mono, monospace';
          ctx.fillText(`${(c.miss_distance_m / 1000).toFixed(1)}km`, px + 6, py - 2);
        }
      });
    }

    // ── Legend ──
    const legendY = H - 30;
    const legendItems = [
      { color: '#f87171', label: '< 1km (Critical)' },
      { color: '#fbbf24', label: '< 5km (Warning)' },
      { color: '#34d399', label: '> 5km (Safe)' },
    ];
    ctx.font = '9px Inter, sans-serif';
    let lx = 10;
    legendItems.forEach(item => {
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(lx + 4, legendY, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
      ctx.fillText(item.label, lx + 10, legendY + 3);
      lx += ctx.measureText(item.label).width + 22;
    });

    animRef.current = requestAnimationFrame(draw);
  }, [conjunctions, selectedSatId]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  return <canvas ref={canvasRef} className="bullseye-canvas" />;
}

export default BullseyePlot;
