"use client";

import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTabsStore } from "../store/tabsStore";
import { getProjectReport } from "../lib/api";
import { Skeleton } from "@/components/ui/skeleton";

interface AIReportViewerProps {
  projectId: string | null;
  reportId?: string;
  markdown?: string;
}

export function AIReportViewer({ projectId, reportId, markdown: initialMarkdown }: AIReportViewerProps) {
  const addTab = useTabsStore((state) => state.addTab);
  const [content, setContent] = useState<string | null>(initialMarkdown || null);
  const [loading, setLoading] = useState<boolean>(!initialMarkdown && !!reportId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialMarkdown) {
      setContent(initialMarkdown);
      setLoading(false);
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
      } catch (err: any) {
        if (mounted) {
          setError(err.message || "Failed to load report");
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
    <div className="p-6 max-w-4xl mx-auto h-full overflow-y-auto custom-scrollbar">
      <div className="prose prose-sm dark:prose-invert prose-zinc max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ node, href, children, ...props }) => {
              if (href?.startsWith("ide://")) {
                const filePath = href.replace("ide://", "");
                return (
                  <a
                    {...props}
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      addTab({
                        id: `editor-${filePath}`,
                        title: filePath.split("/").pop() || filePath,
                        type: "editor",
                        data: { filePath },
                      });
                    }}
                    className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 font-medium cursor-pointer"
                  >
                    {children}
                  </a>
                );
              }
              return (
                <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                  {children}
                </a>
              );
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
