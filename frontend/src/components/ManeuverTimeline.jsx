import React, { useRef, useEffect, useCallback } from 'react';
import './ManeuverTimeline.css';

/**
 * Maneuver Timeline - Gantt-chart style burn scheduler.
 * Shows burn starts, burn ends, cooldown blocks, and conflict flags.
 * Blackout-preemptive burns are rendered in violet with a PRE callout.
 */
function ManeuverTimeline({
  timeline,
  epoch,
  satellites,
  queuedManeuversCount,
  queuedPreemptiveManeuversCount,
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
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const padL = 50;
    const padR = 14;
    const padT = 30;
    const padB = 30;

    const formatDistance = (value) => {
      if (value == null) return 'N/A';
      if (value >= 1000) return `${(value / 1000).toFixed(1)} km`;
      return `${value.toFixed(0)} m`;
    };

    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(161, 161, 170, 0.6)';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText('Burn Schedule & Cooldown Windows', padL, 14);

    if (!timeline || timeline.length === 0) {
      ctx.fillStyle = 'rgba(161, 161, 170, 0.4)';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No collision-triggered burns yet', W / 2, H / 2 - 18);

      ctx.font = '10px DM Mono, monospace';
      ctx.fillStyle = 'rgba(161, 161, 170, 0.55)';
      ctx.fillText(
        `Queued burns: ${queuedManeuversCount}   Pre-emptive queued: ${queuedPreemptiveManeuversCount}`,
        W / 2,
        H / 2 + 2
      );
      ctx.fillText(
        `Closest tracked object: ${formatDistance(closestObjectDistanceM)}   Trigger: ${formatDistance(collisionTriggerDistanceM)}`,
        W / 2,
        H / 2 + 20
      );
      ctx.textAlign = 'left';

      if (satellites && satellites.length > 0) {
        const rowH = 14;
        const maxRows = Math.min(
          satellites.length,
          Math.floor((H - padT - padB) / rowH)
        );
        ctx.font = '9px DM Mono, monospace';

        for (let i = 0; i < maxRows; i += 1) {
          const sat = satellites[i];
          const y = padT + 10 + i * rowH;

          ctx.fillStyle = 'rgba(161, 161, 170, 0.6)';
          ctx.textAlign = 'right';
          ctx.fillText(`S${sat.id}`, padL - 6, y + 9);
          ctx.textAlign = 'left';

          const barX = padL;
          const barW = W - padL - padR;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
          ctx.beginPath();
          ctx.roundRect(barX, y, barW, rowH - 2, 2);
          ctx.fill();

          if (sat.cooldown_remaining_s > 0) {
            const coolPct = sat.cooldown_remaining_s / 600;
            ctx.fillStyle = 'rgba(217, 119, 6, 0.2)';
            ctx.beginPath();
            ctx.roundRect(barX, y, barW * coolPct, rowH - 2, 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(217, 119, 6, 0.15)';
            ctx.lineWidth = 0.5;
            for (let hx = barX; hx < barX + barW * coolPct; hx += 6) {
              ctx.beginPath();
              ctx.moveTo(hx, y);
              ctx.lineTo(hx + rowH, y + rowH - 2);
              ctx.stroke();
            }

            ctx.fillStyle = 'rgba(217, 119, 6, 0.6)';
            ctx.font = '8px DM Mono, monospace';
            ctx.fillText(
              `COOLDOWN ${sat.cooldown_remaining_s.toFixed(0)}s`,
              barX + 4,
              y + 9
            );
            ctx.font = '9px DM Mono, monospace';
          } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
            ctx.beginPath();
            ctx.roundRect(barX, y, barW, rowH - 2, 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.font = '8px DM Mono, monospace';
            ctx.fillText('READY', barX + 4, y + 9);
            ctx.font = '9px DM Mono, monospace';
          }
        }
      }

      animRef.current = requestAnimationFrame(draw);
      return;
    }

    const allTimes = timeline.flatMap((m) => [m.burn_start, m.cooldown_end]);
    const tMin = Math.min(...allTimes) - 60;
    const tMax = Math.max(...allTimes, epoch) + 120;
    const tRange = tMax - tMin || 1;

    const satIds = [...new Set(timeline.map((m) => m.satellite_id))].sort(
      (a, b) => a - b
    );
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

      const maneuvers = timeline.filter((m) => m.satellite_id === satId);
      maneuvers.forEach((m) => {
        const x1 = padL + ((m.burn_start - tMin) / tRange) * chartW;
        const x2 = padL + ((m.burn_end - tMin) / tRange) * chartW;
        const x3 = padL + ((m.cooldown_end - tMin) / tRange) * chartW;

        const burnW = Math.max(6, x2 - x1);
        const burnMarkerX = x1 + burnW / 2;
        const isPreempt = !!m.blackout_preemptive;
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

          const calloutText = m.preempt_station
            ? `PRE ${m.preempt_station.toUpperCase().slice(0, 3)}`
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
          ctx.fillText(`${m.delta_v_mag.toFixed(1)}m/s`, x1 + 3, y + rowH / 2 + 3);
        }

        if (m.conflicts) {
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

    const ly = H - 14;
    ctx.font = '9px Inter, sans-serif';
    const legendParts = [
      { color: 'rgba(255, 255, 255, 0.8)', label: 'Burn' },
      { color: 'rgba(139, 92, 246, 0.85)', label: 'Pre-empt (Blackout)' },
      { color: 'rgba(217, 119, 6, 0.3)', label: 'Cooldown (600s)' },
      { color: '#e11d48', label: 'Conflict' },
    ];
    let lx = padL;
    legendParts.forEach((part) => {
      ctx.fillStyle = part.color;
      ctx.fillRect(lx, ly - 4, 8, 8);
      ctx.fillStyle = 'rgba(161, 161, 170, 0.6)';
      ctx.fillText(part.label, lx + 12, ly + 4);
      lx += ctx.measureText(part.label).width + 24;
    });

    animRef.current = requestAnimationFrame(draw);
  }, [
    timeline,
    epoch,
    satellites,
    queuedManeuversCount,
    queuedPreemptiveManeuversCount,
    closestObjectDistanceM,
    collisionTriggerDistanceM,
  ]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  return <canvas ref={canvasRef} className="block w-full h-full" />;
}

export default ManeuverTimeline;
