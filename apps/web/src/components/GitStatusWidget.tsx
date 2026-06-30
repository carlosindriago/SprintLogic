import { useState, useEffect } from 'react';
import { GitBranch, GitCommit } from 'lucide-react';
import { useTabsStore } from '@/store/tabsStore';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function GitStatusWidget({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { addTab } = useTabsStore();

  const fetchStatus = async () => {
    try {
      const res = await fetch(`http://localhost:8000/api/v1/projects/${projectId}/git/status`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (e) {
      console.error("Failed to fetch git status", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      setLoading(true);
      fetchStatus();
      const interval = setInterval(fetchStatus, 5000); // Poll every 5s
      return () => clearInterval(interval);
    }
  }, [projectId]);

  const openGitGraph = () => {
    addTab({
      id: 'git-graph',
      title: 'Control Git',
      type: 'git-graph'
    });
  };

  if (!projectId || loading) return null;

  return (
    <Card className="bg-slate-800 border-slate-700 text-slate-200 mt-auto shrink-0">
      <CardHeader className="p-3 pb-0">
        <CardTitle className="text-xs font-medium flex items-center justify-between">
          <span className="flex items-center gap-1.5"><GitBranch className="w-3.5 h-3.5" /> Git Status</span>
          {status && (status.modified > 0 || status.untracked > 0) && (
             <span className="bg-amber-500/20 text-amber-500 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
               {status.modified + status.untracked}
             </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 flex flex-col gap-2">
        {status ? (
          <>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Rama:</span>
              <span className="font-mono bg-slate-900 px-1.5 py-0.5 rounded text-blue-400 truncate flex-1">{status.branch}</span>
            </div>
            
            <Button 
              variant="default" 
              size="sm" 
              className="w-full bg-slate-700 hover:bg-slate-600 h-7 text-xs flex gap-1.5"
              onClick={openGitGraph}
            >
              <GitCommit className="w-3.5 h-3.5" /> Abrir Sala de Control
            </Button>
          </>
        ) : (
          <div className="text-xs text-slate-400">Error al leer repositorio Git.</div>
        )}
      </CardContent>
    </Card>
  );
}
