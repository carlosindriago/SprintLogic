import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useGraphPhysics } from "./useGraphPhysics";
import type { ForceNode } from "../types";

/**
 * Regression tests for item #14: the physics effect must reheat the
 * simulation only when the underlying graph structure actually changes
 * (a new `graphNodes` reference from useGraphData's raw graphData), never
 * just because the parent re-rendered with the same node set - that was
 * exactly the bug when this depended on the filtered `displayGraphData`
 * instead, which got a new array reference on every focus/search/type
 * filter change.
 */

function makeMockFg() {
  return {
    d3Force: vi.fn(() => undefined),
    d3ReheatSimulation: vi.fn(),
  };
}

describe("useGraphPhysics", () => {
  it("reheats the simulation when the graph's node set actually changes", () => {
    const fg = makeMockFg();
    const fgRef = { current: fg } as never;
    const nodesA = [{ id: "1" }] as ForceNode[];

    const { rerender } = renderHook(
      ({ graphNodes }) =>
        useGraphPhysics({ fgRef, hasGraphData: true, width: 800, graphNodes }),
      { initialProps: { graphNodes: nodesA } },
    );
    expect(fg.d3ReheatSimulation).toHaveBeenCalledTimes(1);

    const nodesB = [{ id: "1" }, { id: "2" }] as ForceNode[];
    rerender({ graphNodes: nodesB });
    expect(fg.d3ReheatSimulation).toHaveBeenCalledTimes(2);
  });

  it("does NOT reheat when graphNodes is the same reference across a re-render", () => {
    const fg = makeMockFg();
    const fgRef = { current: fg } as never;
    const nodes = [{ id: "1" }] as ForceNode[];

    const { rerender } = renderHook(
      ({ graphNodes, width }) =>
        useGraphPhysics({ fgRef, hasGraphData: true, width, graphNodes }),
      { initialProps: { graphNodes: nodes, width: 800 } },
    );
    expect(fg.d3ReheatSimulation).toHaveBeenCalledTimes(1);

    // Simulates a focus/search/type-filter change in the parent: those only
    // ever produce a new *displayGraphData*, never a new graphData/graphNodes
    // reference - the exact distinction item #14 fixed.
    rerender({ graphNodes: nodes, width: 800 });
    expect(fg.d3ReheatSimulation).toHaveBeenCalledTimes(1);
  });

  it("does nothing when there is no graph data yet", () => {
    const fg = makeMockFg();
    const fgRef = { current: fg } as never;

    renderHook(() =>
      useGraphPhysics({ fgRef, hasGraphData: false, width: 800, graphNodes: [] }),
    );
    expect(fg.d3ReheatSimulation).not.toHaveBeenCalled();
  });
});
