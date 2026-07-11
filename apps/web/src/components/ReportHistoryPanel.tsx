"use client";

import React, { useEffect, useState } from "react";
import { useTabsStore } from "../store/tabsStore";
import { getProjectReports } from "../lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FileText, Clock, Bot } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale"; // Or en-US depending on your locale preference



interface Report {
  id: string;
  content: string;
  created_at: string;
  ai_model_version: string;
}

export function ReportHistoryPanel() {
  const currentProjectId = useTabsStore((state) => state.currentProjectId);
  const addTab = useTabsStore((state) => state.addTab);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentProjectId) {
      return;
    }

    let mounted = true;
    const fetchReports = async () => {
      try {
        setLoading(true);
        const data = await getProjectReports(currentProjectId);
        if (mounted && data.reports) {
          setReports(data.reports);
        }
      } catch (err) {
        console.error("Failed to fetch reports:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchReports();
    return () => {
      mounted = false;
    };
  }, [currentProjectId]);

  const parseDate = (dateString: string) => {
    return new Date(dateString + (dateString.endsWith('Z') ? '' : 'Z'));
  };

  const openReport = (report: Report) => {
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
    // Remove title line if present
    const contentLines = markdown.split('\n');
    const contentBody = contentLines[0].startsWith('# ') ? contentLines.slice(1).join('\n') : markdown;
    
    // Remove markdown headers, bold, italics, etc for a clean excerpt
    const cleanText = contentBody
      .replace(/#+\s/g, "")
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1") // link text
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

  return (
    <div className="w-full h-full bg-[#0d0d0d] overflow-y-auto custom-scrollbar">
      <div className="max-w-4xl mx-auto p-8">
        <div className="flex items-center gap-3 border-b border-[#27272a] pb-4 mb-8">
          <Bot className="w-8 h-8 text-blue-500" />
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Historial de Análisis IA</h1>
            <p className="text-sm text-zinc-400">Registros y reportes generados para tu proyecto.</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-pulse flex items-center gap-2 text-zinc-500">
              Cargando historial...
            </div>
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 border border-dashed border-[#27272a] rounded-xl bg-[#151515]">
            No hay reportes de IA para este proyecto. Inicia un análisis desde el Grafo 2D.
          </div>
        ) : (
          <div className="space-y-6">
            {reports.map((report) => (
              <div
                key={report.id}
                onClick={() => openReport(report)}
                className="group flex flex-col gap-3 p-6 rounded-xl bg-[#151515] border border-[#27272a] hover:border-[#3f3f46] hover:bg-[#18181b] transition-all cursor-pointer shadow-sm hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                      <FileText className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-zinc-100 group-hover:text-blue-400 transition-colors">
                        {getTitle(report.content)}
                      </h2>
                      <div className="flex items-center gap-4 mt-1 text-xs text-zinc-500 font-medium">
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDistanceToNow(parseDate(report.created_at), { addSuffix: true, locale: es })}
                        </span>
                        <span className="bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-700 text-zinc-300 font-mono">
                          {report.ai_model_version.replace("gemini/", "")}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <p className="text-sm text-zinc-400 leading-relaxed mt-2 line-clamp-3">
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
