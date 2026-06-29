"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import * as THREE from "three";
import { getProjectGraph } from "@/lib/api";

// Dynamically import react-force-graph-3d to avoid SSR issues
// @ts-ignore
const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), {
  ssr: false,
}) as any;

export default function GraphScene({ projectId, onNodeClick }: { projectId: number | null, onNodeClick?: (node: any) => void }) {
  const [graphData, setGraphData] = useState<{ nodes: any[], links: any[] }>({ nodes: [], links: [] });

  useEffect(() => {
    if (projectId !== null) {
      getProjectGraph(projectId).then((data) => {
        setGraphData(data);
      }).catch(err => console.error("Failed to load graph:", err));
    } else {
      setGraphData({ nodes: [], links: [] });
    }
  }, [projectId]);

  const getNodeColor = (node: any) => {
    if (node.label === "File") {
      const size = node.size || 0;
      if (size > 15000) return "#ef4444"; // Red (Huge file)
      if (size > 5000) return "#f97316";  // Orange (Large file)
      if (size > 2000) return "#eab308";  // Yellow (Medium-Large file)
      if (size > 500) return "#3b82f6";   // Vivid Blue (Standard file)
      return "#64748b";                   // Slate/Dull (Tiny file)
    }
    if (node.label === "Class") return "#22c55e"; // green
    if (node.label === "Function") return "#a855f7"; // purple (changed from orange to differentiate from large files)
    return "#cbd5e1"; // default slate-300
  };

  const getNodeVal = (node: any) => {
    if (node.label === "File") {
      const size = node.size || 0;
      return Math.min(Math.max(size / 1500, 1.5), 6); // Base size 1.5, max 6 based on code size
    }
    if (node.label === "Class") return 2;
    return 1; // Function or other
  };

  return (
    <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center text-slate-200">
      <ForceGraph3D
        graphData={graphData}
        backgroundColor="#020617" // tailwind slate-950
        nodeColor={getNodeColor}
        nodeVal={getNodeVal}
        linkColor={(link: any) => link.type === "IMPORTS" ? "#f43f5e" : "#94a3b8"} // Rose for imports, slate for contains
        linkWidth={(link: any) => link.type === "IMPORTS" ? 2 : 1.5}
        linkOpacity={0.8}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        nodeLabel="name"
        onNodeClick={onNodeClick}
      />
    </div>
  );
}
