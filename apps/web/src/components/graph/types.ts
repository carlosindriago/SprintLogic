import { GraphNode, GraphEdge } from "@/types";

export interface ForceNode extends GraphNode {
  index?: number;
  isMacronode?: boolean;
  children_count?: number;
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  fx?: number;
  fy?: number;
  fz?: number;
  _modCache?: string | null;
  _lowerName?: string;
  _extCache?: string;
  _colorCache?: string;
  _glowColorCache?: string;
  _safeTime?: number;
}

export interface ForceLink extends GraphEdge {
  source: string | ForceNode;
  target: string | ForceNode;
  _idPair?: string;
  _sourceId?: string;
  _targetId?: string;
}

export interface GraphSceneProps {
  projectId: string | null;
  onNodeClick?: (node: GraphNode) => void;
}
