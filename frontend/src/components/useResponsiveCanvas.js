import { useEffect, useState } from 'react';

function useResponsiveCanvas(canvasRef, draw) {
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;

    if (!parent) {
      return undefined;
    }

    const updateViewport = (width, height) => {
      const nextWidth = Math.max(0, Math.floor(width));
      const nextHeight = Math.max(0, Math.floor(height));

      setViewport((previous) => {
        if (previous.width === nextWidth && previous.height === nextHeight) {
          return previous;
        }

        return { width: nextWidth, height: nextHeight };
      });
    };

    updateViewport(parent.clientWidth, parent.clientHeight);

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];

        if (!entry) {
          return;
        }

        updateViewport(entry.contentRect.width, entry.contentRect.height);
      });

      observer.observe(parent);

      return () => observer.disconnect();
    }

    const handleResize = () => {
      updateViewport(parent.clientWidth, parent.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, [canvasRef]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || viewport.width === 0 || viewport.height === 0) {
      return;
    }

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewport.width, viewport.height);

    draw(ctx, viewport.width, viewport.height);
  }, [canvasRef, draw, viewport.height, viewport.width]);

  return viewport;
}

export default useResponsiveCanvas;
