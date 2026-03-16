import React, { useRef, useEffect, useCallback } from 'react';
import './GroundTrackMap.css';

/**
 * Ground Track Map — Canvas-based Mercator projection.
 * Renders satellite markers, 90-min trails, predicted paths,
 * debris field, and a terminator line shadow overlay.
 */
function GroundTrackMap({ satellites, debrisCompressed, epoch, selectedSatId, onSelectSat }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  // Convert lat/lon to canvas pixel coordinates (Mercator)
  const latLonToXY = useCallback((lat, lon, w, h) => {
    const x = ((lon + 180) / 360) * w;
    const y = ((90 - lat) / 180) * h;
    return [x, y];
  }, []);

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

    // ── Background ──
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    // ── Grid lines ──
    ctx.strokeStyle = 'rgba(99, 179, 237, 0.06)';
    ctx.lineWidth = 1;
    for (let lon = -180; lon <= 180; lon += 30) {
      const [x] = latLonToXY(0, lon, W, H);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let lat = -90; lat <= 90; lat += 30) {
      const [, y] = latLonToXY(lat, 0, W, H);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // ── Equator ──
    ctx.strokeStyle = 'rgba(99, 179, 237, 0.12)';
    ctx.lineWidth = 1;
    const [, eqY] = latLonToXY(0, 0, W, H);
    ctx.beginPath(); ctx.moveTo(0, eqY); ctx.lineTo(W, eqY); ctx.stroke();

    // ── Coastline approximation (simplified continental outlines) ──
    drawCoastlines(ctx, W, H, latLonToXY);

    // ── Terminator Line (day/night shadow) ──
    drawTerminator(ctx, W, H, epoch, latLonToXY);

    // ── Debris cloud (batch render for performance) ──
    if (debrisCompressed && debrisCompressed.length > 0) {
      ctx.fillStyle = 'rgba(251, 146, 60, 0.25)';
      for (let i = 0; i < debrisCompressed.length; i += 4) {
        const lat = debrisCompressed[i + 1];
        const lon = debrisCompressed[i + 2];
        const [dx, dy] = latLonToXY(lat, lon, W, H);
        ctx.fillRect(dx - 0.5, dy - 0.5, 1.5, 1.5);
      }
    }

    // ── Satellites ──
    if (satellites) {
      satellites.forEach(sat => {
        const isSelected = sat.id === selectedSatId;

        // Historical trail (fading)
        if (sat.trail && sat.trail.length > 1) {
          ctx.lineWidth = 1;
          for (let i = 1; i < sat.trail.length; i++) {
            const alpha = (i / sat.trail.length) * 0.6;
            ctx.strokeStyle = isSelected
              ? `rgba(34, 211, 238, ${alpha})`
              : `rgba(99, 179, 237, ${alpha})`;
            const [x1, y1] = latLonToXY(sat.trail[i - 1][0], sat.trail[i - 1][1], W, H);
            const [x2, y2] = latLonToXY(sat.trail[i][0], sat.trail[i][1], W, H);
            // Avoid wrapping lines
            if (Math.abs(x2 - x1) < W * 0.5) {
              ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            }
          }
        }

        // Predicted trajectory (dashed)
        if (sat.predicted && sat.predicted.length > 1) {
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1;
          ctx.strokeStyle = isSelected
            ? 'rgba(167, 139, 250, 0.5)'
            : 'rgba(167, 139, 250, 0.25)';
          ctx.beginPath();
          let moved = false;
          for (let i = 0; i < sat.predicted.length; i++) {
            const [px, py] = latLonToXY(sat.predicted[i][0], sat.predicted[i][1], W, H);
            if (i > 0) {
              const [prevX] = latLonToXY(sat.predicted[i-1][0], sat.predicted[i-1][1], W, H);
              if (Math.abs(px - prevX) > W * 0.5) {
                ctx.stroke();
                ctx.beginPath();
                moved = false;
              }
            }
            if (!moved) { ctx.moveTo(px, py); moved = true; }
            else ctx.lineTo(px, py);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Satellite marker
        const [sx, sy] = latLonToXY(sat.lat, sat.lon, W, H);

        if (isSelected) {
          // Glow ring
          ctx.beginPath();
          ctx.arc(sx, sy, 10, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(34, 211, 238, 0.12)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.5)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Dot
        ctx.beginPath();
        ctx.arc(sx, sy, isSelected ? 4 : 3, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? '#22d3ee' : '#63b3ed';
        ctx.fill();

        // Label
        ctx.fillStyle = isSelected ? '#22d3ee' : 'rgba(226, 232, 240, 0.7)';
        ctx.font = `${isSelected ? '11' : '9'}px Inter, sans-serif`;
        ctx.fillText(`S${sat.id}`, sx + 6, sy - 4);
      });
    }

    // ── Axis labels ──
    ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.font = '9px Inter, sans-serif';
    for (let lon = -150; lon <= 150; lon += 60) {
      const [lx] = latLonToXY(0, lon, W, H);
      ctx.fillText(`${lon}°`, lx + 2, H - 3);
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      if (lat === 0) continue;
      const [, ly] = latLonToXY(lat, 0, W, H);
      ctx.fillText(`${lat}°`, 3, ly - 2);
    }

    animRef.current = requestAnimationFrame(draw);
  }, [satellites, debrisCompressed, epoch, selectedSatId, latLonToXY]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  const handleClick = useCallback((e) => {
    if (!satellites) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const W = rect.width;
    const H = rect.height;

    let closest = null;
    let closestDist = 20;
    satellites.forEach(sat => {
      const [sx, sy] = latLonToXY(sat.lat, sat.lon, W, H);
      const d = Math.hypot(sx - x, sy - y);
      if (d < closestDist) { closest = sat.id; closestDist = d; }
    });
    if (closest !== null) onSelectSat(closest);
  }, [satellites, latLonToXY, onSelectSat]);

  return (
    <canvas
      ref={canvasRef}
      className="ground-track-canvas"
      onClick={handleClick}
    />
  );
}

/** Simplified continental outlines for the map background */
function drawCoastlines(ctx, W, H, latLonToXY) {
  const continents = [
    // North America (simplified)
    [[ 70,-168],[ 70,-60],[ 50,-55],[ 42,-67],[ 25,-80],[ 15,-85],[ 15,-90],[ 18,-105],[ 32,-117],[ 48,-124],[ 60,-140],[ 70,-168]],
    // South America
    [[ 12,-70],[ 5,-77],[ -5,-80],[ -5,-35],[ -15,-40],[ -23,-42],[ -35,-55],[ -55,-69],[ -50,-75],[ -42,-73],[ -17,-72],[ -5,-80]],
    // Europe
    [[ 36,-10],[ 38,0],[ 43,5],[ 46,1],[ 48,3],[ 52,5],[ 54,10],[ 57,10],[ 65,14],[ 71,28],[ 70,40],[ 55,28],[ 45,30],[ 42,28],[ 36,28],[ 36,-10]],
    // Africa
    [[ 35,-5],[ 37,10],[ 32,32],[ 12,44],[ 0,42],[ -12,40],[ -26,33],[ -35,20],[ -35,18],[ -20,12],[ -6,12],[ 5,0],[ 6,-3],[ 15,-17],[ 35,-5]],
    // Asia (very simplified)
    [[ 42,28],[ 45,30],[ 55,28],[ 70,40],[ 72,60],[ 73,80],[ 72,100],[ 65,110],[ 62,130],[ 65,170],[ 55,162],[ 45,140],[ 35,130],[ 22,108],[ 8,77],[ 25,55],[ 32,48],[ 32,32],[ 38,44],[ 42,28]],
    // Australia
    [[-12,130],[-15,140],[-25,153],[-35,150],[-38,145],[-35,137],[-22,114],[-12,130]],
  ];

  ctx.strokeStyle = 'rgba(99, 179, 237, 0.12)';
  ctx.fillStyle = 'rgba(99, 179, 237, 0.04)';
  ctx.lineWidth = 0.8;

  continents.forEach(points => {
    ctx.beginPath();
    points.forEach((p, i) => {
      const [x, y] = latLonToXY(p[0], p[1], W, H);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
}

/** Terminator line — day/night boundary based on simplified solar position */
function drawTerminator(ctx, W, H, epoch, latLonToXY) {
  // Approximate subsolar point
  const dayOfYear = ((epoch || 0) / 86400) % 365.25;
  const declination = -23.44 * Math.cos(((dayOfYear + 10) / 365.25) * 2 * Math.PI);
  const hourAngle = ((epoch || 0) % 86400) / 86400 * 360 - 180;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.beginPath();

  // Draw the night-side polygon
  const steps = 100;
  // Top edge
  for (let i = 0; i <= steps; i++) {
    const lon = -180 + (360 * i / steps);
    const lonRad = (lon - hourAngle) * Math.PI / 180;
    const decRad = declination * Math.PI / 180;
    const terminatorLat = Math.atan2(-Math.cos(lonRad), Math.tan(decRad)) * 180 / Math.PI;
    const [x, y] = latLonToXY(terminatorLat, lon, W, H);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  // Close along bottom or top based on declination sign
  if (declination >= 0) {
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
  } else {
    ctx.lineTo(W, 0);
    ctx.lineTo(0, 0);
  }

  ctx.closePath();
  ctx.fill();
}

export default GroundTrackMap;
