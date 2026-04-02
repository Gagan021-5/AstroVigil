import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import './BullseyePlot.css';

const BULLSEYE_GATE_M = 5000;

function formatGateDistance(distanceM) {
  if (distanceM >= 1000) {
    return `${(distanceM / 1000).toFixed(1)} km`;
  }
  return `${distanceM.toFixed(0)} m`;
}

function BullseyePlot({ conjunctions = [], selectedSatId, epoch = 0 }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  const selectedConjunctions = useMemo(
    () => conjunctions.filter((c) => c.satellite_id === selectedSatId),
    [conjunctions, selectedSatId]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const cx = W / 2;
    const cy = H / 2;
    const maxR = Math.min(W, H) * 0.42;

    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, W, H);

    const rings = [
      { r: 0.2, label: '1 km', color: 'rgba(225, 29, 72, 0.2)' },
      { r: 0.6, label: '3 km', color: 'rgba(217, 119, 6, 0.14)' },
      { r: 1.0, label: '5 km gate', color: 'rgba(255, 255, 255, 0.08)' },
    ];

    rings.forEach((ring) => {
      const r = ring.r * maxR;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 1;
      ctx.stroke();

      if (W > 250) {
        ctx.fillStyle = 'rgba(161, 161, 170, 0.6)';
        ctx.font = '9px DM Mono, monospace';
        ctx.fillText(ring.label, cx + r + 4, cy - 4);
      }
    });

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - maxR);
    ctx.lineTo(cx, cy + maxR);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - maxR, cy);
    ctx.lineTo(cx + maxR, cy);
    ctx.stroke();

    if (W > 250) {
      ctx.fillStyle = 'rgba(161, 161, 170, 0.5)';
      ctx.font = '10px DM Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('0 deg', cx, cy - maxR - 8);
      ctx.fillText('180 deg', cx, cy + maxR + 16);
      ctx.textAlign = 'left';
      ctx.fillText('90 deg', cx + maxR + 8, cy + 4);
      ctx.textAlign = 'right';
      ctx.fillText('270 deg', cx - maxR - 8, cy + 4);
      ctx.textAlign = 'left';
    }

    ctx.fillStyle = 'rgba(161, 161, 170, 0.55)';
    ctx.font = '10px DM Mono, monospace';
    ctx.fillText(`TRACKING SAT-${selectedSatId}`, 14, 18);

    const statusLine = selectedConjunctions.length > 0
      ? `${selectedConjunctions.length} live conjunctions inside ${formatGateDistance(BULLSEYE_GATE_M)}`
      : conjunctions.length > 0
        ? `SAT-${selectedSatId} has no conjunctions inside ${formatGateDistance(BULLSEYE_GATE_M)}`
        : `No conjunctions inside the ${formatGateDistance(BULLSEYE_GATE_M)} gate`;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText(statusLine, 14, 34);

    ctx.fillStyle = 'rgba(161, 161, 170, 0.55)';
    ctx.font = '9px DM Mono, monospace';
    ctx.fillText(`Snapshot T+${(epoch / 60).toFixed(1)}m`, 14, 50);

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

    if (selectedConjunctions.length > 0) {
      const nextConjunction = selectedConjunctions.reduce((best, current) => (
        current.tca < best.tca ? current : best
      ), selectedConjunctions[0]);

      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
      ctx.font = '10px DM Mono, monospace';
      ctx.fillText(
        `Next TCA +${Math.max(0, (nextConjunction.tca - epoch) / 60).toFixed(1)}m`,
        W - 14,
        18
      );
      ctx.fillStyle = nextConjunction.risk_level === 'red' ? '#e11d48' : '#d97706';
      ctx.fillText(
        `Nearest ${formatGateDistance(nextConjunction.miss_distance_m)}`,
        W - 14,
        34
      );
      ctx.textAlign = 'left';
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath();
      ctx.arc(cx, cy, maxR * 0.74, 0, Math.PI * 2);
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.font = '11px DM Mono, monospace';
      ctx.fillText('NO CLOSE APPROACHES', cx, cy + maxR * 0.58);
      ctx.fillStyle = 'rgba(161, 161, 170, 0.58)';
      ctx.font = '10px Inter, sans-serif';
      const detailLine = conjunctions.length > 0
        ? `${conjunctions.length} active conjunctions are on other satellites`
        : 'The selected satellite currently has no objects inside the 5 km gate';
      ctx.fillText(detailLine, cx, cy + maxR * 0.58 + 18);
      ctx.textAlign = 'left';
    }

    selectedConjunctions.forEach((conjunction) => {
      const missDistance = Math.min(conjunction.miss_distance_m, BULLSEYE_GATE_M);
      const rNorm = missDistance < 1000
        ? (missDistance / 1000) * 0.2
        : 0.2 + ((missDistance - 1000) / 4000) * 0.8;

      const r = rNorm * maxR;
      const angle = (conjunction.bearing_deg - 90) * Math.PI / 180;
      const px = cx + r * Math.cos(angle);
      const py = cy + r * Math.sin(angle);

      let color = '#a1a1aa';
      let glowColor = 'rgba(161, 161, 170, 0.18)';
      if (conjunction.risk_level === 'red') {
        color = '#e11d48';
        glowColor = 'rgba(225, 29, 72, 0.4)';
      } else if (conjunction.risk_level === 'yellow') {
        color = '#d97706';
        glowColor = 'rgba(217, 119, 6, 0.3)';
      }

      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fillStyle = glowColor;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      if (W > 250) {
        ctx.fillStyle = color;
        ctx.font = '9px DM Mono, monospace';
        ctx.fillText(formatGateDistance(conjunction.miss_distance_m), px + 6, py - 2);
      }
    });

    if (W > 350) {
      const legendY = H - 24;
      const legendItems = [
        { color: '#e11d48', label: 'Critical < 1 km' },
        { color: '#d97706', label: 'Warning 1-5 km' },
        { color: 'rgba(255, 255, 255, 0.5)', label: '5 km gate boundary' },
      ];

      ctx.font = '9px DM Mono, monospace';
      let lx = 14;
      legendItems.forEach((item) => {
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
  }, [conjunctions.length, epoch, selectedConjunctions, selectedSatId]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  return <canvas ref={canvasRef} className="block w-full h-full cursor-default" />;
}

export default BullseyePlot;
