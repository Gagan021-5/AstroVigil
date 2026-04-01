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
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, W, H);

    // ── Concentric distance rings ──
    const rings = [
      { r: 0.2, label: '1 km', color: 'rgba(225, 29, 72, 0.2)' }, // Rose
      { r: 0.6, label: '5 km', color: 'rgba(217, 119, 6, 0.15)' }, // Amber
      { r: 1.0, label: '5+ km', color: 'rgba(255, 255, 255, 0.08)' }, // Neutral white
    ];

    rings.forEach(ring => {
      const r = ring.r * maxR;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = ring.color.replace(/[\d.]+\)/, '0.03)');
      ctx.fill();

      // Label
      if (W > 250) {
        ctx.fillStyle = 'rgba(161, 161, 170, 0.6)'; // zinc-400
        ctx.font = '9px DM Mono, monospace';
        ctx.fillText(ring.label, cx + r + 4, cy - 4);
      }
    });

    // ── Cross-hairs ──
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy); ctx.stroke();

    // ── Compass labels ──
    if (W > 250) {
      ctx.fillStyle = 'rgba(161, 161, 170, 0.5)';
      ctx.font = '10px DM Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('0°', cx, cy - maxR - 8);
      ctx.fillText('180°', cx, cy + maxR + 16);
      ctx.textAlign = 'left';
      ctx.fillText('90°', cx + maxR + 8, cy + 4);
      ctx.textAlign = 'right';
      ctx.fillText('270°', cx - maxR - 8, cy + 4);
      ctx.textAlign = 'left';
    }

    // ── Center marker (selected satellite) ──
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = '10px DM Mono, monospace';
    ctx.fillText(`SAT-${selectedSatId}`, cx + 14, cy - 10);

    // ── Plot conjunction debris ──
    if (conjunctions && conjunctions.length > 0) {
      const conjs = conjunctions;

      conjs.forEach(c => {
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

        // Classy Risk colors
        let color, glowColor;
        switch (c.risk_level) {
          case 'red':
            color = '#e11d48'; glowColor = 'rgba(225, 29, 72, 0.4)'; break; // Rose-600
          case 'yellow':
            color = '#d97706'; glowColor = 'rgba(217, 119, 6, 0.3)'; break; // Amber-600
          default:
            color = '#a1a1aa'; glowColor = 'rgba(161, 161, 170, 0.2)'; // Zinc-400
        }

        // Glow
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fillStyle = glowColor;
        ctx.fill();

        // Marker
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Label for close ones
        if (c.miss_distance_m < 3000 && W > 250) {
          ctx.fillStyle = color;
          ctx.font = '9px DM Mono, monospace';
          ctx.fillText(`${(c.miss_distance_m / 1000).toFixed(1)}km`, px + 6, py - 2);
        }
      });
    }

    // ── Legend ──
    if (W > 350) {
      const legendY = H - 24;
      const legendItems = [
        { color: '#e11d48', label: '< 1km Critical' },
        { color: '#d97706', label: '< 5km Warning' },
        { color: '#a1a1aa', label: '> 5km Nominal' },
      ];
      ctx.font = '9px DM Mono, monospace';
      let lx = 14;
      legendItems.forEach(item => {
        ctx.fillStyle = item.color;
        ctx.beginPath();
        ctx.arc(lx + 4, legendY, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(161, 161, 170, 0.8)';
        ctx.fillText(item.label, lx + 12, legendY + 3);
        lx += ctx.measureText(item.label).width + 26;
      });
    }

    animRef.current = requestAnimationFrame(draw);
  }, [conjunctions, selectedSatId]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  return <canvas ref={canvasRef} className="block w-full h-full cursor-default" />;
}

export default BullseyePlot;