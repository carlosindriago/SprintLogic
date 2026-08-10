import { useState, useCallback, useEffect, useRef } from "react";
import { forceRadial, forceCollide, forceX, forceY } from "d3-force";
import type { ForceGraphMethods, NodeObject, LinkObject } from "react-force-graph-2d";
import { ForceNode } from "../types";

interface UseGraphPhysicsProps {
  fgRef: React.RefObject<ForceGraphMethods<NodeObject, LinkObject> | undefined>;
  hasGraphData: boolean;
  width: number;
  displayGraphData: { nodes: ForceNode[] };
}

export function useGraphPhysics({ fgRef, hasGraphData, width, displayGraphData }: UseGraphPhysicsProps) {
  const [isPhysicsActive, setIsPhysicsActive] = useState(true);
  const initialFitDoneRef = useRef(false);

  const togglePhysics = useCallback(() => {
    setIsPhysicsActive(prev => {
      const next = !prev;
      const graph = fgRef.current;
      if (graph) {
        if (next) {
          graph.resumeAnimation();
        } else {
          graph.pauseAnimation();
        }
      }
      return next;
    });
  }, [fgRef]);

  useEffect(() => {
    if (!fgRef.current || !hasGraphData || width === 0) return;

    initialFitDoneRef.current = false;
    const fg = fgRef.current;
    
    // Pre-calculate dynamic layout targets based on nodes present
    const rawNodes = displayGraphData.nodes;

    const charge = fg.d3Force('charge');
    if (charge && 'strength' in charge && typeof (charge as { strength?: unknown }).strength === 'function') {
      (charge as unknown as { strength: (val: number) => void }).strength(-1000);
    }

    const linkForce = fg.d3Force('link');
    if (linkForce && 'distance' in linkForce && typeof (linkForce as { distance?: unknown }).distance === 'function') {
      (linkForce as unknown as { distance: (val: number) => void }).distance(40);
    }

    fg.d3Force('collide', forceCollide<NodeObject>().radius((node: NodeObject) => {
      const fn = node as ForceNode;
      if (fn.label === "Module") {
        const children = fn.children_count || 1;
        const visualRadius = Math.max(12, 6 + Math.log2(children) * 3);
        return visualRadius + 80;
      }
      return 15;
    }).iterations(2) as unknown as Parameters<typeof fg.d3Force>[1]);

    function forceCluster() {
      let nodes: ForceNode[];
      const centroids = new Map<string, { x: number; y: number; count: number }>();

      function force(alpha: number) {
        for (const v of centroids.values()) {
          v.x = 0;
          v.y = 0;
          v.count = 0;
        }

        nodes.forEach(d => {
          const mod = d._modCache;
          if (!mod) return;

          const c = centroids.get(mod);
          if (!c) {
             centroids.set(mod, { x: d.x || 0, y: d.y || 0, count: 1 });
          } else {
             c.x += d.x || 0;
             c.y += d.y || 0;
             c.count += 1;
          }
        });

        const strength = 0.08 * alpha;
        nodes.forEach(d => {
          const mod = d._modCache;
          if (!mod) return;
          const centroid = centroids.get(mod);

          if (centroid && centroid.count > 0 && d.vx !== undefined && d.vy !== undefined && d.x !== undefined && d.y !== undefined) {
            const cx = centroid.x / centroid.count;
            const cy = centroid.y / centroid.count;

            d.vx -= (d.x - cx) * strength;
            d.vy -= (d.y - cy) * strength;
          }
        });
      }

      force.initialize = function(_: ForceNode[]) {
        nodes = _;
      };

      return force;
    }

    const centerForce = forceRadial<ForceNode>(0, 0, 0).strength(node => {
      const degree = (node.in_degree || 0) + (node.out_degree || 0);
      return degree === 0 ? 0.05 : 0;
    });

    const mvcTargets: Record<string, {x: number, y: number}> = {
      frontend: { x: -600, y: 0 },
      backend_controller: { x: 0, y: -450 },
      database_model: { x: 0, y: 450 },
      domain_service: { x: 600, y: 0 },
      utility: { x: 600, y: 0 },
      test: { x: 600, y: 0 },
    };

    const uniqueGroups = Array.from(new Set(rawNodes.map(n => n.domain_group || 'other').filter(g => !mvcTargets[g] && g !== 'other')));
    const dynamicTargets = new Map<string, {x: number, y: number}>();
    
    uniqueGroups.forEach((group, index) => {
        const angle = (index / Math.max(1, uniqueGroups.length)) * Math.PI * 2;
        dynamicTargets.set(group, {
            x: Math.cos(angle) * 800,
            y: Math.sin(angle) * 800
        });
    });

    fg.d3Force('cluster', forceCluster() as unknown as Parameters<typeof fg.d3Force>[1]);
    
    fg.d3Force('x', forceX<ForceNode>((node) => {
      const group = node.domain_group || 'other';
      if (mvcTargets[group]) return mvcTargets[group].x;
      if (dynamicTargets.has(group)) return dynamicTargets.get(group)!.x;
      return 0;
    }).strength(node => (node.domain_group && node.domain_group !== 'other') ? 0.15 : 0.05) as unknown as Parameters<typeof fg.d3Force>[1]);
    
    fg.d3Force('y', forceY<ForceNode>((node) => {
      const group = node.domain_group || 'other';
      if (mvcTargets[group]) return mvcTargets[group].y;
      if (dynamicTargets.has(group)) return dynamicTargets.get(group)!.y;
      return 0;
    }).strength(node => (node.domain_group && node.domain_group !== 'other') ? 0.15 : 0.05) as unknown as Parameters<typeof fg.d3Force>[1]);

    fg.d3Force('radial', centerForce as unknown as Parameters<typeof fg.d3Force>[1]);

    fg.d3ReheatSimulation();
  }, [hasGraphData, width, fgRef, displayGraphData.nodes]);

  return {
    isPhysicsActive,
    togglePhysics,
    initialFitDoneRef
  };
}
