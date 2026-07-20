import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  getGitDashboard,
  getFileLocalDiff,
  revertFile,
  stageFile,
  unstageFile,
  commitChanges,
  API_BASE_URL,
  type GitDashboard,
  type GitDashboardFileStatus,
  type FileLocalDiff,
} from '@/lib/api';
import DiffViewer, { detectLanguage } from './DiffViewer';
import {
  ArrowLeft,
  FolderGit2,
  FileText,
  RefreshCw,
  GitBranch,
  GitCommit,
  AlertCircle,
  EyeOff,
  Activity,
  Layers,
  Plus,
  Minus,
} from 'lucide-react';

interface AIAuditPanelProps {
  projectId: string;
}

interface DashboardFile {
  status: string;
  file_path: string;
  timestamp?: number;
}

export default function AIAuditPanel({ projectId }: AIAuditPanelProps) {
  const [dashboard, setDashboard] = useState<GitDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<DashboardFile | null>(null);
  const [diffData, setDiffData] = useState<FileLocalDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const discardingRef = useRef(false);
  const stagingRef = useRef(false);
  const committingRef = useRef(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [committing, setCommitting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const fetchDashboardRef = useRef<() => Promise<void>>(async () => {});

  const dashboardRef = useRef<GitDashboard | null>(null);

  const fetchDashboard = useCallback(async () => {
    const isInitial = dashboardRef.current === null;
    if (isInitial) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);
    try {
      const data = await getGitDashboard(projectId);
      dashboardRef.current = data;
      setDashboard(data);
    } catch (err) {
      if (isInitial) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchDashboardRef.current = fetchDashboard;
  }, [fetchDashboard]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (cancelled) return;
      await fetchDashboard();
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [fetchDashboard]);

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
            fetchDashboardRef.current();
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

  const handleFileClick = useCallback(async (file: DashboardFile) => {
    setSelectedFile(file);
    setDiffLoading(true);
    try {
      const data = await getFileLocalDiff(projectId, file.file_path);
      setDiffData(data);
    } catch {
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

  const handleStage = useCallback(async (filePath: string) => {
    if (stagingRef.current) return;
    stagingRef.current = true;
    try {
      await stageFile(projectId, filePath);
    } catch {
      // silently fail; WebSocket refresh is the recovery
    } finally {
      stagingRef.current = false;
    }
  }, [projectId]);

  const handleUnstage = useCallback(async (filePath: string) => {
    if (stagingRef.current) return;
    stagingRef.current = true;
    try {
      await unstageFile(projectId, filePath);
    } catch {
      // silently fail
    } finally {
      stagingRef.current = false;
    }
  }, [projectId]);

  const handleCommit = useCallback(async () => {
    if (committingRef.current || !commitMessage.trim()) return;
    committingRef.current = true;
    setCommitting(true);
    try {
      await commitChanges(projectId, commitMessage.trim());
      setCommitMessage('');
    } catch {
      // silently fail; WebSocket will refresh
    } finally {
      setCommitting(false);
      committingRef.current = false;
    }
  }, [projectId, commitMessage]);

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


  const unstagedItems = useMemo(() => [
    ...(dashboard?.lists?.untracked_list || []),
    ...(dashboard?.lists?.modified_list || [])
  ], [dashboard?.lists?.untracked_list, dashboard?.lists?.modified_list]);

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
          {statusBadge(selectedFile.status)}
          <span className="text-xs text-zinc-300 font-mono truncate">{selectedFile.file_path}</span>
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

  const kpis = dashboard?.kpis;
  const branch = dashboard?.branch;
  const stagedCount = dashboard?.lists.staged_list.length ?? 0;


  return (
    <div className="flex flex-col h-full bg-[#151515] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800/50 shrink-0">
        <div className="flex items-center gap-2">
          <FolderGit2 className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-zinc-200">Mission Control</span>
          {branch && (
            <span className="flex items-center gap-1 text-xs text-zinc-500 ml-2">
              <GitBranch className="w-3 h-3" />
              {branch.current_branch}
            </span>
          )}
        </div>
        <button
          onClick={fetchDashboard}
          disabled={loading || refreshing}
          className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-30"
          title="Refrescar"
          aria-label="Refrescar"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading || refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
        {refreshing && (
          <span className="flex items-center gap-1.5 text-[11px] text-zinc-500 animate-pulse">
            <RefreshCw className="w-3 h-3 animate-spin" />
            Sincronizando...
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && !dashboard ? (
          <div className="flex items-center justify-center py-16 text-zinc-500">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            Cargando dashboard...
          </div>
        ) : error && !dashboard ? (
          <div className="flex items-center justify-center py-16 text-red-400 text-sm gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        ) : !dashboard ? (
          <div className="flex items-center justify-center py-16 text-zinc-500 text-sm">
            Sin datos del repositorio
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3 p-4 shrink-0">
              <KPICard
                icon={<Layers className="w-4 h-4 text-blue-400" />}
                label="Total Archivos"
                value={kpis?.total_files ?? 0}
                pulsing={refreshing}
              />
              <KPICard
                icon={<FileText className="w-4 h-4 text-zinc-400" />}
                label="Nuevos"
                value={kpis?.untracked ?? 0}
                accent="text-zinc-300"
                pulsing={refreshing}
              />
              <KPICard
                icon={<EyeOff className="w-4 h-4 text-zinc-500" />}
                label="Ignorados"
                value={kpis?.ignored ?? 0}
                accent="text-zinc-500"
                pulsing={refreshing}
              />
              <KPICard
                icon={<Activity className="w-4 h-4 text-yellow-400" />}
                label="Modificados"
                value={kpis?.modified ?? 0}
                accent="text-yellow-400"
                pulsing={refreshing}
              />
              <KPICard
                icon={<GitBranch className="w-4 h-4 text-purple-400" />}
                label="Rama Actual"
                value={branch?.current_branch ?? '-'}
                isText
                pulsing={refreshing}
              />
              <KPICard
                icon={<GitCommit className="w-4 h-4 text-green-400" />}
                label="Estado vs Main"
                value={formatDiffWithMain(branch?.diff_with_main)}
                isText
                accent={mainStatusColor(branch?.diff_with_main)}
                pulsing={refreshing}
              />
            </div>

            <div className="px-4 pb-3 shrink-0">
              <div className="flex items-end gap-3 p-3 bg-zinc-900/50 border border-zinc-800/50 rounded-lg">
                <textarea
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      handleCommit();
                    }
                  }}
                  placeholder={
                    stagedCount === 0
                      ? 'Agrega archivos al stage para habilitar el commit'
                      : 'Mensaje del commit...'
                  }
                  disabled={stagedCount === 0 || committing}
                  rows={2}
                  className="flex-1 px-3 py-2 text-sm bg-zinc-800 border border-zinc-700/50 rounded text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 resize-none disabled:opacity-40 font-mono"
                />
                <button
                  onClick={handleCommit}
                  disabled={stagedCount === 0 || !commitMessage.trim() || committing}
                  className="px-4 py-2 rounded text-sm font-medium bg-green-600 text-white hover:bg-green-500 border border-green-500/20 transition-colors disabled:opacity-30 shrink-0"
                >
                  {committing ? 'Commiteando...' : 'Hacer Commit'}
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 px-4 pb-4">
              <div className="flex gap-4 h-full min-h-[280px] overflow-x-auto">
                <StatusColumn
                  title="Cambios locales (Unstaged)"
                  icon={<FileText className="w-3.5 h-3.5 text-zinc-400" />}
                  count={dashboard.lists.untracked_list.length + dashboard.lists.modified_list.length}
                  items={unstagedItems}
                  onItemClick={handleFileClick}
                  statusBadge={statusBadge}
                  onAction={handleStage}
                  onActionAll={() => handleStage('.')}
                  headerActionLabel="Stage All"
                  showActionAll
                />
                <StatusColumn
                  title="En preparación"
                  icon={<GitCommit className="w-3.5 h-3.5 text-green-400" />}
                  count={dashboard.lists.staged_list.length}
                  items={dashboard.lists.staged_list}
                  onItemClick={handleFileClick}
                  statusBadge={statusBadge}
                  onAction={handleUnstage}
                  onActionAll={() => handleUnstage('.')}
                  headerActionLabel="Unstage All"
                  showActionAll
                />
                <StatusColumn
                  title="Último commit"
                  icon={<GitCommit className="w-3.5 h-3.5 text-blue-400" />}
                  count={dashboard.lists.last_commit_list.length}
                  items={dashboard.lists.last_commit_list}
                  onItemClick={handleFileClick}
                  statusBadge={statusBadge}
                  subtitle={dashboard.commits?.last_commit_message}
                />
                <StatusColumn
                  title="Penúltimo commit"
                  icon={<GitCommit className="w-3.5 h-3.5 text-purple-400" />}
                  count={dashboard.lists.penultimate_commit_list.length}
                  items={dashboard.lists.penultimate_commit_list}
                  onItemClick={handleFileClick}
                  statusBadge={statusBadge}
                  subtitle={dashboard.commits?.penultimate_commit_message}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KPICard({
  icon,
  label,
  value,
  accent,
  isText,
  pulsing,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent?: string;
  isText?: boolean;
  pulsing?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-2 p-3 bg-zinc-900/50 border border-zinc-800/50 rounded-lg transition-opacity duration-300 ${pulsing ? 'opacity-50' : 'opacity-100'}`}>
      <div className="flex items-center gap-2 text-[11px] text-zinc-500 uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <div className={`text-lg font-semibold font-mono truncate ${accent ?? 'text-zinc-100'}`}>
        {isText ? value : typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

function StatusColumn({
  title,
  icon,
  count,
  items,
  onItemClick,
  statusBadge,
  onAction,
  onActionAll,
  headerActionLabel,
  showActionAll,
  subtitle,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  items: GitDashboardFileStatus[];
  onItemClick: (file: DashboardFile) => void;
  statusBadge: (code: string) => React.ReactNode;
  onAction?: (filePath: string) => void;
  onActionAll?: () => void;
  headerActionLabel?: string;
  showActionAll?: boolean;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col min-w-[200px] flex-1 bg-zinc-900/30 border border-zinc-800/50 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-800/50 shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
            {icon}
            {title}
          </div>
          {subtitle && (
            <p
              className="text-[10px] text-zinc-500 italic truncate mt-0.5"
              title={subtitle}
            >
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-zinc-500 font-mono">{count}</span>
          {showActionAll && onActionAll && count > 0 && (
            <button
              onClick={onActionAll}
              className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
            >
              {headerActionLabel ?? 'Acción'}
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-zinc-600 gap-1">
            <FileText className="w-5 h-5 opacity-30" />
            <span className="text-[11px]">Vacío</span>
          </div>
        ) : (
          items.map((item) => (
            <DashboardFileRow
              key={item.file_path}
              item={item}
              onClick={onItemClick}
              statusBadge={statusBadge}
              onAction={onAction}
            />
          ))
        )}
      </div>
    </div>
  );
}

function DashboardFileRow({
  item,
  onClick,
  statusBadge,
  onAction,
}: {
  item: GitDashboardFileStatus;
  onClick: (file: DashboardFile) => void;
  statusBadge: (code: string) => React.ReactNode;
  onAction?: (filePath: string) => void;
}) {
  const fileName = item.file_path.split('/').pop() || item.file_path;
  const dirPath = item.file_path.includes('/')
    ? item.file_path.substring(0, item.file_path.lastIndexOf('/'))
    : '';

  const isStaged = item.status !== '??' && item.status !== 'M';

  return (
    <button
      onClick={() => onClick(item)}
      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-zinc-800/40 transition-colors group border-b border-zinc-800/30 last:border-b-0"
    >
      {statusBadge(item.status)}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-zinc-300 font-mono truncate">{fileName}</div>
        {dirPath && (
          <div className="text-[10px] text-zinc-600 truncate">{dirPath}</div>
        )}
      </div>
      {item.timestamp && (
        <span className="text-[10px] text-zinc-600 font-mono shrink-0 tabular-nums">
          {formatRelativeTimestamp(item.timestamp)}
        </span>
      )}
      {onAction && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onAction(item.file_path);
          }}
          className={`opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-zinc-700 ${isStaged ? 'text-red-400' : 'text-green-400'}`}
          title={isStaged ? 'Unstage' : 'Stage'}
        >
          {isStaged ? <Minus className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        </span>
      )}
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

function formatRelativeTimestamp(ts: number | undefined): string {
  if (!ts) return '';
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;

  if (diff < 60) return 'ahora';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;

  const date = new Date(ts * 1000);
  return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function formatDiffWithMain(diff: { ahead: number | null; behind: number | null } | undefined): string {
  if (!diff || diff.ahead === null || diff.behind === null) return 'N/A';
  return `↑${diff.ahead} ↓${diff.behind}`;
}

function mainStatusColor(diff: { ahead: number | null; behind: number | null } | undefined): string {
  if (!diff || diff.ahead === null || diff.behind === null) return 'text-zinc-500';
  if (diff.behind > 0) return 'text-red-400';
  if (diff.ahead > 0) return 'text-green-400';
  return 'text-zinc-400';
}
