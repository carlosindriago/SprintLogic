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
    let radius = 2;
    let color = "#64748b"; // default: tiny/unknown

    if (node.label === "File") {
      const size = node.size || 0;
      radius = Math.min(Math.max(size / 1500, 3), 8);

      if (size > 15000)      color = "#ef4444"; // Huge  → red
      else if (size > 5000)  color = "#f97316"; // Large → orange
      else if (size > 2000)  color = "#eab308"; // Medium → yellow
      else if (size > 500)   color = "#22c55e"; // Standard → green (was blue)
      else                   color = "#475569"; // Tiny  → slate
    } else if (node.label === "Class") {
      radius = 4;
      color = "#22c55e"; // green
    } else if (node.label === "Function") {
      radius = 3;
      color = "#a855f7"; // purple
    }

    // Flat filled circle — no gradient
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
    ctx.fillStyle = color;
    ctx.fill();

    // Label appears when zoomed in
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
