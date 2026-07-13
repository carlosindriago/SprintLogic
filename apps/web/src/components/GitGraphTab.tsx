'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, Upload, Check, GitCommit, RefreshCw, Archive, FileText, FilePlus, FileMinus, ChevronDown, Plus, AlertTriangle, GitBranch, Trash, GitPullRequest, Globe, Sparkles } from 'lucide-react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { API_BASE_URL, getCommitDetails, fetchWithRetry, getFileContent, saveFileContent } from '@/lib/api';
import { useTabsStore } from '@/store/tabsStore';
import { Commit, CommitDetails, CommitFile } from '@/types';
import { toast } from 'sonner';
import { useGitSyncStatus } from '@/hooks/useGitSyncStatus';
import { checkoutHead, createBranch, deleteBranch, resetCommit, revertCommit, cherryPick, getBranches, getRemoteUrl, addRemoteUrl, generateCommitMessage } from '@/lib/git-actions';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuGroup } from '@/components/ui/dropdown-menu';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuGroup } from '@/components/ui/context-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

  // ── Render ───────────────────────────────────────────────────────────────────
const ROW_HEIGHT = 72;      // px per commit row
const DOT_X = 40;           // x center of the branch line / dot
const DOT_R = 7;            // dot radius
const LINE_X = DOT_X;       // branch vertical line x
const CARD_X = DOT_X + 24;  // commit card left edge
const CARD_HEIGHT = 56;
const CARD_WIDTH = 560;
const SVG_WIDTH = CARD_X + CARD_WIDTH + 24;
const HEADER_OFFSET = 40;   // extra top space

const BRANCH_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

function getBranchColor(branchName: string): string {
  if (branchName === 'main' || branchName === 'master') return '#3b82f6';
  let hash = 0;
  for (let i = 0; i < branchName.length; i++) {
    hash = branchName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % BRANCH_COLORS.length;
  return BRANCH_COLORS[index];
}

interface CommitRow {
  commit: Commit;
  y: number;
  isLatest: boolean;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.substring(0, max) + '…' : s;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function GitGraphTab({ projectId }: { projectId: string }) {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [activeBranch, setActiveBranch] = useState('main');
  const [allBranches, setAllBranches] = useState<Array<{
    name: string;
    is_current?: boolean;
    ahead?: number;
    behind?: number;
    is_local_only?: boolean;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const otherBranches = useMemo(() => allBranches.filter(b => b.name !== activeBranch), [allBranches, activeBranch]);
  const [commitMessage, setCommitMessage] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [isGeneratingMessage, setIsGeneratingMessage] = useState(false);
  
  
  const [commitDetails, setCommitDetails] = useState<CommitDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(true);
  
  // Remote connection state
  const [isRemoteDialogOpen, setIsRemoteDialogOpen] = useState(false);
  const [remoteUrlInput, setRemoteUrlInput] = useState('');
  
  // Dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description: string;
    onConfirm: () => void;
    destructive?: boolean;
  } | null>(null);

  const [newBranchDialog, setNewBranchDialog] = useState<{ open: boolean, startHash?: string }>({ open: false });
  const [newBranchName, setNewBranchName] = useState('');

  // ── Advanced Operations State ────────────────────────────────────────────────
  const [mergeDialog, setMergeDialog] = useState(false);
  const [mergeSource, setMergeSource] = useState('');
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; branch: string }>({ open: false, branch: '' });

  // .gitignore Manager State
  const [gitIgnoreDialog, setGitIgnoreDialog] = useState(false);
  const [gitIgnoreContent, setGitIgnoreContent] = useState('');
  const [gitIgnoreLoading, setGitIgnoreLoading] = useState(false);
  const [gitIgnoreSaving, setGitIgnoreSaving] = useState(false);

  const addTab = useTabsStore((state) => state.addTab);
  const { status: syncState, isLoading: isSyncLoading, refresh: refreshSyncStatus } = useGitSyncStatus(projectId);
  const isMergeInProgress = syncState?.is_merge_in_progress;

  // ── Fetch commits & branches ──────────────────────────────────────────────────
  const fetchCommits = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchWithRetry(`${API_BASE_URL}/projects/${projectId}/git/log`, undefined, 20, 500);
      if (res.ok) {
        const data = await res.json();
        setCommits(data.commits ?? []);
        setActiveBranch(data.active_branch ?? 'main');
      } else {
        const errText = await res.text();
        console.error(`HTTP ${res.status}: ${errText}`);
      }
    } catch (e) {
      console.error(`Fetch error: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const fetchBranches = useCallback(async () => {
    const res = await getBranches(projectId);
    if (res.ok && 'data' in res && res.data) {
      setAllBranches(res.data.branches || []);
    }
  }, [projectId]);

  const refreshAll = useCallback(() => {
    fetchCommits();
    fetchBranches();
    refreshSyncStatus();
  }, [fetchCommits, fetchBranches, refreshSyncStatus]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshAll();
  }, [refreshAll]);

  // ── Git actions ──────────────────────────────────────────────────────────────
  const executeAction = async (action: string, message = '') => {
    try {
      setActionLoading(true);
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/git/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, message }),
      });
      if (res.ok) {
        if (action === 'commit') setCommitMessage('');
        toast.success(`${action} exitoso`);
        refreshAll();
      } else {
        const err = await res.json();
        toast.error(`Error en ${action}: ${err.detail}`);
      }
    } catch {
      toast.error('Error de red');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckoutBranch = async (branchName: string) => {
    const toastId = toast.loading(`Cambiando a rama ${branchName}...`);
    const res = await checkoutHead(projectId, branchName);
    if (res.ok) {
      toast.success(`Checkout a ${branchName} exitoso`, { id: toastId });
      refreshAll();
    } else {
      toast.error(`Error checkout: ${res.error}`, { id: toastId });
    }
  };

  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) return;
    const toastId = toast.loading(`Creando rama ${newBranchName}...`);
    const res = await createBranch(projectId, newBranchName.trim(), newBranchDialog.startHash);
    if (res.ok) {
      toast.success(`Rama creada`, { id: toastId });
      setNewBranchDialog({ open: false });
      setNewBranchName('');
      refreshAll();
    } else {
      toast.error(`Error: ${res.error}`, { id: toastId });
    }
  };
  const handleMergeBranch = async () => {
    if (!mergeSource) return;
    setActionLoading(true);
    const res = await fetch(`${API_BASE_URL}/projects/${projectId}/git/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID?.() || Date.now().toString() },
      body: JSON.stringify({ source_branch: mergeSource }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error('Error al hacer merge', { description: data.detail?.message || data.detail || 'Conflicto detectado.' });
    } else {
      toast.success('Merge exitoso', { description: `Se fusionó ${mergeSource}` });
      setMergeDialog(false);
      setMergeSource('');
      refreshAll();
    }
    setActionLoading(false);
  };

  const handleDeleteBranch = async () => {
    if (!deleteDialog.branch) return;
    setActionLoading(true);
    const res = await deleteBranch(projectId, deleteDialog.branch, false);
    if (!res.ok) {
      if (res.error?.includes('not fully merged')) {
        toast.error('Rama no fusionada', {
          description: 'La rama tiene commits sin fusionar. Fuerza el borrado si estás seguro.',
          action: {
            label: 'Forzar Borrado',
            onClick: async () => {
              await deleteBranch(projectId, deleteDialog.branch, true);
              toast.success(`Rama ${deleteDialog.branch} eliminada (forzado)`);
              setDeleteDialog({ open: false, branch: '' });
              refreshAll();
            }
          }
        });
      } else {
        toast.error('Error al eliminar', { description: res.error });
      }
    } else {
      toast.success('Rama eliminada', { description: deleteDialog.branch });
      setDeleteDialog({ open: false, branch: '' });
      refreshAll();
    }
    setActionLoading(false);
  };

  const handleOpenGitIgnore = async () => {
    setGitIgnoreDialog(true);
    setGitIgnoreLoading(true);
    try {
      const { content } = await getFileContent(projectId, '.gitignore');
      setGitIgnoreContent(content);
    } catch {
      setGitIgnoreContent(''); // File might not exist
    } finally {
      setGitIgnoreLoading(false);
    }
  };

  const handleSaveGitIgnore = async () => {
    setGitIgnoreSaving(true);
    try {
      await saveFileContent(projectId, '.gitignore', gitIgnoreContent);
      toast.success('.gitignore actualizado');
      setGitIgnoreDialog(false);
    } catch {
      toast.error('Error al guardar .gitignore');
    } finally {
      setGitIgnoreSaving(false);
    }
  };


  // ── Context Menu Actions ───────────────────────────────────────────────────────
  const handleOpenRemoteConfig = async () => {
    setActionLoading(true);
    const res = await getRemoteUrl(projectId);
    setActionLoading(false);
    if (res.ok && 'data' in res && res.data) {
      setRemoteUrlInput(res.data.url || '');
      setIsRemoteDialogOpen(true);
    } else {
      toast.error('Error al obtener URL remota');
    }
  };

  const handleCreatePR = async () => {
    setActionLoading(true);
    const res = await getRemoteUrl(projectId);
    setActionLoading(false);
    
    if (res.ok && 'data' in res && res.data) {
      if (res.data.url) {
        let url = res.data.url;
        // Parse ssh or https url
        if (url.startsWith('git@')) {
          url = url.replace(':', '/').replace('git@', 'https://');
        }
        if (url.endsWith('.git')) {
          url = url.substring(0, url.length - 4);
        }
        if (url.includes('github.com')) {
          window.open(`${url}/compare/${activeBranch}?expand=1`, '_blank');
        } else if (url.includes('gitlab.com')) {
          window.open(`${url}/-/merge_requests/new?merge_request[source_branch]=${activeBranch}`, '_blank');
        } else {
          toast.error('Remoto no soportado', { description: 'Solo se soportan atajos para GitHub y GitLab.' });
        }
      } else {
        // No remote url, show dialog
        setRemoteUrlInput('');
        setIsRemoteDialogOpen(true);
      }
    } else {
      toast.error('Error', { description: 'No se pudo consultar el repositorio remoto.' });
    }
  };

  const handleSaveRemote = () => {
    if (!remoteUrlInput.trim()) return;
    
    setConfirmDialog({
      title: 'Confirmar Remoto',
      description: `¿Estás seguro de que deseas configurar la URL del repositorio remoto como "${remoteUrlInput.trim()}"? Esto afectará los Pull Requests, Push y Pull.`,
      onConfirm: async () => {
        setActionLoading(true);
        const res = await addRemoteUrl(projectId, remoteUrlInput.trim());
        setActionLoading(false);
        
        if (res.ok && 'data' in res && res.data) {
          const resData = res.data as { status: string; message: string };
          if (resData && resData.status === 'success') {
            toast.success(resData.message);
            setIsRemoteDialogOpen(false);
            setConfirmDialog(null);
          } else {
            toast.error('Error al vincular', { description: resData?.message || 'No se pudo conectar.' });
            setConfirmDialog(null);
          }
        } else {
          toast.error('Error', { description: res.error });
          setConfirmDialog(null);
        }
      }
    });
  };

  const handleCheckoutCommit = async (hash: string) => {
    const toastId = toast.loading(`Checkout al commit ${hash.substring(0,7)}...`);
    const res = await checkoutHead(projectId, hash);
    if (res.ok) {
      toast.success(`Checkout exitoso`, { id: toastId });
      refreshAll();
    } else {
      toast.error(`Error: ${res.error}`, { id: toastId });
    }
  };

  const handleRevertCommit = async (hash: string) => {
    const toastId = toast.loading(`Revirtiendo commit...`);
    const res = await revertCommit(projectId, hash);
    if (res.ok) {
      toast.success(`Commit revertido`, { id: toastId });
      refreshAll();
    } else {
      toast.error(`Error: ${res.error}`, { id: toastId });
    }
  };

  const handleCherryPick = async (hash: string) => {
    const toastId = toast.loading(`Aplicando cherry-pick...`);
    const res = await cherryPick(projectId, hash);
    if (res.ok) {
      toast.success(`Cherry-pick exitoso`, { id: toastId });
      refreshAll();
    } else {
      toast.error(`Error: ${res.error}`, { id: toastId });
    }
  };

  const promptReset = (hash: string, mode: 'soft'|'mixed'|'hard') => {
    setConfirmDialog({
      title: `Reset --${mode}`,
      description: mode === 'hard' 
        ? `ESTO ES DESTRUCTIVO. Vas a perder todos los cambios no guardados. ¿Estás seguro de hacer reset a ${hash.substring(0,7)}?`
        : `¿Confirmas reset --${mode} al commit ${hash.substring(0,7)}?`,
      destructive: mode === 'hard',
      onConfirm: async () => {
        const toastId = toast.loading(`Resetting...`);
        const res = await resetCommit(projectId, hash, mode);
        if (res.ok) {
          toast.success(`Reset exitoso`, { id: toastId });
          refreshAll();
        } else {
          toast.error(`Error: ${res.error}`, { id: toastId });
        }
        setConfirmDialog(null);
      }
    });
  };

  // ── Commit detail ────────────────────────────────────────────────────────────
  const handleCommitClick = async (hash: string) => {
    setShowDetails(true);
    setDetailsLoading(true);
    setCommitDetails(null);
    try {
      const details = await getCommitDetails(projectId, hash);
      setCommitDetails(details);
    } catch (err) {
      console.error('Failed to load commit details:', err);
    } finally {
      setDetailsLoading(false);
    }
  };

  const openDiff = (hash: string, filePath: string) => {
    addTab({
      id: `diff-${hash}-${filePath}`,
      title: `${filePath.split('/').pop()} (Diff)`,
      type: 'diff',
      data: { hash, filePath },
    });
  };

  const handleGenerateCommitMessage = async () => {
    setIsGeneratingMessage(true);
    const defaultModel = localStorage.getItem("default_ai_model") || "gemini/gemini-2.5-flash";
    const res = await generateCommitMessage(projectId, defaultModel);
    setIsGeneratingMessage(false);
    
    if (res.ok && 'data' in res && res.data) {
      const resData = res.data as { status: string; message: string };
      if (resData.message === "No hay cambios para hacer commit.") {
        toast.info(resData.message);
      } else {
        setCommitMessage(resData.message);
        toast.success('Mensaje generado');
      }
    } else {
      const resData = 'data' in res ? (res.data as { message?: string }) : null;
      toast.error('Error al generar', { description: resData?.message || res.error || 'Fallo inesperado.' });
    }
  };

  const getFileIcon = (status: string) => {
    if (status.startsWith('A')) return <FilePlus className="w-4 h-4 text-green-500" />;
    if (status.startsWith('D')) return <FileMinus className="w-4 h-4 text-red-500" />;
    return <FileText className="w-4 h-4 text-yellow-500" />;
  };

  const rows: CommitRow[] = useMemo(() => commits.map((c, i) => ({
    commit: c,
    y: HEADER_OFFSET + i * ROW_HEIGHT + ROW_HEIGHT / 2,
    isLatest: i === 0,
  })), [commits]);

  const svgHeight = HEADER_OFFSET + commits.length * ROW_HEIGHT + 24;

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] text-zinc-200">
      
      {/* Warning Banner */}
      {isMergeInProgress && (
        <div className="bg-orange-950/80 border-b border-orange-500/50 p-2 flex items-center justify-center gap-2 text-orange-200 text-sm">
          <AlertTriangle className="w-4 h-4" />
          <span>Merge en progreso — resolvé los conflictos antes de continuar. Acciones de Git bloqueadas.</span>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-4 p-4 border-b border-zinc-800/50 bg-zinc-900 shrink-0">
        
        {/* Branch Selector Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-8 px-3 text-xs justify-center rounded-md font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 border bg-zinc-800 border-zinc-700/50 hover:bg-zinc-700 items-center gap-2 min-w-[140px]">
            <span className="truncate">{activeBranch}</span>
            {syncState && (syncState.ahead > 0 || syncState.behind > 0) && (
              <div className="flex gap-1 text-xs px-1">
                {syncState.ahead > 0 && <span className="text-green-400">↑{syncState.ahead}</span>}
                {syncState.behind > 0 && <span className="text-red-400">↓{syncState.behind}</span>}
              </div>
            )}
            <ChevronDown className="w-3 h-3 ml-auto opacity-50" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64 bg-zinc-800 border-zinc-700 text-zinc-200" align="start">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Ramas Locales & Remotas</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-zinc-700" />
              {allBranches.map(b => (
                <DropdownMenuItem 
                  key={b.name} 
                  onClick={() => handleCheckoutBranch(b.name)}
                  className="flex items-center justify-between cursor-pointer hover:bg-zinc-700 focus:bg-zinc-700"
                >
                  <div className="flex items-center gap-2 truncate">
                    {b.is_current && <Check className="w-3 h-3 text-blue-400 shrink-0" />}
                    <span className={b.is_current ? "font-bold text-blue-400 truncate" : "truncate"}>{b.name}</span>
                  </div>
                  <div className="flex gap-1 text-[10px] shrink-0">
                    {(b.ahead ?? 0) > 0 && <span className="text-green-400 bg-green-400/10 px-1 rounded">↑{b.ahead}</span>}
                    {(b.behind ?? 0) > 0 && <span className="text-red-400 bg-red-400/10 px-1 rounded">↓{b.behind}</span>}
                    {b.is_local_only && <span className="text-zinc-500 bg-zinc-500/10 px-1 rounded">local</span>}
                  </div>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-zinc-700" />
              <DropdownMenuItem 
                onClick={() => setNewBranchDialog({ open: true })}
                className="cursor-pointer text-blue-400 hover:text-blue-300 hover:bg-blue-400/10 focus:bg-blue-400/10"
              >
                <Plus className="w-4 h-4 mr-2" /> Nueva Rama
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-700" />
              <DropdownMenuItem 
                onClick={() => setMergeDialog(true)}
                className="cursor-pointer text-orange-400 hover:text-orange-300 hover:bg-orange-400/10 focus:bg-orange-400/10"
              >
                <GitBranch className="w-4 h-4 mr-2" /> Hacer Merge...
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-700" />
              <DropdownMenuItem 
                onClick={() => setDeleteDialog({ open: true, branch: '' })}
                className="cursor-pointer text-red-400 hover:text-red-300 hover:bg-red-400/10 focus:bg-red-400/10"
              >
                <Trash className="w-4 h-4 mr-2" /> Eliminar Rama...
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-700" />
              <DropdownMenuItem 
                onClick={handleOpenRemoteConfig}
                className="cursor-pointer text-zinc-300 hover:text-white hover:bg-zinc-700 focus:bg-zinc-700"
              >
                <Globe className="w-4 h-4 mr-2" /> Vincular Remoto...
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="w-px h-6 bg-zinc-700 mx-1" />

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => executeAction('pull')} disabled={actionLoading || isMergeInProgress} className="bg-zinc-800 border-zinc-700/50 hover:bg-zinc-700">
            <Download className="w-4 h-4 mr-2" /> Pull
          </Button>
          <Button variant="outline" size="sm" onClick={() => executeAction('push')} disabled={actionLoading || isMergeInProgress} className="bg-zinc-800 border-zinc-700/50 hover:bg-zinc-700">
            <Upload className="w-4 h-4 mr-2" /> Push
          </Button>
          <Button variant="outline" size="sm" onClick={handleCreatePR} disabled={actionLoading} className="bg-blue-900/30 text-blue-400 border-blue-800/50 hover:bg-blue-900/50 hover:text-blue-300">
            <GitPullRequest className="w-4 h-4 mr-2" /> Crear PR
          </Button>
          <div className="w-px h-6 bg-zinc-700/50 mx-1" />
          <Button variant="outline" size="sm" onClick={() => executeAction('stash')} disabled={actionLoading} className="bg-zinc-800 border-zinc-700/50 hover:bg-zinc-700">
            <Archive className="w-4 h-4 mr-2" /> Stash
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleOpenGitIgnore()} disabled={actionLoading} className="bg-zinc-800 border-zinc-700/50 hover:bg-zinc-700">
            <FileText className="w-4 h-4 mr-2" /> .gitignore
          </Button>
          <Button variant="ghost" size="icon" onClick={refreshAll} disabled={loading} className="text-zinc-400 hover:text-white" aria-label="Refresh Git status">
            <RefreshCw className={`w-4 h-4 ${loading || isSyncLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </Button>
        </div>
        <div className="w-px h-6 bg-zinc-700 mx-2" />
        <div className="flex gap-2 flex-1 max-w-md relative">
          <Input
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Mensaje de commit..."
            className="h-8 bg-zinc-800 border-zinc-700/50 text-sm pr-8"
            disabled={isMergeInProgress || isGeneratingMessage}
          />
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-[85px] top-1 h-6 w-6 text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50"
            disabled={isMergeInProgress || isGeneratingMessage}
            onClick={handleGenerateCommitMessage}
            title="Generar mensaje con IA"
            aria-label="Generate commit message with AI"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isGeneratingMessage ? 'animate-pulse text-amber-400' : ''}`} aria-hidden="true" />
          </Button>
          <Button
            size="sm"
            onClick={() => executeAction('commit', commitMessage)}
            disabled={actionLoading || !commitMessage.trim() || isMergeInProgress || isGeneratingMessage}
            className="bg-blue-600 hover:bg-blue-700 h-8"
          >
            <Check className="w-4 h-4 mr-2" /> Commit
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={showDetails ? 60 : 100} minSize={30}>
            <div className="h-full overflow-auto bg-[#0a0a0a] p-4">
              {loading && (
                <div className="flex items-center justify-center h-full text-zinc-500">
                  <RefreshCw className="w-6 h-6 animate-spin mr-3" />
                  Cargando historial...
                </div>
              )}

              {!loading && commits.length > 0 && (
                <svg
                  width={SVG_WIDTH}
                  height={svgHeight}
                  style={{ overflow: 'visible', display: 'block' }}
                >
                  {/* Branch vertical line */}
                  <line
                    x1={LINE_X}
                    y1={HEADER_OFFSET + ROW_HEIGHT / 2}
                    x2={LINE_X}
                    y2={svgHeight - 24}
                    stroke={getBranchColor(activeBranch)}
                    strokeWidth={3}
                    strokeLinecap="round"
                  />

                  {/* Commit rows */}
                  {rows.map((row) => (
                    <g key={row.commit.hash}>
                      {/* Branch dot */}
                      <circle cx={DOT_X} cy={row.y} r={DOT_R} fill={getBranchColor(activeBranch)} stroke="#0a0a0a" strokeWidth={3} />
                      <line x1={DOT_X + DOT_R} y1={row.y} x2={CARD_X} y2={row.y} stroke={getBranchColor(activeBranch)} strokeWidth={1.5} strokeOpacity={0.4} />
                      
                      {row.isLatest && (
                        <foreignObject x={DOT_X - 26} y={row.y - 42} width={52} height={22}>
                          <div
                            style={{
                              background: getBranchColor(activeBranch), color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 6px',
                              textAlign: 'center', fontFamily: 'Inter, sans-serif', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              overflow: 'hidden', whiteSpace: 'nowrap', boxShadow: '0 2px 4px rgba(0,0,0,0.5)', width: '100%'
                            }}
                          >
                            {activeBranch}
                          </div>
                        </foreignObject>
                      )}

                      <foreignObject x={CARD_X} y={row.y - CARD_HEIGHT / 2} width={CARD_WIDTH} height={CARD_HEIGHT}>
                        <ContextMenu>
                          <ContextMenuTrigger>
                            <div
                              onClick={() => handleCommitClick(row.commit.hash)}
                              className="flex items-center justify-between h-full px-4 border border-zinc-700/50 rounded-lg cursor-pointer transition-colors hover:border-zinc-500"
                              style={{ background: !row.isLatest ? '#1a1a1a' : '#141414', boxSizing: 'border-box' }}
                            >
                              <div className="flex flex-col gap-1 min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="bg-blue-900/30 text-blue-400 text-[10px] font-mono px-1.5 py-0.5 rounded border border-blue-800/30 shrink-0">
                                    {row.commit.hash.substring(0, 7)}
                                  </span>
                                  <span className="text-zinc-200 text-[13px] font-medium truncate" title={row.commit.subject}>
                                    {truncate(row.commit.subject, 60)}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0 ml-4">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-4 h-4 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-300 text-[9px] font-bold shrink-0">
                                    {row.commit.author.charAt(0).toUpperCase()}
                                  </div>
                                  <span className="text-zinc-400 text-[11px] whitespace-nowrap">{truncate(row.commit.author, 18)}</span>
                                </div>
                                <span className="text-zinc-500 text-[10px] whitespace-nowrap">{formatDate(row.commit.date)}</span>
                              </div>
                            </div>
                          </ContextMenuTrigger>
                          <ContextMenuContent className="w-56 bg-zinc-800 border-zinc-700 text-zinc-200">
                            <ContextMenuGroup>
                              <ContextMenuItem onClick={() => handleCheckoutCommit(row.commit.hash)}>Checkout a este commit</ContextMenuItem>
                              <ContextMenuItem onClick={() => setNewBranchDialog({ open: true, startHash: row.commit.hash })}>Crear rama desde aquí</ContextMenuItem>
                              <ContextMenuItem onClick={() => handleRevertCommit(row.commit.hash)}>Revertir commit</ContextMenuItem>
                              <ContextMenuItem onClick={() => handleCherryPick(row.commit.hash)}>Cherry-pick</ContextMenuItem>
                              <ContextMenuSeparator className="bg-zinc-700" />
                              <ContextMenuSub>
                                <ContextMenuSubTrigger className="text-orange-400">Reset commit</ContextMenuSubTrigger>
                                <ContextMenuSubContent className="bg-zinc-800 border-zinc-700 text-zinc-200">
                                  <ContextMenuGroup>
                                    <ContextMenuItem onClick={() => promptReset(row.commit.hash, 'soft')}>Reset --soft</ContextMenuItem>
                                    <ContextMenuItem onClick={() => promptReset(row.commit.hash, 'mixed')}>Reset --mixed</ContextMenuItem>
                                    <ContextMenuItem onClick={() => promptReset(row.commit.hash, 'hard')} className="text-red-400">Reset --hard</ContextMenuItem>
                                  </ContextMenuGroup>
                                </ContextMenuSubContent>
                              </ContextMenuSub>
                            </ContextMenuGroup>
                          </ContextMenuContent>
                        </ContextMenu>
                      </foreignObject>
                    </g>
                  ))}
                </svg>
              )}
            </div>
          </ResizablePanel>

          {showDetails && (
            <>
              <ResizableHandle className="bg-zinc-800" />
              <ResizablePanel defaultSize={40} minSize={20}>
                <div className="h-full flex flex-col bg-zinc-900 border-l border-zinc-800/50 relative">
                  <Button variant="ghost" size="sm" className="absolute right-4 top-4 h-8 w-8 p-0 text-zinc-400 hover:text-white rounded-full bg-zinc-800" onClick={() => setShowDetails(false)}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                    </svg>
                  </Button>

                  {detailsLoading ? (
                    <div className="p-8 text-center text-zinc-400"><RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />Cargando...</div>
                  ) : commitDetails && !commitDetails.error ? (
                    <div className="flex flex-col h-full">
                      <div className="p-6 border-b border-zinc-800/50">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-300 font-bold border border-zinc-700/50">{commitDetails.author.charAt(0).toUpperCase()}</div>
                          <div><h3 className="font-semibold text-zinc-200">{commitDetails.author}</h3><p className="text-xs text-zinc-500">{new Date(commitDetails.date).toLocaleString()}</p></div>
                        </div>
                        <div className="bg-[#0d0d0d] p-4 rounded-lg border border-zinc-800/50"><p className="text-zinc-300 text-sm whitespace-pre-wrap break-words">{commitDetails.message}</p></div>
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <span className="px-2 py-1 bg-zinc-800 text-zinc-400 rounded text-xs font-mono border border-zinc-700/50 mr-2">
                            {commitDetails.hash.substring(0, 7)}
                          </span>
                          <Button 
                            variant="outline" size="sm" 
                            onClick={() => handleCheckoutCommit(commitDetails.hash)} 
                            className="h-7 text-xs bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-zinc-300"
                          >
                            Checkout
                          </Button>
                          <Button 
                            variant="outline" size="sm" 
                            onClick={() => handleRevertCommit(commitDetails.hash)} 
                            className="h-7 text-xs bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-zinc-300"
                          >
                            Revertir (Deshacer)
                          </Button>
                          <Button 
                            variant="outline" size="sm" 
                            onClick={() => promptReset(commitDetails.hash, 'hard')} 
                            className="h-7 text-xs bg-red-950/20 border-red-900/50 text-red-400 hover:bg-red-900/40 hover:text-red-300"
                          >
                            Regresar a este commit (Reset)
                          </Button>
                        </div>
                      </div>
                      <div className="flex-1 overflow-auto p-0">
                        <div className="px-6 py-4 bg-zinc-900 sticky top-0 border-b border-zinc-800/50 z-10"><h4 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Archivos Modificados ({commitDetails.files.length})</h4></div>
                        <ul className="divide-y divide-zinc-800">
                          {commitDetails.files.map((file: CommitFile, i: number) => (
                            <li key={i} className="px-6 py-3 hover:bg-zinc-800/50 cursor-pointer flex items-center gap-3 transition-colors" onClick={() => openDiff(commitDetails.hash, file.path)}>
                              {getFileIcon(file.status)}<span className="text-sm text-zinc-300 truncate">{file.path}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-zinc-500 p-8 text-center"><div><GitCommit className="w-12 h-12 mx-auto mb-4 opacity-20" /><p>Selecciona un commit en el grafo<br />para ver sus detalles.</p></div></div>
                  )}
                </div>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={!!confirmDialog} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-200 sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{confirmDialog?.title}</DialogTitle>
            <DialogDescription className="text-zinc-400 pt-2">{confirmDialog?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-transparent border-t border-zinc-800 mt-4">
            <Button variant="outline" onClick={() => setConfirmDialog(null)} className="bg-transparent border-zinc-700 hover:bg-zinc-800 text-zinc-300">Cancelar</Button>
            <Button 
              variant={confirmDialog?.destructive ? "destructive" : "default"} 
              onClick={confirmDialog?.onConfirm}
              className={confirmDialog?.destructive ? "bg-red-600 hover:bg-red-700 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Branch Dialog */}
      <Dialog open={newBranchDialog.open} onOpenChange={(open) => !open && setNewBranchDialog({ open: false })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-200 sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Nueva Rama</DialogTitle>
            <DialogDescription className="text-zinc-400 pt-2">
              Ingresa el nombre para la nueva rama {newBranchDialog.startHash ? `desde el commit ${newBranchDialog.startHash.substring(0,7)}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input 
              value={newBranchName} 
              onChange={(e) => setNewBranchName(e.target.value)} 
              placeholder="Ej: feature/login" 
              className="bg-zinc-800 border-zinc-700" 
              autoFocus 
              onKeyDown={(e) => e.key === 'Enter' && handleCreateBranch()}
            />
          </div>
          <DialogFooter className="bg-transparent border-t border-zinc-800 mt-4">
            <Button variant="outline" onClick={() => setNewBranchDialog({ open: false })} className="bg-transparent border-zinc-700 hover:bg-zinc-800 text-zinc-300">Cancelar</Button>
            <Button onClick={handleCreateBranch} disabled={!newBranchName.trim()} className="bg-blue-600 hover:bg-blue-700 text-white">Crear Rama</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para Merge */}
      <Dialog open={mergeDialog} onOpenChange={setMergeDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-200 sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Fusionar Rama (Merge)</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Selecciona la rama que deseas fusionar hacia la rama actual ({activeBranch}).
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select onValueChange={(val) => setMergeSource(val || '')} value={mergeSource}>
              <SelectTrigger className="w-full bg-zinc-800 border-zinc-700">
                <SelectValue placeholder="Selecciona la rama de origen" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-200">
                {otherBranches.map((b) => (
                  <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="bg-transparent border-t border-zinc-800 mt-4">
            <Button variant="ghost" onClick={() => setMergeDialog(false)} className="hover:bg-zinc-800 text-zinc-300">Cancelar</Button>
            <Button onClick={handleMergeBranch} disabled={actionLoading || !mergeSource} className="bg-blue-600 hover:bg-blue-700 text-white">
              {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : 'Fusionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Branch Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, branch: '' })}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-200 sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Eliminar Rama (Delete)</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Selecciona la rama que deseas eliminar.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select onValueChange={(val) => setDeleteDialog(prev => ({ ...prev, branch: val || '' }))} value={deleteDialog.branch}>
              <SelectTrigger className="w-full bg-zinc-950 border-zinc-800 text-zinc-200">
                <SelectValue placeholder="Seleccionar rama a eliminar" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-200 max-h-64">
                {otherBranches.map(b => (
                  <SelectItem key={b.name} value={b.name} className="hover:bg-zinc-700 cursor-pointer">
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="bg-transparent border-t border-zinc-800 mt-4">
            <Button variant="ghost" onClick={() => setDeleteDialog({ open: false, branch: '' })} className="hover:bg-zinc-800 text-zinc-300">Cancelar</Button>
            <Button onClick={handleDeleteBranch} disabled={actionLoading || !deleteDialog.branch} className="bg-red-600 hover:bg-red-700 text-white">
              {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={gitIgnoreDialog} onOpenChange={setGitIgnoreDialog}>
        <DialogContent className="max-w-2xl bg-zinc-900 border-zinc-800 text-zinc-200">
          <DialogHeader>
            <DialogTitle>Gestionar .gitignore</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Edita las reglas de exclusión de Git. Cada línea es un patrón.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {gitIgnoreLoading ? (
              <div className="flex items-center justify-center p-8">
                <RefreshCw className="w-6 h-6 animate-spin text-zinc-500" />
              </div>
            ) : (
              <textarea
                value={gitIgnoreContent}
                onChange={(e) => setGitIgnoreContent(e.target.value)}
                className="w-full h-64 bg-zinc-950 border border-zinc-800 rounded-md p-4 font-mono text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-none"
                placeholder="node_modules/&#10;.env&#10;*.log"
              />
            )}
          </div>
          <DialogFooter className="bg-transparent border-t border-zinc-800 mt-4">
            <Button variant="ghost" onClick={() => setGitIgnoreDialog(false)} className="hover:bg-zinc-800 text-zinc-300">Cancelar</Button>
            <Button onClick={handleSaveGitIgnore} disabled={gitIgnoreSaving || gitIgnoreLoading} className="bg-blue-600 hover:bg-blue-700 text-white">
              {gitIgnoreSaving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : 'Guardar Cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Remote Dialog */}
      <Dialog open={isRemoteDialogOpen} onOpenChange={setIsRemoteDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-100 max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular Repositorio Remoto</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Ingresa la URL de tu repositorio en GitHub o GitLab (HTTPS o SSH) para habilitar Pull Requests y sincronización.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">URL del Repositorio</label>
              <Input
                autoFocus
                placeholder="https://github.com/usuario/repo.git"
                className="bg-zinc-800 border-zinc-700 text-zinc-200"
                value={remoteUrlInput}
                onChange={e => setRemoteUrlInput(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="bg-transparent border-t border-zinc-800 mt-4">
            <Button variant="ghost" className="hover:bg-zinc-800 text-zinc-300" onClick={() => setIsRemoteDialogOpen(false)} disabled={actionLoading}>
              Cancelar
            </Button>
            <Button variant="default" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSaveRemote} disabled={actionLoading || !remoteUrlInput.trim()}>
              {actionLoading ? 'Verificando...' : 'Vincular y Verificar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
