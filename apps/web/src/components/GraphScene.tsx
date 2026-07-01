"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useRef, ComponentType } from "react";
import { getProjectGraph } from "@/lib/api";
import { GraphData, GraphNode } from "@/types";
import { ForceGraphProps, NodeObject, LinkObject } from "react-force-graph-2d";

// Dynamically import react-force-graph-2d to avoid SSR issues
const ForceGraph2D = dynamic<ForceGraphProps>(
  () => import("react-force-graph-2d").then((mod) => mod.default as ComponentType<ForceGraphProps>),
  {
    ssr: false,
  }
);

interface GraphSceneProps {
  projectId: string | null;
  onNodeClick?: (node: GraphNode) => void;
}

export default function GraphScene({ projectId, onNodeClick }: GraphSceneProps) {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

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

    return () => {
      active = false;
    };
  }, [projectId]);

  const paintNode = (
    node: NodeObject,
    ctx: CanvasRenderingContext2D,
    globalScale: number
  ) => {
    let radius = 2;
    let color = "#64748b"; // default: tiny/unknown

    if (node.label === "File") {
      const size = (node.size as number) || 0;
      radius = Math.min(Math.max(size / 1500, 3), 8);

      if (size > 15000)      color = "#ef4444"; // Huge  → red
      else if (size > 5000)  color = "#f97316"; // Large → orange
      else if (size > 2000)  color = "#eab308"; // Medium → yellow
      else if (size > 500)   color = "#22c55e"; // Standard → green
      else                   color = "#475569"; // Tiny  → slate
    } else if (node.label === "Class") {
      radius = 4;
      color = "#22c55e"; // green
    } else if (node.label === "Function") {
      radius = 3;
      color = "#a5b4fc"; // indigo-300 (light indigo)
    }

    // Flat filled circle — no gradient
    ctx.beginPath();
    ctx.arc(node.x || 0, node.y || 0, radius, 0, 2 * Math.PI, false);
    ctx.fillStyle = color;
    ctx.fill();

    // Label appears when zoomed in
    if (globalScale > 2) {
      const fontSize = 12 / globalScale;
      ctx.font = `${fontSize}px Inter, sans-serif`;
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.textAlign = "center";
      ctx.fillText((node.name as string) || "", node.x || 0, (node.y || 0) + radius + fontSize + 2);
    }
  };

  const paintLink = (
    link: LinkObject,
    ctx: CanvasRenderingContext2D,
    globalScale: number
  ) => {
    const sourceNode = link.source as NodeObject;
    const targetNode = link.target as NodeObject;

    // Only draw if we have source and target coordinates
    if (!sourceNode || !targetNode || sourceNode.x === undefined || targetNode.x === undefined || sourceNode.y === undefined || targetNode.y === undefined) return;

    ctx.beginPath();
    ctx.moveTo(sourceNode.x, sourceNode.y);
    ctx.lineTo(targetNode.x, targetNode.y);

    const grad = ctx.createLinearGradient(sourceNode.x, sourceNode.y, targetNode.x, targetNode.y);
    if (link.type === "IMPORTS") {
      ctx.lineWidth = 0.6 / globalScale;
      grad.addColorStop(0, "rgba(203, 213, 225, 0.0)");   // zinc-300 transparent
      grad.addColorStop(0.5, "rgba(203, 213, 225, 0.6)"); // zinc-300 semi-bright center
      grad.addColorStop(1, "rgba(203, 213, 225, 0.0)");   // zinc-300 transparent
    } else {
      ctx.lineWidth = 0.25 / globalScale;
      grad.addColorStop(0, "rgba(148, 163, 184, 0.0)");   // zinc-400 transparent
      grad.addColorStop(0.5, "rgba(148, 163, 184, 0.25)"); // zinc-400 faint center
      grad.addColorStop(1, "rgba(148, 163, 184, 0.0)");   // zinc-400 transparent
    }
    ctx.strokeStyle = grad;
    ctx.stroke();
  };

  const handleNodeClick = (node: NodeObject) => {
    if (onNodeClick) {
      onNodeClick({
        id: (node.id as string) || "",
        label: (node.label as "File" | "Class" | "Function") || "File",
        name: (node.name as string) || "",
        file_path: (node.file_path as string) || "",
        size: node.size as number | undefined,
        metadata: node.metadata as Record<string, unknown> | undefined
      });
    }
  };

  return (
    <div ref={containerRef} className="w-full h-full bg-[#0d0d0d] flex flex-col items-center justify-center text-zinc-200">
      <ForceGraph2D
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        backgroundColor="#020617"
        nodeCanvasObject={paintNode}
        linkCanvasObjectMode={() => "replace"}
        linkCanvasObject={paintLink}
        onNodeClick={handleNodeClick}
        enableZoomInteraction={true}
        enablePanInteraction={true}
      />
    </div>
  );
}
