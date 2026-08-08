import { useState, useEffect, useRef } from "react";
import { GraphData, GraphEdge } from "@/types";

interface UseGraphAnimationProps {
  graphData: GraphData;
  idPairCache: WeakMap<object, string>;
}

export function useGraphAnimation({ graphData, idPairCache }: UseGraphAnimationProps) {
  const [animating, setAnimating] = useState(false);
  const [animProgress, setAnimProgress] = useState(1);
  const [enableFlow, setEnableFlow] = useState(false);
  const [glowingLinks, setGlowingLinks] = useState<Set<string>>(new Set());

  const animProgressRef = useRef(1);
  const cutoffTimeRef = useRef<number | null>(null);

  useEffect(() => {
    animProgressRef.current = animProgress;
  }, [animProgress]);

  useEffect(() => {
    if (!animating) return;
    const start = Date.now();
    const duration = 15000;
    let rafId: number;

    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      animProgressRef.current = progress;
      setAnimProgress(progress);
      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setAnimating(false);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [animating]);

  useEffect(() => {
    if (!enableFlow || !graphData || !graphData.links) {
      setTimeout(() => setGlowingLinks(new Set()), 0);
      return;
    }

    const interval = setInterval(() => {
      const newGlowing = new Set<string>();
      graphData.links.forEach((link: GraphEdge) => {
        if (Math.random() < 0.1) {
          let idPair = idPairCache.get(link);
          if (idPair === undefined) {
            // Using ForceLink typing to access caches
            const l = link as import("../types").ForceLink;
            const sourceId = l._sourceId || (typeof link.source === 'object' ? link.source.id : link.source);
            const targetId = l._targetId || (typeof link.target === 'object' ? link.target.id : link.target);
            idPair = `${sourceId}-${targetId}`;
            idPairCache.set(link, idPair);
          }
          newGlowing.add(idPair);
        }
      });
      setGlowingLinks(newGlowing);
    }, 1500);

    return () => clearInterval(interval);
  }, [enableFlow, graphData, idPairCache]);

  return {
    animating, setAnimating,
    animProgress, setAnimProgress,
    enableFlow, setEnableFlow,
    glowingLinks,
    animProgressRef,
    cutoffTimeRef
  };
}
