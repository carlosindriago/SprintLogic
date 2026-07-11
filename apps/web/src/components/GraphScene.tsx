/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities, react-hooks/set-state-in-effect */
"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useRef, ComponentType, useMemo, useCallback } from "react";
import { getProjectGraph, analyzeProjectGraph } from "@/lib/api";
import { GraphData, GraphNode } from "@/types";
import { ForceGraphProps, NodeObject, LinkObject } from "react-force-graph-2d";
import { graphTheme } from "@/lib/graph-theme";
import { Search, RotateCcw, ZoomIn, ZoomOut, Maximize, Brain, AlertTriangle } from "lucide-react";
import { useTabsStore } from "../store/tabsStore";
import { useLLMConfigStore } from "../store/llmConfigStore";

// Dynamically import react-force-graph-2d to avoid SSR issues
const ForceGraph2D = dynamic<any>(
  () => import("react-force-graph-2d").then((mod) => mod.default as any),
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



interface GraphSceneProps {
  projectId: string | null;
  onNodeClick?: (node: GraphNode) => void;
}
 
export default function GraphScene({ projectId, onNodeClick }: GraphSceneProps) {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
 
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [focusNode, setFocusNode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCycles, setShowCycles] = useState(false);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set(["File", "Class", "Function", "Interface"]));
  
  const [iconsLoaded, setIconsLoaded] = useState(false);
  const iconImages = useRef<Record<string, HTMLImageElement>>({});

  const [analyzing, setAnalyzing] = useState(false);
  const [savedAnalysis, setSavedAnalysis] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  
  const addTab = useTabsStore((state) => state.addTab);

  // Compute codebase statistics
  const stats = useMemo(() => {
    let files = 0;
    let classes = 0;
    let functions = 0;
    let interfaces = 0;
    let loc = 0;
    const extMap: Record<string, number> = {};

    graphData.nodes.forEach((n: any) => {
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

  // Compute current signature
  const currentSignature = `${graphData.nodes.length}_${graphData.links.length}_${stats.loc}`;

  useEffect(() => {
    if (!projectId) {
      setSavedAnalysis(null);
      setHasChanges(false);
      return;
    }
    const saved = localStorage.getItem(`graph_analysis_${projectId}`);
    const savedSig = localStorage.getItem(`graph_analysis_sig_${projectId}`);
    
    if (saved) {
      setSavedAnalysis(saved);
      if (savedSig && savedSig !== currentSignature) {
        setHasChanges(true);
      } else {
        setHasChanges(false);
      }
    } else {
      setSavedAnalysis(null);
      setHasChanges(false);
    }
  }, [projectId, graphData, currentSignature]);

  const handleAnalyze = async () => {
    if (!projectId) return;
    setAnalyzing(true);
    try {
      const defaultModel = useLLMConfigStore.getState().analysisDefaultModel;
      const fallbackModel = useLLMConfigStore.getState().analysisFallbackModel;
      
      const result = await analyzeProjectGraph(
        projectId, 
        defaultModel,
        fallbackModel === 'none' || fallbackModel === '' ? undefined : fallbackModel
      );
      
      // Save analysis and current signature
      localStorage.setItem(`graph_analysis_${projectId}`, result);
      localStorage.setItem(`graph_analysis_sig_${projectId}`, currentSignature);
      
      setSavedAnalysis(result);
      setHasChanges(false);
      
      addTab({ id: 'ai-history', title: 'Historial IA', type: 'ai-history' });
    } catch (err) {
      console.error(err);
      alert("Error al analizar el grafo con IA");
    } finally {
      setAnalyzing(false);
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

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      if (projectId !== null) {
        try {
          const data = await getProjectGraph(projectId);
          if (active) setGraphData(data);
        } catch (err) {
          console.error("Failed to load graph:", err);
        }
      } else {
        if (active) setGraphData({ nodes: [], links: [] });
      }
    };
    loadData();
    return () => { active = false; };
  }, [projectId]);

  useEffect(() => {
    // Configure D3 Force layout for a "solar system" spread
    if (fgRef.current) {
      fgRef.current.d3Force('charge').strength(-400); // Strong repulsion to spread clusters
      fgRef.current.d3Force('link').distance((link: any) => {
        // File-to-File (imports) are pushed further apart, internal classes orbit closely
        return link.type === 'IMPORTS' ? 150 : 40;
      });
    }
  }, [graphData]);

  const lowerSearchQuery = useMemo(() => searchQuery?.toLowerCase() || "", [searchQuery]);

  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    graphData.nodes.forEach(n => map.set(n.id as string, new Set()));
    graphData.links.forEach((l: any) => {
      const source = typeof l.source === 'object' ? l.source.id : l.source;
      const target = typeof l.target === 'object' ? l.target.id : l.target;
      if (source && target) {
        map.get(source)?.add(target);
        map.get(target)?.add(source);
      }
    });
    return map;
  }, [graphData]);

  const isFaded = useCallback((nodeId: string) => {
    const activeFocus = focusNode || hoverNode;
    if (!activeFocus) return false;
    if (nodeId === activeFocus) return false;
    return !neighbors.get(activeFocus)?.has(nodeId);
  }, [focusNode, hoverNode, neighbors]);

  const paintNode = useCallback((node: NodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const n = node as any;
    const id = n.id as string;
    const label = n.label as string;
    const name = n.name as string;
    
    // Filter by type
    if (!activeTypes.has(label)) return;
    
    // Filter by search
    if (lowerSearchQuery && !name.toLowerCase().includes(lowerSearchQuery)) return;

    let radius = 3;
    let color = graphTheme.unknown;

    if (label === "File") {
      const size = (n.size as number) || 0;
      radius = Math.min(Math.max(size / 2000, 4), 10);
      color = graphTheme.file;
    } else if (label === "Class") {
      radius = 5;
      color = graphTheme.class;
    } else if (label === "Function") {
      radius = 4;
      color = graphTheme.function;
    } else if (label === "Interface") {
      radius = 5;
      color = graphTheme.interface;
    }

    const faded = isFaded(id);
    ctx.globalAlpha = faded ? graphTheme.dimOpacity : 1;

    let isIconDrawn = false;
    if (label === "File") {
      const ext = name.split(".").pop()?.toLowerCase() || "";
      const img = iconImages.current[ext];
      if (img && img.complete && img.naturalWidth !== 0) {
        const iconSize = radius * 2.5;
        ctx.drawImage(img, (n.x || 0) - iconSize / 2, (n.y || 0) - iconSize / 2, iconSize, iconSize);
        isIconDrawn = true;
      }
    }

    if (!isIconDrawn) {
      ctx.beginPath();
      ctx.arc(n.x || 0, n.y || 0, radius, 0, 2 * Math.PI, false);
      ctx.fillStyle = color;
      ctx.fill();
    }

    // Hover tooltip info (LOC / Degrees)
    if (id === hoverNode && !faded) {
       const info = [];
       if (n.loc !== undefined) info.push(`LOC: ${n.loc}`);
       if (n.in_degree !== undefined) info.push(`In: ${n.in_degree} | Out: ${n.out_degree}`);
       
       if (info.length > 0) {
         ctx.font = `10px Inter, sans-serif`;
         ctx.fillStyle = "rgba(255,255,255,0.9)";
         ctx.fillText(info.join(" - "), (n.x || 0), (n.y || 0) - radius - 6);
       }
    }

    if (globalScale > 2 || id === focusNode || id === hoverNode) {
      const fontSize = 12 / globalScale;
      ctx.font = `${fontSize}px Inter, sans-serif`;
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.textAlign = "center";
      ctx.fillText(name || "", n.x || 0, (n.y || 0) + radius + fontSize + 2);
    }
    
    ctx.globalAlpha = 1; // reset
  }, [activeTypes, lowerSearchQuery, isFaded, hoverNode, focusNode]);

  const paintLink = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const sourceNode = link.source;
    const targetNode = link.target;
    
    if (!sourceNode || !targetNode || sourceNode.x === undefined || targetNode.x === undefined) return;
    
    const sourceLabel = sourceNode.label as string;
    const targetLabel = targetNode.label as string;
    
    if (!activeTypes.has(sourceLabel) || !activeTypes.has(targetLabel)) return;

    if (lowerSearchQuery) {
      const sourceName = sourceNode.name as string;
      const targetName = targetNode.name as string;
      if (!sourceName.toLowerCase().includes(lowerSearchQuery) &&
          !targetName.toLowerCase().includes(lowerSearchQuery)) return;
    }

    const faded = isFaded(sourceNode.id as string) && isFaded(targetNode.id as string);
    ctx.globalAlpha = faded ? graphTheme.dimOpacity : 1;

    ctx.beginPath();
    ctx.moveTo(sourceNode.x, sourceNode.y);
    ctx.lineTo(targetNode.x, targetNode.y);

    if (showCycles && link.is_cycle) {
      ctx.strokeStyle = graphTheme.edgeCycle;
      ctx.lineWidth = 1 / globalScale;
    } else if (link.type === "IMPORTS") {
      ctx.strokeStyle = graphTheme.edgeImport;
      ctx.lineWidth = 0.6 / globalScale;
    } else {
      ctx.strokeStyle = graphTheme.edgeCall;
      ctx.lineWidth = 0.4 / globalScale;
    }
    
    ctx.stroke();
    ctx.globalAlpha = 1;
  }, [activeTypes, lowerSearchQuery, isFaded, showCycles]);

  const toggleType = (type: string) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  return (
    <div className="w-full h-full flex flex-col relative" style={{ backgroundColor: graphTheme.background }}>
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
          {["File", "Class", "Function", "Interface"].map(type => (
            <button 
              key={type}
              onClick={() => toggleType(type)}
              className={`px-2 py-1 rounded-md transition-colors ${activeTypes.has(type) ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
              style={{
                backgroundColor: activeTypes.has(type) ? '#3f3f46' : '#18181b',
                borderLeft: `3px solid ${activeTypes.has(type) ? graphTheme[type.toLowerCase() as keyof typeof graphTheme] : 'transparent'}`
              }}
            >
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
          <h4 className="text-[10px] font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Métricas del Código</h4>
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
          </div>
        )}
      </div>

      {/* Zoom Controls Overlay */}
      <div className="absolute bottom-6 left-4 z-10 flex flex-col gap-2 p-1.5 rounded-lg shadow-lg" 
           style={{ backgroundColor: graphTheme.surfaceElevated, border: `1px solid ${graphTheme.border}` }}>
        <button 
          onClick={handleZoomIn}
          className="p-1.5 rounded-md transition-colors text-zinc-400 hover:text-white hover:bg-[#3f3f46]"
          title="Acercar (Zoom In)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button 
          onClick={handleFitView}
          className="p-1.5 rounded-md transition-colors text-zinc-400 hover:text-white hover:bg-[#3f3f46]"
          title="Ajustar a la pantalla"
        >
          <Maximize className="w-4 h-4" />
        </button>
        <button 
          onClick={handleZoomOut}
          className="p-1.5 rounded-md transition-colors text-zinc-400 hover:text-white hover:bg-[#3f3f46]"
          title="Alejar (Zoom Out)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
      </div>

      <div ref={containerRef} className="flex-1 w-full" onClick={() => setFocusNode(null)}>
        <ForceGraph2D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          backgroundColor={graphTheme.background}
          nodeCanvasObject={paintNode}
          linkCanvasObjectMode={() => "replace"}
          linkCanvasObject={paintLink}
          onNodeClick={(node: any, event: any) => {
            setFocusNode(node.id as string);
            if (onNodeClick) {
              onNodeClick({
                id: (node.id as string) || "",
                label: (node.label as "File" | "Class" | "Function") || "File",
                name: (node.name as string) || "",
                file_path: (node.file_path as string) || "",
                size: (node as any).size as number | undefined,
                metadata: (node as any).metadata as Record<string, unknown> | undefined
              });
            }
          }}
          onNodeHover={(node: any) => setHoverNode(node ? (node.id as string) : null)}
          enableZoomInteraction={true}
          enablePanInteraction={true}
        />
      </div>
    </div>
  );
}
