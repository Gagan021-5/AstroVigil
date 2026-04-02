import React, { useRef, useEffect, useCallback } from 'react';
import './TelemetryPanel.css';

/**
 * Telemetry Heatmaps — Fuel gauges per satellite and efficiency chart.
 */
function TelemetryPanel({
  satellites,
  totalFuelConsumed,
  totalCollisionsAvoided,
  queuedManeuversCount,
  queuedPreemptiveManeuversCount,
  executedPreemptiveManeuversCount,
  closestObjectDistanceM,
  collisionTriggerDistanceM,
}) {
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

    // ── Background ──
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, W, H);

    if (!satellites || satellites.length === 0) return;

    const chartW = W * 0.55;
    const gaugeW = W - chartW - 20;
    const padX = 14;
    const padY = 8;

    // ═══════════════════════════════════════════════════════════
    // LEFT: Fuel Gauge Bars (scrollable list)
    // ═══════════════════════════════════════════════════════════
    ctx.fillStyle = 'rgba(161, 161, 170, 0.6)';
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
      ctx.fillStyle = 'rgba(161, 161, 170, 0.6)';
      ctx.font = '9px DM Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`S${sat.id}`, padX + 20, y + barH - 1);
      ctx.textAlign = 'left';

      // Background bar
      const bx = padX + 26;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.beginPath();
      ctx.roundRect(bx, y, barMaxW, barH, 3);
      ctx.fill();

      // Fuel bar with gradient (using elegant colors)
      let barColor;
      if (fuelPct > 0.5) barColor = '#10b981'; // Emerald
      else if (fuelPct > 0.2) barColor = '#d97706'; // Amber
      else barColor = '#e11d48'; // Rose

      const grad = ctx.createLinearGradient(bx, 0, bx + barMaxW * fuelPct, 0);
      grad.addColorStop(0, barColor);
      grad.addColorStop(1, barColor + '80');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(bx, y, Math.max(2, barMaxW * fuelPct), barH, 3);
      ctx.fill();

      // Value
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '8px DM Mono, monospace';
      ctx.fillText(`${sat.fuel_remaining_kg.toFixed(1)}`, bx + barMaxW + 6, y + barH - 1);
    }

    if (satellites.length > maxBars) {
      ctx.fillStyle = 'rgba(161, 161, 170, 0.4)';
      ctx.font = '9px Inter, sans-serif';
      ctx.fillText(`+${satellites.length - maxBars} more...`, padX, H - 6);
    }

    // ═══════════════════════════════════════════════════════════
    // RIGHT: Efficiency Chart (Fuel Consumed vs Collisions Avoided)
    // ═══════════════════════════════════════════════════════════
    const cx = chartW + 10;
    const cw = gaugeW;
    const cy = padY;

    // Title
    ctx.fillStyle = 'rgba(161, 161, 170, 0.6)';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText('Fleet Efficiency', cx, cy + 12);

    // Stats boxes
    const closestObjectLabel = closestObjectDistanceM == null
      ? 'N/A'
      : closestObjectDistanceM >= 1000
        ? `${(closestObjectDistanceM / 1000).toFixed(1)} km`
        : `${closestObjectDistanceM.toFixed(0)} m`;

    const triggerLabel = collisionTriggerDistanceM >= 1000
      ? `${(collisionTriggerDistanceM / 1000).toFixed(1)} km`
      : `${collisionTriggerDistanceM.toFixed(0)} m`;

    const stats = [
      { label: 'Total Fuel Used', value: `${totalFuelConsumed.toFixed(1)} kg`,
        color: '#d97706', icon: '⛽' },
      { label: 'Collisions Avoided', value: `${totalCollisionsAvoided}`,
        color: '#10b981', icon: '🛡️' },
      { label: 'Queued Burns', value: `${queuedManeuversCount}`,
        color: '#ffffff', icon: '⏳' },
      { label: 'Pre-emptive Uploads', value: `${executedPreemptiveManeuversCount} done / ${queuedPreemptiveManeuversCount} queued`,
        color: '#8b5cf6', icon: '📡' },
      { label: 'Closest Tracked Object', value: `${closestObjectLabel} (trigger ${triggerLabel})`,
        color: closestObjectDistanceM != null && closestObjectDistanceM <= collisionTriggerDistanceM ? '#e11d48' : '#71717a', icon: '📏' },
    ];

    const boxH = 36;
    const boxGap = 6;
    stats.forEach((s, i) => {
      const by = cy + 24 + i * (boxH + boxGap);
      // Box background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.beginPath();
      ctx.roundRect(cx, by, cw, boxH, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Icon
      ctx.font = '12px sans-serif';
      ctx.fillText(s.icon, cx + 8, by + 23);

      // Value
      ctx.fillStyle = s.color;
      ctx.font = '14px DM Mono, monospace';
      ctx.fillText(s.value, cx + 30, by + 16);

      // Label
      ctx.fillStyle = 'rgba(161, 161, 170, 0.5)';
      ctx.font = '9px Inter, sans-serif';
      ctx.fillText(s.label, cx + 30, by + 28);
    });

    // Fleet fuel histogram at bottom
    const histY = cy + 24 + stats.length * (boxH + boxGap) + 12;
    const histH = Math.max(30, H - histY - 10);
    if (histH > 20) {
      ctx.fillStyle = 'rgba(161, 161, 170, 0.5)';
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
      const colors = ['#e11d48', '#d97706', '#d97706', '#10b981', '#10b981'];

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
          ctx.font = '9px DM Mono, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(count.toString(), bx + (bucketW - 4) / 2, by2 - 4);
          ctx.textAlign = 'left';
        }
      });
    }

    animRef.current = requestAnimationFrame(draw);
  }, [
    satellites,
    totalFuelConsumed,
    totalCollisionsAvoided,
    queuedManeuversCount,
    queuedPreemptiveManeuversCount,
    executedPreemptiveManeuversCount,
    closestObjectDistanceM,
    collisionTriggerDistanceM,
  ]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  return <canvas ref={canvasRef} className="block w-full h-full" />;
}

export default TelemetryPanel;
