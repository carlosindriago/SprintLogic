"use client";

import { useProjectInsightsStore } from "@/store/projectInsightsStore";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

const EXT_LABELS: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TSX",
  ".js": "JavaScript",
  ".jsx": "JSX",
  ".py": "Python",
  ".json": "JSON",
  ".md": "Markdown",
  ".css": "CSS",
  ".html": "HTML",
  ".rs": "Rust",
  ".toml": "TOML",
  ".yaml": "YAML",
  ".yml": "YAML",
  ".sql": "SQL",
  ".sh": "Shell",
  ".svg": "SVG",
  ".png": "Imagen",
  ".jpg": "Imagen",
};

function extLabel(ext: string): string {
  return EXT_LABELS[ext] ?? ext.replace(".", "").toUpperCase();
}

export default function ProjectInsightsPanel() {
  const { data, loading } = useProjectInsightsStore();

  if (!data && !loading) return null;

  return (
    <Card className="bg-zinc-800 border-zinc-700/50 text-zinc-200 mt-2 shrink-0">
      <CardHeader className="p-3 pb-2 border-b border-zinc-700/50/50">
        <CardTitle className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
          Project Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 text-xs text-zinc-400 flex flex-col gap-2">
        {loading && (
          <div className="flex items-center gap-2 text-zinc-500">
            <Loader2 className="w-3 h-3 animate-spin" />
            Analizando proyecto...
          </div>
        )}

        {data && (
          <>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-zinc-200">{data.total_files}</span>
              <span>archivos</span>
            </div>

            <div className="flex flex-col gap-1 mt-1">
              {Object.entries(data.tech_stack).slice(0, 8).map(([ext, count]) => (
                <div key={ext} className="flex items-center justify-between">
                  <span className="text-zinc-400">{extLabel(ext)}</span>
                  <span className="font-mono text-zinc-300">{count}</span>
                </div>
              ))}
              {Object.keys(data.tech_stack).length > 8 && (
                <span className="text-zinc-500 text-[10px]">
                  +{Object.keys(data.tech_stack).length - 8} tipos más
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
