import { useState, useEffect, useRef, useMemo } from "react";
import { getProjectGraph, rescanProject } from "@/lib/api";
import { useBackgroundJobsStore } from "@/store/backgroundJobsStore";
import { toast } from "sonner";
import { GraphData, GraphNode, GraphEdge } from "@/types";
import { ForceNode, ForceLink } from "../types";
import { toTitleCase } from "../utils";
import { extColorHash, bloomGlow } from "@/lib/graph-theme";

interface UseGraphDataProps {
  projectId: string | null;
  focusNode: string | null;
}

const extCache = new WeakMap<object, string>();
const modCache = new WeakMap<object, string | null>();
const lowerNameCache = new WeakMap<object, string>();
const idPairCache = new WeakMap<object, string>();

const enrichGraphData = (data: GraphData) => {
  data.nodes.forEach((n: any) => {
    const node = n as ForceNode;
    if (node.label === "File") {
      let ext = extCache.get(n);
      if (ext === undefined) {
        ext = node.name?.split(".").pop()?.toLowerCase() || "";
        extCache.set(n, ext);
      }
      node._extCache = ext;
      node._colorCache = extColorHash(ext);
      node._glowColorCache = bloomGlow(node._colorCache, 0.45);
    }
    let mod = modCache.get(n);
    if (mod === undefined) {
      mod = (node.folder && node.folder !== "/") ? node.folder.split('/').filter(Boolean).slice(0, 2).join('/') : null;
      modCache.set(n, mod);
    }
    node._modCache = mod;
    let lowerName = lowerNameCache.get(n);
    if (lowerName === undefined) {
      lowerName = node.name ? node.name.toLowerCase() : "";
      lowerNameCache.set(n, lowerName);
    }
    node._lowerName = lowerName;
  });

  data.links.forEach((l: any) => {
    const link = l as ForceLink;
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    link._sourceId = sourceId as string;
    link._targetId = targetId as string;

    let idPair = idPairCache.get(l);
    if (idPair === undefined) {
      idPair = `${sourceId}-${targetId}`;
      idPairCache.set(l, idPair);
    }
    link._idPair = idPair;
  });
};

export function useGraphData({ projectId, focusNode }: UseGraphDataProps) {

  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set(["File", "Module"]));
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [savedAnalysis, setSavedAnalysis] = useState<string | null>(null);

  const scanStatus = useBackgroundJobsStore((s) => (projectId ? s.activeScans[projectId]?.status : undefined));
  const startScan = useBackgroundJobsStore((s) => s.startScan);
  const clearScan = useBackgroundJobsStore((s) => s.clearScan);
  const isScanning = scanStatus === "scanning";

  const rescanHandledRef = useRef(false);



  // Handle Scan completion
  useEffect(() => {
    if (!projectId) return;
    if (scanStatus === "scanning") {
      rescanHandledRef.current = false;
      return;
    }
    if (scanStatus === "completed" && !rescanHandledRef.current) {
      rescanHandledRef.current = true;
      getProjectGraph(projectId, Array.from(expandedFolders).join(","))
        .then((data) => {
          enrichGraphData(data);
          setGraphData(data);
        })

        .catch(() => {
          toast.error("El escaneo terminó, pero falló la descarga del nuevo grafo. Reintentá.");
        })
        .finally(() => clearScan(projectId));
    }
    if (scanStatus === "failed") {
      clearScan(projectId);
    }
  }, [scanStatus, projectId, clearScan, expandedFolders]);

  // Initial Load
  useEffect(() => {
    let active = true;
    const loadData = async () => {
      if (projectId !== null) {
        try {
          const data = await getProjectGraph(projectId, Array.from(expandedFolders).join(","));
          enrichGraphData(data);
          if (active) {
            setGraphData((prevGraph) => {
              const existingCoords = new Map(prevGraph.nodes.map((n: ForceNode) => [n.id, { x: n.x, y: n.y }]));
              data.nodes.forEach((n: ForceNode) => {
                if (existingCoords.has(n.id)) {
                  const coords = existingCoords.get(n.id)!;
                  n.x = coords.x;
                  n.y = coords.y;
                }
              });
              return data;
            });
          }
        } catch {
          // Ignore 404s
          if (active) setGraphData({ nodes: [], links: [] });
        }
      } else {
        if (active) setGraphData({ nodes: [], links: [] });
      }
    };
    loadData();
    return () => { active = false; };
  }, [projectId, expandedFolders]);

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
    }, 300000);
    return () => clearTimeout(watchdog);
  }, [isScanning, projectId, clearScan]);

  const timeRange = useMemo(() => {
    const timed = graphData.nodes
      .filter((n) => (n as ForceNode).birth_time)
      .map((n) => (n as ForceNode).birth_time!) as number[];
    if (timed.length < 2) return null;
    return { min: Math.min(...timed), max: Math.max(...timed) };
  }, [graphData]);

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
        let ext = extCache.get(n);
        if (ext === undefined) { ext = n.name.split(".").pop()?.toLowerCase() || "unknown"; extCache.set(n, ext); }
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSavedAnalysis(null);
      return;
    }
    const saved = localStorage.getItem(`graph_analysis_${projectId}`);
    setSavedAnalysis(saved || null);
  }, [projectId, graphData, currentSignature]);

  const moduleLegend = useMemo(() => {
    const extMap = new Map<string, string>();
    for (const n of graphData.nodes) {
      const node = n as ForceNode;
      if (node.label !== "File") continue;
      let ext = extCache.get(node);
      if (ext === undefined) { ext = node.name?.split(".").pop()?.toLowerCase() || ""; extCache.set(node, ext); }
      if (ext && !extMap.has(ext)) {
        extMap.set(ext, extColorHash(ext));
      }
    }
    return Array.from(extMap.entries()).map(([name, color]) => ({ name, color }));
  }, [graphData]);

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

    let nodes = graphData.nodes as ForceNode[];

    nodes = nodes.filter((n: ForceNode) => {
      const titleLabel = n.label ? toTitleCase(String(n.label)) : "";
      return activeTypes.has(titleLabel);
    });

    if (lowerSearchQuery) {
      nodes = nodes.filter(n => (n._lowerName || "").includes(lowerSearchQuery));
    }

    if (focusNode) {
      const neighborsSet = neighbors.get(focusNode) || new Set();
      const visibleNodes = new Set([focusNode, ...neighborsSet]);
      nodes = nodes.filter((n) => visibleNodes.has(n.id as string));
    }

    const visibleIds = new Set(nodes.map(n => n.id));
    let links = (graphData.links as ForceLink[]).filter((l) => {
      return visibleIds.has(l._sourceId as string) && visibleIds.has(l._targetId as string);
    });

    return { nodes, links };
  }, [graphData, focusNode, neighbors, activeTypes, lowerSearchQuery]);

  const toggleType = (type: string) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const hasGraphData = useMemo(
    () => graphData && graphData.nodes && graphData.nodes.length > 0,
    [graphData]
  );

  return {
    graphData, setGraphData,
    searchQuery, setSearchQuery,
    activeTypes, setActiveTypes,
    expandedFolders, setExpandedFolders,
    savedAnalysis, setSavedAnalysis,
    isScanning,
    handleRescan,
    toggleType,
    timeRange,
    stats,
    currentSignature,
    moduleLegend,
    lowerSearchQuery,
    neighbors,
    displayGraphData,
    hasGraphData,
    caches: { extCache, modCache, lowerNameCache, idPairCache }
  };
}
