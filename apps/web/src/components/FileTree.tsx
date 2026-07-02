import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Folder } from 'lucide-react';
import { getProjectFiles } from '@/lib/api';
import { FileTreeNode } from '@/types';
import FileIcon from './FileIcon';

interface FileTreeProps {
  projectId: string;
  onFileSelect: (path: string) => void;
}

const TreeNode: React.FC<{ node: FileTreeNode; onSelect: (path: string) => void; depth: number }> = ({ node, onSelect, depth }) => {
  const [isOpen, setIsOpen] = useState(false);
  const paddingLeft = `${depth * 12 + 8}px`;

  if (node.type === 'directory') {
    return (
      <div>
        <div 
          className="flex items-center py-1 hover:bg-zinc-800 cursor-pointer text-zinc-300 transition-colors"
          style={{ paddingLeft }}
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? <ChevronDown className="w-4 h-4 mr-1 text-zinc-500" /> : <ChevronRight className="w-4 h-4 mr-1 text-zinc-500" />}
          <Folder className="w-4 h-4 mr-2 text-blue-400" />
          <span className="text-sm truncate">{node.name}</span>
        </div>
        {isOpen && node.children && (
          <div>
            {node.children.map((child, idx) => (
              <TreeNode key={idx} node={child} onSelect={onSelect} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div 
      className="flex items-center py-1 hover:bg-zinc-800 cursor-pointer text-zinc-300 transition-colors group"
      style={{ paddingLeft: `${depth * 12 + 28}px` }}
      onClick={() => onSelect(node.path)}
    >
      <FileIcon fileName={node.name} className="w-4 h-4 mr-2 shrink-0" />
      <span className="text-sm truncate">{node.name}</span>
    </div>
  );
};

export default function FileTree({ projectId, onFileSelect }: FileTreeProps) {
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
  }, [projectId]);

  if (loading) return <div className="p-4 text-xs text-zinc-500">Cargando explorador...</div>;
  if (error) return <div className="p-4 text-xs text-red-400">Error: {error}</div>;
  if (!tree) return null;

  return (
    <div className="py-2 overflow-x-auto">
      {tree.children?.map((child, idx) => (
        <TreeNode key={idx} node={child} onSelect={onFileSelect} depth={0} />
      ))}
    </div>
  );
}
