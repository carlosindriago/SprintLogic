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

export default function GraphScene({ projectId }: { projectId: number | null }) {
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
    if (node.label === "File") return "#3b82f6"; // blue
    if (node.label === "Class") return "#22c55e"; // green
    if (node.label === "Function") return "#f97316"; // orange
    return "#cbd5e1"; // default slate-300
  };

  return (
    <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center text-slate-200">
      <ForceGraph3D
        graphData={graphData}
        backgroundColor="#020617" // tailwind slate-950
        nodeColor={getNodeColor}
        linkColor={() => "#94a3b8"} // tailwind slate-400 for better visibility
        linkWidth={1.5}
        linkOpacity={0.8}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        nodeLabel="name"
      />
    </div>
  );
}
