import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphData } from "@/types";

vi.mock("@/lib/api", () => ({
  getProjectGraph: vi.fn(),
  rescanProject: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { getProjectGraph } from "@/lib/api";
import { useGraphData } from "./useGraphData";

const mockGraph: GraphData = {
  nodes: [
    { id: "file-a", label: "File", name: "a.ts", file_path: "src/a.ts", domain_group: "frontend" },
    { id: "file-b", label: "File", name: "b.ts", file_path: "src/b.ts", domain_group: "backend" },
    { id: "mod-1", label: "Module", name: "core", file_path: "src/core", domain_group: "frontend" },
  ],
  links: [
    { source: "file-a", target: "mod-1", type: "CONTAINS" },
    { source: "file-a", target: "file-b", type: "IMPORTS" },
  ],
};

describe("useGraphData -> displayGraphData filtering", () => {
  beforeEach(() => {
    vi.mocked(getProjectGraph).mockReset();
    vi.mocked(getProjectGraph).mockResolvedValue(structuredClone(mockGraph));
  });

  it("loads the graph and includes all nodes matching the default active types", async () => {
    const { result } = renderHook(() =>
      useGraphData({ projectId: "p1", focusNode: null, viewMode: "REAL" }),
    );

    await waitFor(() => expect(result.current.graphData.nodes.length).toBe(3));

    // Default activeTypes is {"File", "Module"} - all 3 mock nodes qualify.
    expect(result.current.displayGraphData.nodes.map((n) => n.id).sort()).toEqual([
      "file-a",
      "file-b",
      "mod-1",
    ]);
  });

  it("filters out a node type when it's toggled off via setActiveTypes", async () => {
    const { result } = renderHook(() =>
      useGraphData({ projectId: "p1", focusNode: null, viewMode: "REAL" }),
    );
    await waitFor(() => expect(result.current.graphData.nodes.length).toBe(3));

    act(() => {
      result.current.setActiveTypes(new Set(["File"]));
    });

    const ids = result.current.displayGraphData.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(["file-a", "file-b"]);
    // Links touching the now-hidden Module node must also drop out.
    expect(
      result.current.displayGraphData.links.some(
        (l) => l.source === "mod-1" || l.target === "mod-1",
      ),
    ).toBe(false);
  });

  it("filters by search query against the lowercased node name", async () => {
    const { result } = renderHook(() =>
      useGraphData({ projectId: "p1", focusNode: null, viewMode: "REAL" }),
    );
    await waitFor(() => expect(result.current.graphData.nodes.length).toBe(3));

    act(() => {
      result.current.setSearchQuery("CORE");
    });

    expect(result.current.displayGraphData.nodes.map((n) => n.id)).toEqual(["mod-1"]);
  });

  it("restricts to a focus node and its direct neighbors when focusNode is set", async () => {
    const { result, rerender } = renderHook(
      ({ focusNode }: { focusNode: string | null }) =>
        useGraphData({ projectId: "p1", focusNode, viewMode: "REAL" }),
      { initialProps: { focusNode: null as string | null } },
    );
    await waitFor(() => expect(result.current.graphData.nodes.length).toBe(3));

    // file-b only links to file-a; mod-1 is not a neighbor of file-b and
    // must be excluded once focused.
    rerender({ focusNode: "file-b" });

    expect(result.current.displayGraphData.nodes.map((n) => n.id).sort()).toEqual([
      "file-a",
      "file-b",
    ]);
  });
});
