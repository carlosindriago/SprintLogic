"use client";

import { useEffect, useState, useCallback } from "react";
import { X, Sparkles, Loader2, FileCode, ArrowDownLeft, ArrowUpRight, RefreshCw } from "lucide-react";
import { ForceNode } from "../types";
import { getNodeInsight } from "@/lib/api";

interface GraphNodeDetailsPanelProps {
  projectId: string | null;
  activeNode: ForceNode | null;
  onClose: () => void;
}

export default function GraphNodeDetailsPanel({
  projectId,
  activeNode,
  onClose,
}: GraphNodeDetailsPanelProps) {
  const [insight, setInsight] = useState<string | null>(null);
  const [isCached, setIsCached] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInsight = useCallback(async () => {
    if (!projectId || !activeNode) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getNodeInsight(projectId, activeNode.id);
      setInsight(res.ai_summary);
      setIsCached(res.cached);
    } catch {
      setError("No se pudo obtener el resumen IA del nodo.");
    } finally {
      setLoading(false);
    }
  }, [projectId, activeNode]);

  useEffect(() => {
    let isMounted = true;
    if (activeNode && projectId) {
      setLoading(true);
      setError(null);
      setInsight(null);
      getNodeInsight(projectId, activeNode.id)
        .then((res) => {
          if (isMounted) {
            setInsight(res.ai_summary);
            setIsCached(res.cached);
            setLoading(false);
          }
        })
        .catch(() => {
          if (isMounted) {
            setError("No se pudo obtener el resumen IA del nodo.");
            setLoading(false);
          }
        });
    } else {
      setInsight(null);
      setError(null);
    }
    return () => {
      isMounted = false;
    };
  }, [activeNode, projectId]);

  if (!activeNode) return null;

  const ext = activeNode.name?.split(".").pop()?.toUpperCase() || "FILE";
  const formattedSize = activeNode.size
    ? activeNode.size > 1024
      ? `${(activeNode.size / 1024).toFixed(1)} KB`
      : `${activeNode.size} B`
    : "-";

  return (
    <div className="absolute top-4 right-4 z-30 w-80 bg-zinc-900/95 border border-zinc-800 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden flex flex-col text-zinc-100 animate-in fade-in slide-in-from-right-4 duration-200">
      {/* Header */}
      <div className="p-3.5 border-b border-zinc-800/80 flex items-start justify-between gap-2 bg-zinc-900/50">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 shrink-0 mt-0.5">
            <FileCode className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-zinc-100 truncate" title={activeNode.name}>
              {activeNode.name}
            </h3>
            <p className="text-[10px] text-zinc-400 font-mono truncate" title={activeNode.file_path}>
              {activeNode.folder || "/"}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Badges */}
      <div className="px-3.5 pt-2.5 flex items-center gap-1.5 flex-wrap">
        <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
          {activeNode.label || "File"}
        </span>
        <span className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-blue-950/60 text-blue-300 border border-blue-800/40">
          .{ext}
        </span>
        {activeNode.domain_group && (
          <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-purple-950/60 text-purple-300 border border-purple-800/40">
            {activeNode.domain_group}
          </span>
        )}
      </div>

      {/* Hard Metrics Grid */}
      <div className="p-3.5 grid grid-cols-2 gap-2 text-xs">
        <div className="p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/60 flex flex-col">
          <span className="text-[10px] text-zinc-500 font-medium">Líneas de código</span>
          <span className="text-sm font-semibold text-zinc-200 mt-0.5 font-mono">
            {activeNode.loc ?? "-"}
          </span>
        </div>
        <div className="p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/60 flex flex-col">
          <span className="text-[10px] text-zinc-500 font-medium">Tamaño</span>
          <span className="text-sm font-semibold text-zinc-200 mt-0.5 font-mono">
            {formattedSize}
          </span>
        </div>
        <div className="p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/60 flex flex-col">
          <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
            <ArrowDownLeft className="w-3 h-3" />
            <span>Dependientes</span>
          </div>
          <span className="text-sm font-semibold text-emerald-300 mt-0.5 font-mono">
            {activeNode.in_degree ?? 0}
          </span>
        </div>
        <div className="p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/60 flex flex-col">
          <div className="flex items-center gap-1 text-[10px] text-orange-400 font-medium">
            <ArrowUpRight className="w-3 h-3" />
            <span>Dependencias</span>
          </div>
          <span className="text-sm font-semibold text-orange-300 mt-0.5 font-mono">
            {activeNode.out_degree ?? 0}
          </span>
        </div>
      </div>

      {/* AI Insight Section */}
      <div className="p-3.5 border-t border-zinc-800/80 bg-zinc-950/40">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-400">
            <Sparkles className="w-3.5 h-3.5" />
            <span>IA Insight</span>
          </div>
          {isCached && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
              Caché DB
            </span>
          )}
        </div>

        {loading ? (
          <div className="space-y-2 py-1">
            <div className="flex items-center gap-2 text-xs text-zinc-400 mb-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
              <span>Analizando responsabilidad...</span>
            </div>
            <div className="h-3 bg-zinc-800 animate-pulse rounded w-full" />
            <div className="h-3 bg-zinc-800 animate-pulse rounded w-4/5" />
            <div className="h-3 bg-zinc-800 animate-pulse rounded w-2/3" />
          </div>
        ) : error ? (
          <div className="p-2.5 rounded-lg bg-red-950/30 border border-red-900/40 text-red-400 text-xs flex flex-col gap-1.5">
            <span>{error}</span>
            <button
              onClick={fetchInsight}
              className="self-start flex items-center gap-1 text-[10px] text-red-300 underline hover:text-red-200"
            >
              <RefreshCw className="w-3 h-3" /> Reintentar
            </button>
          </div>
        ) : insight ? (
          <p className="text-xs text-zinc-300 leading-relaxed font-normal bg-zinc-900/80 p-2.5 rounded-lg border border-zinc-800/80">
            {insight}
          </p>
        ) : null}
      </div>
    </div>
  );
}
