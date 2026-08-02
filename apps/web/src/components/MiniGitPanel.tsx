"use client";

import { useEffect } from "react";
import { useGitStore } from "@/store/gitStore";
import { useProjectStore } from "@/store/projectStore";
import { useTabsStore } from "@/store/tabsStore";
import { useLayoutStore } from "@/store/layoutStore";
import { Button } from "@/components/ui/button";
import { GitBranch, Loader2, ArrowRight } from "lucide-react";

export default function MiniGitPanel() {
  const projectId = useProjectStore((s) => s.projectId);
  const {
    currentBranch,
    modified,
    untracked,
    stagedFiles,
    modifiedFiles,
    untrackedFiles,
    isLoading,
    error,
    fetchDashboard,
  } = useGitStore();
  const addTab = useTabsStore((s) => s.addTab);
  const { isDrawerOpen, toggleDrawer } = useLayoutStore();

  useEffect(() => {
    if (projectId) {
      fetchDashboard(projectId);
    }
  }, [projectId, fetchDashboard]);

  const handleOpenGitStudio = () => {
    addTab({ id: "git-graph", title: "Git Studio", type: "git-graph" });
    if (isDrawerOpen) toggleDrawer();
  };

  if (!projectId) {
    return (
      <div className="p-4 text-zinc-500 text-sm">
        Seleccioná un proyecto para ver Git.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 space-y-3">
        <p className="text-xs text-red-400">{error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchDashboard(projectId)}
          className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs"
        >
          Reintentar
        </Button>
      </div>
    );
  }

  const modifiedCount = modifiedFiles.length || modified;
  const stagedCount = stagedFiles.length;
  const untrackedCount = untrackedFiles.length || untracked;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg">
        <div className="flex items-center gap-2 text-sm text-zinc-300">
          <GitBranch className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="font-mono truncate">{currentBranch}</span>
        </div>
      </div>

      <div className="space-y-2">
        {modifiedCount > 0 && (
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-yellow-500/70" />
              Modificados
            </span>
            <span className="font-mono text-zinc-300">{modifiedCount}</span>
          </div>
        )}
        {stagedCount > 0 && (
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500/70" />
              Staged
            </span>
            <span className="font-mono text-zinc-300">{stagedCount}</span>
          </div>
        )}
        {untrackedCount > 0 && (
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-zinc-500/70" />
              Sin seguimiento
            </span>
            <span className="font-mono text-zinc-300">{untrackedCount}</span>
          </div>
        )}
        {modifiedCount === 0 && stagedCount === 0 && untrackedCount === 0 && (
          <p className="text-xs text-zinc-500">Directorio limpio</p>
        )}
      </div>

      <Button
        onClick={handleOpenGitStudio}
        className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm gap-2"
      >
        <ArrowRight className="w-4 h-4" />
        Abrir Git Studio
      </Button>
    </div>
  );
}