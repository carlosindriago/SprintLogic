"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { getProjectGraph } from "@/lib/api";

// Dynamically import react-force-graph-2d to avoid SSR issues
// @ts-ignore
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
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

  const paintNode = (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    let radius = 2; // Default size
    let color1 = "#cbd5e1";
    let color2 = "#64748b";

    if (node.label === "File") {
      const size = node.size || 0;
      radius = Math.min(Math.max(size / 1500, 3), 8); // Slightly larger for 2D
      
      if (size > 15000) { color1 = "#fca5a5"; color2 = "#ef4444"; }      // Huge
      else if (size > 5000) { color1 = "#fdba74"; color2 = "#f97316"; } // Large
      else if (size > 2000) { color1 = "#fde047"; color2 = "#eab308"; } // Medium
      else if (size > 500) { color1 = "#93c5fd"; color2 = "#3b82f6"; }  // Standard
      else { color1 = "#94a3b8"; color2 = "#475569"; }                  // Tiny
    } else if (node.label === "Class") {
      radius = 4;
      color1 = "#86efac"; color2 = "#22c55e"; // Green
    } else if (node.label === "Function") {
      radius = 3;
      color1 = "#d8b4fe"; color2 = "#a855f7"; // Purple
    }

    // Draw gradient circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
    const gradient = ctx.createRadialGradient(node.x - radius/3, node.y - radius/3, radius/5, node.x, node.y, radius);
    gradient.addColorStop(0, color1);
    gradient.addColorStop(1, color2);
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // Optional: Draw text label if zoomed in
    if (globalScale > 2) {
      const fontSize = 12 / globalScale;
      ctx.font = `${fontSize}px Inter, sans-serif`;
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.textAlign = "center";
      ctx.fillText(node.name, node.x, node.y + radius + fontSize + 2);
    }
  };

  const paintLink = (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    // Only draw if we have source and target coordinates
    if (!link.source.x || !link.target.x) return;

    ctx.beginPath();
    ctx.moveTo(link.source.x, link.source.y);
    ctx.lineTo(link.target.x, link.target.y);

    if (link.type === "IMPORTS") {
      ctx.lineWidth = 0.5 / globalScale; // Very thin
      // Create a linear gradient along the line for Imports
      const grad = ctx.createLinearGradient(link.source.x, link.source.y, link.target.x, link.target.y);
      grad.addColorStop(0, "rgba(244, 63, 94, 0.1)"); // Rose faded
      grad.addColorStop(0.5, "rgba(244, 63, 94, 0.8)"); // Rose bright center
      grad.addColorStop(1, "rgba(244, 63, 94, 0.1)"); // Rose faded
      ctx.strokeStyle = grad;
    } else {
      ctx.lineWidth = 0.2 / globalScale; // Extremely thin for standard contains
      const grad = ctx.createLinearGradient(link.source.x, link.source.y, link.target.x, link.target.y);
      grad.addColorStop(0, "rgba(148, 163, 184, 0.05)");
      grad.addColorStop(0.5, "rgba(148, 163, 184, 0.3)");
      grad.addColorStop(1, "rgba(148, 163, 184, 0.05)");
      ctx.strokeStyle = grad;
    }
    
    ctx.stroke();
  };

  return (
    <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center text-slate-200">
      <ForceGraph2D
        graphData={graphData}
        backgroundColor="#020617"
        nodeCanvasObject={paintNode}
        linkCanvasObjectMode={() => "replace"}
        linkCanvasObject={paintLink}
        onNodeClick={onNodeClick}
        enableNodeDrag={false}
        enableZoomPanInteraction={true}
      />
    </div>
  );
}
