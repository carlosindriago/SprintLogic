/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/preserve-manual-memoization */
"use client";

import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getProjectReport, createKanbanTicket, deleteKanbanTicket } from "../lib/api";
import type { TicketType, TicketPriority } from "@/types";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { MarkdownLink } from "./MarkdownLink";

import { Copy, Check, Download, Kanban, AlertTriangle, Plus, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WBSPlannerModal } from "./WBSPlannerModal";
import { generateWBS, WBSHierarchicalResponse, importWBSTickets, WBSImportTicket } from "../lib/api";
import { useTabsStore } from "@/store/tabsStore";

interface AIReportViewerProps {
  projectId: string | null;
  reportId?: string;
  markdown?: string;
}

interface ExtractedIssue {
  title: string;
  type: string;
  description: string;
  priority: string;
}

export function AIReportViewer({ projectId, reportId, markdown: initialMarkdown }: AIReportViewerProps) {
  const [content, setContent] = useState<string | null>(initialMarkdown || null);
  const [loading, setLoading] = useState<boolean>(!initialMarkdown && !!reportId);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  const [wbsModalOpen, setWbsModalOpen] = useState(false);
  const [wbsData, setWbsData] = useState<WBSHierarchicalResponse | null>(null);
  const [generatingWbs, setGeneratingWbs] = useState(false);

  const handleCopy = () => {
    if (content) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = async () => {
    if (!content) return;

    const now = new Date();
    const dateStr = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
    const timeStr = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
    const defaultFilename = `analisis-${projectId || 'reporte'}-${dateStr}-${timeStr}.md`;

    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');

      const filePath = await save({
        filters: [{
          name: 'Markdown',
          extensions: ['md']
        }],
        defaultPath: defaultFilename,
      });

      if (filePath) {
        await writeTextFile(filePath, content);
      }
    } catch (err) {
      console.warn("Fallback a descarga web normal:", err);
      const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = defaultFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  useEffect(() => {
    if (initialMarkdown) {
      return;
    }

    if (!projectId || !reportId) return;

    let mounted = true;
    const fetchReport = async () => {
      try {
        setLoading(true);
        const res = await getProjectReport(projectId, reportId);
        if (mounted) {
          setContent(res.content);
        }
      } catch (err: unknown) {
        if (mounted) {
          const error = err as Error;
          setError(error.message || "Failed to load report");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchReport();
    return () => {
      mounted = false;
    };
  }, [projectId, reportId, initialMarkdown]);

  const { cleanText, issues } = React.useMemo(() => {
    if (!content) return { cleanText: "", issues: [] };
    const match = content.match(/<kanban_issues>([\s\S]*?)<\/kanban_issues>/);
    if (!match) return { cleanText: content, issues: [] };

    const parsedText = content.replace(/<kanban_issues>[\s\S]*?<\/kanban_issues>/g, "").trim();
    const issuesXml = match[1];

    const issueRegex = /<issue>([\s\S]*?)<\/issue>/g;
    const extractedIssues: ExtractedIssue[] = [];
    let issueMatch;

    while ((issueMatch = issueRegex.exec(issuesXml)) !== null) {
      const issueBody = issueMatch[1];
      const getTag = (tag: string) => {
        const m = issueBody.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
        return m ? m[1].trim() : "";
      };
      extractedIssues.push({
        title: getTag("title"),
        type: getTag("type"),
        description: getTag("description"),
        priority: getTag("priority")
      });
    }

    return { cleanText: parsedText, issues: extractedIssues };
  }, [content]);

  const handleCreateTicket = async (issue: ExtractedIssue) => {
    if (!projectId) {
      toast.error("No se encontró el ID del proyecto");
      return;
    }

    const fileMatches = (issue.description + " " + issue.title).match(/[\w-]+\.(java|ts|tsx|py|php|go)/gi) || [];
    const affectedNodes = Array.from(new Set<string>(fileMatches)).map((f: string) => ({
      node_id: f,
      file_path: f,
    }));

    try {
      await createKanbanTicket(projectId, {
        title: issue.title,
        type: issue.type as TicketType,
        priority: issue.priority as TicketPriority,
        description: issue.description,
        report_id: reportId,
        affected_nodes: affectedNodes,
      });
      toast.success("Ticket registrado en Sprint Center", {
        description: `"${issue.title}" ha sido enviado a la columna TODO.`,
      });
    } catch (err) {
      console.error("Failed to create kanban ticket:", err);
      toast.error("Error al crear el ticket", {
        description: err instanceof Error ? err.message : "No se pudo conectar con el servidor.",
      });
    }
  };

  const handleLaunchPlanningStudio = () => {
    useTabsStore.getState().addTab({
      id: "planning-studio",
      title: "Planning Studio",
      type: "planning-studio",
      data: { markdown: cleanText, projectId: projectId || undefined }
    });
  };

  const handleGenerateWbs = async () => {
    if (!projectId || !cleanText) {
      toast.error("Faltan datos para generar el WBS");
      return;
    }
    try {
      setGeneratingWbs(true);
      // El backend resuelve el modelo desde tool_model_mappings (planning_studio).
      const res = await generateWBS(projectId, cleanText.substring(0, 5000));
      setWbsData(res);
      setWbsModalOpen(true);
    } catch (err) {
      toast.error("Error al generar WBS", {
        description: err instanceof Error ? err.message : "Fallo la conexión con el servidor LLM",
      });
    } finally {
      setGeneratingWbs(false);
    }
  };

  const handleSaveWbs = async (data: WBSHierarchicalResponse) => {
    if (!projectId) return;

    try {
      const ticketsToImport: WBSImportTicket[] = [];

      for (const pkg of data.work_packages) {
        const epicName = (pkg as any).epic || pkg.title;
        const sprintName = (pkg as any).sprint || "Sprint 1";
        
        for (const sub of pkg.subtasks) {
          const rawSubtasks = (sub as any).subtasks || [];
          const normalizedSubtasks = rawSubtasks.map((st: any, idx: number) => {
            if (typeof st === 'string') return { id: String(idx + 1), title: st, completed: false };
            return { id: st.id || String(idx + 1), title: st.title || String(st), completed: Boolean(st.completed) };
          });

          ticketsToImport.push({
            title: sub.title,
            type: ((sub as any).type as any) || "Feature",
            priority: ((sub as any).priority as any) || "Medium",
            description: sub.description ? `${sub.description}\n\nEstimated: ${sub.estimated_hours}h` : pkg.objective || "",
            branch_name: (sub as any).branch_name || undefined,
            subtasks: normalizedSubtasks,
            report_id: reportId,
            affected_nodes: [],
            epic: epicName,
            sprint: sprintName
          });
        }
      }

      const result = await importWBSTickets(projectId, ticketsToImport);
      toast.success(`Se crearon ${result.imported_count} tickets de WBS en Sprint Center`);
      setWbsModalOpen(false);
    } catch (err) {
      toast.error("Error guardando tareas WBS", { description: err instanceof Error ? err.message : String(err) });
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-32 w-full mt-6" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-red-500">
        <h2 className="text-xl font-bold mb-2">Error</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="p-6 text-muted-foreground">
        No content available.
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-[#0d0d0d] overflow-y-auto custom-scrollbar p-8 dark">
      <div className="max-w-4xl mx-auto mb-12 flex flex-col gap-4">
        <div className="flex justify-end gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleCopy}
            className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 h-8"
          >
            {copied ? <Check className="w-3.5 h-3.5 mr-2 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 mr-2" />}
            {copied ? "Copiado" : "Copiar todo"}
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleDownload}
            className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 h-8"
          >
            <Download className="w-3.5 h-3.5 mr-2" />
            Exportar .md
          </Button>
          <Button 
            variant="default" 
            size="sm" 
            onClick={handleLaunchPlanningStudio}
            disabled={generatingWbs}
            className="bg-blue-600 hover:bg-blue-700 text-white h-8"
          >
            <Network className="w-3.5 h-3.5 mr-2" />
            {generatingWbs ? "Generando WBS..." : "Planificador WBS"}
          </Button>
        </div>

        <div className="bg-[#151515] border border-[#27272a] rounded-xl shadow-2xl p-8 lg:p-12">
          <div className="prose prose-base prose-invert prose-zinc max-w-none text-zinc-300
            prose-headings:text-zinc-100 prose-headings:font-bold
            prose-h1:text-3xl prose-h1:mb-6 prose-h1:pb-4 prose-h1:border-b prose-h1:border-[#27272a]
            prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
            prose-h3:text-xl prose-h3:mt-8
            prose-a:text-blue-400 hover:prose-a:text-blue-300 prose-a:no-underline
            prose-code:text-emerald-400 prose-code:bg-emerald-400/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-normal prose-code:before:content-none prose-code:after:content-none
            prose-pre:bg-[#0a0a0a] prose-pre:border prose-pre:border-[#27272a]
            prose-strong:text-zinc-200
            prose-ul:list-disc prose-ul:pl-6
            prose-ol:list-decimal prose-ol:pl-6
            marker:text-zinc-500
          ">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: MarkdownLink,
            }}
          >
            {cleanText}
          </ReactMarkdown>
        </div>

        {issues.length > 0 && (
          <div className="mt-12 pt-8 border-t border-[#27272a]">
            <div className="flex items-center gap-2 mb-6">
              <Kanban className="w-6 h-6 text-blue-400" />
              <h2 className="text-2xl font-bold text-zinc-100">Tareas Accionables (Sprint Center)</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {issues.map((issue, idx) => (
                <div key={idx} className="bg-[#0f0f0f] border border-[#27272a] rounded-lg p-5 flex flex-col justify-between hover:border-blue-500/50 transition-colors">
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-md uppercase tracking-wider ${
                        issue.priority.toLowerCase().includes('high') ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 
                        issue.priority.toLowerCase().includes('medium') ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' : 
                        'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      }`}>
                        {issue.priority}
                      </span>
                      <span className="text-xs text-zinc-500 flex items-center gap-1 bg-zinc-900 px-2 py-1 rounded-md border border-zinc-800">
                        {issue.type}
                      </span>
                    </div>
                    <h3 className="text-zinc-200 font-bold mb-2 leading-tight">{issue.title}</h3>
                    <p className="text-sm text-zinc-400 mb-6 line-clamp-4">{issue.description}</p>
                  </div>
                  
                  <Button 
                    onClick={() => handleCreateTicket(issue)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/20"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Crear Ticket
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      <WBSPlannerModal 
        open={wbsModalOpen} 
        onOpenChange={setWbsModalOpen} 
        wbsData={wbsData} 
        onSave={handleSaveWbs} 
      />
    </div>
    </div>
  );
}
