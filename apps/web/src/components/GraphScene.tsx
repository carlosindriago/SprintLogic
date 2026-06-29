"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import * as THREE from "three";

// Dynamically import react-force-graph-3d to avoid SSR issues
// @ts-ignore
const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), {
  ssr: false,
}) as any;

export default function GraphScene() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });

  useEffect(() => {
    // Sample placeholder data for the IDE canvas
    setGraphData({
      nodes: [
        { id: "1", name: "System" },
        { id: "2", name: "User" },
        { id: "3", name: "DB" },
      ] as any,
      links: [
        { source: "1", target: "2" },
        { source: "1", target: "3" },
      ] as any,
    });
  }, []);

  return (
    <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center text-slate-200">
      <ForceGraph3D
        graphData={graphData}
        backgroundColor="#020617" // tailwind slate-950
        nodeColor={() => "#3b82f6"} // tailwind blue-500
        linkColor={() => "#475569"} // tailwind slate-600
        nodeLabel="name"
      />
    </div>
  );
}
