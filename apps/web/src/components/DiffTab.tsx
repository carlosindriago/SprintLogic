import { useState, useEffect } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { getCommitFileDiff } from '@/lib/api';
import { RefreshCw } from 'lucide-react';

interface DiffTabProps {
  projectId: string;
  hash: string;
  filePath: string;
}

export default function DiffTab({ projectId, hash, filePath }: DiffTabProps) {
  const [original, setOriginal] = useState("");
  const [modified, setModified] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchDiff = async () => {
      try {
        setLoading(true);
        setError(null);
        const diffData = await getCommitFileDiff(projectId, hash, filePath);
        if (mounted) {
          setOriginal(diffData.original || "");
          setModified(diffData.modified || "");
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || "Failed to load diff");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    if (projectId && hash && filePath) {
      fetchDiff();
    }

    return () => {
      mounted = false;
    };
  }, [projectId, hash, filePath]);

  const getLanguage = (path: string) => {
    const ext = path.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts': case 'tsx': return 'typescript';
      case 'js': case 'jsx': return 'javascript';
      case 'json': return 'json';
      case 'css': return 'css';
      case 'html': return 'html';
      case 'md': return 'markdown';
      case 'py': return 'python';
      default: return 'plaintext';
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#1e1e1e] text-zinc-400">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        Loading diff...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#1e1e1e] text-red-400">
        <p>Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border-b border-zinc-800/50 text-xs text-zinc-400 shrink-0">
        <span className="font-mono bg-zinc-800 px-2 py-1 rounded border border-zinc-700/50">{hash.substring(0, 7)}</span>
        <span>{filePath}</span>
      </div>
      <div className="flex-1">
        <DiffEditor
          original={original}
          modified={modified}
          language={getLanguage(filePath)}
          theme="vs-dark"
          options={{
            readOnly: true,
            renderSideBySide: true,
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
          }}
        />
      </div>
    </div>
  );
}
