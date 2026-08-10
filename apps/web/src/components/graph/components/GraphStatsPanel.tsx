import { Search, RotateCcw, RefreshCw, Radio, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { graphUI, graphTheme } from "@/lib/graph-theme";

interface GraphStatsPanelProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activeTypes: Set<string>;
  toggleType: (type: string) => void;
  showCycles: boolean;
  setShowCycles: (s: boolean) => void;
  showGitRadar: boolean;
  setShowGitRadar: (s: boolean) => void;
  viewMode: "REAL" | "GROUPED";
  setViewMode: (mode: "REAL" | "GROUPED") => void;
  stats: {
    files: number;
    classes: number;
    functions: number;
    interfaces: number;
    loc: number;
    extMap: Record<string, number>;
  };
  isScanning: boolean;
  handleRescan: () => void;
  savedAnalysis: string | null;
  analyzing: boolean;
  analyzingText: string;
  handleAnalyze: () => void;
  handleShowAnalysis: () => void;
}

export function GraphStatsPanel({
  searchQuery,
  setSearchQuery,
  activeTypes,
  toggleType,
  showCycles,
  setShowCycles,
  showGitRadar,
  setShowGitRadar,
  viewMode,
  setViewMode,
  stats,
  isScanning,
  handleRescan,
  savedAnalysis,
  analyzing,
  analyzingText,
  handleAnalyze,
  handleShowAnalysis
}: GraphStatsPanelProps) {
  return (
    <div className={cn("absolute top-4 left-4 z-10 flex flex-col gap-3 p-4 rounded-lg", graphUI.background, graphUI.blur, graphUI.border, graphUI.shadow)}>
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
        <input
          type="text"
          placeholder="Search nodes..."
          className="w-full bg-[#18181b] border border-[#3f3f46] rounded-md py-1.5 pl-9 pr-3 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {([
          { type: "File",      shape: "●", color: "#94a3b8" },
          { type: "Class",     shape: "■", color: graphTheme.class },
          { type: "Function",  shape: "▲", color: graphTheme.function },
          { type: "Interface", shape: "◆", color: graphTheme.interface },
        ] as { type: string; shape: string; color: string }[]).map(({ type, shape, color }) => (
          <button
            key={type}
            onClick={() => toggleType(type)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all ${
              activeTypes.has(type)
                ? 'text-white'
                : 'text-zinc-500 hover:text-zinc-300 opacity-50'
            }`}
            style={{
              backgroundColor: activeTypes.has(type) ? `${color}18` : 'transparent',
              border: `1px solid ${activeTypes.has(type) ? `${color}60` : '#27272a'}`,
            }}
          >
            <span style={{ color: activeTypes.has(type) ? color : '#52525b', fontSize: '0.7rem' }}>
              {shape}
            </span>
            {type}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5">
        <button
          onClick={() => setShowCycles(!showCycles)}
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md transition-colors ${showCycles ? 'bg-red-900/40 text-red-400 border border-red-900/50' : 'bg-[#18181b] text-zinc-400 border border-[#3f3f46]'}`}
        >
          <RotateCcw className="w-3 h-3" />
          Cycles
        </button>

        <button
          onClick={() => setShowGitRadar(!showGitRadar)}
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md transition-colors ${showGitRadar ? 'bg-cyan-950/80 text-cyan-400 border border-cyan-500/50 shadow-sm shadow-cyan-500/20' : 'bg-[#18181b] text-zinc-400 border border-[#3f3f46]'}`}
          title="Resaltar archivos modificados en Git"
        >
          <Radio className={`w-3 h-3 ${showGitRadar ? 'animate-pulse text-cyan-400' : ''}`} />
          Radar Git
        </button>
      </div>

      {/* Toggle View Mode */}
      <div className="flex bg-[#18181b] border border-[#3f3f46] rounded-md p-0.5 mt-1">
        <button
          onClick={() => setViewMode("REAL")}
          className={`flex-1 text-[10px] py-1.5 rounded transition-colors ${viewMode === "REAL" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-300"}`}
        >
          Archivos Reales
        </button>
        <button
          onClick={() => setViewMode("GROUPED")}
          className={`flex-1 text-[10px] py-1.5 rounded transition-colors ${viewMode === "GROUPED" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-300"}`}
        >
          Agrupar por Carpetas
        </button>
      </div>

      {/* Project Statistics */}
      <div className="border-t border-[#3f3f46] pt-3 mt-1">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Métricas del Código</h4>
          <button
            onClick={handleRescan}
            disabled={isScanning}
            className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title={isScanning ? "Re-escaneando..." : "Re-escanear Proyecto"}
          >
            <RefreshCw className={`w-3 h-3 ${isScanning ? "animate-spin" : ""}`} />
            {isScanning ? "Escaneando..." : "Sincronizar"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
          <div className="flex justify-between">
            <span className="text-zinc-500">Archivos:</span>
            <span className="font-medium text-zinc-200">{stats.files}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Clases:</span>
            <span className="font-medium text-zinc-200">{stats.classes}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Funciones:</span>
            <span className="font-medium text-zinc-200">{stats.functions}</span>
          </div>
          {stats.interfaces > 0 && (
            <div className="flex justify-between">
              <span className="text-zinc-500">Interfaces:</span>
              <span className="font-medium text-zinc-200">{stats.interfaces}</span>
            </div>
          )}
          <div className="flex justify-between col-span-2 border-t border-[#27272a] pt-1.5 mt-0.5">
            <span className="text-zinc-500">Total LOC:</span>
            <span className="font-semibold text-blue-400">{stats.loc.toLocaleString()}</span>
          </div>
        </div>
        {Object.keys(stats.extMap).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {Object.entries(stats.extMap).map(([ext, count]) => (
              <span key={ext} className="text-[9px] bg-zinc-800 text-zinc-400 px-1 py-0.5 rounded border border-[#27272a]">
                .{ext} ({count})
              </span>
            ))}
          </div>
        )}
      </div>

      {savedAnalysis ? (
        <div className="flex flex-col gap-2 border-t border-[#3f3f46] pt-3 mt-1">
          <button
            onClick={handleShowAnalysis}
            className="flex items-center justify-center gap-2 text-xs py-1.5 rounded-md transition-colors bg-zinc-850 hover:bg-zinc-800 text-zinc-200 border border-[#3f3f46]"
          >
            <Brain className="w-3.5 h-3.5 text-green-400" />
            Mostrar Análisis
          </button>
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="flex items-center justify-center gap-2 text-xs py-1.5 rounded-md transition-colors bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
          >
            <Brain className="w-3.5 h-3.5" />
            {analyzing ? "Analizando..." : "Volver a Analizar"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 border-t border-[#3f3f46] pt-3 mt-1">
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="flex items-center justify-center gap-2 text-xs py-1.5 rounded-md transition-colors bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
          >
            <Brain className="w-3.5 h-3.5" />
            {analyzing ? "Analizando..." : "Análisis IA del Grafo"}
          </button>
          {analyzing && analyzingText && (
            <div className="max-h-32 overflow-y-auto text-[11px] text-zinc-400 leading-relaxed bg-[#0a0a0a] rounded-md p-2 border border-[#3f3f46]">
              {analyzingText.slice(-500)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
