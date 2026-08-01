import { useEffect, useState, useCallback } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { RefreshCw, GitPullRequest, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PR {
  id: string;
  number: number;
  title: string;
  author: string;
  state: string;
  url: string;
  created_at: string;
  ci_status: {
    status: string;
    description: string;
  };
}

export default function GitDashboard({ projectId }: { projectId: string }) {
  const [prs, setPrs] = useState<PR[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPRs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/git/pull-requests`);
      if (!res.ok) throw new Error('Failed to fetch pull requests');
      const data = await res.json();
      setPrs(data.pull_requests || []);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(String(err));
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPRs();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchPRs]);

  const ciSuccessCount = prs.filter(pr => pr.ci_status?.status === 'success').length;
  const successRate = prs.length > 0 ? Math.round((ciSuccessCount / prs.length) * 100) : 0;

  return (
    <div className="h-full bg-[#0a0a0a] text-zinc-200 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
              <GitPullRequest className="w-5 h-5 text-blue-400" />
              Nube (Pull Requests & CI)
            </h2>
            <p className="text-sm text-zinc-400 mt-1">
              Información sincronizada con el proveedor VCS
            </p>
          </div>
          <button 
            onClick={fetchPRs}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors flex items-center gap-2 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-zinc-900 border-zinc-800/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400 flex justify-between">
                Pull Requests Abiertos
                <GitPullRequest className="w-4 h-4 text-zinc-500" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-zinc-100">{prs.length}</div>
            </CardContent>
          </Card>
          
          <Card className="bg-zinc-900 border-zinc-800/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400 flex justify-between">
                Tasa de Éxito CI
                <CheckCircle className="w-4 h-4 text-zinc-500" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-zinc-100">{successRate}%</div>
              <p className="text-xs text-zinc-500 mt-1">Basado en PRs actuales</p>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400 flex justify-between">
                Commits Locales Pendientes
                <Clock className="w-4 h-4 text-zinc-500" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-500">3</div>
              <p className="text-xs text-zinc-500 mt-1">Ahead of origin/main</p>
            </CardContent>
          </Card>
        </div>

        {/* PR List */}
        <div className="bg-zinc-900 border border-zinc-800/50 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-zinc-800/50 bg-zinc-900/50">
            <h3 className="font-semibold text-zinc-300">Pull Requests Activos</h3>
          </div>
          
          {loading ? (
            <div className="p-8 text-center text-zinc-500">Cargando...</div>
          ) : error ? (
            <div className="p-8 text-center text-red-400">{error}</div>
          ) : prs.length === 0 ? (
            <div className="p-8 text-center text-zinc-500">No hay pull requests abiertos.</div>
          ) : (
            <ul className="divide-y divide-zinc-800/50">
              {prs.map(pr => (
                <li key={pr.id} className="p-4 hover:bg-zinc-800/30 transition-colors flex items-center justify-between">
                  <div>
                    <a href={pr.url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-400 hover:underline">
                      {pr.title}
                    </a>
                    <div className="text-xs text-zinc-500 mt-1 flex items-center gap-2">
                      <span>#{pr.number}</span>
                      <span>•</span>
                      <span>por {pr.author}</span>
                      <span>•</span>
                      <span>{new Date(pr.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {pr.ci_status?.status === 'success' ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded border border-emerald-400/20">
                        <CheckCircle className="w-3 h-3" />
                        {pr.ci_status.description || 'Success'}
                      </span>
                    ) : pr.ci_status ? (
                      <span className="flex items-center gap-1 text-xs text-red-400 bg-red-400/10 px-2 py-1 rounded border border-red-400/20">
                        <XCircle className="w-3 h-3" />
                        {pr.ci_status.description || 'Failed'}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-zinc-500 bg-zinc-800 px-2 py-1 rounded border border-zinc-700/50">
                        <Clock className="w-3 h-3" />
                        Pendiente
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
