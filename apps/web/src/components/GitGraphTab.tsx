import { useState, useEffect } from 'react';
import { Gitgraph, templateExtend, TemplateName } from '@gitgraph/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, Upload, Check, Archive, RefreshCw } from 'lucide-react';

export default function GitGraphTab({ projectId }: { projectId: string }) {
  const [commits, setCommits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [commitMessage, setCommitMessage] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchCommits = async () => {
    try {
      setLoading(true);
      const res = await fetch(`http://localhost:8000/api/v1/projects/${projectId}/git/log`);
      if (res.ok) {
        const data = await res.json();
        setCommits(data.commits || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCommits();
  }, [projectId]);

  const executeAction = async (action: string, message: string = "") => {
    try {
      setActionLoading(true);
      const res = await fetch(`http://localhost:8000/api/v1/projects/${projectId}/git/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, message })
      });
      if (res.ok) {
        if (action === 'commit') setCommitMessage("");
        fetchCommits();
      } else {
        const err = await res.json();
        alert(`Error: ${err.detail}`);
      }
    } catch (e) {
      console.error(e);
      alert("Error de red");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200">
      <div className="flex items-center gap-4 p-4 border-b border-slate-800 bg-slate-900 shrink-0">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => executeAction('pull')} disabled={actionLoading} className="bg-slate-800 border-slate-700 hover:bg-slate-700">
            <Download className="w-4 h-4 mr-2" /> Pull
          </Button>
          <Button variant="outline" size="sm" onClick={() => executeAction('push')} disabled={actionLoading} className="bg-slate-800 border-slate-700 hover:bg-slate-700">
            <Upload className="w-4 h-4 mr-2" /> Push
          </Button>
          <Button variant="outline" size="sm" onClick={() => executeAction('stash')} disabled={actionLoading} className="bg-slate-800 border-slate-700 hover:bg-slate-700">
            <Archive className="w-4 h-4 mr-2" /> Stash
          </Button>
          <Button variant="ghost" size="icon" onClick={fetchCommits} disabled={loading} className="text-slate-400 hover:text-white">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <div className="w-px h-6 bg-slate-700 mx-2" />
        <div className="flex gap-2 flex-1 max-w-md">
          <Input 
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Mensaje de commit..." 
            className="h-8 bg-slate-800 border-slate-700 text-sm"
          />
          <Button size="sm" onClick={() => executeAction('commit', commitMessage)} disabled={actionLoading || !commitMessage.trim()} className="bg-blue-600 hover:bg-blue-700 h-8">
            <Check className="w-4 h-4 mr-2" /> Commit
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8 flex justify-center">
        {!loading && commits.length > 0 && (
          <div className="bg-slate-900 p-8 rounded-xl border border-slate-800 min-w-[600px] w-full max-w-4xl shadow-xl">
            <Gitgraph
              options={{
                template: templateExtend(TemplateName.Metro, {
                  colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
                  commit: {
                    message: {
                      displayAuthor: true,
                      displayHash: true,
                      color: '#cbd5e1',
                      font: 'normal 12pt Inter'
                    },
                    dot: {
                      size: 6
                    }
                  }
                })
              }}
            >
              {(gitgraph) => {
                // VERY simplified version for rendering linear history
                // In a real scenario, we'd reconstruct the graph with parents
                // but @gitgraph/react expects us to script the graph building.
                
                // For this MVP, let's just create a main branch and add all commits sequentially
                // (GitGraph is better for drawing from scratch, not importing existing histories,
                // but we can fake it by drawing the commits in reverse order)
                
                const master = gitgraph.branch("main");
                
                // Commits come from backend sorted newest first
                // So we reverse to draw oldest first
                const reversed = [...commits].reverse();
                
                reversed.forEach(c => {
                  master.commit({
                    hash: c.hash.substring(0, 7),
                    subject: c.subject,
                    author: c.author,
                  });
                });
              }}
            </Gitgraph>
          </div>
        )}
        
        {!loading && commits.length === 0 && (
          <div className="text-slate-500 mt-20 text-center">
            No se encontraron commits o error al cargar historial de Git.
          </div>
        )}
      </div>
    </div>
  );
}
