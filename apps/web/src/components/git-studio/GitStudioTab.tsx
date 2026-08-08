'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, FilePlus, FileMinus, FileText, AlertTriangle } from 'lucide-react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { API_BASE_URL, getCommitDetails, getFileContent, saveFileContent } from '@/lib/api';
import { useTabsStore } from '@/store/tabsStore';
import { useGitStore } from '@/store/gitStore';
import { CommitDetails, CommitFile } from '@/types';
import { toast } from 'sonner';
import { useGitSyncStatus } from '@/hooks/useGitSyncStatus';
import { checkoutHead, createBranch, deleteBranch, resetCommit, revertCommit, cherryPick, getBranches, getRemoteUrl, addRemoteUrl } from '@/lib/git-actions';

import CommitGraph from './CommitGraph';
import StagingArea from './StagingArea';
import GitDiffView from './GitDiffView';


import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import GitDashboard from './GitDashboard';
import AIAuditPanel from '../AIAuditPanel';
import CommitInput from './CommitInput';
import GitToolbar from './GitToolbar';

  // ── Render ───────────────────────────────────────────────────────────────────

// ─── Main component ───────────────────────────────────────────────────────────
export default function GitStudioTab({ projectId }: { projectId: string }) {
  const { commits, currentBranch: activeBranch, fetchCommits, selectedFile, setSelectedFile } = useGitStore();
  const [allBranches, setAllBranches] = useState<Array<{
    name: string;
    is_current?: boolean;
    ahead?: number;
    behind?: number;
    is_local_only?: boolean;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const otherBranches = useMemo(() => allBranches.filter(b => b.name !== activeBranch), [allBranches, activeBranch]);
  const [actionLoading, setActionLoading] = useState(false);
  
  
  const [commitDetails, setCommitDetails] = useState<CommitDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(true);
  const [activeTab, setActiveTab] = useState<'local' | 'cloud' | 'mission-control'>('local');
  

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
  const loadCommits = useCallback(async () => {
    try {
      setLoading(true);
      await fetchCommits(projectId);
    } catch (e) {
      console.error(`Fetch error: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [projectId, fetchCommits]);

  const fetchBranches = useCallback(async () => {
    const res = await getBranches(projectId);
    if (res.ok && 'data' in res && res.data) {
      setAllBranches(res.data.branches || []);
    }
  }, [projectId]);

  const refreshAll = useCallback(() => {
    loadCommits();
    fetchBranches();
    refreshSyncStatus();
    useGitStore.getState().fetchDashboard(projectId);
  }, [loadCommits, fetchBranches, refreshSyncStatus, projectId]);

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
    setSelectedFile(null);
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

  const getFileIcon = (status: string) => {
    if (status.startsWith('A')) return <FilePlus className="w-4 h-4 text-green-500" />;
    if (status.startsWith('D')) return <FileMinus className="w-4 h-4 text-red-500" />;
    return <FileText className="w-4 h-4 text-yellow-500" />;
  };

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
        
        <GitToolbar
          projectId={projectId}
          currentBranch={activeBranch}
          allBranches={allBranches}
          stagedCount={useGitStore.getState().stagedFiles?.length ?? 0}
          isMergeInProgress={isMergeInProgress}
          actionLoading={actionLoading}
          onAction={executeAction}
          onBranchCheckout={handleCheckoutBranch}
          onOpenNewBranch={() => setNewBranchDialog({ open: true })}
          onOpenMerge={() => setMergeDialog(true)}
          onOpenDelete={(branch) => setDeleteDialog({ open: true, branch })}
          onOpenRemote={handleOpenRemoteConfig}
          onOpenGitignore={handleOpenGitIgnore}
          onRefresh={refreshAll}
          onCreatePR={handleCreatePR}
          syncState={syncState}
          isSyncLoading={isSyncLoading}
          remoteUrl={remoteUrlInput}
        />

        <CommitInput 
          projectId={projectId} 
          stagedCount={useGitStore.getState().stagedFiles?.length ?? 0} 
          onCommitSuccess={refreshAll}
          isMergeInProgress={isMergeInProgress}
        />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Tabs Header */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800/50 bg-zinc-900/50">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setActiveTab('local')}
            className={`h-8 rounded-full px-4 ${activeTab === 'local' ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700/50' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}
          >
            Local (Staging & Grafo)
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setActiveTab('cloud')}
            className={`h-8 rounded-full px-4 ${activeTab === 'cloud' ? 'bg-blue-900/30 text-blue-400 shadow-sm border border-blue-800/50' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}
          >
            Nube (Pull Requests & CI)
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setActiveTab('mission-control')}
            className={`h-8 rounded-full px-4 ${activeTab === 'mission-control' ? 'bg-purple-900/30 text-purple-400 shadow-sm border border-purple-800/50' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}
          >
            Mission Control
          </Button>
        </div>

        <div className="flex-1 overflow-hidden">
          {activeTab === 'local' ? (
            <ResizablePanelGroup direction="vertical" id="git-studio-vertical-layout">
              
              <ResizablePanel defaultSize={45} minSize={30} maxSize={60} className="bg-[#0a0a0a] flex flex-col">
                <StagingArea projectId={projectId} />
              </ResizablePanel>

          <ResizableHandle className="bg-zinc-800" withHandle />

          <ResizablePanel defaultSize={55} minSize={30}>
            <ResizablePanelGroup direction="horizontal" id="git-studio-horizontal-layout">
              <ResizablePanel defaultSize={showDetails || selectedFile ? 40 : 100} minSize={30}>
                <div className="h-full overflow-auto bg-[#0a0a0a] p-4">
                  {loading && (
                    <div className="flex items-center justify-center h-full text-zinc-500">
                      <RefreshCw className="w-6 h-6 animate-spin mr-3" />
                      Cargando historial...
                    </div>
                  )}

                  {!loading && commits.length > 0 && (
                    <CommitGraph
                      commits={commits}
                      activeBranch={activeBranch}
                      handleCommitClick={handleCommitClick}
                      handleCheckoutCommit={handleCheckoutCommit}
                      setNewBranchDialog={setNewBranchDialog}
                      handleRevertCommit={handleRevertCommit}
                      handleCherryPick={handleCherryPick}
                      promptReset={promptReset}
                    />
                  )}
                </div>
              </ResizablePanel>

          {(showDetails || selectedFile) && (
            <>
              <ResizableHandle className="bg-zinc-800" withHandle />
              <ResizablePanel defaultSize={40} minSize={20}>
                {selectedFile ? (
                  <GitDiffView projectId={projectId} />
                ) : (
                  <div className="h-full flex flex-col bg-zinc-900 border-l border-zinc-800/50 relative">
                    <Button variant="ghost" size="sm" className="absolute right-4 top-4 h-8 w-8 p-0 text-zinc-400 hover:text-white rounded-full bg-zinc-800" onClick={() => setShowDetails(false)} aria-label="Cerrar detalles" title="Cerrar detalles">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
                      <div className="flex-1 flex items-center justify-center text-zinc-500 p-8 text-center"><div><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12 mx-auto mb-4 opacity-20"><circle cx="12" cy="12" r="3"/><line x1="3" x2="9" y1="12" y2="12"/><line x1="15" x2="21" y1="12" y2="12"/></svg><p>Selecciona un commit en el grafo<br />para ver sus detalles.</p></div></div>
                    )}
                  </div>
                )}
              </ResizablePanel>
            </>
          )}
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
          ) : activeTab === 'cloud' ? (
            <GitDashboard projectId={projectId} />
          ) : (
            <AIAuditPanel projectId={projectId} />
          )}
        </div>
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
