import { useState, useCallback, useEffect } from "react";
import type { ForceGraphMethods, NodeObject, LinkObject } from "react-force-graph-2d";
import { GraphNode } from "@/types";
import { ForceNode } from "../types";

interface UseGraphInteractionProps {
  fgRef: React.RefObject<ForceGraphMethods<NodeObject, LinkObject> | undefined>;
  onNodeClick?: (node: GraphNode) => void;
}

export function useGraphInteraction({ fgRef, onNodeClick }: UseGraphInteractionProps) {
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [focusNode, setFocusNode] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; node: ForceNode } | null>(null);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const handleZoomIn = useCallback(() => {
    if (fgRef.current) {
      fgRef.current.zoom(fgRef.current.zoom() * 1.5, 400);
    }
  }, [fgRef]);

  const handleZoomOut = useCallback(() => {
    if (fgRef.current) {
      fgRef.current.zoom(fgRef.current.zoom() / 1.5, 400);
    }
  }, [fgRef]);

  const handleFitView = useCallback(() => {
    if (fgRef.current) {
      fgRef.current.zoomToFit(400, 50);
    }
  }, [fgRef]);

  const onNodeHover = useCallback((node: NodeObject | null) => {
    if (node) {
      const fn = node as ForceNode;
      setHoverNode(fn.id as string);
    } else {
      setHoverNode(null);
    }
  }, []);

  const onNodeRightClick = useCallback((node: NodeObject, event: MouseEvent) => {
    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      node: node as ForceNode,
    });
  }, []);

  const handleNodeClick = useCallback((node: NodeObject) => {
    const n = node as ForceNode;
    setFocusNode(n.id as string);
    if (onNodeClick) onNodeClick(n);
  }, [onNodeClick]);

  return {
    hoverNode, setHoverNode,
    focusNode, setFocusNode,
    contextMenu, setContextMenu,
    handleZoomIn,
    handleZoomOut,
    handleFitView,
    onNodeHover,
    onNodeRightClick,
    handleNodeClick
  };
}
