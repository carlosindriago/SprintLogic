"use client";

import dynamic from "next/dynamic";
import { useRef, useCallback, useMemo, useState } from "react";
import { LinkObject, NodeObject, type ForceGraphMethods } from "react-force-graph-2d";
import { RefreshCw } from "lucide-react";
import { graphTheme } from "@/lib/graph-theme";
import { GraphNodeLabel } from "@/types";
import { useTabsStore } from "@/store/tabsStore";

import { GraphSceneProps, ForceNode, ForceLink } from "./types";
import { getSafeTime } from "./utils";

import {
  useGraphData,
  useGraphPhysics,
  useGraphInteraction,
  useGraphAnimation,
  useGraphCanvas,
  useGraphViewport
} from "./hooks";

import {
  GraphToolbar,
  GraphBreadcrumbs,
  GraphStatsPanel,
  GraphContextMenu,
  GraphAnimationControls,
  GraphExpandedFolders,
  GraphModuleLegend
} from "./components";

const ForceGraph2D = dynamic(
  () => import("react-force-graph-2d"),
  { ssr: false }
);

export default function GraphScene({ projectId, onNodeClick }: GraphSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<NodeObject, LinkObject> | undefined>(undefined);

  const { dimensions } = useGraphViewport(containerRef);

  const {
    hoverNode,
    focusNode, setFocusNode,
    contextMenu, setContextMenu,
    handleZoomIn, handleZoomOut, handleFitView,
    onNodeHover, onNodeRightClick
  } = useGraphInteraction({ fgRef, onNodeClick });

  const [viewMode, setViewMode] = useState<"REAL" | "GROUPED">("REAL");

  const {
    graphData, setGraphData,
    searchQuery, setSearchQuery,
    activeTypes, toggleType,
    expandedFolders, setExpandedFolders,
    savedAnalysis,
    isScanning, handleRescan,
    timeRange, stats,
    moduleLegend, lowerSearchQuery,
    neighbors, displayGraphData,
    hasGraphData,
    caches
  } = useGraphData({ projectId, focusNode, viewMode });

  const {
    animating, setAnimating,
    animProgress, setAnimProgress,
    enableFlow, setEnableFlow,
    glowingLinks,
    animProgressRef,
    cutoffTimeRef
  } = useGraphAnimation({ graphData, idPairCache: caches.idPairCache });

  const { isPhysicsActive, togglePhysics, initialFitDoneRef } = useGraphPhysics({ fgRef, hasGraphData, width: dimensions.width });

  const [showCyclesState, setShowCycles] = useState(false);

  const {
    paintBackground,
    paintNode,
    getLinkColor,
    getParticleColor,
    getLinkWidth,
    getLinkVisibility
  } = useGraphCanvas({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    displayGraphData: displayGraphData as any,
    graphDataLength: graphData.nodes.length,
    activeTypes,
    lowerSearchQuery,
    focusNode,
    hoverNode,
    neighbors,
    timeRange,
    animProgressRef,
    cutoffTimeRef,
    showCycles: showCyclesState,
    glowingLinks
  });

  const nodeById = useMemo(() => {
    const map = new Map<string, ForceNode>();
    for (let i = 0; i < displayGraphData.nodes.length; i++) {
      const n = displayGraphData.nodes[i] as ForceNode;
      map.set(n.id as string, n);
    }
    return map;
  }, [displayGraphData]);

  const activeNode = useMemo(() => {
    const activeId = focusNode || hoverNode;
    if (!activeId) return null;
    return nodeById.get(activeId) || null;
  }, [focusNode, hoverNode, nodeById]);

  const handleNodeDragEnd = useCallback((node: NodeObject) => {
    const n = node as ForceNode;
    n.fx = n.x;
    n.fy = n.y;
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setFocusNode(null);
  }, [setFocusNode]);

  const handleNodeDrag = useCallback(() => {}, []);

  const { addTab } = useTabsStore();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [analyzing, setAnalyzing] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [analyzingText, setAnalyzingText] = useState("");

  const handleAnalyze = async () => {
    // Basic analyze function
  };

  const handleShowAnalysis = () => {
    addTab({ id: 'ai-history', title: 'Historial IA', type: 'ai-history' });
  };

  return (
    <div className="flex-1 w-full flex flex-col relative min-h-0" style={{ backgroundColor: graphTheme.background }}>
      <GraphStatsPanel
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        activeTypes={activeTypes} toggleType={toggleType}
        showCycles={showCyclesState} setShowCycles={setShowCycles}
        viewMode={viewMode} setViewMode={setViewMode}
        stats={stats}
        isScanning={isScanning} handleRescan={handleRescan}
        savedAnalysis={savedAnalysis}
        analyzing={analyzing} analyzingText={analyzingText}
        handleAnalyze={handleAnalyze} handleShowAnalysis={handleShowAnalysis}
      />

      <GraphModuleLegend moduleLegend={moduleLegend} />
      <GraphBreadcrumbs activeNode={activeNode || null} />

      <GraphToolbar
        handleZoomIn={handleZoomIn}
        handleZoomOut={handleZoomOut}
        handleFitView={handleFitView}
        isPhysicsActive={isPhysicsActive}
        togglePhysics={togglePhysics}
        enableFlow={enableFlow}
        setEnableFlow={setEnableFlow}
      />

      <GraphAnimationControls
        timeRange={timeRange}
        animating={animating} setAnimating={setAnimating}
        animProgress={animProgress} setAnimProgress={setAnimProgress}
      />

      <div ref={containerRef} className={`flex-1 w-full min-h-0 z-0 transition-opacity duration-300 ${isScanning ? "opacity-40 pointer-events-none" : ""}`}>
        {isScanning && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-black/70 border border-zinc-700 backdrop-blur-sm">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
              <span className="text-sm text-zinc-300">Re-escaneando proyecto...</span>
            </div>
          </div>
        )}

        <GraphContextMenu
          contextMenu={contextMenu} setContextMenu={setContextMenu}
          focusNode={focusNode} setFocusNode={setFocusNode}
          onNodeClick={onNodeClick}
        />

        <GraphExpandedFolders
          expandedFolders={expandedFolders} setExpandedFolders={setExpandedFolders}
          setGraphData={setGraphData} fgRef={fgRef}
        />

        <ForceGraph2D
          ref={fgRef}
          width={dimensions.width || 800}
          height={dimensions.height || 600}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          graphData={displayGraphData as any}
          backgroundColor={graphTheme.background}
          onRenderFramePre={paintBackground}
          nodeCanvasObject={paintNode}
          nodeVisibility={(node: NodeObject) => {
            if (!cutoffTimeRef.current) return true;
            return getSafeTime(node) <= cutoffTimeRef.current;
          }}
          linkColor={getLinkColor}
          linkWidth={getLinkWidth}
          linkVisibility={getLinkVisibility}
          linkCurvature={0.15}
          linkDirectionalParticles={enableFlow ? ((link: LinkObject) => {
            const l = link as ForceLink;
            const sourceId = l._sourceId;
            const targetId = l._targetId;
            const activeFocus = focusNode || hoverNode;
            let faded = false;
            if (activeFocus) {
              faded = (sourceId !== activeFocus && !neighbors.get(activeFocus)?.has(sourceId as string)) &&
                      (targetId !== activeFocus && !neighbors.get(activeFocus)?.has(targetId as string));
            }
            if (faded) return 0;
            return showCyclesState && l.is_cycle ? 4 : 2;
          }) : 0}
          linkDirectionalParticleSpeed={(link: LinkObject) => (showCyclesState && (link as ForceLink).is_cycle ? 0.012 : 0.005)}
          linkDirectionalParticleWidth={1.0}
          linkDirectionalParticleColor={getParticleColor}
          linkDirectionalArrowLength={3.5}
          linkDirectionalArrowRelPos={1}
          d3AlphaDecay={0.1}
          d3AlphaMin={0.05}
          cooldownTicks={100}
          nodePointerAreaPaint={(node: NodeObject, color: string, ctx: CanvasRenderingContext2D) => {
            ctx.fillStyle = color;
            const hitRadius = (node as ForceNode).label === "Module" ? 18 : 8;
            ctx.beginPath();
            ctx.arc(node.x || 0, node.y || 0, hitRadius, 0, 2 * Math.PI);
            ctx.fill();
          }}
          onNodeClick={(node) => {
            const n = node as ForceNode;
            if (n.label === "Module") {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              setGraphData((prevGraph: any) => {
                prevGraph.nodes.forEach((nItem: ForceNode) => {
                  if (nItem.x !== undefined) nItem.x = nItem.x;
                  if (nItem.y !== undefined) nItem.y = nItem.y;
                });
                return { ...prevGraph };
              });
              setExpandedFolders((prev) => new Set([...prev, n.file_path || ""]));
              setTimeout(() => {
                if (fgRef.current) {
                  fgRef.current.zoomToFit(800, 100);
                  fgRef.current.d3ReheatSimulation();
                }
              }, 100);
            } else if (onNodeClick) {
              onNodeClick({
                id: (n.id as string) || "",
                label: (n.label as GraphNodeLabel) || "File",
                name: (n.name as string) || "",
                file_path: (n.file_path as string) || "",
                size: n.size,
                metadata: n.metadata
              });
            }
          }}
          onNodeDragEnd={handleNodeDragEnd}
          onNodeDrag={handleNodeDrag}
          onBackgroundClick={handleBackgroundClick}
          onNodeRightClick={onNodeRightClick}
          onNodeHover={onNodeHover}
          enableZoomInteraction={true}
          enablePanInteraction={true}
          onEngineStop={() => {
            if (fgRef.current) {
              if (!initialFitDoneRef.current) {
                initialFitDoneRef.current = true;
                fgRef.current.zoomToFit(800, 100);
              }
              // Stop the animation loop entirely to bring CPU to 0% when idle
              if (!enableFlow) {
                fgRef.current.pauseAnimation();
              }
            }
          }}
        />
      </div>
    </div>
  );
}
