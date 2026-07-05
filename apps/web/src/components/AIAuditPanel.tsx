import { useState, useEffect, useCallback, useRef } from 'react';
import { getLocalChanges, getFileLocalDiff, revertFile, API_BASE_URL, type ChangedFile, type FileLocalDiff } from '@/lib/api';
import DiffViewer, { detectLanguage } from './DiffViewer';
import { ArrowLeft, FolderGit2, Plus, Minus, FileText, RefreshCw } from 'lucide-react';

interface AIAuditPanelProps {
  projectId: string;
}

export default function AIAuditPanel({ projectId }: AIAuditPanelProps) {
  const [files, setFiles] = useState<ChangedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<ChangedFile | null>(null);
  const [diffData, setDiffData] = useState<FileLocalDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const discardingRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const fetchChangesRef = useRef<() => Promise<void>>(async () => {});

  const fetchChanges = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getLocalChanges(projectId);
      setFiles(data.files);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load changes');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchChangesRef.current = fetchChanges;
  }, [fetchChanges]);

  useEffect(() => {
    fetchChanges();
  }, [fetchChanges]);

  useEffect(() => {
    const wsUrl = API_BASE_URL.replace(/^http/, "ws") + `/projects/${projectId}/ws`;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "file_changed") {
            fetchChangesRef.current();
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [projectId]);

  const handleFileClick = useCallback(async (file: ChangedFile) => {
    setSelectedFile(file);
    setDiffLoading(true);
    try {
      const data = await getFileLocalDiff(projectId, file.file_path);
      setDiffData(data);
    } catch (err) {
      setDiffData(null);
    } finally {
      setDiffLoading(false);
    }
  }, [projectId]);

  const handleBack = useCallback(() => {
    setSelectedFile(null);
    setDiffData(null);
  }, []);

  const handleDiscard = useCallback(async () => {
    if (!selectedFile || discardingRef.current) return;
    discardingRef.current = true;
    setDiscarding(true);
    try {
      await revertFile(projectId, selectedFile.file_path);
      setSelectedFile(null);
      setDiffData(null);
      setConfirmDiscard(false);
    } catch {
      // silently fail
    } finally {
      setDiscarding(false);
      discardingRef.current = false;
    }
  }, [projectId, selectedFile]);

  const modifiedFiles = files.filter((f) => f.is_modified);
  const untrackedFiles = files.filter((f) => f.is_untracked);

  const statusBadge = (code: string) => {
    const map: Record<string, { label: string; className: string }> = {
      'M': { label: 'M', className: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
      ' M': { label: 'M', className: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
      'A': { label: 'A', className: 'bg-green-500/10 text-green-400 border-green-500/20' },
      'D': { label: 'D', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
      'R': { label: 'R', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
      '??': { label: 'U', className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
    };
    const style = map[code] || { label: code, className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' };
    return (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${style.className}`}>
        {style.label}
      </span>
    );
  };

  if (selectedFile) {
    return (
      <div className="flex flex-col h-full bg-[#151515]">
        <div className="flex items-center gap-3 px-4 py-2 bg-zinc-900 border-b border-zinc-800/50 shrink-0">
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver
          </button>
          <div className="w-px h-4 bg-zinc-700/50" />
          {statusBadge(selectedFile.status_code)}
          <span className="text-xs text-zinc-300 font-mono truncate">{selectedFile.file_path}</span>
          <span className="text-[11px] text-green-400">+{selectedFile.added}</span>
          <span className="text-[11px] text-red-400">-{selectedFile.deleted}</span>
          <button
            onClick={() => setConfirmDiscard(true)}
            disabled={discarding}
            className="ml-auto px-3 py-1 rounded text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-30"
          >
            {discarding ? "Descartando..." : "Descartar Cambios"}
          </button>
        </div>

        {confirmDiscard && (
          <ConfirmationModal
            fileName={selectedFile.file_path.split("/").pop() || selectedFile.file_path}
            onConfirm={handleDiscard}
            onCancel={() => setConfirmDiscard(false)}
            loading={discarding}
          />
        )}

        <div className="flex-1 relative">
          {diffLoading ? (
            <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
              Cargando diff...
            </div>
          ) : diffData ? (
            <DiffViewer
              original={diffData.original_content}
              modified={diffData.modified_content}
              language={detectLanguage(selectedFile.file_path)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-red-400 text-sm">
              Error al cargar el diff
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#151515]">
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800/50 shrink-0">
        <div className="flex items-center gap-2">
          <FolderGit2 className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-zinc-200">Auditoría IA</span>
          <span className="text-xs text-zinc-500">· {files.length} archivos</span>
        </div>
        <button
          onClick={fetchChanges}
          disabled={loading}
          className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-30"
          title="Refrescar"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-zinc-500">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            Escaneando cambios...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-16 text-red-400 text-sm">{error}</div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-500 gap-2">
            <FileText className="w-8 h-8 opacity-30" />
            <span className="text-sm">Sin cambios locales</span>
            <span className="text-xs text-zinc-600">El working tree está limpio</span>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {modifiedFiles.length > 0 && (
              <div>
                <div className="px-4 py-2 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                  Modificados ({modifiedFiles.length})
                </div>
                {modifiedFiles.map((file) => (
                  <FileRow
                    key={file.file_path}
                    file={file}
                    onClick={handleFileClick}
                    statusBadge={statusBadge}
                  />
                ))}
              </div>
            )}
            {untrackedFiles.length > 0 && (
              <div>
                <div className="px-4 py-2 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                  Sin seguimiento ({untrackedFiles.length})
                </div>
                {untrackedFiles.map((file) => (
                  <FileRow
                    key={file.file_path}
                    file={file}
                    onClick={handleFileClick}
                    statusBadge={statusBadge}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FileRow({
  file,
  onClick,
  statusBadge,
}: {
  file: ChangedFile;
  onClick: (file: ChangedFile) => void;
  statusBadge: (code: string) => React.ReactNode;
}) {
  const fileName = file.file_path.split('/').pop() || file.file_path;
  const dirPath = file.file_path.includes('/')
    ? file.file_path.substring(0, file.file_path.lastIndexOf('/'))
    : '';

  return (
    <button
      onClick={() => onClick(file)}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-zinc-800/30 transition-colors group"
    >
      {statusBadge(file.status_code)}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-zinc-300 font-mono truncate">{fileName}</div>
        {dirPath && (
          <div className="text-[11px] text-zinc-600 truncate">{dirPath}</div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0 text-xs font-mono">
        {file.added > 0 && (
          <span className="flex items-center gap-0.5 text-green-500">
            <Plus className="w-3 h-3" />{file.added}
          </span>
        )}
        {file.deleted > 0 && (
          <span className="flex items-center gap-0.5 text-red-400">
            <Minus className="w-3 h-3" />{file.deleted}
          </span>
        )}
      </div>
    </button>
  );
}

function ConfirmationModal({
  fileName,
  onConfirm,
  onCancel,
  loading,
}: {
  fileName: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 max-w-sm w-full mx-4 shadow-2xl">
        <h3 className="text-sm font-medium text-zinc-100 mb-2">Descartar cambios</h3>
        <p className="text-xs text-zinc-400 mb-6">
          ¿Estás seguro de que querés descartar todos los cambios locales en{" "}
          <span className="text-zinc-300 font-mono">{fileName}</span>? Esta acción no se puede
          deshacer.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-1.5 rounded text-xs text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50 transition-colors disabled:opacity-30"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-1.5 rounded text-xs font-medium bg-red-600 text-white hover:bg-red-500 border border-red-500/20 transition-colors disabled:opacity-30"
          >
            {loading ? "Descartando..." : "Descartar"}
          </button>
        </div>
      </div>
    </div>
  );
}
