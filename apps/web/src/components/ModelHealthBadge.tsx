"use client";

import { ModelHealthMetric } from "@/lib/api";

interface ModelHealthBadgeProps {
  metric?: ModelHealthMetric | null;
  showDetails?: boolean;
}

export function ModelHealthBadge({ metric, showDetails = false }: ModelHealthBadgeProps) {
  if (!metric || metric.total_calls === 0) {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-500 bg-zinc-800/40 border border-zinc-700/30 shrink-0"
        title="Sin llamadas registradas aún"
      >
        ⚪ Sin datos
      </span>
    );
  }

  if (metric.status === "healthy") {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-emerald-400 bg-emerald-950/50 border border-emerald-800/40 shrink-0"
        title={`${metric.success_calls}/${metric.total_calls} exitosas (${metric.success_rate}%) | Latencia media: ${(metric.avg_latency_ms / 1000).toFixed(1)}s`}
      >
        🟢 {metric.success_rate}% ({(metric.avg_latency_ms / 1000).toFixed(1)}s)
        {showDetails && <span className="text-emerald-500/70">· {metric.total_calls} reqs</span>}
      </span>
    );
  }

  if (metric.status === "degraded") {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-amber-400 bg-amber-950/50 border border-amber-800/40 shrink-0"
        title={`${metric.success_calls}/${metric.total_calls} exitosas (${metric.success_rate}%) | Latencia media: ${(metric.avg_latency_ms / 1000).toFixed(1)}s`}
      >
        🟡 {metric.success_rate}% ({(metric.avg_latency_ms / 1000).toFixed(1)}s)
        {showDetails && <span className="text-amber-500/70">· {metric.total_calls} reqs</span>}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-rose-400 bg-rose-950/50 border border-rose-800/40 shrink-0"
      title={`Fallas frecuentes: ${metric.failed_calls} errores (${metric.timeout_calls} timeouts). Último error: ${metric.last_error || "Desconocido"}`}
    >
      🔴 {metric.timeout_calls > 0 ? "Timeout" : `${metric.success_rate}%`}
      {showDetails && <span className="text-rose-500/70">· {metric.failed_calls} fallos</span>}
    </span>
  );
}
