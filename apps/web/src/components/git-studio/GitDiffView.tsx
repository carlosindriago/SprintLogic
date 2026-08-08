import { useEffect, useState } from 'react';
import { useGitStore } from '@/store/gitStore';
import { getFileLocalDiff, getFileContent } from '@/lib/api';
import { DiffEditor } from '@monaco-editor/react';
import { RefreshCw, AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  json: 'json',
  md: 'markdown',
  css: 'css',
  html: 'html',
  yaml: 'yaml',
  yml: 'yaml',
  sh: 'shell',
  rs: 'rust',
  go: 'go',
};

export default function GitDiffView({ projectId }: { projectId: string }) {
  const { selectedFile, setSelectedFile } = useGitStore();
  const [original, setOriginal] = useState<string>('');
  const [modified, setModified] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedFile) {
      setTimeout(() => {
        setOriginal('');
        setModified('');
      }, 0);
      return;
    }

    const fetchDiff = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getFileLocalDiff(projectId, selectedFile);
        if (res) {
          setOriginal(res.original || '');
          setModified(res.modified || '');
        }
      } catch (err: unknown) {
        try {
          const fallback = await getFileContent(projectId, selectedFile);
          if (fallback && fallback.content !== undefined) {
             setOriginal('');
             setModified(fallback.content);
          } else {
             setError((err as Error).message || 'Error al cargar el diff.');
          }
        } catch {
          setError((err as Error).message || 'Error de red.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchDiff();
  }, [projectId, selectedFile]);

  if (!selectedFile) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#0a0a0a] text-zinc-500 p-8 text-center border-l border-zinc-800">
        <p>Selecciona un archivo para ver sus diferencias.</p>
      </div>
    );
  }

  // Obtenemos la extensión para el lenguaje
  const ext = selectedFile.split('.').pop()?.toLowerCase() ?? '';
  const language = LANGUAGE_MAP[ext] ?? 'plaintext';

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] border-l border-zinc-800">
      <div className="px-4 h-11 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between shrink-0">
        <span className="text-sm font-medium text-zinc-300 truncate">{selectedFile}</span>
        <Button 
          variant="ghost" 
          size="icon" 
          className="w-6 h-6 text-zinc-400 hover:text-white bg-zinc-800 border border-zinc-700/50 hover:bg-zinc-700 rounded" 
          onClick={() => setSelectedFile(null)}
          title="Cerrar vista de diff"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
      <div className="flex-1 overflow-hidden relative">
        {loading ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0a0a0a]/80 backdrop-blur-sm text-zinc-500">
            <RefreshCw className="w-6 h-6 animate-spin mb-3" />
            <span className="text-sm">Cargando diff...</span>
          </div>
        ) : error ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0a0a0a]/80 backdrop-blur-sm text-red-500 p-8 text-center">
            <AlertTriangle className="w-8 h-8 mb-4 opacity-50" />
            <p>{error}</p>
          </div>
        ) : null}
        
        <DiffEditor
          original={original}
          modified={modified}
          language={language}
          theme="vs-dark"
          options={{
            readOnly: true,
            minimap: { enabled: false },
            wordWrap: 'on',
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
            renderSideBySide: true,
            scrollBeyondLastLine: false,
            contextmenu: false,
          }}
        />
      </div>
    </div>
  );
}
