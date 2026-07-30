 
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */
 
 

"use client";

import React, { useEffect, useState } from "react";
import { useTabsStore } from "../store/tabsStore";

import { 
  getProjectReports, 
  getProjectReportsTrash, 
  trashProjectReport, 
  restoreProjectReport, 
  deleteProjectReport,
  API_BASE_URL
} from "../lib/api";

import { FileText, Clock, Bot, Trash2, RefreshCw, X, Brain, Database } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale"; // Or en-US depending on your locale preference
import { cn } from "../lib/utils";

interface Report {
  id: string;
  type?: string;
  content: string;
  created_at: string;
  ai_model_version: string;
}

export function ReportHistoryPanel() {
  const currentProjectId = useTabsStore((state) => state.currentProjectId);
  const addTab = useTabsStore((state) => state.addTab);
  
  const [activeReports, setActiveReports] = useState<Report[]>([]);
  const [trashReports, setTrashReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"active" | "trash">("active");
  
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzingText, setAnalyzingText] = useState("");

  const fetchReports = async () => {
    if (!currentProjectId) return;
    try {
      setLoading(true);
      const [activeData, trashData] = await Promise.all([
        getProjectReports(currentProjectId),
        getProjectReportsTrash(currentProjectId)
      ]);
      if (activeData.reports) setActiveReports(activeData.reports);
      if (trashData.reports) setTrashReports(trashData.reports);
    } catch (err) {
      console.error("Failed to fetch reports:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    if (mounted) {
       
      fetchReports();
    }
    return () => {
      mounted = false;
    };
  }, [currentProjectId]);

  const handleAnalyze = async () => {
    if (!currentProjectId) return;
    setAnalyzing(true);
    setAnalyzingText("Iniciando análisis...");
    try {
      // El backend resuelve el modelo desde tool_model_mappings (BD).
      // No enviamos model/fallback_model: la BD es la única fuente de verdad.
      const res = await fetch(`${API_BASE_URL}/projects/${currentProjectId}/graph/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.type === "message_chunk") {
                fullText += parsed.text;
                setAnalyzingText(fullText);
              }
            } catch { /* skip */ }
          }
        }
      }

      if (fullText) {
        localStorage.setItem(`graph_analysis_${currentProjectId}`, fullText);
        // Refresh reports
        await  
      fetchReports();
      }
    } catch (err) {
      console.error(err);
      alert("Error al analizar el grafo con IA");
    } finally {
      setAnalyzing(false);
      setAnalyzingText("");
    }
  };

  const handleTrash = async (e: React.MouseEvent, reportId: string) => {
    e.stopPropagation();
    if (!currentProjectId) return;
    try {
      await trashProjectReport(currentProjectId, reportId);
      await  
      fetchReports();
    } catch (err) {
      console.error("Failed to trash report:", err);
    }
  };

  const handleRestore = async (e: React.MouseEvent, reportId: string) => {
    e.stopPropagation();
    if (!currentProjectId) return;
    try {
      await restoreProjectReport(currentProjectId, reportId);
      await  
      fetchReports();
    } catch (err) {
      console.error("Failed to restore report:", err);
    }
  };

  const handleDelete = async (e: React.MouseEvent, reportId: string) => {
    e.stopPropagation();
    if (!currentProjectId) return;
    
    // Importación dinámica para evitar problemas en SSR (si aplicara) aunque esto corre en cliente.
    const { confirm } = await import('@tauri-apps/plugin-dialog');
    const confirmed = await confirm('¿Seguro que deseas eliminar este reporte definitivamente?', {
      title: 'Eliminar Reporte',
      kind: 'warning',
    });
    
    if (!confirmed) return;

    try {
      await deleteProjectReport(currentProjectId, reportId);
      await  
      fetchReports();
    } catch (err) {
      console.error("Failed to delete report:", err);
    }
  };

  const parseDate = (dateString: string) => {
    return new Date(dateString + (dateString.endsWith('Z') ? '' : 'Z'));
  };

  const openReport = (report: Report) => {
    if (view === "trash") return; // No abrir reportes en la papelera
    addTab({
      id: `report-${report.id}`,
      title: `Reporte ${formatDistanceToNow(parseDate(report.created_at), { locale: es })}`,
      type: "ai-report",
      data: {
        reportId: report.id,
        markdown: report.content,
      },
    });
  };

  const getTitle = (markdown: string) => {
    const match = markdown.match(/^#\s+(.+)$/m);
    if (match) {
      return match[1].length > 80 ? match[1].substring(0, 80) + "..." : match[1];
    }
    return "Reporte de Arquitectura";
  };

  const getExcerpt = (markdown: string) => {
    const contentLines = markdown.split('\n');
    const contentBody = contentLines[0].startsWith('# ') ? contentLines.slice(1).join('\n') : markdown;
    const cleanText = contentBody
      .replace(/#+\s/g, "")
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1") 
      .replace(/\n+/g, " ")
      .trim();
    return cleanText.length > 200 ? cleanText.substring(0, 200) + "..." : cleanText;
  };

  if (!currentProjectId) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#0d0d0d] text-zinc-400">
        Selecciona un proyecto para ver el historial.
      </div>
    );
  }

  const reportsToShow = view === "active" ? activeReports : trashReports;

  return (
    <div className="w-full h-full bg-[#0d0d0d] overflow-y-auto custom-scrollbar flex flex-col">
      <div className="max-w-4xl mx-auto p-8 w-full">
        <div className="flex flex-col gap-4 border-b border-[#27272a] pb-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bot className="w-8 h-8 text-blue-500" />
              <div>
                <h1 className="text-2xl font-bold text-zinc-100">Historial de Análisis IA</h1>
                <p className="text-sm text-zinc-400">Registros y reportes generados para tu proyecto.</p>
              </div>
            </div>
            {view === "active" && (
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white rounded-lg transition-colors text-sm font-medium shadow-sm"
              >
                {analyzing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Brain className="w-4 h-4" />
                )}
                {analyzing ? "Analizando..." : "Volver a Analizar"}
              </button>
            )}
          </div>
          
          {/* Tabs */}
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setView("active")}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-colors border",
                view === "active" 
                  ? "bg-zinc-800 border-zinc-700 text-zinc-100" 
                  : "bg-transparent border-transparent text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/50"
              )}
            >
              Activos ({activeReports.length})
            </button>
            <button
              onClick={() => setView("trash")}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-colors border",
                view === "trash" 
                  ? "bg-zinc-800 border-zinc-700 text-zinc-100" 
                  : "bg-transparent border-transparent text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/50"
              )}
            >
              Papelera ({trashReports.length})
            </button>
          </div>
        </div>

        {analyzing && analyzingText && view === "active" && (
          <div className="mb-6 p-4 bg-[#151515] border border-blue-500/30 rounded-xl">
            <div className="flex items-center gap-2 mb-2 text-blue-400">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-sm font-medium">Generando nuevo reporte...</span>
            </div>
            <div className="max-h-32 overflow-y-auto text-xs text-zinc-400 font-mono leading-relaxed p-2 bg-[#0a0a0a] rounded border border-[#27272a] custom-scrollbar">
              {analyzingText.slice(-600)}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-pulse flex items-center gap-2 text-zinc-500">
              Cargando historial...
            </div>
          </div>
        ) : reportsToShow.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 border border-dashed border-[#27272a] rounded-xl bg-[#151515]">
            {view === "active" 
              ? "No hay reportes de IA activos para este proyecto. Inicia un análisis desde aquí o el Grafo 2D."
              : "La papelera está vacía."}
          </div>
        ) : (
          <div className="space-y-4">
            {reportsToShow.map((report) => (
              <div
                key={report.id}
                onClick={() => openReport(report)}
                className={cn(
                  "group flex flex-col gap-3 p-5 rounded-xl bg-[#151515] border border-[#27272a] transition-all shadow-sm",
                  view === "active" ? "hover:border-[#3f3f46] hover:bg-[#18181b] cursor-pointer hover:shadow-md" : "opacity-80"
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={cn(
                      "p-2 rounded-lg transition-colors shrink-0",
                      report.type === "db_audit"
                        ? "bg-indigo-500/10 group-hover:bg-indigo-500/20"
                        : "bg-emerald-500/10 group-hover:bg-emerald-500/20"
                    )}>
                      {report.type === "db_audit" ? (
                        <Database className="w-5 h-5 text-indigo-400" />
                      ) : (
                        <FileText className="w-5 h-5 text-emerald-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-semibold text-zinc-100 group-hover:text-blue-400 transition-colors truncate">
                          {getTitle(report.content)}
                        </h2>
                        {report.type === "db_audit" ? (
                          <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded-md text-[10px] font-medium shrink-0">
                            🗄️ Base de Datos
                          </span>
                        ) : (
                          <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-md text-[10px] font-medium shrink-0">
                            📄 Código / Grafo
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500 font-medium">
                        <span className="flex items-center gap-1.5 shrink-0">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDistanceToNow(parseDate(report.created_at), { addSuffix: true, locale: es })}
                        </span>
                        <span className="bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-700 text-zinc-300 font-mono text-[10px] shrink-0">
                          {report.ai_model_version.replace("gemini/", "")}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Acciones */}
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity ml-4 shrink-0">
                    {view === "active" ? (
                      <button
                        onClick={(e) => handleTrash(e, report.id)}
                        className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors"
                        title="Enviar a papelera"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={(e) => handleRestore(e, report.id)}
                          className="px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 rounded-md border border-zinc-700 transition-colors"
                        >
                          Restaurar
                        </button>
                        <button
                          onClick={(e) => handleDelete(e, report.id)}
                          className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors"
                          title="Eliminar definitivamente"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                
                <p className="text-sm text-zinc-400 leading-relaxed mt-1 line-clamp-2">
                  {getExcerpt(report.content)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
