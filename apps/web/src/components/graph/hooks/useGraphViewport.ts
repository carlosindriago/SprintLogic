import { useState, useLayoutEffect, useEffect } from "react";

export function useGraphViewport(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setDimensions({ width: rect.width, height: rect.height });
      }
    }
  }, [containerRef]);

  useEffect(() => {
    if (!containerRef.current) return;

    let rafId: number;
    const observer = new ResizeObserver((entries) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        for (const entry of entries) {
          const w = entry.contentRect.width;
          const h = entry.contentRect.height;
          if (w > 0 && h > 0) {
            setDimensions((prev) =>
              prev.width === w && prev.height === h ? prev : { width: w, height: h }
            );
          }
        }
      });
    });

    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, [containerRef]);

  return { dimensions };
}
