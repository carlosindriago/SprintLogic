import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, GitCommit, GitBranch, FolderGit2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, DoughnutChart, PieChart, Pie, Cell } from 'recharts';

export default function InsightDashboard({ projectId }: { projectId: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInsights = async () => {
      try {
        setLoading(true);
        const res = await fetch(`http://127.0.0.1:8000/api/v1/projects/${projectId}/insights`);
        if (res.ok) {
          const result = await res.json();
          setData(result);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    if (projectId) {
      fetchInsights();
    }
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 text-slate-400">
        <Activity className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 text-slate-400">
        Error loading insights.
      </div>
    );
  }

  // Dummy burn down data for the AreaChart
  const burndownData = [
    { name: 'Day 1', tasks: 100 },
    { name: 'Day 2', tasks: 90 },
    { name: 'Day 3', tasks: 75 },
    { name: 'Day 4', tasks: 60 },
    { name: 'Day 5', tasks: 45 },
    { name: 'Day 6', tasks: 20 },
    { name: 'Day 7', tasks: data.tasks_by_state?.todo || 0 },
  ];

  const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];
  const langData = data.language_distribution && data.language_distribution.length > 0
    ? data.language_distribution
    : [{ name: 'N/A', value: 1 }];

  return (
    <div className="h-full w-full bg-slate-950 overflow-auto p-6 text-slate-200">
      <div className="grid gap-6">
        
        {/* Row 1: KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">Total Commits</CardTitle>
              <GitCommit className="w-4 h-4 text-slate-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-blue-600">
                {data.total_commits}
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">Ramas Activas</CardTitle>
              <GitBranch className="w-4 h-4 text-slate-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-purple-600">
                {data.active_branches}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">Tareas Pendientes</CardTitle>
              <FolderGit2 className="w-4 h-4 text-slate-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-emerald-600">
                {data.tasks_by_state?.todo || 0}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">Velocity (Pts)</CardTitle>
              <Activity className="w-4 h-4 text-slate-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-400 to-orange-600">
                {data.velocity}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Row 2: Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 h-[400px]">
          <Card className="bg-slate-900 border-slate-800 lg:col-span-3 flex flex-col min-w-0">
            <CardHeader>
              <CardTitle className="text-base md:text-lg text-slate-300">Burndown de Tareas</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 min-w-0 pb-6 pl-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={burndownData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTasks" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" stroke="#475569" fontSize={12} tickMargin={10} />
                  <YAxis stroke="#475569" fontSize={12} tickMargin={10} />
                  <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b' }} />
                  <Area type="monotone" dataKey="tasks" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorTasks)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 lg:col-span-2 flex flex-col min-w-0">
            <CardHeader>
              <CardTitle className="text-base md:text-lg text-slate-300">Lenguajes de Archivos</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 min-w-0 flex items-center justify-center">
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
                    {langData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b' }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Row 3: Logs */}
        <div className="grid grid-cols-1">
          <Card className="bg-slate-900 border-slate-800 min-w-0">
            <CardHeader>
              <CardTitle className="text-base md:text-lg text-slate-300">Últimos Commits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-400 uppercase bg-slate-800/50">
                    <tr>
                      <th className="px-6 py-3 rounded-tl">Hash</th>
                      <th className="px-6 py-3">Mensaje</th>
                      <th className="px-6 py-3">Autor</th>
                      <th className="px-6 py-3 rounded-tr">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.recent_commits || []).map((commit: any, index: number) => (
                      <tr key={commit.hash} className={`border-b border-slate-800 ${index % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800/20'} hover:bg-slate-800/50 transition-colors`}>
                        <td className="px-6 py-4 font-mono text-xs text-blue-400">{commit.hash.substring(0, 7)}</td>
                        <td className="px-6 py-4 max-w-[200px] md:max-w-[400px]">
                          <div className="truncate text-slate-300" title={commit.subject}>{commit.subject}</div>
                        </td>
                        <td className="px-6 py-4 text-slate-400">{commit.author}</td>
                        <td className="px-6 py-4 text-slate-500 whitespace-nowrap">{new Date(commit.date).toLocaleDateString()}</td>
                      </tr>
                    ))}
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
