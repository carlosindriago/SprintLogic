import { useCallback, useRef, useState, useEffect } from "react";
import type { NodeObject, LinkObject } from "react-force-graph-2d";
import { ForceNode, ForceLink } from "../types";
import { getSafeTime, drawRoundedSquare, drawDiamond, drawTriangle } from "../utils";
import { graphTheme, extColorHash } from "@/lib/graph-theme";

interface UseGraphCanvasProps {
  displayGraphData: { nodes: ForceNode[]; links: ForceLink[] };
  graphDataLength: number;
  activeTypes: Set<string>;
  lowerSearchQuery: string;
  focusNode: string | null;
  hoverNode: string | null;
  neighbors: Map<string, Set<string>>;
  timeRange: { min: number; max: number } | null;
  animProgressRef: React.MutableRefObject<number>;
  cutoffTimeRef: React.MutableRefObject<number | null>;
  showCycles: boolean;
  glowingLinks: Set<string>;
}

const ICON_URLS: Record<string, string> = {
  py: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg",
  ts: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg",
  tsx: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg",
  js: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg",
  jsx: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg",
  go: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/go/go-original.svg",
  php: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/php/php-original.svg",
  java: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg",
  html: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/html5/html5-original.svg",
  css: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/css3/css3-original.svg",
  json: "https://cdn.simpleicons.org/json/f59e0b",
  md: "https://cdn.simpleicons.org/markdown/e2e8f0",
  bash: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/bash/bash-original.svg",
  sh: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/bash/bash-original.svg"
};

export function useGraphCanvas({
  displayGraphData,
  graphDataLength,
  activeTypes,
  lowerSearchQuery,
  focusNode,
  hoverNode,
  neighbors,
  timeRange,
  animProgressRef,
  cutoffTimeRef,
  showCycles,
  glowingLinks
}: UseGraphCanvasProps) {
  const globalScaleRef = useRef(1);
  const bgCentroidsRef = useRef<Map<string, { x: number; y: number; count: number; upperMod: string }>>(new Map());

  const [, setIconsLoaded] = useState(false);
  const iconImages = useRef<Record<string, HTMLImageElement>>({});

  useEffect(() => {
    let loadedCount = 0;
    const extensions = Object.keys(ICON_URLS);
    extensions.forEach((ext) => {
      const img = new Image();
      img.src = ICON_URLS[ext];
      img.onload = () => {
        loadedCount++;
        if (loadedCount === extensions.length) {
          setIconsLoaded(true);
        }
      };
      img.onerror = () => {
        loadedCount++;
        if (loadedCount === extensions.length) {
          setIconsLoaded(true);
        }
      };
      iconImages.current[ext] = img;
    });
  }, []);

  const isFaded = useCallback((nodeId: string) => {
    const activeFocus = focusNode || hoverNode;
    if (!activeFocus) return false;
    if (nodeId === activeFocus) return false;
    return !neighbors.get(activeFocus)?.has(nodeId);
  }, [focusNode, hoverNode, neighbors]);

  const paintBackground = useCallback((ctx: CanvasRenderingContext2D, globalScale: number) => {
    if (!displayGraphData || !displayGraphData.nodes || displayGraphData.nodes.length === 0) return;

    const centroids = bgCentroidsRef.current;
    for (const v of centroids.values()) {
      v.x = 0;
      v.y = 0;
      v.count = 0;
    }
    
    displayGraphData.nodes.forEach((n: ForceNode) => {
      if (cutoffTimeRef.current && getSafeTime(n) > cutoffTimeRef.current) return;
      const mod = n._modCache;
      if (!mod) return;
      
      const c = centroids.get(mod);
      if (!c) {
         centroids.set(mod, { x: n.x || 0, y: n.y || 0, count: 1, upperMod: mod.toUpperCase() });
      } else {
         c.x += n.x || 0;
         c.y += n.y || 0;
         c.count += 1;
      }
    });

    ctx.save();
    for (const [mod, centroid] of centroids.entries()) {
      if (centroid.count === 0) continue;
      const cx = centroid.x / centroid.count;
      const cy = centroid.y / centroid.count;
      const orbitRadius = Math.max(60, Math.sqrt(centroid.count) * 20);
      const color = extColorHash(mod);

      ctx.beginPath();
      ctx.arc(cx, cy, orbitRadius, 0, 2 * Math.PI, false);
      
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.03;
      ctx.fill();
      
      ctx.lineWidth = 1 / globalScale;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.15;
      ctx.stroke();
      
      const fontSize = 12 / globalScale;
      ctx.font = `${fontSize}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(centroid.upperMod, cx, cy - orbitRadius - (10 / globalScale));
    }
    ctx.restore();
  }, [displayGraphData, cutoffTimeRef]);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const paintNode = useCallback((node: NodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const isMassive = graphDataLength > 1000;
    const n = node as ForceNode;
    const { id, label, name } = n;
    const nx = n.x || 0;
    const ny = n.y || 0;

    globalScaleRef.current = globalScale;

    if (!activeTypes.has(label)) return;
    if (lowerSearchQuery && !(n._lowerName || "").includes(lowerSearchQuery)) return;

    const progress = animProgressRef.current;
    const bTime = getSafeTime(n);
    if (progress < 1 && timeRange) {
      const cutoff = timeRange.min + (timeRange.max - timeRange.min) * progress;
      if (bTime > cutoff) return;
    }

    const degree = n.in_degree || 0;
    const outDegree = n.out_degree || 0;
    const degreeRadius = 1 + Math.log2(1 + degree) * 1.8;

    let radius = 4;
    let color = graphTheme.unknown;
    let glowColor = "rgba(148, 163, 184, 0.4)";

    if (label === "File") {
      color = n._colorCache || graphTheme.unknown;
      glowColor = n._glowColorCache || "rgba(148, 163, 184, 0.4)";
      radius = Math.max(3.5, degreeRadius * 0.9);
    } else if (label === "Class") {
      color = graphTheme.class;
      glowColor = graphTheme.glowClass;
      radius = Math.max(5, degreeRadius);
    } else if (label === "Function") {
      color = graphTheme.function;
      glowColor = graphTheme.glowFunction;
      radius = Math.max(4, degreeRadius * 0.85);
    } else if (label === "Interface") {
      color = graphTheme.interface;
      glowColor = graphTheme.glowInterface;
      radius = Math.max(5, degreeRadius);
    } else if (label === "Module") {
      color = "#6366f1";
      glowColor = "#6366f1";
      const children = (n as ForceNode).children_count || 1;
      radius = Math.max(12, 6 + Math.log2(children) * 3);
    }

    const faded = isFaded(id as string);
    const isZoomedOut = globalScale < 1.0;
    const isActive = id === hoverNode || id === focusNode;

    let isSupernova = false;
    if (progress > 0 && progress < 1 && timeRange && !faded) {
      const currentCutoff = timeRange.min + (timeRange.max - timeRange.min) * progress;
      const age = currentCutoff - bTime;
      const supernovaWindow = (timeRange.max - timeRange.min) * 0.05;
      isSupernova = age >= 0 && age <= supernovaWindow;
    }

    if (isSupernova) {
      const pulse = Math.sin(Date.now() / 200) * 0.3 + 0.7;
      ctx.save();
      ctx.beginPath();
      ctx.arc(nx, ny, radius * (2.2 + pulse * 0.8), 0, 2 * Math.PI);
      ctx.shadowColor = "white";
      ctx.shadowBlur = 22 * pulse;
      ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
      ctx.globalAlpha = 0.85 * pulse;
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = faded ? graphTheme.dimOpacity : 1;

    if (!faded && !isZoomedOut) {
      const bloomRadius = isActive ? radius * 2.6 : radius * 1.9;
      ctx.save();
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = (isMassive && !isActive) ? 0 : (isActive ? 18 : 10);
      
      if (!isMassive || isActive) {
        ctx.beginPath();
        ctx.arc(nx, ny, bloomRadius * 0.5, 0, 2 * Math.PI);
        ctx.fillStyle = glowColor;
        ctx.globalAlpha = isActive ? 0.22 : 0.12;
        ctx.fill();
      }
      ctx.restore();
    }

    let isIconDrawn = false;
    if (label === "File") {
      const ext = n._extCache || "";
      const img = iconImages.current[ext];
      if (img && img.complete && img.naturalWidth !== 0) {
        ctx.save();
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = isActive ? 14 : 7;
        const iconSize = radius * 2.6;
        ctx.drawImage(img, nx - iconSize / 2, ny - iconSize / 2, iconSize, iconSize);
        ctx.restore();
        isIconDrawn = true;
      }
    }

    if (!isIconDrawn) {
      ctx.save();
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = (isMassive && !isActive) ? 0 : (isActive ? 16 : 8);
      ctx.fillStyle = color;

      if (isMassive && globalScale < 0.3 && !isActive) {
        ctx.fillRect(nx - radius, ny - radius, radius * 2, radius * 2);
      } else {
        if (label === "Class") {
          drawRoundedSquare(ctx, nx, ny, radius);
        } else if (label === "Interface") {
          drawDiamond(ctx, nx, ny, radius);
        } else if (label === "Function") {
          drawTriangle(ctx, nx, ny, radius);
        } else if (label === "Module") {
          ctx.beginPath();
          ctx.arc(nx, ny, radius, 0, 2 * Math.PI);
          ctx.lineWidth = 2;
          ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(nx, ny, radius, 0, 2 * Math.PI);
        }
        ctx.fill();

        if (!faded && !isZoomedOut && !isMassive && label !== "Module") {
          ctx.shadowBlur = 0;
          ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
          ctx.beginPath();
          ctx.arc(nx - radius * 0.3, ny - radius * 0.3, radius * 0.35, 0, 2 * Math.PI);
          ctx.fill();
        }
        
        if (label === "Module" && !isZoomedOut) {
          ctx.fillStyle = "white";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const fontSize = Math.max(4, radius * 0.4);
          ctx.font = `600 ${fontSize}px Inter, sans-serif`;
          ctx.shadowBlur = 0;
          const count = (n as ForceNode).children_count || 1;
          ctx.fillText(String(count), nx, ny);
        }
      }
      ctx.restore();
    }

    if (outDegree >= 10 && !faded && !isZoomedOut) {
      ctx.save();
      ctx.shadowColor = "rgba(251, 113, 133, 0.7)";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(nx, ny, radius + 2, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(251, 113, 133, 0.65)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }

    if (degree > 0 && !faded && !isZoomedOut && !isMassive && (label === "Function" || label === "Interface")) {
      const t = (Date.now() / 1400) % 1.0;
      const rippleRadius = radius + t * 9;
      ctx.beginPath();
      ctx.arc(nx, ny, rippleRadius, 0, 2 * Math.PI);
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = (1 - t) * 0.35;
      ctx.stroke();
      ctx.globalAlpha = faded ? graphTheme.dimOpacity : 1;
    }

    if (id === hoverNode && !faded) {
      const info: string[] = [];
      if (n.loc !== undefined) info.push(`LOC: ${n.loc}`);
      if (n.in_degree !== undefined) info.push(`↓${n.in_degree}  ↑${n.out_degree}`);
      if (info.length > 0) {
        const text = info.join("  ·  ");
        const fontSize = Math.max(8, 10 / globalScale);
        ctx.font = `${fontSize}px "Inter", sans-serif`;
        const tw = ctx.measureText(text).width;
        const padding = 3;
        const bx = nx - tw / 2 - padding;
        const by = ny - radius - fontSize - 10;
        ctx.fillStyle = "rgba(0,0,0,0.65)";
        ctx.beginPath();
        ctx.roundRect(bx, by, tw + padding * 2, fontSize + padding * 2, 3);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.textAlign = "center";
        ctx.fillText(text, nx, by + fontSize + padding - 1);
      }
    }

    if (globalScale > 2.5 || id === focusNode || id === hoverNode) {
      if (!(isMassive && globalScale < 0.6 && !isActive)) {
        const fontSize = Math.max(7, 11 / globalScale);
        ctx.font = `${fontSize}px "Inter", sans-serif`;
        ctx.textAlign = "center";
        ctx.shadowColor = "rgba(0,0,0,0.9)";
        ctx.shadowBlur = (isMassive && !isActive) ? 0 : 4;
        ctx.fillStyle = isActive ? "rgba(255, 255, 255, 1)" : "rgba(200, 200, 220, 0.75)";
        ctx.fillText(name || "", nx, ny + radius + fontSize + 2);
        ctx.shadowBlur = 0;
      }
    }

    ctx.restore();
  }, [activeTypes, lowerSearchQuery, isFaded, hoverNode, focusNode, timeRange, graphDataLength, animProgressRef, cutoffTimeRef]);

  const getLinkColor = useCallback((link: LinkObject) => {
    const l = link as ForceLink;
    const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
    const targetId = typeof l.target === 'object' ? l.target.id : l.target;

    const faded = isFaded(sourceId as string) && isFaded(targetId as string);

    const isGlowing = glowingLinks.has(l._idPair || "");
    if (isGlowing && !faded) {
      return graphTheme.edgeGlow;
    }

    if (faded) {
      return "rgba(255, 255, 255, 0.025)";
    }

    if (showCycles && l.is_cycle) {
      return graphTheme.edgeCycle;
    }
    return graphTheme.edgeDefault;
  }, [isFaded, showCycles, glowingLinks]);

  const getParticleColor = useCallback((link: LinkObject) => {
    const l = link as ForceLink;
    if (showCycles && l.is_cycle) {
      return "rgba(252, 165, 165, 0.85)";
    }
    return "rgba(226, 232, 240, 0.75)";
  }, [showCycles]);

  const getLinkWidth = useCallback((link: LinkObject) => {
    const l = link as ForceLink;
    const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
    const targetId = typeof l.target === 'object' ? l.target.id : l.target;
    const faded = isFaded(sourceId as string) && isFaded(targetId as string);

    if (glowingLinks.has(l._idPair || "") && !faded) {
      return 2.5;
    }

    if (faded) return 0.5;

    if (showCycles && l.is_cycle) return 2;
    if (hoverNode === sourceId || hoverNode === targetId) return 2;
    return Math.max(1, 1.5 / globalScaleRef.current);
  }, [isFaded, hoverNode, showCycles, glowingLinks]);

  const getLinkVisibility = useCallback((link: LinkObject) => {
    const l = link as ForceLink;
    const sourceNode = l.source;
    const targetNode = l.target;
    if (!sourceNode || !targetNode) return false;
    
    if (l.type === "internal_cluster") return false;

    const sourceLabel = typeof sourceNode === 'object' ? sourceNode.label : null;
    const targetLabel = typeof targetNode === 'object' ? targetNode.label : null;

    if (sourceLabel && !activeTypes.has(sourceLabel)) return false;
    if (targetLabel && !activeTypes.has(targetLabel)) return false;

    if (lowerSearchQuery) {
      const sourceName = (typeof sourceNode === 'object' ? (sourceNode as ForceNode)._lowerName || '' : '');
      const targetName = (typeof targetNode === 'object' ? (targetNode as ForceNode)._lowerName || '' : '');
      if (!sourceName.includes(lowerSearchQuery) && !targetName.includes(lowerSearchQuery)) return false;
    }

    if (cutoffTimeRef.current) {
      const sTime = getSafeTime(sourceNode);
      const tTime = getSafeTime(targetNode);
      if (sTime > cutoffTimeRef.current || tTime > cutoffTimeRef.current) return false;
    }

    return true;
  }, [activeTypes, lowerSearchQuery, cutoffTimeRef]);

  return {
    paintBackground,
    paintNode,
    getLinkColor,
    getParticleColor,
    getLinkWidth,
    getLinkVisibility
  };
}
