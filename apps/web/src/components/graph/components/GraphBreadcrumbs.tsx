import React, { useMemo } from "react";
import { ChevronRight, File, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import { graphUI } from "@/lib/graph-theme";
import { ForceNode } from "../types";

interface GraphBreadcrumbsProps {
  activeNode: ForceNode | null;
}

export function GraphBreadcrumbs({ activeNode }: GraphBreadcrumbsProps) {
  const activeNodeBreadcrumbs = useMemo(() => {
    if (!activeNode) return [];
    const path = activeNode.label === "Module" ? (activeNode.folder || "") : (activeNode.file_path || activeNode.name);
    return path.split("/").filter(Boolean);
  }, [activeNode]);

  if (!activeNode) return null;

  return (
    <div className={cn("absolute top-4 left-4 z-10 flex items-center px-3 py-1.5 rounded-lg max-w-full overflow-hidden whitespace-nowrap", graphUI.background, graphUI.blur, graphUI.border, graphUI.shadow)}>
      {activeNode.label === "Module" ? <Folder className="w-3.5 h-3.5 text-indigo-400 mr-2 shrink-0" /> : <File className="w-3.5 h-3.5 text-blue-400 mr-2 shrink-0" />}
      <div className="flex items-center text-xs text-zinc-300 font-mono tracking-tight gap-1 truncate overflow-hidden">
        {activeNodeBreadcrumbs.map((part, i, arr) => (
          <div key={i} className="flex items-center gap-1 shrink-0">
            <span className={i === arr.length - 1 ? "text-zinc-100 font-medium" : "text-zinc-500"}>{part}</span>
            {i < arr.length - 1 && <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />}
          </div>
        ))}
      </div>
    </div>
  );
}
