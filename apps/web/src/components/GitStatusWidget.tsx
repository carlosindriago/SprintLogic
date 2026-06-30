import { useState, useEffect, useCallback } from 'react';
import { GitBranch, GitCommit } from 'lucide-react';
import { useTabsStore } from '@/store/tabsStore';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getGitStatus } from '@/lib/api';
import { GitStatus } from '@/types';

export default function GitStatusWidget({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const { addTab } = useTabsStore();

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getGitStatus(projectId);
      setStatus(data);
    } catch (e) {
      console.error("Failed to fetch git status", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    let active = true;
    
    const loadData = async () => {
      if (active) setLoading(true);
      await fetchStatus();
    };

    loadData();
    const interval = setInterval(fetchStatus, 5000); // Poll every 5s
    
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [projectId, fetchStatus]);

  const openGitGraph = () => {
    addTab({
      id: 'git-graph',
      title: 'Control Git',
      type: 'git-graph'
    });
  };

  if (!projectId || loading) return null;

  return (
    <Card className="bg-zinc-800 border-zinc-700/50 text-zinc-200 mt-auto shrink-0">
      <CardHeader className="p-3 pb-0">
        <CardTitle className="text-xs font-medium flex items-center justify-between">
          <span className="flex items-center gap-1.5"><GitBranch className="w-3.5 h-3.5" /> Git Status</span>
          {status && status.modified !== undefined && status.untracked !== undefined && (status.modified > 0 || status.untracked > 0) && (
             <span className="bg-amber-500/20 text-amber-500 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
               {status.modified + status.untracked}
             </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 flex flex-col gap-2">
        {status && !status.error ? (
          <>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-400">Rama:</span>
              <span className="font-mono bg-zinc-900 px-1.5 py-0.5 rounded text-blue-400 truncate flex-1">{status.branch}</span>
            </div>
            
            <Button 
              variant="default" 
              size="sm" 
              className="w-full bg-zinc-700 hover:bg-zinc-600 h-7 text-xs flex gap-1.5"
              onClick={openGitGraph}
            >
              <GitCommit className="w-3.5 h-3.5" /> Abrir Sala de Control
            </Button>
          </>
        ) : (
          <div className="text-xs text-zinc-400">Error al leer repositorio Git.</div>
        )}
      </CardContent>
    </Card>
  );
}
