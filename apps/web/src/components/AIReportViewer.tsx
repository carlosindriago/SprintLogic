"use client";

import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTabsStore } from "../store/tabsStore";
import { getProjectReport } from "../lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { MarkdownLink } from "./MarkdownLink";

import { Copy, Check, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AIReportViewerProps {
  projectId: string | null;
  reportId?: string;
  markdown?: string;
}

export function AIReportViewer({ projectId, reportId, markdown: initialMarkdown }: AIReportViewerProps) {
  const [content, setContent] = useState<string | null>(initialMarkdown || null);
  const [loading, setLoading] = useState<boolean>(!initialMarkdown && !!reportId);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
    </div>
  );
}
