import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, GitCommit, GitBranch, FolderGit2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { getProjectInsights } from '@/lib/api';
import { ProjectInsights, LanguageDistributionItem, Commit } from '@/types';

export default function InsightDashboard({ projectId }: { projectId: string }) {
  const [data, setData] = useState<ProjectInsights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const fetchInsights = async () => {
      try {
        if (active) setLoading(true);
        const result = await getProjectInsights(projectId);
        if (active) setData(result);
      } catch (e) {
        console.error(e);
      } finally {
        if (active) setLoading(false);
      }
    };

    if (projectId) {
      fetchInsights();
    }

    return () => {
      active = false;
    };
  }, [projectId]);

  // Dummy burn down data for the AreaChart
  const burndownData = useMemo(() => [
    { name: 'Day 1', tasks: 100 },
    { name: 'Day 2', tasks: 90 },
    { name: 'Day 3', tasks: 75 },
    { name: 'Day 4', tasks: 60 },
    { name: 'Day 5', tasks: 45 },
    { name: 'Day 6', tasks: 20 },
    { name: 'Day 7', tasks: data?.tasks_by_state?.todo || 0 },
  ], [data]);

  const COLORS = ['#3b82f6', '#d946ef', '#10b981', '#f59e0b', '#ef4444'];
  const langData = useMemo(() => data?.language_distribution && data.language_distribution.length > 0
    ? data.language_distribution
    : [{ name: 'N/A', value: 1 }], [data]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0d0d0d] text-zinc-400">
        <Activity className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0d0d0d] text-zinc-400">
        Error loading insights.
      </div>
    );
  }





  return (
    <div className="h-full w-full bg-[#0d0d0d] overflow-auto p-6 text-zinc-200">
      <div className="grid gap-6">
        
        {/* Row 1: KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <Card className="bg-zinc-900 border-zinc-800/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">Total Commits</CardTitle>
              <GitCommit className="w-4 h-4 text-zinc-500" />
            </CardHeader>
            <CardContent className="flex items-end justify-between">
              <div className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-blue-600">
                {data.total_commits}
              </div>
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                +12%
              </span>
            </CardContent>
          </Card>
          
          <Card className="bg-zinc-900 border-zinc-800/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">Ramas Activas</CardTitle>
              <GitBranch className="w-4 h-4 text-zinc-500" />
            </CardHeader>
            <CardContent className="flex items-end justify-between">
              <div className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-purple-600">
                {data.active_branches}
              </div>
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                +3
              </span>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">Tareas Pendientes</CardTitle>
              <FolderGit2 className="w-4 h-4 text-zinc-500" />
            </CardHeader>
            <CardContent className="flex items-end justify-between">
              <div className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-emerald-600">
                {data.tasks_by_state?.todo || 0}
              </div>
              <span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                -5%
              </span>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">Velocity (Pts)</CardTitle>
              <Activity className="w-4 h-4 text-zinc-500" />
            </CardHeader>
            <CardContent className="flex items-end justify-between">
              <div className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-400 to-orange-600">
                {data.velocity}
              </div>
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                +8%
              </span>
            </CardContent>
          </Card>
        </div>

        {/* Row 2: Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 h-[400px]">
          <Card className="bg-zinc-900 border-zinc-800/50 lg:col-span-3 flex flex-col min-w-0">
            <CardHeader>
              <CardTitle className="text-base md:text-lg text-zinc-300">Burndown de Tareas</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 min-w-0 pb-6 pl-0">
              {data.total_commits > 0 || (data.tasks_by_state?.todo > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={burndownData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorTasks" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#d946ef" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#d946ef" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" stroke="#475569" fontSize={12} tickMargin={10} />
                    <YAxis stroke="#475569" fontSize={12} tickMargin={10} />
                    <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b' }} />
                    <Area type="monotone" dataKey="tasks" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorTasks)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-zinc-500 text-sm">
                  No hay suficientes datos aún
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800/50 lg:col-span-2 flex flex-col min-w-0">
            <CardHeader>
              <CardTitle className="text-base md:text-lg text-zinc-300">Lenguajes de Archivos</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 min-w-0 flex items-center justify-center">
              {data.language_distribution && data.language_distribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={langData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {langData.map((entry: LanguageDistributionItem, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-zinc-500 text-sm">
                  No hay suficientes datos aún
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Row 3: Logs */}
        <div className="grid grid-cols-1">
          <Card className="bg-zinc-900 border-zinc-800/50 min-w-0">
            <CardHeader>
              <CardTitle className="text-base md:text-lg text-zinc-300">Últimos Commits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-zinc-400 uppercase bg-zinc-800/50">
                    <tr>
                      <th className="px-6 py-3 rounded-tl">Hash</th>
                      <th className="px-6 py-3">Mensaje</th>
                      <th className="px-6 py-3">Autor</th>
                      <th className="px-6 py-3 rounded-tr">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_commits && data.recent_commits.length > 0 ? (
                      data.recent_commits.map((commit: Commit, index: number) => (
                        <tr key={commit.hash} className={`border-b border-zinc-800/50 ${index % 2 === 0 ? 'bg-zinc-900' : 'bg-zinc-800/20'} hover:bg-zinc-800/50 transition-colors`}>
                          <td className="px-6 py-4 font-mono text-xs text-blue-400">{commit.hash.substring(0, 7)}</td>
                          <td className="px-6 py-4 max-w-[200px] md:max-w-[400px]">
                            <div className="truncate text-zinc-300" title={commit.subject}>{commit.subject}</div>
                          </td>
                          <td className="px-6 py-4 text-zinc-400">{commit.author}</td>
                          <td className="px-6 py-4 text-zinc-500 whitespace-nowrap">{new Date(commit.date).toLocaleDateString()}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-zinc-500 text-sm">
                          No hay commits recientes en este proyecto.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
