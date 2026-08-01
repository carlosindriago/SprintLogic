import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuGroup } from '@/components/ui/dropdown-menu';
import { Download, Upload, Check, RefreshCw, Archive, FileText, ChevronDown, Plus, GitBranch, Trash, GitPullRequest, Globe } from 'lucide-react';

interface GitToolbarProps {
  projectId: string;
  currentBranch: string;
  allBranches: Array<{ name: string; is_current?: boolean; ahead?: number; behind?: number; is_local_only?: boolean }>;
  stagedCount: number;
  isMergeInProgress: boolean | undefined;
  actionLoading: boolean;
  onAction: (action: string, message?: string) => void;
  onBranchCheckout: (branch: string) => void;
  onOpenNewBranch: () => void;
  onOpenMerge: () => void;
  onOpenDelete: (branch: string) => void;
  onOpenRemote: () => void;
  onOpenGitignore: () => void;
  onRefresh: () => void;
  onCreatePR: () => void;
  syncState: { ahead?: number; behind?: number; can_push?: boolean; can_pull?: boolean } | null;
  isSyncLoading: boolean;
  remoteUrl: string | null;
}

export default function GitToolbar({
  currentBranch,
  allBranches,
  isMergeInProgress,
  actionLoading,
  onAction,
  onBranchCheckout,
  onOpenNewBranch,
  onOpenMerge,
  onOpenDelete,
  onOpenRemote,
  onOpenGitignore,
  onRefresh,
  onCreatePR,
  syncState,
  isSyncLoading,
}: GitToolbarProps) {
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex h-8 px-3 text-xs justify-center rounded-md font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 border bg-zinc-800 border-zinc-700/50 hover:bg-zinc-700 items-center gap-2 min-w-[140px]">
          <span className="truncate">{currentBranch}</span>
          {syncState && (syncState.ahead! > 0 || syncState.behind! > 0) && (
            <div className="flex gap-1 text-xs px-1">
              {syncState.ahead! > 0 && <span className="text-green-400">↑{syncState.ahead}</span>}
              {syncState.behind! > 0 && <span className="text-red-400">↓{syncState.behind}</span>}
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
                onClick={() => onBranchCheckout(b.name)}
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
              onClick={onOpenNewBranch}
              className="cursor-pointer text-blue-400 hover:text-blue-300 hover:bg-blue-400/10 focus:bg-blue-400/10"
            >
              <Plus className="w-4 h-4 mr-2" /> Nueva Rama
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-zinc-700" />
            <DropdownMenuItem 
              onClick={onOpenMerge}
              className="cursor-pointer text-orange-400 hover:text-orange-300 hover:bg-orange-400/10 focus:bg-orange-400/10"
            >
              <GitBranch className="w-4 h-4 mr-2" /> Hacer Merge...
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-zinc-700" />
            <DropdownMenuItem 
              onClick={() => onOpenDelete('')}
              className="cursor-pointer text-red-400 hover:text-red-300 hover:bg-red-400/10 focus:bg-red-400/10"
            >
              <Trash className="w-4 h-4 mr-2" /> Eliminar Rama...
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-zinc-700" />
            <DropdownMenuItem 
              onClick={onOpenRemote}
              className="cursor-pointer text-zinc-300 hover:text-white hover:bg-zinc-700 focus:bg-zinc-700"
            >
              <Globe className="w-4 h-4 mr-2" /> Vincular Remoto...
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="w-px h-6 bg-zinc-700 mx-1" />

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => onAction('pull')} disabled={actionLoading || isMergeInProgress} className="bg-zinc-800 border-zinc-700/50 hover:bg-zinc-700">
          <Download className="w-4 h-4 mr-2" /> Pull
        </Button>
        <Button variant="outline" size="sm" onClick={() => onAction('push')} disabled={actionLoading || isMergeInProgress} className="bg-zinc-800 border-zinc-700/50 hover:bg-zinc-700">
          <Upload className="w-4 h-4 mr-2" /> Push
        </Button>
        <Button variant="outline" size="sm" onClick={onCreatePR} disabled={actionLoading} className="bg-blue-900/30 text-blue-400 border-blue-800/50 hover:bg-blue-900/50 hover:text-blue-300">
          <GitPullRequest className="w-4 h-4 mr-2" /> Crear PR
        </Button>
        <div className="w-px h-6 bg-zinc-700/50 mx-1" />
        <Button variant="outline" size="sm" onClick={() => onAction('stash')} disabled={actionLoading} className="bg-zinc-800 border-zinc-700/50 hover:bg-zinc-700">
          <Archive className="w-4 h-4 mr-2" /> Stash
        </Button>
        <Button variant="outline" size="sm" onClick={onOpenGitignore} disabled={actionLoading} className="bg-zinc-800 border-zinc-700/50 hover:bg-zinc-700">
          <FileText className="w-4 h-4 mr-2" /> .gitignore
        </Button>
        <Button variant="ghost" size="icon" onClick={onRefresh} disabled={actionLoading} className="text-zinc-400 hover:text-white" aria-label="Refresh Git status">
          <RefreshCw className={`w-4 h-4 ${actionLoading || isSyncLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
        </Button>
      </div>
      <div className="w-px h-6 bg-zinc-700 mx-2" />
    </>
  );
}
