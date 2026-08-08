import React, { useMemo } from "react";
import { FolderOpen, X } from "lucide-react";
import { ForceNode } from "../types";

interface GraphExpandedFoldersProps {
  expandedFolders: Set<string>;
  setExpandedFolders: (setter: (prev: Set<string>) => Set<string>) => void;
  setGraphData: (setter: (prev: any) => any) => void;
  fgRef: any;
}

export function GraphExpandedFolders({
  expandedFolders,
  setExpandedFolders,
  setGraphData,
  fgRef
}: GraphExpandedFoldersProps) {
  const expandedFolderList = useMemo(() => {
    return Array.from(expandedFolders).map(folderPath => ({
      folderPath,
      name: folderPath.split('/').pop() || folderPath
    }));
  }, [expandedFolders]);

  if (expandedFolders.size === 0) return null;

  return (
    <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 flex flex-row flex-wrap justify-center gap-2 w-full max-w-3xl pointer-events-none">
      {expandedFolderList.map(({ folderPath, name }) => (
        <div 
          key={folderPath}
          className="flex items-center gap-1 px-2 py-0.5 bg-indigo-950/80 border border-indigo-500/50 rounded-full text-[11px] font-medium tracking-wide text-indigo-100 shadow-[0_0_15px_rgba(99,102,241,0.3)] pointer-events-auto backdrop-blur-md transition-all hover:bg-indigo-900/90"
        >
          <FolderOpen className="w-2.5 h-2.5 text-blue-400" />
          <span className="truncate max-w-[150px]">{name}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpandedFolders((prev) => {
                const next = new Set(prev);
                next.delete(folderPath);
                return next;
              });
              
              setGraphData((prevGraph: any) => {
                prevGraph.nodes.forEach((nItem: ForceNode) => {
                  nItem.fx = undefined;
                  nItem.fy = undefined;
                });
                return { ...prevGraph };
              });

              setTimeout(() => {
                if (fgRef.current) {
                  fgRef.current.d3ReheatSimulation();
                }
              }, 50);
            }}
            className="ml-1 p-0.5 rounded-full hover:bg-zinc-700 hover:text-white transition-colors"
            title="Colapsar carpeta"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
