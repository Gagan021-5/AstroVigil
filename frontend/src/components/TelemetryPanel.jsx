import React, { useRef, useEffect, useCallback } from 'react';
import './TelemetryPanel.css';

/**
 * Telemetry Heatmaps — Fuel gauges per satellite and efficiency chart.
 */
function TelemetryPanel({ satellites, totalFuelConsumed, totalCollisionsAvoided }) {
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
    const maxFuel = 100; // WET_MASS - DRY_MASS = 100 kg

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    if (!satellites || satellites.length === 0) return;

    const chartW = W * 0.55;
    const gaugeW = W - chartW - 20;
    const padX = 14;
    const padY = 8;

    // ═══════════════════════════════════════════════════════════
    // LEFT: Fuel Gauge Bars (scrollable list)
    // ═══════════════════════════════════════════════════════════
    ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText('Fuel Reserves (kg)', padX, padY + 12);

    const barH = 10;
    const barGap = 4;
    const maxBars = Math.min(satellites.length, Math.floor((H - 50) / (barH + barGap)));
    const barMaxW = chartW - 60;

    for (let i = 0; i < maxBars; i++) {
      const sat = satellites[i];
      const y = padY + 28 + i * (barH + barGap);
      const fuelPct = Math.max(0, sat.fuel_remaining_kg / maxFuel);

      // Label
      ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
      ctx.font = '8px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`S${sat.id}`, padX + 20, y + barH - 1);
      ctx.textAlign = 'left';

      // Background bar
      const bx = padX + 26;
      ctx.fillStyle = 'rgba(99, 179, 237, 0.06)';
      ctx.beginPath();
      ctx.roundRect(bx, y, barMaxW, barH, 3);
      ctx.fill();

      // Fuel bar with gradient
      let barColor;
      if (fuelPct > 0.5) barColor = '#34d399';
      else if (fuelPct > 0.2) barColor = '#fbbf24';
      else barColor = '#f87171';

      const grad = ctx.createLinearGradient(bx, 0, bx + barMaxW * fuelPct, 0);
      grad.addColorStop(0, barColor);
      grad.addColorStop(1, barColor + '80');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(bx, y, Math.max(2, barMaxW * fuelPct), barH, 3);
      ctx.fill();

      // Value
      ctx.fillStyle = 'rgba(226, 232, 240, 0.5)';
      ctx.font = '7px JetBrains Mono, monospace';
      ctx.fillText(`${sat.fuel_remaining_kg.toFixed(1)}`, bx + barMaxW + 4, y + barH - 1);
    }

    if (satellites.length > maxBars) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.font = '9px Inter, sans-serif';
      ctx.fillText(`+${satellites.length - maxBars} more...`, padX, H - 6);
    }

    // ═══════════════════════════════════════════════════════════
    // RIGHT: Efficiency Chart (Fuel Consumed vs Collisions Avoided)
    // ═══════════════════════════════════════════════════════════
    const cx = chartW + 10;
    const cw = gaugeW;
    const ch = H - 40;
    const cy = padY;

    // Title
    ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText('Fleet Efficiency', cx, cy + 12);

    // Stats boxes
    const stats = [
      { label: 'Total Fuel Used', value: `${totalFuelConsumed.toFixed(1)} kg`,
        color: '#fb923c', icon: '⛽' },
      { label: 'Collisions Avoided', value: `${totalCollisionsAvoided}`,
        color: '#34d399', icon: '🛡️' },
      { label: 'Active Satellites', value: `${satellites.length}`,
        color: '#63b3ed', icon: '🛰' },
      { label: 'Avg Fuel Remaining', value: `${(satellites.reduce((a, s) => a + s.fuel_remaining_kg, 0) / satellites.length).toFixed(1)} kg`,
        color: '#a78bfa', icon: '📊' },
    ];

    const boxH = 36;
    const boxGap = 6;
    stats.forEach((s, i) => {
      const by = cy + 24 + i * (boxH + boxGap);
      // Box background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.roundRect(cx, by, cw, boxH, 6);
      ctx.fill();
      ctx.strokeStyle = s.color + '30';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Icon
      ctx.font = '14px sans-serif';
      ctx.fillText(s.icon, cx + 8, by + 24);

      // Value
      ctx.fillStyle = s.color;
      ctx.font = 'bold 14px JetBrains Mono, monospace';
      ctx.fillText(s.value, cx + 28, by + 16);

      // Label
      ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
      ctx.font = '8px Inter, sans-serif';
      ctx.fillText(s.label, cx + 28, by + 28);
    });

    // Fleet fuel histogram at bottom
    const histY = cy + 24 + 4 * (boxH + boxGap) + 10;
    const histH = Math.max(30, H - histY - 10);
    if (histH > 20) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.font = '9px Inter, sans-serif';
      ctx.fillText('Fuel Distribution', cx, histY + 10);

      // 5-bucket histogram
      const buckets = [0, 0, 0, 0, 0]; // 0-20%, 20-40%, ...
      satellites.forEach(s => {
        const pct = s.fuel_remaining_kg / maxFuel;
        const b = Math.min(4, Math.floor(pct * 5));
        buckets[b]++;
      });
      const maxBucket = Math.max(...buckets, 1);
      const bucketW = (cw - 10) / 5;
      const colors = ['#f87171', '#fb923c', '#fbbf24', '#34d399', '#22d3ee'];

      buckets.forEach((count, i) => {
        const bx = cx + i * bucketW + 2;
        const bh = (count / maxBucket) * (histH - 24);
        const by2 = histY + histH - bh;
        ctx.fillStyle = colors[i] + '60';
        ctx.beginPath();
        ctx.roundRect(bx, by2, bucketW - 4, bh, 2);
        ctx.fill();
        // Count label
        if (count > 0) {
          ctx.fillStyle = colors[i];
          ctx.font = '8px JetBrains Mono, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(count.toString(), bx + (bucketW - 4) / 2, by2 - 2);
          ctx.textAlign = 'left';
        }
      });
    }

    animRef.current = requestAnimationFrame(draw);
  }, [satellites, totalFuelConsumed, totalCollisionsAvoided]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  return <canvas ref={canvasRef} className="telemetry-canvas" />;
}

export default TelemetryPanel;
