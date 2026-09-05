import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileTreeNode } from "@/types";

vi.mock("@/lib/api", () => ({
  getProjectFiles: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = "ApiError";
    }
  },
}));

import { ApiError, getProjectFiles } from "@/lib/api";
import FileTree from "./FileTree";

const mockTree: FileTreeNode = {
  name: "root",
  path: "/project",
  type: "directory",
  children: [{ name: "index.ts", path: "/project/index.ts", type: "file" }],
};

describe("FileTree loading failures", () => {
  beforeEach(() => {
    vi.mocked(getProjectFiles).mockReset();
  });

  it("renders the tree once getProjectFiles resolves", async () => {
    vi.mocked(getProjectFiles).mockResolvedValue(structuredClone(mockTree));

    render(<FileTree projectId="p1" onFileSelect={vi.fn()} />);

    expect(await screen.findByText("index.ts")).toBeInTheDocument();
  });

  it("shows the backend's message immediately (no retry) when the project path is gone", async () => {
    vi.mocked(getProjectFiles).mockRejectedValue(
      new ApiError(404, "Project path not found on disk"),
    );

    render(<FileTree projectId="p1" onFileSelect={vi.fn()} />);

    expect(await screen.findByText(/Project path not found on disk/)).toBeInTheDocument();
    // A missing directory won't reappear by retrying - only one attempt should happen.
    expect(getProjectFiles).toHaveBeenCalledTimes(1);
  });

  it("retries a raw network failure (e.g. the sidecar not listening yet) and recovers", async () => {
    vi.mocked(getProjectFiles)
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockResolvedValueOnce(structuredClone(mockTree));

    render(<FileTree projectId="p1" onFileSelect={vi.fn()} />);

    await waitFor(() => expect(getProjectFiles).toHaveBeenCalledTimes(2), { timeout: 3000 });
    expect(await screen.findByText("index.ts")).toBeInTheDocument();
  });

  it("shows a manual retry action once network retries are exhausted, and it works", async () => {
    vi.mocked(getProjectFiles).mockRejectedValue(new TypeError("Load failed"));

    render(<FileTree projectId="p1" onFileSelect={vi.fn()} />);

    const retryButton = await screen.findByRole("button", { name: /reintentar/i }, { timeout: 5000 });
    expect(screen.getByText(/Load failed/)).toBeInTheDocument();

    vi.mocked(getProjectFiles).mockResolvedValue(structuredClone(mockTree));
    fireEvent.click(retryButton);

    expect(await screen.findByText("index.ts")).toBeInTheDocument();
  });
});
