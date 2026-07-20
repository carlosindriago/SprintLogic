import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Activity, GitCommit, GitBranch, FolderGit2, Zap, BrainCircuit,
  LineChart, Flame, Infinity as InfinityIcon, TrendingUp, TrendingDown,
  Bell, Brain, Clock, Calendar, Sparkles,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
  BarChart, Bar,
} from 'recharts';
import { getGlobalFlowInsights, getProjectFlowInsights, getProjectRepoInsights, API_BASE_URL } from '@/lib/api';
import { LanguageDistributionItem, Commit, ProjectFlowInsights } from '@/types';
import { useNotificationStore, type DaemonInsight } from '@/store/notificationStore';

const COLORS = ['#3b82f6', '#d946ef', '#10b981', '#f59e0b', '#ef4444'];

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);

function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  // eslint-disable-next-line react-hooks/refs -- canonical usePrevious pattern
  return ref.current;
}

function useWindowFocus(): boolean {
  const [focused, setFocused] = useState(true);
  useEffect(() => {
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    const onVisibility = () => setFocused(!document.hidden);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  return focused;
}

function useActivityState(idleTimeoutMs = 30000) {
  const [isActivelyTyping, setIsActivelyTyping] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const onActivity = () => {
      setIsActivelyTyping(true);
      clearTimeout(timer);
      timer = setTimeout(() => setIsActivelyTyping(false), idleTimeoutMs);
    };

    window.addEventListener('keydown', onActivity);
    window.addEventListener('click', onActivity);

    return () => {
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('click', onActivity);
      clearTimeout(timer);
    };
  }, [idleTimeoutMs]);

  return isActivelyTyping;
}

function getHeatmapColor(activity: number, maxActivity: number): string {
  if (activity === 0 || maxActivity === 0) return 'bg-zinc-800/30';
  const ratio = activity / maxActivity;
  if (ratio <= 0.2) return 'bg-blue-950/60';
  if (ratio <= 0.4) return 'bg-blue-900/70';
  if (ratio <= 0.6) return 'bg-blue-700/70';
  if (ratio <= 0.8) return 'bg-blue-500/80';
  return 'bg-blue-400';
}

function buildHeatmapGrid(matrix: ProjectFlowInsights['heatmap_matrix']) {
  const grid: (number | null)[][] = Array.from({ length: 7 }, () => Array(24).fill(null));

  for (const cell of matrix) {
    const date = new Date(cell.date + 'T00:00:00');
    if (isNaN(date.getTime())) continue;
    const dayIndex = date.getDay();
    const hourIndex = parseInt(cell.hour.split(':')[0], 10);
    if (dayIndex >= 0 && dayIndex < 7 && hourIndex >= 0 && hourIndex < 24) {
      grid[dayIndex][hourIndex] = (grid[dayIndex][hourIndex] ?? 0) + cell.activity;
    }
  }

  return grid;
}

function getMaxActivity(grid: (number | null)[][]): number {
  let max = 0;
  for (const row of grid) {
    for (const val of row) {
      if (val !== null && val > max) max = val;
    }
  }
  return max;
}

function formatDelta(delta: number | null): { label: string; positive: boolean } | null {
  if (delta === null || delta === undefined || !isFinite(delta)) return null;
  const abs = Math.abs(delta);
  return {
    label: `${delta >= 0 ? '↑' : '↓'} ${abs.toFixed(1)}%`,
    positive: delta >= 0,
  };
}

const SkeletonCard = () => (
  <Card className="bg-zinc-900 border-zinc-800/50 animate-pulse">
    <CardHeader className="flex flex-row items-center justify-between pb-2">
      <div className="h-4 w-24 bg-zinc-800 rounded" />
      <div className="h-4 w-4 bg-zinc-800 rounded-full" />
    </CardHeader>
    <CardContent>
      <div className="h-8 w-16 bg-zinc-800 rounded mt-2" />
    </CardContent>
  </Card>
);

const SkeletonChart = ({ className = '' }: { className?: string }) => (
  <Card className={`bg-zinc-900 border-zinc-800/50 flex flex-col min-w-0 animate-pulse ${className}`}>
    <CardHeader>
      <div className="h-5 w-32 bg-zinc-800 rounded" />
    </CardHeader>
    <CardContent className="flex-1 flex items-center justify-center p-6">
      <div className="w-full h-full min-h-[200px] bg-zinc-800/30 rounded-lg" />
    </CardContent>
  </Card>
);

function Sparkline({ data, color }: { data: { hour: string; activity: number }[]; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="activity"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#spark-${color})`}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default function InsightDashboard({ projectId }: { projectId: string }) {
  const [activeTab, setActiveTab] = useState<'tactico' | 'estrategico'>('tactico');
  const [scope, setScope] = useState<'global' | 'project'>('project');
  const queryClient = useQueryClient();
  const windowFocused = useWindowFocus();
  const isActivelyTyping = useActivityState();
  const isActivelyTypingRef = useRef(isActivelyTyping);
  const notificationStore = useNotificationStore();
  const insightsRef = useRef(notificationStore.insights);

  useEffect(() => {
    isActivelyTypingRef.current = isActivelyTyping;
  });

  useEffect(() => {
    insightsRef.current = notificationStore.insights;
  });

  const { data: flowData, isLoading: isLoadingFlow } = useQuery({
    queryKey: ['insights', 'flow', scope === 'global' ? 'global' : projectId],
    queryFn: () =>
      scope === 'global'
        ? getGlobalFlowInsights()
        : getProjectFlowInsights(projectId),
    staleTime: 2000,
    refetchInterval: windowFocused ? 5000 : false,
    placeholderData: keepPreviousData,
    enabled: scope === 'global' || !!projectId,
  });

  const prevFlowData = usePrevious(flowData);

  const { data: repoData, isLoading: isLoadingRepo } = useQuery({
    queryKey: ['insights', 'repo', projectId],
    queryFn: () => getProjectRepoInsights(projectId),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    enabled: !!projectId && activeTab === 'estrategico',
  });

  const handleMouseEnterStrategy = () => {
    if (!projectId) return;
    queryClient.prefetchQuery({
      queryKey: ['insights', 'repo', projectId],
      queryFn: () => getProjectRepoInsights(projectId),
      staleTime: 5 * 60 * 1000,
    });
  };

  useEffect(() => {
    if (!projectId) return;

    const url = `${API_BASE_URL}/projects/${projectId}/session/stream`;

    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      try {
        const data: DaemonInsight = JSON.parse(event.data);
        if (data.type !== 'daemon_insight') return;

        const wasEmpty = insightsRef.current.length === 0;
        notificationStore.addInsight(data);

        if (!isActivelyTypingRef.current && wasEmpty) {
          toast(data.message, {
            description: `Detectado: ${data.anomaly?.rule === 'high_friction_low_flow' ? 'Alta fricción + bajo flujo' : 'Distracción'}`,
            icon: <Bell className="w-4 h-4 text-amber-400" />,
            duration: 10000,
          });
        }
      } catch (e: unknown) {
        console.error("Error procesando mensaje parseado:", e);
      }
    };

    eventSource.onerror = () => {
      // EventSource auto-reconnects, but on fatal errors we could handle them here
    };

    return () => eventSource.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- notificationStore is a stable Zustand reference
  }, [projectId]);

  const prevActiveTabRef = useRef(activeTab);

  useEffect(() => {
    if (prevActiveTabRef.current === activeTab) return;
    prevActiveTabRef.current = activeTab;

    const queued = insightsRef.current;
    if (queued.length === 0) return;

    if (queued.length === 1) {
      const insight = queued[0];
      toast(insight.message, {
        description: `Detectado: ${insight.anomaly?.rule === 'high_friction_low_flow' ? 'Alta fricción + bajo flujo' : 'Distracción'}`,
        icon: <Bell className="w-4 h-4 text-amber-400" />,
        duration: 10000,
      });
    } else {
      toast(`Tenés ${queued.length} sugerencias de SprintLogic pendientes.`, {
        description: 'Hacé clic en la campana 🛎️ para revisarlas.',
        duration: 8000,
      });
    }
  }, [activeTab]);

  const deepFlowDelta = useMemo(() => {
    if (!prevFlowData || !flowData) return null;
    const prev = prevFlowData.deep_flow_hours;
    const curr = flowData.deep_flow_hours;
    if (prev === 0) return curr > 0 ? 100 : null;
    return ((curr - prev) / prev) * 100;
  }, [flowData, prevFlowData]);

  const idleDelta = useMemo(() => {
    if (!prevFlowData || !flowData) return null;
    const prev = prevFlowData.idle_breaks;
    const curr = flowData.idle_breaks;
    if (prev === 0) return curr > 0 ? 100 : null;
    return ((curr - prev) / prev) * 100;
  }, [flowData, prevFlowData]);

  const codingPct = useMemo(() => {
    if (!flowData?.golden_ratio) return 0;
    const { thinking, coding, testing } = flowData.golden_ratio;
    const total = thinking + coding + testing;
    return total ? ((coding / total) * 100) : 0;
  }, [flowData]);

  const prevCodingPct = useMemo(() => {
    if (!prevFlowData?.golden_ratio) return 0;
    const { thinking, coding, testing } = prevFlowData.golden_ratio;
    const total = thinking + coding + testing;
    return total ? ((coding / total) * 100) : 0;
  }, [prevFlowData]);

  const codingDelta = useMemo(() => {
    if (prevCodingPct === 0) return codingPct > 0 ? 100 : null;
    return ((codingPct - prevCodingPct) / prevCodingPct) * 100;
  }, [codingPct, prevCodingPct]);

  const sparklineData = useMemo(() => {
    if (!flowData?.heatmap) return [];
    return flowData.heatmap;
  }, [flowData]);

  const heatmapGrid = useMemo(() => {
    if (!flowData?.heatmap_matrix) return [];
    return buildHeatmapGrid(flowData.heatmap_matrix);
  }, [flowData]);

  const maxMatrixActivity = useMemo(() => getMaxActivity(heatmapGrid), [heatmapGrid]);

  const dailyTotals = useMemo(() => {
    const totals: number[] = Array(7).fill(0);
    for (const cell of flowData?.heatmap_matrix ?? []) {
      const date = new Date(cell.date + 'T00:00:00');
      if (isNaN(date.getTime())) continue;
      const dayIndex = date.getDay();
      if (dayIndex >= 0 && dayIndex < 7) {
        totals[dayIndex] += cell.activity;
      }
    }
    return totals;
  }, [flowData]);

  const weeklyKpis = useMemo(() => {
    const active = dailyTotals.filter((t) => t > 0);
    if (active.length === 0) return null;
    const totalMs = active.reduce((a, b) => a + b, 0);
    const maxMs = Math.max(...active);
    const minMs = Math.min(...active);
    const bestIdx = dailyTotals.indexOf(maxMs);
    const worstIdx = dailyTotals.indexOf(minMs);
    return {
      totalHours: (totalMs / 3600000).toFixed(1),
      avgHours: (totalMs / active.length / 3600000).toFixed(1),
      bestDay: DAY_LABELS[bestIdx],
      bestHours: (maxMs / 3600000).toFixed(1),
      worstDay: DAY_LABELS[worstIdx],
      worstHours: (minMs / 3600000).toFixed(1),
      activeDays: active.length,
    };
  }, [dailyTotals]);

  const primeTime = useMemo(() => {
    if (!flowData?.heatmap || flowData.heatmap.length === 0) return null;
    const sorted = [...flowData.heatmap].sort((a, b) => b.activity - a.activity);
    return sorted[0].hour;
  }, [flowData]);

  // ⚡ Bolt: Performance Optimization
  // Extracts the shared O(N) matrix aggregation to prevent redundant loops
  // in both anchorDay and streak calculations on every render.
  const activityByDay = useMemo(() => {
    const byDay: Record<string, number> = {};
    if (!flowData?.heatmap_matrix) return byDay;
    for (const cell of flowData.heatmap_matrix) {
      byDay[cell.date] = (byDay[cell.date] || 0) + cell.activity;
    }
    return byDay;
  }, [flowData]);

  const anchorDay = useMemo(() => {
    const sorted = Object.entries(activityByDay).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return null;
    const date = new Date(sorted[0][0] + 'T00:00:00');
    return DAY_LABELS[date.getDay()];
  }, [activityByDay]);

  const streak = useMemo(() => {
    if (Object.keys(activityByDay).length === 0) return 0;
    const today = new Date();
    let count = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const ms = activityByDay[key] || 0;
      if (ms >= 3600000) count++;
      else break;
    }
    return count;
  }, [activityByDay]);

  const cognitiveDistribution = useMemo(() => {
    if (!flowData?.golden_ratio) return { items: [], stacked: [] };
    const { thinking, coding, testing } = flowData.golden_ratio;
    const total = thinking + coding + testing;
    if (total === 0) return { items: [], stacked: [] };
    return {
      items: [
        { name: 'Pensamiento', pct: ((thinking / total) * 100).toFixed(0), color: '#a78bfa' },
        { name: 'Coding', pct: ((coding / total) * 100).toFixed(0), color: '#3b82f6' },
        { name: 'Testing', pct: ((testing / total) * 100).toFixed(0), color: '#10b981' },
      ],
      stacked: [{ thinking: (thinking / total) * 100, coding: (coding / total) * 100, testing: (testing / total) * 100 }],
    };
  }, [flowData]);

  const burndownData = useMemo(() => [
    { name: 'Day 1', tasks: 100 },
    { name: 'Day 2', tasks: 90 },
    { name: 'Day 3', tasks: 75 },
    { name: 'Day 4', tasks: 60 },
    { name: 'Day 5', tasks: 45 },
    { name: 'Day 6', tasks: 20 },
    { name: 'Day 7', tasks: repoData?.tasks_by_state?.todo || 0 },
  ], [repoData]);

  const langData = useMemo(() => {
    if (repoData?.language_distribution && repoData.language_distribution.length > 0) {
      return repoData.language_distribution;
    }
    return [{ name: 'N/A', value: 1 }];
  }, [repoData]);

  const flowDelta = formatDelta(deepFlowDelta);
  const frictionDelta = formatDelta(idleDelta);
  const ratioDelta = formatDelta(codingDelta);

  return (
    <div className="h-full w-full bg-[#0d0d0d] overflow-auto p-6 text-zinc-200 flex flex-col gap-6">

      <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
        <button
          onClick={() => setActiveTab('tactico')}
          className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors font-medium text-sm ${activeTab === 'tactico'
              ? 'bg-blue-500/10 text-blue-400 border-b-2 border-blue-500'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
            }`}
        >
          <Zap className="w-4 h-4" />
          Vista Táctica (Flow)
        </button>
        <button
          onClick={() => setActiveTab('estrategico')}
          onMouseEnter={handleMouseEnterStrategy}
          className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors font-medium text-sm ${activeTab === 'estrategico'
              ? 'bg-purple-500/10 text-purple-400 border-b-2 border-purple-500'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
            }`}
        >
          <BrainCircuit className="w-4 h-4" />
          Vista Estratégica (Repo)
        </button>

        {activeTab === 'tactico' && (
          <div className="flex items-center rounded-lg bg-zinc-800/50 p-0.5">
            <button
              onClick={() => setScope('global')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                scope === 'global'
                  ? 'bg-zinc-700 text-zinc-200'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Global
            </button>
            <button
              onClick={() => setScope('project')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                scope === 'project'
                  ? 'bg-zinc-700 text-zinc-200'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Proyecto
            </button>
          </div>
        )}

        <div className="ml-auto flex items-center">
          <button
            onClick={() => {
              const queued = notificationStore.drain();
              if (queued.length === 0) return;
              if (queued.length > 1) {
                toast(`Tenés ${queued.length} sugerencias de SprintLogic:`, {
                  duration: 6000,
                });
              }
              for (const insight of queued) {
                toast(insight.message, {
                  description: `Detectado: ${insight.anomaly?.rule === 'high_friction_low_flow' ? 'Alta fricción + bajo flujo' : 'Distracción'}`,
                  icon: <Bell className="w-4 h-4 text-amber-400" />,
                  duration: 10000,
                });
              }
            }}
            className="relative p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
            title="Notificaciones pendientes"
          >
            <Bell className="w-4 h-4" />
            {notificationStore.insights.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {notificationStore.insights.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Tab: TÁCTICO */}
      {activeTab === 'tactico' && (
        <div className="grid gap-6 animate-in fade-in duration-300">
          {isLoadingFlow && !flowData ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <SkeletonCard /><SkeletonCard /><SkeletonCard />
              </div>
              <SkeletonChart className="h-[380px]" />
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Deep Flow */}
                <Card className="bg-zinc-900 border-zinc-800/50 overflow-hidden relative">
                  <CardHeader className="flex flex-row items-center justify-between pb-1">
                    <CardTitle className="text-sm font-medium text-zinc-400">Deep Flow (hrs)</CardTitle>
                    <Zap className="w-4 h-4 text-blue-500" />
                  </CardHeader>
                  <CardContent className="pb-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-blue-600">
                        {flowData?.deep_flow_hours ?? 0}
                      </span>
                      {flowDelta && (
                        <span className={`text-xs font-medium flex items-center gap-0.5 ${flowDelta.positive ? 'text-emerald-400' : 'text-red-400'}`}>
                          {flowDelta.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {flowDelta.label}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 opacity-60">
                      <Sparkline data={sparklineData} color="#3b82f6" />
                    </div>
                  </CardContent>
                </Card>

                {/* Friction */}
                <Card className="bg-zinc-900 border-zinc-800/50 overflow-hidden relative">
                  <CardHeader className="flex flex-row items-center justify-between pb-1">
                    <CardTitle className="text-sm font-medium text-zinc-400">Pausas (Fricción)</CardTitle>
                    <Flame className="w-4 h-4 text-orange-500" />
                  </CardHeader>
                  <CardContent className="pb-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-400 to-red-500">
                        {flowData?.idle_breaks ?? 0}
                      </span>
                      {frictionDelta && (
                        <span className={`text-xs font-medium flex items-center gap-0.5 ${!frictionDelta.positive ? 'text-emerald-400' : 'text-red-400'}`}>
                          {frictionDelta.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {frictionDelta.label}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 opacity-60">
                      <Sparkline data={sparklineData} color="#f97316" />
                    </div>
                  </CardContent>
                </Card>

                {/* Golden Ratio */}
                <Card className="bg-zinc-900 border-zinc-800/50 overflow-hidden relative">
                  <CardHeader className="flex flex-row items-center justify-between pb-1">
                    <CardTitle className="text-sm font-medium text-zinc-400">Ratio de Oro (Coding)</CardTitle>
                    <Activity className="w-4 h-4 text-emerald-500" />
                  </CardHeader>
                  <CardContent className="pb-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-emerald-600">
                        {codingPct.toFixed(0)}%
                      </span>
                      {ratioDelta && (
                        <span className={`text-xs font-medium flex items-center gap-0.5 ${ratioDelta.positive ? 'text-emerald-400' : 'text-red-400'}`}>
                          {ratioDelta.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {ratioDelta.label}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 opacity-60">
                      <Sparkline data={sparklineData} color="#10b981" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Heatmap Matrix + KPI Contextual */}
              <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
                <Card className="bg-zinc-900 border-zinc-800/50 lg:col-span-5 min-w-0">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-zinc-300 flex items-center gap-2">
                    <LineChart className="w-4 h-4" />
                    Matriz de Actividad (7 días)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {heatmapGrid.length > 0 ? (
                    <div className="overflow-x-auto flex justify-center">
                      <div className="inline-flex flex-col gap-1 min-w-[600px]">
                        <div className="flex gap-1 ml-8">
                          {HOUR_LABELS.map((h, i) => (
                            <div key={h} className="w-6 text-[10px] text-zinc-500 text-center">
                              {i % 3 === 0 ? h.slice(0, 2) : ''}
                            </div>
                          ))}
                        </div>
                        {heatmapGrid.map((row, dayIdx) => (
                          <div key={dayIdx} className="flex items-center gap-1">
                            <span className="w-8 text-xs text-zinc-500 text-right pr-1">
                              {DAY_LABELS[dayIdx]}
                            </span>
                            {row.map((activity, hourIdx) => (
                              <div
                                key={`${dayIdx}-${hourIdx}`}
                                className={`w-6 h-4 rounded-sm ${getHeatmapColor(activity ?? 0, maxMatrixActivity)}`}
                                title={`${DAY_LABELS[dayIdx]} ${HOUR_LABELS[hourIdx]}: ${activity ? Math.round(activity / 1000) + 's' : '0s'}`}
                              />
                            ))}
                          </div>
                        ))}
                        <div className="flex items-center gap-1 mt-1 ml-8">
                          <span className="text-[10px] text-zinc-500 mr-1">Menos</span>
                          {[0.2, 0.4, 0.6, 0.8, 1].map((r) => (
                            <div key={r} className={`w-3 h-3 rounded-sm ${getHeatmapColor(maxMatrixActivity * r, maxMatrixActivity)}`} />
                          ))}
                          <span className="text-[10px] text-zinc-500 ml-1">Más</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-48 w-full items-center justify-center text-zinc-500 text-sm">
                      Sin datos de telemetría para los últimos 7 días.
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* KPI Panel — Resumen Semanal */}
              <Card className="bg-zinc-900 border-zinc-800/50 lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-cyan-400" />
                    Resumen Semanal
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {weeklyKpis ? (
                    <div className="space-y-4">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-zinc-100 tabular-nums">
                          {weeklyKpis.totalHours}
                        </div>
                        <div className="text-[11px] text-zinc-500">horas totales</div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-500">Promedio diario</span>
                          <span className="text-zinc-300 font-mono">{weeklyKpis.avgHours}h</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-500">Mejor día</span>
                          <span className="text-emerald-400 font-mono">
                            {weeklyKpis.bestDay} · {weeklyKpis.bestHours}h
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-500">Día más bajo</span>
                          <span className="text-amber-400 font-mono">
                            {weeklyKpis.worstDay} · {weeklyKpis.worstHours}h
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-500">Días activos</span>
                          <span className="text-zinc-300 font-mono">{weeklyKpis.activeDays}/7</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 gap-2">
                      <Calendar className="w-6 h-6 text-zinc-600" />
                      <p className="text-xs text-zinc-600 text-center">Sin datos semanales</p>
                    </div>
                  )}
                </CardContent>
              </Card>
              </div>

              {/* Row 2: Diagnóstico Accionable */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Col 1: Carga Cognitiva */}
                <Card className="bg-zinc-900 border-zinc-800/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
                      <Brain className="w-4 h-4 text-violet-400" />
                      Carga Cognitiva
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {cognitiveDistribution.items.length > 0 ? (
                      <div className="space-y-3">
                        <ResponsiveContainer width="100%" height={120}>
                          <BarChart
                            data={cognitiveDistribution.stacked}
                            layout="vertical"
                            margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                            barSize={16}
                          >
                            <XAxis type="number" hide domain={[0, 100]} />
                            <YAxis type="category" hide />
                            <Bar dataKey="thinking" radius={[4, 0, 0, 4]} fill="#a78bfa" stackId="a" />
                            <Bar dataKey="coding" fill="#3b82f6" stackId="a" />
                            <Bar dataKey="testing" radius={[0, 4, 4, 0]} fill="#10b981" stackId="a" />
                          </BarChart>
                        </ResponsiveContainer>
                        <div className="space-y-1.5">
                          {cognitiveDistribution.items.map((item) => (
                            <div key={item.name} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                                <span className="text-zinc-400">{item.name}</span>
                              </div>
                              <span className="text-zinc-300 font-mono">{item.pct}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-500 py-4 text-center">Sin datos de actividad</div>
                    )}
                  </CardContent>
                </Card>

                {/* Col 2: Patrones de Flujo */}
                <Card className="bg-zinc-900 border-zinc-800/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-400" />
                      Patrones de Flujo
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">Prime Time</span>
                      <span className="text-sm font-semibold text-zinc-200">{primeTime ?? '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">Día de Anclaje</span>
                      <span className="text-sm font-semibold text-zinc-200">{anchorDay ?? '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">Racha Actual</span>
                      <span className="text-sm font-semibold text-emerald-400">
                        {streak > 0 ? `${streak} día${streak > 1 ? 's' : ''}` : '—'}
                      </span>
                    </div>
                    {streak >= 3 && (
                      <div className="mt-2 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-1.5">
                        <p className="text-[11px] text-emerald-400 leading-relaxed">
                          {streak} días consecutivos con +1h de Deep Flow. ¡Imparable!
                        </p>
                      </div>
                    )}
                    {streak === 0 && flowData && (
                      <div className="mt-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-1.5">
                        <p className="text-[11px] text-amber-400 leading-relaxed">
                          Sin racha activa. ¿Arrancamos hoy con 1h de foco?
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Col 3: Diagnóstico del Sensei */}
                <Card className="bg-zinc-900 border-zinc-800/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-blue-400" />
                      Diagnóstico del Sensei
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {notificationStore.insights.length > 0 ? (
                      <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                        {notificationStore.insights.map((insight, i) => (
                          <div key={i} className="rounded-md bg-blue-500/5 border border-blue-500/10 px-2.5 py-2">
                            <p className="text-xs text-zinc-300 leading-relaxed">{insight.message}</p>
                            <p className="text-[10px] text-zinc-500 mt-1">
                              {insight.anomaly?.rule === 'high_friction_low_flow' ? 'Alta fricción detectada' : 'Distracción detectada'}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-4 gap-2">
                        <Sparkles className="w-5 h-5 text-zinc-600" />
                        <p className="text-xs text-zinc-600 text-center leading-relaxed">
                          Todos los sistemas en flujo óptimo.
                          <br />No hay bloqueos detectados.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab: ESTRATÉGICO */}
      {activeTab === 'estrategico' && (
        <div className="grid gap-6 animate-in fade-in duration-300">
          {isLoadingRepo && !repoData ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
              </div>
              <SkeletonChart className="xl:col-span-4 h-[400px]" />
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                <Card className="bg-zinc-900 border-zinc-800/50">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-zinc-400">Total Commits</CardTitle>
                    <GitCommit className="w-4 h-4 text-purple-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-purple-600">
                      {repoData?.total_commits ?? 0}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-zinc-900 border-zinc-800/50">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-zinc-400">Ramas Activas</CardTitle>
                    <GitBranch className="w-4 h-4 text-purple-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl md:text-3xl font-bold text-zinc-200">
                      {repoData?.active_branches ?? 0}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-zinc-900 border-zinc-800/50">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-zinc-400">Tareas Pendientes</CardTitle>
                    <FolderGit2 className="w-4 h-4 text-purple-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl md:text-3xl font-bold text-zinc-200">
                      {repoData?.tasks_by_state?.todo ?? 0}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-zinc-900 border-zinc-800/50">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-zinc-400">Velocity (7d)</CardTitle>
                    <InfinityIcon className="w-4 h-4 text-purple-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl md:text-3xl font-bold text-zinc-200">
                      {repoData?.velocity ?? 0}
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">commits / 7 días</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 h-[400px]">
                <Card className="bg-zinc-900 border-zinc-800/50 lg:col-span-3 flex flex-col min-w-0">
                  <CardHeader>
                    <CardTitle className="text-base md:text-lg text-zinc-300">Burndown de Tareas</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 min-h-0 min-w-0 pb-6 pl-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={burndownData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorTasks" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#d946ef" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#d946ef" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="name" stroke="#475569" fontSize={12} tickMargin={10} axisLine={false} tickLine={false} />
                        <YAxis stroke="#475569" fontSize={12} tickMargin={10} axisLine={false} tickLine={false} />
                        <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }} />
                        <Area type="monotone" dataKey="tasks" stroke="#d946ef" strokeWidth={3} fillOpacity={1} fill="url(#colorTasks)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="bg-zinc-900 border-zinc-800/50 lg:col-span-2 flex flex-col min-w-0">
                  <CardHeader>
                    <CardTitle className="text-base md:text-lg text-zinc-300">Lenguajes</CardTitle>
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
                          {langData.map((entry: LanguageDistributionItem, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

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
                        {repoData?.recent_commits && repoData.recent_commits.length > 0 ? (
                          repoData.recent_commits.map((commit: Commit, index: number) => (
                            <tr key={commit.hash} className={`border-b border-zinc-800/50 ${index % 2 === 0 ? 'bg-zinc-900' : 'bg-zinc-800/20'} hover:bg-zinc-800/50 transition-colors`}>
                              <td className="px-6 py-4 font-mono text-xs text-purple-400">{commit.hash.substring(0, 7)}</td>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
