import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Folder, FilePlus, FolderPlus } from 'lucide-react';
import { getProjectFiles } from '@/lib/api';
import { FileTreeNode } from '@/types';
import FileIcon from './FileIcon';

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
}> = ({ node, onSelect, depth, onNewFile }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
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
        </div>
        {isOpen && node.children && (
          <div>
            {node.children.map((child, idx) => (
              <TreeNode key={idx} node={child} onSelect={onSelect} depth={depth + 1} onNewFile={onNewFile} />
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
      </div>

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

export default function FileTree({ projectId, onFileSelect, onNewFile, refreshKey }: FileTreeProps) {
  const [tree, setTree] = useState<FileTreeNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <TreeNode key={idx} node={child} onSelect={onFileSelect} depth={0} onNewFile={onNewFile} />
      ))}
    </div>
  );
}
