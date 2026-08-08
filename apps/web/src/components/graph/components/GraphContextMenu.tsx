import { ScanSearch, FileCode } from "lucide-react";
import { GraphNode } from "@/types";
import { ForceNode } from "../types";

interface GraphContextMenuProps {
  contextMenu: { visible: boolean; x: number; y: number; node: ForceNode } | null;
  setContextMenu: (menu: { visible: boolean; x: number; y: number; node: ForceNode } | null) => void;
  focusNode: string | null;
  setFocusNode: (id: string | null) => void;
  onNodeClick?: (node: GraphNode) => void;
}

export function GraphContextMenu({
  contextMenu,
  setContextMenu,
  focusNode,
  setFocusNode,
  onNodeClick
}: GraphContextMenuProps) {
  if (!contextMenu || !contextMenu.visible) return null;

  return (
    <div
      className="fixed z-50 bg-[#18181b] border border-[#3f3f46] rounded-md shadow-xl py-1 w-48 text-sm overflow-hidden"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        className="w-full text-left px-4 py-2 text-zinc-300 hover:bg-blue-600 hover:text-white transition-colors flex items-center gap-2"
        onClick={(e) => {
          e.stopPropagation();
          if (focusNode === contextMenu.node.id) {
            setFocusNode(null);
          } else {
            setFocusNode(contextMenu.node.id as string);
          }
          setContextMenu(null);
        }}
      >
        <ScanSearch className="w-4 h-4" />
        {focusNode === contextMenu.node.id ? "Restaurar Grafo" : "Aislar Nodo"}
      </button>
      <button
        className="w-full text-left px-4 py-2 text-zinc-300 hover:bg-blue-600 hover:text-white transition-colors flex items-center gap-2"
        onClick={(e) => {
          e.stopPropagation();
          if (onNodeClick) {
            onNodeClick({
              id: (contextMenu.node.id as string) || "",
              label: (contextMenu.node.label as "File" | "Class" | "Function") || "File",
              name: (contextMenu.node.name as string) || "",
              file_path: (contextMenu.node.file_path as string) || "",
              size: contextMenu.node.size,
              metadata: contextMenu.node.metadata
            });
          }
          setContextMenu(null);
        }}
      >
        <FileCode className="w-4 h-4" /> Abrir Archivo
      </button>
    </div>
  );
}
