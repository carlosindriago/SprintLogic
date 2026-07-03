import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Folder, FilePlus, FolderPlus, AlertCircle, AlertTriangle } from 'lucide-react';
import { getProjectFiles } from '@/lib/api';
import { FileTreeNode } from '@/types';
import FileIcon from './FileIcon';
import { useMarkersStore, type MarkerData } from '@/store/markersStore';
import { cn } from '@/lib/utils';

interface FileTreeProps {
  projectId: string;
  onFileSelect: (path: string) => void;
  onNewFile?: (directory?: string) => void;
  refreshKey?: number;
}

const TreeNode: React.FC<{
  node: FileTreeNode;
  onSelect: (path: string) => void;
  depth: number;
  onNewFile?: (directory?: string) => void;
  allFiles: Record<string, { errors: number; warnings: number; markers: MarkerData[] }>;
  onNavigateToMarker?: (filePath: string, line: number, column: number) => void;
}> = ({ node, onSelect, depth, onNewFile, allFiles, onNavigateToMarker }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showMarkers, setShowMarkers] = useState(false);
  const paddingLeft = `${depth * 12 + 8}px`;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = () => setContextMenu(null);

  useEffect(() => {
    const handleClick = () => closeContextMenu();
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  if (node.type === 'directory') {
    const dirMarkers = sumDescendantMarkers(node, allFiles);

    return (
      <div>
        <div 
          className="flex items-center py-1 hover:bg-zinc-800 cursor-pointer text-zinc-300 transition-colors"
          style={{ paddingLeft }}
          onClick={() => setIsOpen(!isOpen)}
          onContextMenu={handleContextMenu}
        >
          {isOpen ? <ChevronDown className="w-4 h-4 mr-1 text-zinc-500" /> : <ChevronRight className="w-4 h-4 mr-1 text-zinc-500" />}
          <Folder className="w-4 h-4 mr-2 text-blue-400" />
          <span className="text-sm truncate">{node.name}</span>
          {dirMarkers.errors > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500/20 text-[10px] font-semibold text-red-400 leading-none shrink-0">
              {dirMarkers.errors}
            </span>
          )}
        </div>
        {isOpen && node.children && (
          <div>
            {node.children.map((child, idx) => (
              <TreeNode key={idx} node={child} onSelect={onSelect} depth={depth + 1} onNewFile={onNewFile} allFiles={allFiles} onNavigateToMarker={onNavigateToMarker} />
            ))}
          </div>
        )}

        {contextMenu && (
          <div
            className="fixed z-50 bg-zinc-800 border border-zinc-700/50 rounded-lg shadow-xl py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onNewFile?.(node.path);
                closeContextMenu();
              }}
            >
              <FilePlus className="w-3.5 h-3.5 text-zinc-400" />
              Nuevo Archivo
            </button>
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onNewFile?.(node.path);
                closeContextMenu();
              }}
            >
              <FolderPlus className="w-3.5 h-3.5 text-zinc-400" />
              Nueva Carpeta
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div 
        className="flex items-center py-1 hover:bg-zinc-800 cursor-pointer text-zinc-300 transition-colors group"
        style={{ paddingLeft: `${depth * 12 + 28}px` }}
        onClick={() => onSelect(node.path)}
        onContextMenu={handleContextMenu}
      >
        <FileIcon fileName={node.name} className="w-4 h-4 mr-2 shrink-0" />
        <span className="text-sm truncate">{node.name}</span>
        <FileMarkerBadge
          filePath={node.path}
          onToggle={() => setShowMarkers((v) => !v)}
          expanded={showMarkers}
        />
      </div>

      {showMarkers && allFiles[node.path] && (
        <div style={{ paddingLeft: `${depth * 12 + 40}px` }} className="pb-1">
          {[...allFiles[node.path].markers]
            .sort((a, b) => b.severity - a.severity || a.line - b.line)
            .slice(0, 12)
            .map((m, i) => (
              <div
                key={i}
                className="flex items-start gap-1 py-0.5 text-[11px] cursor-pointer hover:bg-zinc-800/50 rounded px-1 group/marker"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigateToMarker?.(node.path, m.line, m.column);
                }}
              >
                {m.severity === 8 ? (
                  <AlertCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-3 h-3 text-yellow-400 shrink-0 mt-0.5" />
                )}
                <span className="text-zinc-500 font-mono shrink-0">Ln {m.line}</span>
                <span className="text-zinc-400 truncate group-hover/marker:text-zinc-300">
                  {m.message}
                </span>
              </div>
            ))}
          {allFiles[node.path].markers.length > 12 && (
            <div className="text-[10px] text-zinc-600 pl-4">
              +{allFiles[node.path].markers.length - 12} más
            </div>
          )}
        </div>
      )}

      {contextMenu && (
        <div
          className="fixed z-50 bg-zinc-800 border border-zinc-700/50 rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(node.path);
              closeContextMenu();
            }}
          >
            <FileIcon fileName={node.name} className="w-3.5 h-3.5" />
            Abrir
          </button>
          <div className="h-px bg-zinc-700/50 my-0.5" />
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              const dir = node.path.substring(0, node.path.lastIndexOf('/'));
              onNewFile?.(dir);
              closeContextMenu();
            }}
          >
            <FilePlus className="w-3.5 h-3.5 text-zinc-400" />
            Nuevo Archivo aquí
          </button>
        </div>
      )}
    </>
  );
};

function sumDescendantMarkers(
  node: FileTreeNode,
  allFiles: Record<string, { errors: number; warnings: number }>
): { errors: number; warnings: number } {
  if (node.type === 'file') {
    return allFiles[node.path] ?? { errors: 0, warnings: 0 };
  }
  let errors = 0;
  let warnings = 0;
  for (const child of node.children ?? []) {
    const m = sumDescendantMarkers(child, allFiles);
    errors += m.errors;
    warnings += m.warnings;
  }
  return { errors, warnings };
}

function FileMarkerBadge({ filePath, onToggle, expanded }: { filePath: string; onToggle: () => void; expanded: boolean }) {
  const markers = useMarkersStore((s) => s.files[filePath]);
  if (!markers || (markers.errors === 0 && markers.warnings === 0)) return null;

  return (
    <span className="ml-1.5 flex items-center gap-0.5 shrink-0">
      {markers.errors > 0 && (
        <button
          className={cn(
            "inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold leading-none transition-colors",
            expanded ? "bg-red-500/30 text-red-300" : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
          )}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
        >
          {markers.errors}
        </button>
      )}
      {markers.warnings > 0 && (
        <button
          className={cn(
            "inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold leading-none transition-colors",
            expanded ? "bg-yellow-500/30 text-yellow-300" : "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30"
          )}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
        >
          {markers.warnings}
        </button>
      )}
      {expanded && (
        <ChevronDown className="w-3 h-3 text-zinc-500" />
      )}
    </span>
  );
}

export default function FileTree({ projectId, onFileSelect, onNewFile, refreshKey, onNavigateToMarker }: FileTreeProps & { onNavigateToMarker?: (filePath: string, line: number, column: number) => void }) {
  const [tree, setTree] = useState<FileTreeNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allFiles = useMarkersStore((s) => s.files);

  useEffect(() => {
    const keys = Object.keys(allFiles);
    if (keys.length > 0) {
      console.log('[filetree] markers store keys:', keys, allFiles);
    }
  }, [allFiles]);

  useEffect(() => {
    if (!projectId) return;
    
    let isMounted = true;
    
    const loadFiles = async () => {
      if (isMounted) setLoading(true);
      try {
        const data = await getProjectFiles(projectId);
        if (isMounted) {
          setTree(data);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadFiles();
      
    return () => { isMounted = false; };
  }, [projectId, refreshKey]);

  if (loading) return <div className="p-4 text-xs text-zinc-500">Cargando explorador...</div>;
  if (error) return <div className="p-4 text-xs text-red-400">Error: {error}</div>;
  if (!tree) return null;

  return (
    <div className="py-2 overflow-x-auto">
      {tree.children?.map((child, idx) => (
        <TreeNode key={idx} node={child} onSelect={onFileSelect} depth={0} onNewFile={onNewFile} allFiles={allFiles} onNavigateToMarker={onNavigateToMarker} />
      ))}
    </div>
  );
}
