import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import './TelemetryPanel.css';

function formatDistance(distanceM) {
  if (distanceM == null) return 'N/A';
  if (distanceM >= 1000) return `${(distanceM / 1000).toFixed(1)} km`;
  return `${distanceM.toFixed(0)} m`;
}

function formatLatLon(value) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)} deg`;
}

function TelemetryPanel({
  satellites,
  conjunctions = [],
  selectedSatId,
  epoch,
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

  const selectedSat = useMemo(
    () => satellites.find((sat) => sat.id === selectedSatId) ?? satellites[0],
    [satellites, selectedSatId]
  );

  const selectedConjunctions = useMemo(
    () => conjunctions
      .filter((conjunction) => conjunction.satellite_id === selectedSatId)
      .sort((a, b) => a.miss_distance_m - b.miss_distance_m),
    [conjunctions, selectedSatId]
  );

  const nearestThreat = selectedConjunctions[0] ?? null;

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
    const maxFuel = 100;
    const chartW = W * 0.55;
    const gaugeW = W - chartW - 20;
    const padX = 14;
    const padY = 8;

    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, W, H);

    if (!satellites || satellites.length === 0) return;

    ctx.fillStyle = 'rgba(161, 161, 170, 0.6)';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText('Fuel Reserves (kg)', padX, padY + 12);

    const barH = 10;
    const barGap = 4;
    const maxBars = Math.min(satellites.length, Math.floor((H - 50) / (barH + barGap)));
    const barMaxW = chartW - 60;

    for (let i = 0; i < maxBars; i += 1) {
      const sat = satellites[i];
      const y = padY + 28 + i * (barH + barGap);
      const fuelPct = Math.max(0, sat.fuel_remaining_kg / maxFuel);

      ctx.fillStyle = sat.id === selectedSatId
        ? 'rgba(103, 232, 249, 0.9)'
        : 'rgba(161, 161, 170, 0.6)';
      ctx.font = '9px DM Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`S${sat.id}`, padX + 20, y + barH - 1);
      ctx.textAlign = 'left';

      const bx = padX + 26;
      ctx.fillStyle = sat.id === selectedSatId
        ? 'rgba(103, 232, 249, 0.08)'
        : 'rgba(255, 255, 255, 0.05)';
      ctx.beginPath();
      ctx.roundRect(bx, y, barMaxW, barH, 3);
      ctx.fill();

      let barColor = '#10b981';
      if (fuelPct <= 0.2) barColor = '#e11d48';
      else if (fuelPct <= 0.5) barColor = '#d97706';

      const grad = ctx.createLinearGradient(bx, 0, bx + barMaxW * fuelPct, 0);
      grad.addColorStop(0, barColor);
      grad.addColorStop(1, `${barColor}80`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(bx, y, Math.max(2, barMaxW * fuelPct), barH, 3);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '8px DM Mono, monospace';
      ctx.fillText(`${sat.fuel_remaining_kg.toFixed(1)}`, bx + barMaxW + 6, y + barH - 1);
    }

    if (satellites.length > maxBars) {
      ctx.fillStyle = 'rgba(161, 161, 170, 0.4)';
      ctx.font = '9px Inter, sans-serif';
      ctx.fillText(`+${satellites.length - maxBars} more...`, padX, H - 6);
    }

    const cx = chartW + 10;
    const cw = gaugeW;
    const cy = padY;

    ctx.fillStyle = 'rgba(161, 161, 170, 0.6)';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText('Live Mission State', cx, cy + 12);

    const trackingLine = selectedSat
      ? `${formatLatLon(selectedSat.lat)}  ${formatLatLon(selectedSat.lon)}`
      : 'No satellite selected';

    const threatLine = nearestThreat
      ? `${formatDistance(nearestThreat.miss_distance_m)} at ${nearestThreat.bearing_deg.toFixed(0)} deg`
      : 'CLEAR';

    const threatColor = !nearestThreat
      ? '#71717a'
      : nearestThreat.risk_level === 'red'
        ? '#e11d48'
        : '#d97706';

    const stats = [
      {
        label: 'Sim Clock',
        value: `T+${(epoch / 60).toFixed(1)}m`,
        color: '#67e8f9',
      },
      {
        label: `Tracking SAT-${selectedSatId}`,
        value: trackingLine,
        color: '#ffffff',
      },
      {
        label: 'Nearest Selected Threat',
        value: threatLine,
        color: threatColor,
      },
      {
        label: 'Gate Hits',
        value: `${selectedConjunctions.length} selected / ${conjunctions.length} fleet`,
        color: conjunctions.length > 0 ? '#d97706' : '#71717a',
      },
      {
        label: 'Burn Pipeline',
        value: `${queuedManeuversCount} queued / ${queuedPreemptiveManeuversCount} pre`,
        color: queuedManeuversCount > 0 ? '#8b5cf6' : '#71717a',
      },
      {
        label: 'Avoided / Fuel',
        value: `${totalCollisionsAvoided} / ${totalFuelConsumed.toFixed(1)} kg`,
        color: totalCollisionsAvoided > 0 ? '#10b981' : '#d97706',
      },
    ];

    const boxH = 31;
    const boxGap = 5;
    stats.forEach((stat, index) => {
      const by = cy + 24 + index * (boxH + boxGap);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.beginPath();
      ctx.roundRect(cx, by, cw, boxH, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = stat.color;
      ctx.font = '12px DM Mono, monospace';
      ctx.fillText(stat.value, cx + 10, by + 14);

      ctx.fillStyle = 'rgba(161, 161, 170, 0.5)';
      ctx.font = '9px Inter, sans-serif';
      ctx.fillText(stat.label, cx + 10, by + 26);
    });

    const meterY = cy + 24 + stats.length * (boxH + boxGap) + 10;
    const meterH = Math.max(28, H - meterY - 12);
    if (meterH > 20) {
      const safeWidth = cw;
      const dangerWidth = safeWidth * Math.min(1, collisionTriggerDistanceM / 5000);
      const nearestRatio = Math.min(1, (closestObjectDistanceM ?? 5000) / 5000);
      const markerX = cx + nearestRatio * safeWidth;

      ctx.fillStyle = 'rgba(161, 161, 170, 0.5)';
      ctx.font = '9px Inter, sans-serif';
      ctx.fillText('Closest Object Range Gate', cx, meterY + 10);

      const barY = meterY + 16;
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath();
      ctx.roundRect(cx, barY, safeWidth, 10, 5);
      ctx.fill();

      ctx.fillStyle = 'rgba(225, 29, 72, 0.20)';
      ctx.beginPath();
      ctx.roundRect(cx, barY, Math.max(6, dangerWidth), 10, 5);
      ctx.fill();

      ctx.fillStyle = 'rgba(217, 119, 6, 0.16)';
      ctx.beginPath();
      ctx.roundRect(cx + dangerWidth, barY, Math.max(0, safeWidth - dangerWidth), 10, 5);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(markerX, barY - 4);
      ctx.lineTo(markerX, barY + 14);
      ctx.stroke();

      ctx.fillStyle = closestObjectDistanceM != null && closestObjectDistanceM <= collisionTriggerDistanceM
        ? '#e11d48'
        : '#ffffff';
      ctx.font = '10px DM Mono, monospace';
      ctx.fillText(
        `${formatDistance(closestObjectDistanceM)} nearest`,
        cx,
        barY + 28
      );

      ctx.fillStyle = 'rgba(161, 161, 170, 0.55)';
      ctx.font = '9px DM Mono, monospace';
      ctx.fillText(
        `trigger ${formatDistance(collisionTriggerDistanceM)}`,
        cx + 120,
        barY + 28
      );

      ctx.fillText('0', cx, barY + 44);
      ctx.fillText('1 km', cx + safeWidth * 0.2 - 12, barY + 44);
      ctx.fillText('5 km', cx + safeWidth - 26, barY + 44);
    }

    animRef.current = requestAnimationFrame(draw);
  }, [
    satellites,
    conjunctions,
    selectedSatId,
    selectedSat,
    selectedConjunctions,
    nearestThreat,
    epoch,
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
