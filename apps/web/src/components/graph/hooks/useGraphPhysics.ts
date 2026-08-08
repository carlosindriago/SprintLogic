import { useState, useCallback, useEffect, useRef } from "react";
import { forceRadial, forceCollide } from "d3-force";
import type { ForceGraphMethods, NodeObject, LinkObject } from "react-force-graph-2d";
import { ForceNode } from "../types";

interface UseGraphPhysicsProps {
  fgRef: React.RefObject<ForceGraphMethods<NodeObject, LinkObject> | undefined>;
  hasGraphData: boolean;
  width: number;
}

export function useGraphPhysics({ fgRef, hasGraphData, width }: UseGraphPhysicsProps) {
  const [isPhysicsActive, setIsPhysicsActive] = useState(true);
  const initialFitDone = useRef(false);

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

    initialFitDone.current = false;
    const fg = fgRef.current;

    const charge = fg.d3Force('charge');
    if (charge && 'strength' in charge && typeof (charge as { strength?: unknown }).strength === 'function') {
      (charge as unknown as { strength: (val: number) => void }).strength(-350);
    }

    const linkForce = fg.d3Force('link');
    if (linkForce && 'distance' in linkForce && typeof (linkForce as { distance?: unknown }).distance === 'function') {
      (linkForce as unknown as { distance: (val: number) => void }).distance(40);
    }
    
    fg.d3Force('collide', forceCollide<NodeObject>().radius((node: NodeObject) => {
      const fn = node as ForceNode;
      return fn.label === "Module" ? 22 : 10;
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

    fg.d3Force('cluster', forceCluster() as unknown as Parameters<typeof fg.d3Force>[1]);
    fg.d3Force('x', null);
    fg.d3Force('y', null);
    fg.d3Force('radial', centerForce as unknown as Parameters<typeof fg.d3Force>[1]);

    fg.d3ReheatSimulation();
  }, [hasGraphData, width, fgRef]);

  return {
    isPhysicsActive,
    togglePhysics,
    initialFitDone
  };
}
