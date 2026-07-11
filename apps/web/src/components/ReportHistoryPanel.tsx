"use client";

import React, { useEffect, useState } from "react";
import { useTabsStore } from "../store/tabsStore";
import { getProjectReports } from "../lib/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Clock, Bot } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale"; // Or en-US depending on your locale preference

export function ReportHistoryPanel() {
  const currentProjectId = useTabsStore((state) => state.currentProjectId);
  const addTab = useTabsStore((state) => state.addTab);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentProjectId) {
      setReports([]);
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

  const openReport = (report: any) => {
    addTab({
      id: `report-${report.id}`,
      title: `Reporte ${formatDistanceToNow(new Date(report.created_at), { locale: es })}`,
      type: "ai-report",
      data: {
        reportId: report.id,
        // We can pass the markdown right away since we fetched it, 
        // avoiding a second roundtrip in AIReportViewer
        markdown: report.content,
      },
    });
  };

  if (!currentProjectId) {
    return (
      <div className="p-4 text-xs text-muted-foreground text-center">
        Selecciona un proyecto para ver el historial.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-sidebar">
      <div className="px-4 py-3 flex items-center justify-between border-b border-border/50">
        <span className="text-xs font-semibold text-sidebar-foreground uppercase tracking-wider flex items-center gap-2">
          <Bot className="w-4 h-4" />
          Historial IA
        </span>
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-4 text-xs text-muted-foreground animate-pulse">Cargando historial...</div>
        ) : reports.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground text-center">
            No hay reportes de IA para este proyecto.
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {reports.map((report) => (
              <button
                key={report.id}
                onClick={() => openReport(report)}
                className="w-full flex flex-col gap-1 p-2 text-left rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors group"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-sidebar-foreground group-hover:text-sidebar-accent-foreground">
                  <FileText className="w-4 h-4 text-blue-500" />
                  <span className="truncate">Reporte de Arquitectura</span>
                </div>
                <div className="flex items-center gap-3 pl-6 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDistanceToNow(new Date(report.created_at), { addSuffix: true, locale: es })}
                  </span>
                  <span className="bg-muted px-1.5 py-0.5 rounded text-[9px] font-mono border border-border">
                    {report.ai_model_version.replace("gemini/", "")}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
