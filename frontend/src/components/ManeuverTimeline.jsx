import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import './ManeuverTimeline.css';

const PROXIMITY_GATE_M = 5000;

function formatDistance(value) {
  if (value == null) return 'N/A';
  if (value >= 1000) return `${(value / 1000).toFixed(1)} km`;
  return `${value.toFixed(0)} m`;
}

function ManeuverTimeline({
  timeline,
  conjunctions = [],
  selectedSatId,
  epoch,
  satellites,
  queuedManeuversCount,
  queuedPreemptiveManeuversCount,
  closestObjectDistanceM,
  collisionTriggerDistanceM,
}) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  const nearestThreats = useMemo(() => {
    const map = new Map();
    conjunctions.forEach((conjunction) => {
      const existing = map.get(conjunction.satellite_id);
      if (!existing || conjunction.miss_distance_m < existing.miss_distance_m) {
        map.set(conjunction.satellite_id, conjunction);
      }
    });
    return map;
  }, [conjunctions]);

  const drawLiveThreatLanes = useCallback((ctx, W, H, padL, padR, padT, padB) => {
    const threats = satellites
      .map((satellite) => ({
        satellite,
        threat: nearestThreats.get(satellite.id) ?? null,
      }))
      .filter((entry) => entry.threat);

    if (threats.length === 0) {
      ctx.fillStyle = 'rgba(161, 161, 170, 0.4)';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No conjunctions inside the 5 km gate', W / 2, H / 2 - 8);
      ctx.font = '10px DM Mono, monospace';
      ctx.fillStyle = 'rgba(161, 161, 170, 0.55)';
      ctx.fillText(
        `Closest tracked object: ${formatDistance(closestObjectDistanceM)}   Trigger: ${formatDistance(collisionTriggerDistanceM)}`,
        W / 2,
        H / 2 + 12
      );
      ctx.textAlign = 'left';
      return;
    }

    threats.sort((a, b) => {
      if (a.satellite.id === selectedSatId) return -1;
      if (b.satellite.id === selectedSatId) return 1;
      return a.threat.miss_distance_m - b.threat.miss_distance_m;
    });

    ctx.fillStyle = 'rgba(161, 161, 170, 0.4)';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No burns yet. Showing live conjunction lanes.', W / 2, 42);
    ctx.font = '10px DM Mono, monospace';
    ctx.fillStyle = 'rgba(161, 161, 170, 0.55)';
    ctx.fillText(
      `Queued burns: ${queuedManeuversCount}   Pre-emptive queued: ${queuedPreemptiveManeuversCount}   Snapshot T+${(epoch / 60).toFixed(1)}m`,
      W / 2,
      60
    );
    ctx.textAlign = 'left';

    const chartTop = padT + 42;
    const chartBottom = H - padB;
    const chartHeight = chartBottom - chartTop;
    const rowH = Math.min(26, Math.max(20, chartHeight / Math.max(1, threats.length)));
    const chartW = W - padL - padR;
    const barX = padL + 34;
    const barW = chartW - 34;

    const axisY = chartTop - 12;
    [0, 1000, PROXIMITY_GATE_M].forEach((distance) => {
      const x = barX + (distance / PROXIMITY_GATE_M) * barW;
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, chartTop - 4);
      ctx.lineTo(x, chartBottom);
      ctx.stroke();

      ctx.fillStyle = 'rgba(161,161,170,0.55)';
      ctx.font = '9px DM Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(formatDistance(distance), x, axisY);
    });
    ctx.textAlign = 'left';

    threats.forEach((entry, index) => {
      const y = chartTop + index * rowH;
      const { satellite, threat } = entry;
      const ratio = Math.min(1, threat.miss_distance_m / PROXIMITY_GATE_M);
      const markerX = barX + ratio * barW;
      const selected = satellite.id === selectedSatId;

      if (selected) {
        ctx.fillStyle = 'rgba(103, 232, 249, 0.07)';
        ctx.fillRect(padL, y, chartW, rowH - 3);
      }

      ctx.fillStyle = selected ? 'rgba(103, 232, 249, 0.9)' : 'rgba(161, 161, 170, 0.6)';
      ctx.font = '9px DM Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`S${satellite.id}`, padL + 26, y + rowH / 2 + 2);
      ctx.textAlign = 'left';

      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.beginPath();
      ctx.roundRect(barX, y + 4, barW, rowH - 10, 4);
      ctx.fill();

      ctx.fillStyle = 'rgba(225, 29, 72, 0.18)';
      ctx.beginPath();
      ctx.roundRect(barX, y + 4, Math.max(8, barW * 0.2), rowH - 10, 4);
      ctx.fill();

      ctx.fillStyle = 'rgba(217, 119, 6, 0.14)';
      ctx.beginPath();
      ctx.roundRect(barX + barW * 0.2, y + 4, barW * 0.8, rowH - 10, 4);
      ctx.fill();

      const markerColor = threat.risk_level === 'red' ? '#e11d48' : '#d97706';
      ctx.fillStyle = markerColor;
      ctx.beginPath();
      ctx.arc(markerX, y + rowH / 2, 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `${markerColor}66`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(markerX, y + 4);
      ctx.lineTo(markerX, y + rowH - 6);
      ctx.stroke();

      ctx.fillStyle = markerColor;
      ctx.font = '8px DM Mono, monospace';
      ctx.fillText(
        `${formatDistance(threat.miss_distance_m)}  OBJ-${threat.debris_id}`,
        Math.min(markerX + 8, W - padR - 110),
        y + rowH / 2 + 3
      );

      ctx.fillStyle = 'rgba(161, 161, 170, 0.55)';
      ctx.fillText(
        `${threat.bearing_deg.toFixed(0)} deg`,
        W - padR - 42,
        y + rowH / 2 + 3
      );
    });

    const legendY = H - 14;
    ctx.font = '9px Inter, sans-serif';
    const legendParts = [
      { color: 'rgba(225, 29, 72, 0.85)', label: 'Critical < 1 km' },
      { color: 'rgba(217, 119, 6, 0.85)', label: 'Gate 1-5 km' },
      { color: 'rgba(103, 232, 249, 0.85)', label: `Selected SAT-${selectedSatId}` },
    ];
    let legendX = padL;
    legendParts.forEach((part) => {
      ctx.fillStyle = part.color;
      ctx.fillRect(legendX, legendY - 4, 8, 8);
      ctx.fillStyle = 'rgba(161, 161, 170, 0.6)';
      ctx.fillText(part.label, legendX + 12, legendY + 4);
      legendX += ctx.measureText(part.label).width + 24;
    });
  }, [
    satellites,
    nearestThreats,
    selectedSatId,
    queuedManeuversCount,
    queuedPreemptiveManeuversCount,
    epoch,
    closestObjectDistanceM,
    collisionTriggerDistanceM,
  ]);

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
    const padL = 50;
    const padR = 14;
    const padT = 30;
    const padB = 30;

    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(161, 161, 170, 0.6)';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText('Burn Schedule and Live Threat Lanes', padL, 14);

    if (!timeline || timeline.length === 0) {
      drawLiveThreatLanes(ctx, W, H, padL, padR, padT, padB);
      animRef.current = requestAnimationFrame(draw);
      return;
    }

    const allTimes = timeline.flatMap((maneuver) => [maneuver.burn_start, maneuver.cooldown_end]);
    const tMin = Math.min(...allTimes) - 60;
    const tMax = Math.max(...allTimes, epoch) + 120;
    const tRange = tMax - tMin || 1;

    const satIds = [...new Set(timeline.map((maneuver) => maneuver.satellite_id))].sort((a, b) => a - b);
    const rowH = Math.min(20, (H - padT - padB) / satIds.length);
    const chartW = W - padL - padR;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 0.5;
    const steps = 6;
    for (let i = 0; i <= steps; i += 1) {
      const x = padL + (chartW * i / steps);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, H - padB);
      ctx.stroke();

      const t = tMin + (tRange * i / steps);
      ctx.fillStyle = 'rgba(161, 161, 170, 0.5)';
      ctx.font = '9px DM Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`T+${(t / 60).toFixed(0)}m`, x, H - padB + 14);
    }
    ctx.textAlign = 'left';

    const nowX = padL + ((epoch - tMin) / tRange) * chartW;
    if (nowX >= padL && nowX <= W - padR) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(nowX, padT);
      ctx.lineTo(nowX, H - padB);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffff';
      ctx.font = '8px DM Mono, monospace';
      ctx.fillText('NOW', nowX + 3, padT - 4);
    }

    satIds.forEach((satId, rowIdx) => {
      const y = padT + rowIdx * rowH;

      ctx.fillStyle = 'rgba(161, 161, 170, 0.6)';
      ctx.font = '9px DM Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`S${satId}`, padL - 6, y + rowH / 2 + 3);
      ctx.textAlign = 'left';

      ctx.fillStyle = rowIdx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent';
      ctx.fillRect(padL, y, chartW, rowH);

      const maneuvers = timeline.filter((maneuver) => maneuver.satellite_id === satId);
      maneuvers.forEach((maneuver) => {
        const x1 = padL + ((maneuver.burn_start - tMin) / tRange) * chartW;
        const x2 = padL + ((maneuver.burn_end - tMin) / tRange) * chartW;
        const x3 = padL + ((maneuver.cooldown_end - tMin) / tRange) * chartW;

        const burnW = Math.max(6, x2 - x1);
        const burnMarkerX = x1 + burnW / 2;
        const isPreempt = !!maneuver.blackout_preemptive;
        const burnFill = isPreempt
          ? 'rgba(139, 92, 246, 0.85)'
          : 'rgba(255, 255, 255, 0.8)';

        ctx.fillStyle = burnFill;
        ctx.beginPath();
        ctx.roundRect(x1, y + 2, burnW, rowH - 4, 2);
        ctx.fill();

        if (isPreempt) {
          ctx.fillStyle = 'rgba(139, 92, 246, 0.95)';
          ctx.beginPath();
          ctx.moveTo(burnMarkerX, y - 4);
          ctx.lineTo(burnMarkerX + 5, y + 1);
          ctx.lineTo(burnMarkerX, y + 6);
          ctx.lineTo(burnMarkerX - 5, y + 1);
          ctx.closePath();
          ctx.fill();

          const calloutText = maneuver.preempt_station
            ? `PRE ${maneuver.preempt_station.toUpperCase().slice(0, 3)}`
            : 'PRE';
          ctx.fillStyle = 'rgba(139, 92, 246, 0.95)';
          ctx.font = '7px DM Mono, monospace';
          ctx.fillText(
            calloutText,
            Math.min(burnMarkerX + 8, W - padR - 42),
            y + 9
          );
        }

        const coolW = Math.max(0, x3 - x2);
        if (coolW > 0) {
          ctx.fillStyle = 'rgba(217, 119, 6, 0.1)';
          ctx.fillRect(x2, y + 2, coolW, rowH - 4);

          ctx.strokeStyle = 'rgba(217, 119, 6, 0.15)';
          ctx.lineWidth = 0.5;
          ctx.save();
          ctx.beginPath();
          ctx.rect(x2, y + 2, coolW, rowH - 4);
          ctx.clip();
          for (let hx = x2; hx < x2 + coolW + rowH; hx += 5) {
            ctx.beginPath();
            ctx.moveTo(hx, y + 2);
            ctx.lineTo(hx - rowH, y + rowH - 2);
            ctx.stroke();
          }
          ctx.restore();
        }

        if (burnW > 25) {
          ctx.fillStyle = '#000000';
          ctx.font = '8px DM Mono, monospace';
          ctx.fillText(`${maneuver.delta_v_mag.toFixed(1)}m/s`, x1 + 3, y + rowH / 2 + 3);
        }

        if (maneuver.conflicts) {
          const fx = x1 - 2;
          const fy = y + 2;
          ctx.fillStyle = '#e11d48';
          ctx.beginPath();
          ctx.moveTo(fx, fy);
          ctx.lineTo(fx + 6, fy);
          ctx.lineTo(fx + 3, fy - 6);
          ctx.closePath();
          ctx.fill();
        }
      });
    });

    const legendY = H - 14;
    ctx.font = '9px Inter, sans-serif';
    const legendParts = [
      { color: 'rgba(255, 255, 255, 0.8)', label: 'Burn' },
      { color: 'rgba(139, 92, 246, 0.85)', label: 'Pre-empt upload' },
      { color: 'rgba(217, 119, 6, 0.3)', label: 'Cooldown' },
      { color: '#e11d48', label: 'Conflict' },
    ];
    let legendX = padL;
    legendParts.forEach((part) => {
      ctx.fillStyle = part.color;
      ctx.fillRect(legendX, legendY - 4, 8, 8);
      ctx.fillStyle = 'rgba(161, 161, 170, 0.6)';
      ctx.fillText(part.label, legendX + 12, legendY + 4);
      legendX += ctx.measureText(part.label).width + 24;
    });

    animRef.current = requestAnimationFrame(draw);
  }, [
    timeline,
    drawLiveThreatLanes,
    epoch,
  ]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  return <canvas ref={canvasRef} className="block w-full h-full" />;
}

export default ManeuverTimeline;
