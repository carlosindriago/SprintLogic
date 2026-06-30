import { useState, useEffect } from 'react';
import { Gitgraph, templateExtend, TemplateName } from '@gitgraph/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, Upload, Check, Archive, RefreshCw, FileText, FilePlus, FileMinus, GitCommit } from 'lucide-react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { getCommitDetails } from '@/lib/api';
import { useTabsStore } from '@/store/tabsStore';

export default function GitGraphTab({ projectId }: { projectId: string }) {
  const [commits, setCommits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [commitMessage, setCommitMessage] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedCommit, setSelectedCommit] = useState<any | null>(null);
  const [commitDetails, setCommitDetails] = useState<any | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(true);
  
  const addTab = useTabsStore((state) => state.addTab);

  const fetchCommits = async () => {
    try {
      setLoading(true);
      const res = await fetch(`http://127.0.0.1:8000/api/v1/projects/${projectId}/git/log`);
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
      const res = await fetch(`http://127.0.0.1:8000/api/v1/projects/${projectId}/git/action`, {
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

  const handleCommitClick = async (hash: string) => {
    setSelectedCommit(hash);
    setShowDetails(true);
    setDetailsLoading(true);
    setCommitDetails(null);
    try {
      const details = await getCommitDetails(projectId, hash);
      setCommitDetails(details);
    } catch (error) {
      console.error("Failed to fetch commit details:", error);
    } finally {
      setDetailsLoading(false);
    }
  };

  const openDiff = (hash: string, filePath: string) => {
    addTab({
      id: `diff-${hash}-${filePath}`,
      title: `${filePath.split('/').pop()} (Diff)`,
      type: 'diff',
      data: { hash, filePath }
    });
  };

  const getFileIcon = (status: string) => {
    if (status.startsWith('A')) return <FilePlus className="w-4 h-4 text-green-500" />;
    if (status.startsWith('D')) return <FileMinus className="w-4 h-4 text-red-500" />;
    return <FileText className="w-4 h-4 text-yellow-500" />; // Modified (M) or others
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] text-zinc-200">
      <div className="flex items-center gap-4 p-4 border-b border-zinc-800/50 bg-zinc-900 shrink-0">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => executeAction('pull')} disabled={actionLoading} className="bg-zinc-800 border-zinc-700/50 hover:bg-zinc-700">
            <Download className="w-4 h-4 mr-2" /> Pull
          </Button>
          <Button variant="outline" size="sm" onClick={() => executeAction('push')} disabled={actionLoading} className="bg-zinc-800 border-zinc-700/50 hover:bg-zinc-700">
            <Upload className="w-4 h-4 mr-2" /> Push
          </Button>
          <Button variant="outline" size="sm" onClick={() => executeAction('stash')} disabled={actionLoading} className="bg-zinc-800 border-zinc-700/50 hover:bg-zinc-700">
            <Archive className="w-4 h-4 mr-2" /> Stash
          </Button>
          <Button variant="ghost" size="icon" onClick={fetchCommits} disabled={loading} className="text-zinc-400 hover:text-white">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <div className="w-px h-6 bg-zinc-700 mx-2" />
        <div className="flex gap-2 flex-1 max-w-md">
          <Input 
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Mensaje de commit..." 
            className="h-8 bg-zinc-800 border-zinc-700/50 text-sm"
          />
          <Button size="sm" onClick={() => executeAction('commit', commitMessage)} disabled={actionLoading || !commitMessage.trim()} className="bg-blue-600 hover:bg-blue-700 h-8">
            <Check className="w-4 h-4 mr-2" /> Commit
          </Button>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up-fade {
          animation: slideUpFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        /* Custom hover effects for GitGraph SVG elements */
        .gitgraph-container svg circle {
          transition: transform 0.2s ease, stroke-width 0.2s ease, filter 0.2s ease;
          transform-origin: center;
          cursor: pointer;
        }
        .gitgraph-container svg circle:hover {
          transform: scale(1.35);
          stroke-width: 4px !important;
          filter: drop-shadow(0 0 8px rgba(139, 92, 246, 0.6));
        }
        .gitgraph-container svg path {
          stroke-linecap: round;
        }
        .gitgraph-container text {
          transition: opacity 0.2s;
        }
        .gitgraph-container g:hover > text {
          opacity: 1 !important;
        }
      `}} />

      <div className="flex-1 overflow-hidden animate-slide-up-fade">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={showDetails ? 60 : 100} minSize={30}>
            <div className="h-full overflow-auto flex justify-start bg-[#0d0d0d] gitgraph-container">
              {!loading && commits.length > 0 && (
                <div className="min-w-full min-h-full w-max bg-zinc-900/80 p-8 shadow-2xl">
                  <Gitgraph key={commits.length > 0 ? commits[0].hash : "empty"}
                    options={{
                      template: templateExtend(TemplateName.Metro, {
                        colors: ['#8b5cf6', '#3b82f6', '#ec4899', '#10b981', '#f59e0b'],
                        branch: {
                          lineWidth: 5,
                          spacing: 45,
                        },
                        commit: {
                          spacing: 55,
                          message: {
                            displayAuthor: true,
                            displayHash: true,
                            color: '#e2e8f0',
                            font: 'normal 14px "Inter", sans-serif'
                          },
                          dot: {
                            size: 10,
                            strokeWidth: 3,
                            strokeColor: '#0f172a'
                          }
                        }
                      })
                    }}
                  >
                    {(gitgraph) => {
                      const master = gitgraph.branch("main");
                      const reversed = [...commits].reverse();
                      
                      const truncate = (str: string, max: number) => 
                        str.length > max ? str.substring(0, max) + '...' : str;

                      reversed.forEach(c => {
                        master.commit({
                          hash: c.hash.substring(0, 7),
                          subject: truncate(c.subject, 65),
                          author: truncate(c.author, 20),
                          onClick: () => handleCommitClick(c.hash)
                        });
                      });
                    }}
                  </Gitgraph>
                </div>
              )}
              
              {!loading && commits.length === 0 && (
                <div className="text-zinc-500 mt-20 text-center">
                  No se encontraron commits o error al cargar historial de Git.
                </div>
              )}
            </div>
          </ResizablePanel>
          
          {showDetails && (
            <>
              <ResizableHandle className="bg-zinc-800" />
              <ResizablePanel defaultSize={40} minSize={20}>
                <div className="h-full flex flex-col bg-zinc-900 border-l border-zinc-800/50 relative">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="absolute right-4 top-4 h-8 w-8 p-0 text-zinc-400 hover:text-white rounded-full bg-zinc-800"
                    onClick={() => setShowDetails(false)}
                    title="Cerrar Detalles"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </Button>
                  {detailsLoading ? (
                <div className="p-8 text-center text-zinc-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Cargando detalles...
                </div>
              ) : commitDetails ? (
                <div className="flex flex-col h-full">
                  <div className="p-6 border-b border-zinc-800/50">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-300 font-bold border border-zinc-700/50">
                        {commitDetails.author.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-semibold text-zinc-200">{commitDetails.author}</h3>
                        <p className="text-xs text-zinc-500">{new Date(commitDetails.date).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="bg-[#0d0d0d] p-4 rounded-lg border border-zinc-800/50">
                      <p className="text-zinc-300 text-sm whitespace-pre-wrap break-words">{commitDetails.message}</p>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <span className="px-2 py-1 bg-zinc-800 text-zinc-400 rounded text-xs font-mono border border-zinc-700/50">
                        {commitDetails.hash.substring(0, 7)}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-auto p-0">
                    <div className="px-6 py-4 bg-zinc-900 sticky top-0 border-b border-zinc-800/50 z-10">
                      <h4 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                        Archivos Modificados ({commitDetails.files.length})
                      </h4>
                    </div>
                    <ul className="divide-y divide-zinc-800">
                      {commitDetails.files.map((file: any, i: number) => (
                        <li 
                          key={i} 
                          className="px-6 py-3 hover:bg-zinc-800/50 cursor-pointer flex items-center gap-3 transition-colors"
                          onClick={() => openDiff(commitDetails.hash, file.path)}
                        >
                          {getFileIcon(file.status)}
                          <span className="text-sm text-zinc-300 truncate" title={file.path}>
                            {file.path}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-zinc-500 p-8 text-center">
                  <div>
                    <GitCommit className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>Selecciona un commit en el grafo<br/>para ver sus detalles.</p>
                  </div>
                </div>
              )}
            </div>
          </ResizablePanel>
          </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
