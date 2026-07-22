"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useRef, useMemo, useCallback, useLayoutEffect } from "react";
import { getProjectGraph, rescanProject, ApiError } from "@/lib/api";
import { API_BASE_URL } from "@/lib/api";
import { forceX, forceY } from "d3-force";
import { GraphData, GraphNode, GraphEdge } from "@/types";
import { LinkObject, NodeObject } from "react-force-graph-2d";
import { graphTheme, extColorHash, bloomGlow } from "@/lib/graph-theme";
import { Search, RotateCcw, ZoomIn, ZoomOut, Maximize, Brain, Play, Pause, Zap, ZapOff, ScanSearch, FileCode, RefreshCw } from "lucide-react";
import { useTabsStore } from "../store/tabsStore";
import { useLLMConfigStore } from "../store/llmConfigStore";
import { useBackgroundJobsStore } from "../store/backgroundJobsStore";
import { toast } from "sonner";

interface ForceNode extends GraphNode {
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  fx?: number;
  fy?: number;
  fz?: number;
}

interface ForceLink extends GraphEdge {
  source: string | ForceNode;
  target: string | ForceNode;
}

// Dynamically import react-force-graph to avoid SSR issues
const ForceGraph2D = dynamic(
  () => import("react-force-graph-2d"),
  { ssr: false }
);

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

// SENSEI FIX: Nuestro escudo, protegiendo contra los undefined y las mutaciones de D3.
const getSafeTime = (nodeRef: unknown): number => {
  if (!nodeRef || typeof nodeRef !== 'object') return 0;
  const value = (nodeRef as { birth_time?: unknown }).birth_time;
  return typeof value === 'number' ? value : 0;
};

// Normalize any label casing to TitleCase ("file" -> "File") — must match activeTypes set values exactly.
const toTitleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

// ── Visual helpers ────────────────────────────────────────────────────

// Draw a rounded square centered at (cx, cy) with half-size r
function drawRoundedSquare(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const rad = r * 0.35;
  const x = cx - r, y = cy - r, w = r * 2, h = r * 2;
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

// Draw a diamond (rotated square) centered at (cx, cy) with half-size r
function drawDiamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
}

// Draw a triangle pointing up centered at (cx, cy) with half-size r
function drawTriangle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r * 0.87, cy + r * 0.5);
  ctx.lineTo(cx - r * 0.87, cy + r * 0.5);
  ctx.closePath();
}

interface GraphSceneProps {
  projectId: string | null;
  onNodeClick?: (node: GraphNode) => void;
}

export default function GraphScene({ projectId, onNodeClick }: GraphSceneProps) {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [focusNode, setFocusNode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCycles, setShowCycles] = useState(false);
  // Canonical label form is TitleCase ("File", "Class", "Function", "Interface") — matches backend values exactly.
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set(["File", "Class", "Function", "Interface"]));

  const [enableFlow, setEnableFlow] = useState(false);
  const [isPhysicsActive, setIsPhysicsActive] = useState(true);
  const [glowingLinks, setGlowingLinks] = useState<Set<string>>(new Set());

  const [animating, setAnimating] = useState(false);
  const [animProgress, setAnimProgress] = useState(1);
  const animProgressRef = useRef(1);

  const scanStatus = useBackgroundJobsStore((s) => (projectId ? s.activeScans[projectId]?.status : undefined));
  const startScan = useBackgroundJobsStore((s) => s.startScan);
  const clearScan = useBackgroundJobsStore((s) => s.clearScan);
  const isScanning = scanStatus === "scanning";

  const rescanHandledRef = useRef(false);
  const cutoffTimeRef = useRef<number | null>(null);
  const globalScaleRef = useRef(1);

  useEffect(() => {
    if (!projectId) return;
    if (scanStatus === "scanning") {
      rescanHandledRef.current = false;
      return;
    }
    if (scanStatus === "completed" && !rescanHandledRef.current) {
      rescanHandledRef.current = true;
      getProjectGraph(projectId)
        .then((data) => setGraphData(data))
        .catch(() => {
          toast.error("El escaneo terminó, pero falló la descarga del nuevo grafo. Reintentá.");
        })
        .finally(() => clearScan(projectId));
    }
    if (scanStatus === "failed") {
      clearScan(projectId);
    }
  }, [scanStatus, projectId, clearScan]);

  const handleRescan = async () => {
    if (!projectId) return;
    try {
      await rescanProject(projectId);
      startScan(projectId);
      toast.success("Re-escaneo iniciado. El grafo se actualizará al finalizar.");
    } catch {
      toast.error("Error al re-escanear");
    }
  };

  useEffect(() => {
    if (!isScanning || !projectId) return;
    const watchdog = setTimeout(() => {
      const current = useBackgroundJobsStore.getState().activeScans[projectId]?.status;
      if (current === "scanning") {
        clearScan(projectId);
        toast.error("El escaneo no respondió a tiempo. Verificá la conexión con el servidor.");
      }
    }, 300000); // 5 minutes watchdog for large codebases
    return () => clearTimeout(watchdog);
  }, [isScanning, projectId, clearScan]);

  const timeRange = useMemo(() => {
    const timed = graphData.nodes
      .filter((n) => (n as ForceNode).birth_time)
      .map((n) => (n as ForceNode).birth_time!) as number[];
    if (timed.length < 2) return null;
    return { min: Math.min(...timed), max: Math.max(...timed) };
  }, [graphData]);

  useEffect(() => {
    if (!timeRange) {
      cutoffTimeRef.current = null;
      return;
    }
    cutoffTimeRef.current = timeRange.min + (timeRange.max - timeRange.min) * animProgress;
  }, [timeRange, animProgress]);

  // Extension-based color legend (each file extension gets its own HSL color)
  const moduleLegend = useMemo(() => {
    const extMap = new Map<string, string>();
    for (const n of graphData.nodes) {
      const node = n as ForceNode;
      if (node.label !== "File") continue;
      const ext = node.name?.split(".").pop()?.toLowerCase() || "";
      if (ext && !extMap.has(ext)) {
        extMap.set(ext, extColorHash(ext));
      }
    }
    return Array.from(extMap.entries()).map(([name, color]) => ({ name, color }));
  }, [graphData]);

  useEffect(() => {
    animProgressRef.current = animProgress;
  }, [animProgress]);

  const lastClickTimeRef = useRef<number>(0);
  const initialFitDone = useRef(false);

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

  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; node: ForceNode } | null>(null);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const [, setIconsLoaded] = useState(false);
  const iconImages = useRef<Record<string, HTMLImageElement>>({});

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzingText, setAnalyzingText] = useState("");
  const [savedAnalysis, setSavedAnalysis] = useState<string | null>(null);

  const addTab = useTabsStore((state) => state.addTab);

  const stats = useMemo(() => {
    let files = 0;
    let classes = 0;
    let functions = 0;
    let interfaces = 0;
    let loc = 0;
    const extMap: Record<string, number> = {};

    graphData.nodes.forEach((n: GraphNode) => {
      if (n.label === 'File') {
        files++;
        loc += n.loc || 0;
        const ext = n.name.split('.').pop()?.toLowerCase() || 'unknown';
        extMap[ext] = (extMap[ext] || 0) + 1;
      } else if (n.label === 'Class') {
        classes++;
      } else if (n.label === 'Function') {
        functions++;
      } else if (n.label === 'Interface') {
        interfaces++;
      }
    });

    return { files, classes, functions, interfaces, loc, extMap };
  }, [graphData]);

  const currentSignature = `${graphData.nodes.length}_${graphData.links.length}_${stats.loc}`;

  useEffect(() => {
    if (!projectId) {
      // Reset de estado derivado al cerrar el proyecto (no es sincronizacion con un
      // sistema externo), por eso silenciamos la regla puntualmente aqui.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSavedAnalysis(null);
      return;
    }
    const saved = localStorage.getItem(`graph_analysis_${projectId}`);

    if (saved) {
      setSavedAnalysis(saved);
    } else {
      setSavedAnalysis(null);
    }
  }, [projectId, graphData, currentSignature]);

  const handleAnalyze = async () => {
    if (!projectId) return;
    setAnalyzing(true);
    setAnalyzingText("");
    try {
      const defaultModel = useLLMConfigStore.getState().analysisDefaultModel;
      const fallbackModel = useLLMConfigStore.getState().analysisFallbackModel;

      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/graph/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: defaultModel,
          fallback_model: fallbackModel === 'none' || fallbackModel === '' ? undefined : fallbackModel,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.type === "message_chunk") {
                fullText += parsed.text;
                setAnalyzingText(fullText);
              }
            } catch { /* skip */ }
          }
        }
      }

      if (fullText) {
        localStorage.setItem(`graph_analysis_${projectId}`, fullText);
        localStorage.setItem(`graph_analysis_sig_${projectId}`, currentSignature);
        setSavedAnalysis(fullText);
        addTab({ id: 'ai-history', title: 'Historial IA', type: 'ai-history' });
      }
    } catch (err) {
      console.error(err);
      alert("Error al analizar el grafo con IA");
    } finally {
      setAnalyzing(false);
      setAnalyzingText("");
    }
  };

  const handleShowAnalysis = () => {
    addTab({ id: 'ai-history', title: 'Historial IA', type: 'ai-history' });
  };

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

  const handleZoomIn = () => {
    if (fgRef.current) {
      fgRef.current.zoom(fgRef.current.zoom() * 1.5, 400);
    }
  };

  const handleZoomOut = () => {
    if (fgRef.current) {
      fgRef.current.zoom(fgRef.current.zoom() / 1.5, 400);
    }
  };

  const handleFitView = () => {
    if (fgRef.current) {
      fgRef.current.zoomToFit(400, 50);
    }
  };

  const togglePhysics = () => {
    setIsPhysicsActive(prev => {
      const next = !prev;
      const graph = fgRef.current;
      if (graph) {
        if (next) {
          graph.resumeAnimation();
        } else {
          graph.pauseAnimation();
        }
      }
      return next;
    });
  };

  useLayoutEffect(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setDimensions({ width: rect.width, height: rect.height });
      }
    }
  }, []);

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
  }, []);

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      if (projectId !== null) {
        try {
          const data = await getProjectGraph(projectId);
          if (active) setGraphData(data);
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            if (active) setGraphData({ nodes: [], links: [] });
            return;
          }
          console.error("Failed to load graph:", err);
        }
      } else {
        if (active) setGraphData({ nodes: [], links: [] });
      }
    };
    loadData();
    return () => { active = false; };
  }, [projectId]);

  const hasGraphData = useMemo(
    () => graphData && graphData.nodes && graphData.nodes.length > 0,
    [graphData]
  );

  // Calculate focal points for modules to create "solar systems"
  const focalPoints = useMemo(() => {
    const modules = new Set<string>();
    if (!graphData || !graphData.nodes) return new Map<string, { x: number; y: number }>();
    
    for (const n of graphData.nodes) {
      const node = n as ForceNode;
      if (!node.folder || node.folder === "/") continue;
      const parts = node.folder.split('/').filter(Boolean);
      // Group by the first two segments of the path to form major "modules"
      const moduleName = parts.slice(0, 2).join('/');
      if (moduleName) modules.add(moduleName);
    }
    
    const moduleList = Array.from(modules);
    const map = new Map<string, { x: number; y: number }>();
    // Giant circle based on the number of modules
    const radius = Math.max(300, moduleList.length * 90);
    
    moduleList.forEach((mod, i) => {
      const angle = (i / moduleList.length) * 2 * Math.PI;
      map.set(mod, {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius
      });
    });
    
    return map;
  }, [graphData]);

  useEffect(() => {
    if (!fgRef.current || !hasGraphData) return;
    if (dimensions.width === 0) return;

    initialFitDone.current = false;

    // Base D3 forces
    fgRef.current.d3Force('charge').strength(-120);
    fgRef.current.d3Force('link').distance(30);

    // Magnetic Injection: Solar System grouping by folder
    const fx = forceX<ForceNode>(node => {
      if (!node.folder || node.folder === "/") return 0;
      const parts = node.folder.split('/').filter(Boolean);
      const mod = parts.slice(0, 2).join('/');
      return focalPoints.get(mod)?.x || 0;
    }).strength(0.05);

    const fy = forceY<ForceNode>(node => {
      if (!node.folder || node.folder === "/") return 0;
      const parts = node.folder.split('/').filter(Boolean);
      const mod = parts.slice(0, 2).join('/');
      return focalPoints.get(mod)?.y || 0;
    }).strength(0.05);

    fgRef.current.d3Force('x', fx);
    fgRef.current.d3Force('y', fy);

    fgRef.current.d3ReheatSimulation();
  }, [hasGraphData, dimensions.width, focalPoints]);

  useEffect(() => {
    if (!enableFlow || !graphData || !graphData.links) {
      // Reset de estado derivado al desactivar el flujo animado o vaciarse el grafo.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGlowingLinks(new Set());
      return;
    }

    const interval = setInterval(() => {
      const newGlowing = new Set<string>();
      graphData.links.forEach((link: GraphEdge) => {
        if (Math.random() < 0.1) {
          const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
          const targetId = typeof link.target === 'object' ? link.target.id : link.target;
          newGlowing.add(`${sourceId}-${targetId}`);
        }
      });
      setGlowingLinks(newGlowing);
    }, 1500);

    return () => clearInterval(interval);
  }, [enableFlow, graphData]);

  const lowerSearchQuery = useMemo(() => searchQuery?.toLowerCase() || "", [searchQuery]);

  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    graphData.nodes.forEach(n => map.set(n.id as string, new Set()));
    graphData.links.forEach((l: GraphEdge) => {
      const source = typeof l.source === 'object' ? l.source.id : l.source;
      const target = typeof l.target === 'object' ? l.target.id : l.target;
      if (source && target) {
        map.get(source)?.add(target);
        map.get(target)?.add(source);
      }
    });
    return map;
  }, [graphData]);

  const displayGraphData = useMemo(() => {
    if (!graphData || !graphData.nodes) return { nodes: [], links: [] };

    // Deep-ish clone for d3-force to allow mutation of .x, .y, .vx, .vy without readonly errors
    let nodes = graphData.nodes.map((n: GraphNode) => ({ ...n }));
    let links = graphData.links.map((l: GraphEdge) => ({ ...l }));

    // Filter by node types — compare TitleCase label against the TitleCase activeTypes set
    nodes = nodes.filter((n: GraphNode) => {
      const titleLabel = n.label ? toTitleCase(String(n.label)) : "";
      return activeTypes.has(titleLabel);
    });

    if (focusNode) {
      const neighborsSet = neighbors.get(focusNode) || new Set();
      const visibleNodes = new Set([focusNode, ...neighborsSet]);
      nodes = nodes.filter((n) => visibleNodes.has(n.id));
    }

    // ALWAYS filter links to ensure both source and target exist in the current nodes array
    // This prevents d3-force "node not found" errors when a connected node is filtered out.
    const visibleIds = new Set(nodes.map(n => n.id));
    links = links.filter((l) => {
      const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
      const targetId = typeof l.target === 'object' ? l.target.id : l.target;
      return visibleIds.has(sourceId) && visibleIds.has(targetId);
    });

    return { nodes, links };
  }, [graphData, focusNode, neighbors, activeTypes]);

  const isFaded = useCallback((nodeId: string) => {
    const activeFocus = focusNode || hoverNode;
    if (!activeFocus) return false;
    if (nodeId === activeFocus) return false;
    return !neighbors.get(activeFocus)?.has(nodeId);
  }, [focusNode, hoverNode, neighbors]);

  const paintNode = useCallback((node: NodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const n = node as ForceNode;
    const id = n.id as string;
    const label = n.label as string;
    const name = n.name as string;
    const nx = n.x || 0;
    const ny = n.y || 0;

    globalScaleRef.current = globalScale;

    if (!activeTypes.has(label)) return;
    if (lowerSearchQuery && !name.toLowerCase().includes(lowerSearchQuery)) return;

    const progress = animProgressRef.current;
    const bTime = getSafeTime(n);
    if (progress < 1 && timeRange) {
      const cutoff = timeRange.min + (timeRange.max - timeRange.min) * progress;
      if (bTime > cutoff) return;
    }

    // ── Color resolution ─────────────────────────────────────
    const degree = n.in_degree || 0;
    const outDegree = n.out_degree || 0;
    const degreeRadius = 1 + Math.log2(1 + degree) * 1.8;

    let radius = 4;
    let color = graphTheme.unknown;
    let glowColor = "rgba(148, 163, 184, 0.4)";

    if (label === "File") {
      const ext = name.split(".").pop()?.toLowerCase() || "";
      color = extColorHash(ext);
      glowColor = bloomGlow(color, 0.45);
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
    }

    const faded = isFaded(id);
    const isZoomedOut = globalScale < 1.0;
    const isActive = id === hoverNode || id === focusNode;

    // ── SUPERNOVA EFFECT (temporal birth flash) ──────────────────────────────
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
    // ────────────────────────────────────────────────────────────────────────

    ctx.save();
    ctx.globalAlpha = faded ? graphTheme.dimOpacity : 1;

    // ── Bloom outer glow (signature luminous effect) ────────────────
    if (!faded && !isZoomedOut) {
      const bloomRadius = isActive ? radius * 2.6 : radius * 1.9;
      ctx.save();
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = isActive ? 18 : 10;
      ctx.beginPath();
      ctx.arc(nx, ny, bloomRadius * 0.5, 0, 2 * Math.PI);
      ctx.fillStyle = glowColor;
      ctx.globalAlpha = isActive ? 0.22 : 0.12;
      ctx.fill();
      ctx.restore();
    }

    // ── File icons (devicon — drawn over bloom) ──────────────────────────────
    let isIconDrawn = false;
    if (label === "File") {
      const ext = name.split(".").pop()?.toLowerCase() || "";
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

    // ── Node shape by type ───────────────────────────────────────────────────
    if (!isIconDrawn) {
      ctx.save();
      // Bloom: inner core glows with shadowBlur
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = isActive ? 16 : 8;
      ctx.fillStyle = color;

      if (label === "Class") {
        // Rounded square — structured, solid
        drawRoundedSquare(ctx, nx, ny, radius);
      } else if (label === "Interface") {
        // Diamond — abstract, structural
        drawDiamond(ctx, nx, ny, radius);
      } else if (label === "Function") {
        // Triangle — directional, active
        drawTriangle(ctx, nx, ny, radius);
      } else {
        // Circle — file or unknown
        ctx.beginPath();
        ctx.arc(nx, ny, radius, 0, 2 * Math.PI);
      }
      ctx.fill();

      // Inner highlight (top-left specular — self-luminous feel)
      if (!faded && !isZoomedOut) {
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
        ctx.beginPath();
        ctx.arc(nx - radius * 0.3, ny - radius * 0.3, radius * 0.35, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.restore();
    }

    // ── High out-degree ring (hot node indicator) ────────────────────────────
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

    // ── Ripple pulse on nodes with in-connections ────────────────────────────
    if (degree > 0 && !faded && !isZoomedOut && (label === "Function" || label === "Interface")) {
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

    // ── Hover tooltip ────────────────────────────────────────────────────────
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

    // ── Node label (shown on zoom or focus) ──────────────────────────────────
    if (globalScale > 2.5 || id === focusNode || id === hoverNode) {
      const fontSize = Math.max(7, 11 / globalScale);
      ctx.font = `${fontSize}px "Inter", sans-serif`;
      ctx.textAlign = "center";
      // Text shadow for readability on dark background
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = 4;
      ctx.fillStyle = isActive ? "rgba(255, 255, 255, 1)" : "rgba(200, 200, 220, 0.75)";
      ctx.fillText(name || "", nx, ny + radius + fontSize + 2);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }, [activeTypes, lowerSearchQuery, isFaded, hoverNode, focusNode, timeRange]);

  const getLinkColor = useCallback((link: LinkObject) => {
    const l = link as ForceLink;
    const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
    const targetId = typeof l.target === 'object' ? l.target.id : l.target;

    const faded = isFaded(sourceId) && isFaded(targetId);

    const isGlowing = glowingLinks.has(`${sourceId}-${targetId}`);
    if (isGlowing && !faded) {
      return graphTheme.edgeGlow;
    }

    if (faded) {
      return "rgba(255, 255, 255, 0.025)";
    }

    if (showCycles && l.is_cycle) {
      return graphTheme.edgeCycle;
    }
    // Uses very thin, barely-visible white lines — the graph structure
    // is implied, not dominant. Nodes are the stars, edges are the void between them.
    return graphTheme.edgeDefault;
  }, [isFaded, showCycles, glowingLinks]);

  const getParticleColor = useCallback((link: LinkObject) => {
    const l = link as ForceLink;
    if (showCycles && l.is_cycle) {
      return "rgba(252, 165, 165, 0.85)";
    }
    // Particles travel as small bright dots along edges
    return "rgba(226, 232, 240, 0.75)";
  }, [showCycles]);

  const getLinkWidth = useCallback((link: LinkObject) => {
    const l = link as ForceLink;
    const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
    const targetId = typeof l.target === 'object' ? l.target.id : l.target;
    const faded = isFaded(sourceId) && isFaded(targetId);

    if (glowingLinks.has(`${sourceId}-${targetId}`) && !faded) {
      return 2.5;
    }

    if (faded) return 0.5;

    if (showCycles && l.is_cycle) return 2;
    if (hoverNode === sourceId || hoverNode === targetId) return 2;
    return Math.max(1, 1.5 / globalScaleRef.current);
  }, [isFaded, hoverNode, showCycles, glowingLinks]);

  // SENSEI FIX: Reescritura segura de getLinkVisibility usando getSafeTime
  const getLinkVisibility = useCallback((link: LinkObject) => {
    const l = link as ForceLink;
    const sourceNode = l.source;
    const targetNode = l.target;
    if (!sourceNode || !targetNode) return false;

    const sourceLabel = typeof sourceNode === 'object' ? sourceNode.label : null;
    const targetLabel = typeof targetNode === 'object' ? targetNode.label : null;

    if (sourceLabel && !activeTypes.has(sourceLabel)) return false;
    if (targetLabel && !activeTypes.has(targetLabel)) return false;

    if (lowerSearchQuery) {
      const sourceName = (typeof sourceNode === 'object' ? sourceNode.name : '').toLowerCase();
      const targetName = (typeof targetNode === 'object' ? targetNode.name : '').toLowerCase();
      if (!sourceName.includes(lowerSearchQuery) && !targetName.includes(lowerSearchQuery)) return false;
    }

    if (cutoffTimeRef.current) {
      const sTime = getSafeTime(sourceNode);
      const tTime = getSafeTime(targetNode);
      if (sTime > cutoffTimeRef.current || tTime > cutoffTimeRef.current) return false;
    }

    return true;
  }, [activeTypes, lowerSearchQuery]);

  const toggleType = (type: string) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  return (
    <div className="flex-1 w-full flex flex-col relative min-h-0" style={{ backgroundColor: graphTheme.background }}>
      {/* Controls Overlay */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-3 p-4 rounded-lg shadow-lg"
           style={{ backgroundColor: graphTheme.surfaceElevated, border: `1px solid ${graphTheme.border}` }}>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
          <input
            type="text"
            placeholder="Search nodes..."
            className="w-full bg-[#18181b] border border-[#3f3f46] rounded-md py-1.5 pl-9 pr-3 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          {([
            { type: "File",      shape: "●", color: "#94a3b8" },
            { type: "Class",     shape: "■", color: graphTheme.class },
            { type: "Function",  shape: "▲", color: graphTheme.function },
            { type: "Interface", shape: "◆", color: graphTheme.interface },
          ] as { type: string; shape: string; color: string }[]).map(({ type, shape, color }) => (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all ${
                activeTypes.has(type)
                  ? 'text-white'
                  : 'text-zinc-500 hover:text-zinc-300 opacity-50'
              }`}
              style={{
                backgroundColor: activeTypes.has(type) ? `${color}18` : 'transparent',
                border: `1px solid ${activeTypes.has(type) ? `${color}60` : '#27272a'}`,
              }}
            >
              <span style={{ color: activeTypes.has(type) ? color : '#52525b', fontSize: '0.7rem' }}>
                {shape}
              </span>
              {type}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowCycles(!showCycles)}
          className={`flex items-center justify-center gap-2 text-xs py-1.5 rounded-md transition-colors ${showCycles ? 'bg-red-900/40 text-red-400 border border-red-900/50' : 'bg-[#18181b] text-zinc-400 border border-[#3f3f46]'}`}
        >
          <RotateCcw className="w-3 h-3" />
          Highlight Cycles
        </button>

        {/* Project Statistics */}
        <div className="border-t border-[#3f3f46] pt-3 mt-1">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Métricas del Código</h4>
            <button
              onClick={handleRescan}
              disabled={isScanning}
              className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title={isScanning ? "Re-escaneando..." : "Re-escanear Proyecto"}
            >
              <RefreshCw className={`w-3 h-3 ${isScanning ? "animate-spin" : ""}`} />
              {isScanning ? "Escaneando..." : "Sincronizar"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
            <div className="flex justify-between">
              <span className="text-zinc-500">Archivos:</span>
              <span className="font-medium text-zinc-200">{stats.files}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Clases:</span>
              <span className="font-medium text-zinc-200">{stats.classes}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Funciones:</span>
              <span className="font-medium text-zinc-200">{stats.functions}</span>
            </div>
            {stats.interfaces > 0 && (
              <div className="flex justify-between">
                <span className="text-zinc-500">Interfaces:</span>
                <span className="font-medium text-zinc-200">{stats.interfaces}</span>
              </div>
            )}
            <div className="flex justify-between col-span-2 border-t border-[#27272a] pt-1.5 mt-0.5">
              <span className="text-zinc-500">Total LOC:</span>
              <span className="font-semibold text-blue-400">{stats.loc.toLocaleString()}</span>
            </div>
          </div>
          {Object.keys(stats.extMap).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {Object.entries(stats.extMap).map(([ext, count]) => (
                <span key={ext} className="text-[9px] bg-zinc-800 text-zinc-400 px-1 py-0.5 rounded border border-[#27272a]">
                  .{ext} ({count})
                </span>
              ))}
            </div>
          )}
        </div>

        {savedAnalysis ? (
          <div className="flex flex-col gap-2 border-t border-[#3f3f46] pt-3 mt-1">
            <button
              onClick={handleShowAnalysis}
              className="flex items-center justify-center gap-2 text-xs py-1.5 rounded-md transition-colors bg-zinc-850 hover:bg-zinc-800 text-zinc-200 border border-[#3f3f46]"
            >
              <Brain className="w-3.5 h-3.5 text-green-400" />
              Mostrar Análisis
            </button>
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="flex items-center justify-center gap-2 text-xs py-1.5 rounded-md transition-colors bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
            >
              <Brain className="w-3.5 h-3.5" />
              {analyzing ? "Analizando..." : "Volver a Analizar"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 border-t border-[#3f3f46] pt-3 mt-1">
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="flex items-center justify-center gap-2 text-xs py-1.5 rounded-md transition-colors bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
            >
              <Brain className="w-3.5 h-3.5" />
              {analyzing ? "Analizando..." : "Análisis IA del Grafo"}
            </button>
            {analyzing && analyzingText && (
              <div className="max-h-32 overflow-y-auto text-[11px] text-zinc-400 leading-relaxed bg-[#0a0a0a] rounded-md p-2 border border-[#3f3f46]">
                {analyzingText.slice(-500)}
              </div>
            )}
          </div>
        )}
      </div>

      {moduleLegend.length > 0 && (
        <div className="absolute top-4 right-4 z-10 flex flex-col gap-1 p-2 rounded-lg shadow-lg max-h-64 overflow-y-auto"
             style={{ backgroundColor: graphTheme.surfaceElevated, border: `1px solid ${graphTheme.border}` }}>
          <span className="text-[10px] text-zinc-500 px-1 mb-1">Módulos</span>
          {moduleLegend.map((item) => (
            <div key={item.name} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-[#3f3f46] cursor-pointer text-xs">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-zinc-400 truncate max-w-[120px]">{item.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Unified Graph Controls Toolbar */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex flex-row items-center rounded-lg shadow-lg overflow-hidden"
           style={{ backgroundColor: graphTheme.surfaceElevated, border: `1px solid ${graphTheme.border}` }}>
        <button
          onClick={handleZoomIn}
          className="p-2 transition-colors text-zinc-400 hover:text-white hover:bg-[#3f3f46]"
          title="Acercar (Zoom In)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={handleFitView}
          className="p-2 border-l border-[#3f3f46] transition-colors text-zinc-400 hover:text-white hover:bg-[#3f3f46]"
          title="Ajustar a la pantalla"
        >
          <Maximize className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-2 border-l border-[#3f3f46] transition-colors text-zinc-400 hover:text-white hover:bg-[#3f3f46]"
          title="Alejar (Zoom Out)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <button
          onClick={togglePhysics}
          className={`p-2 border-l border-[#3f3f46] transition-colors ${isPhysicsActive ? "text-emerald-400 hover:text-emerald-300 bg-emerald-950/20" : "text-zinc-500 hover:text-zinc-300 hover:bg-[#3f3f46]"}`}
          title={isPhysicsActive ? "Pausar Simulación Física" : "Reanudar Simulación Física"}
        >
          {isPhysicsActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button
          onClick={() => setEnableFlow(!enableFlow)}
          className={`p-2 border-l border-[#3f3f46] transition-colors ${enableFlow ? "text-yellow-400 hover:text-yellow-300 bg-yellow-950/20" : "text-zinc-500 hover:text-zinc-300 hover:bg-[#3f3f46]"}`}
          title={enableFlow ? "Desactivar Flujo de Corriente" : "Activar Flujo de Corriente"}
        >
          {enableFlow ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
        </button>
      </div>

      {timeRange && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 px-4 py-2 rounded-lg shadow-lg"
             style={{ backgroundColor: graphTheme.surfaceElevated, border: `1px solid ${graphTheme.border}` }}>
          <button
            onClick={() => {
              if (animating) {
                setAnimating(false);
              } else {
                setAnimProgress(0);
                setAnimating(true);
              }
            }}
            className="p-1.5 rounded transition-colors text-zinc-400 hover:text-white hover:bg-[#3f3f46]"
            title={animating ? "Pausar" : "Animar"}
          >
            {animating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(animProgress * 100)}
            onChange={(e) => {
              setAnimating(false);
              setAnimProgress(Number(e.target.value) / 100);
            }}
            className="w-32 h-1 accent-blue-500 cursor-pointer"
          />
          <button
            onClick={() => { setAnimating(false); setAnimProgress(1); }}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {Math.round(animProgress * 100)}%
          </button>
        </div>
      )}

      <div ref={containerRef} className={`flex-1 w-full min-h-0 z-0 transition-opacity duration-300 ${isScanning ? "opacity-40 pointer-events-none" : ""}`}>
        {isScanning && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-black/70 border border-zinc-700 backdrop-blur-sm">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
              <span className="text-sm text-zinc-300">Re-escaneando proyecto...</span>
            </div>
          </div>
        )}
        {contextMenu && contextMenu.visible && (
          <div
            className="fixed z-50 bg-[#18181b] border border-[#3f3f46] rounded-md shadow-xl py-1 w-48 text-sm overflow-hidden"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button
              className="w-full text-left px-4 py-2 text-zinc-300 hover:bg-blue-600 hover:text-white transition-colors flex items-center gap-2"
              onClick={(e) => {
                e.stopPropagation();
                if (focusNode === contextMenu.node.id) {
                  setFocusNode(null);
                } else {
                  setFocusNode(contextMenu.node.id as string);
                }
                setContextMenu(null);
              }}
            >
              <ScanSearch className="w-4 h-4" />
              {focusNode === contextMenu.node.id ? "Restaurar Grafo" : "Aislar Nodo"}
            </button>
            <button
              className="w-full text-left px-4 py-2 text-zinc-300 hover:bg-blue-600 hover:text-white transition-colors flex items-center gap-2"
              onClick={(e) => {
                e.stopPropagation();
                if (onNodeClick) {
                  onNodeClick({
                    id: (contextMenu.node.id as string) || "",
                    label: (contextMenu.node.label as "File" | "Class" | "Function") || "File",
                    name: (contextMenu.node.name as string) || "",
                    file_path: (contextMenu.node.file_path as string) || "",
                    size: contextMenu.node.size,
                    metadata: contextMenu.node.metadata
                  });
                }
                setContextMenu(null);
              }}
            >
              <FileCode className="w-4 h-4" /> Abrir Archivo
            </button>
          </div>
        )}

        <ForceGraph2D
            ref={fgRef}
            width={dimensions.width || 800}
            height={dimensions.height || 600}
            graphData={displayGraphData}
            backgroundColor={graphTheme.background}
            nodeCanvasObject={paintNode}
            nodeVisibility={(node: NodeObject) => {
              // SENSEI FIX: También curamos la evaluación global de D3
              if (!cutoffTimeRef.current) return true;
              const bTime = getSafeTime(node);
              return bTime <= cutoffTimeRef.current;
            }}
            linkColor={getLinkColor}
            linkWidth={getLinkWidth}
            linkVisibility={getLinkVisibility}
            linkCurvature={0.15}
            linkDirectionalParticles={enableFlow ? ((link: LinkObject) => {
              const l = link as ForceLink;
              const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
              const targetId = typeof l.target === 'object' ? l.target.id : l.target;
              const faded = isFaded(sourceId) && isFaded(targetId);
              if (faded) return 0;
              return showCycles && l.is_cycle ? 4 : 2;
            }) : 0}
            linkDirectionalParticleSpeed={(link: LinkObject) => (showCycles && (link as ForceLink).is_cycle ? 0.012 : 0.005)}
            linkDirectionalParticleWidth={1.0}
            linkDirectionalParticleColor={getParticleColor}
            linkDirectionalArrowLength={3.5}
            linkDirectionalArrowRelPos={1}
            cooldownTicks={100}
            onNodeClick={(node: NodeObject) => {
              const n = node as ForceNode;
              const now = Date.now();
              const isDoubleClick = now - lastClickTimeRef.current < 400;
              lastClickTimeRef.current = now;

              if (isDoubleClick) {
                if (onNodeClick) {
                  onNodeClick({
                    id: (n.id as string) || "",
                    label: (n.label as "File" | "Class" | "Function") || "File",
                    name: (n.name as string) || "",
                    file_path: (n.file_path as string) || "",
                    size: n.size,
                    metadata: n.metadata
                  });
                }
              } else {
                setFocusNode(n.id as string);
              }
            }}
            onBackgroundClick={() => setFocusNode(null)}
            onNodeRightClick={(node: NodeObject, event: MouseEvent) => {
              setContextMenu({
                visible: true,
                x: event.clientX,
                y: event.clientY,
                node: node as ForceNode
              });
            }}
            onNodeHover={(node: NodeObject | null) => setHoverNode(node ? (node.id as string) : null)}
            enableZoomInteraction={true}
            enablePanInteraction={true}
            onEngineStop={() => {
              if (fgRef.current && !initialFitDone.current) {
                initialFitDone.current = true;
                fgRef.current.zoomToFit(800, 100);
              }
            }}
          />
      </div>
    </div>
  );
}
