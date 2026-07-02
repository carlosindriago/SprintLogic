"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useProjectInsightsStore } from "@/store/projectInsightsStore";

const EXT_LABELS: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TSX", ".js": "JavaScript", ".jsx": "JSX",
  ".py": "Python", ".json": "JSON", ".md": "Markdown", ".css": "CSS",
  ".html": "HTML", ".rs": "Rust", ".toml": "TOML", ".yaml": "YAML",
  ".yml": "YAML", ".sql": "SQL", ".sh": "Shell", ".svg": "SVG",
  ".png": "Image", ".jpg": "Image",
};

function extLabel(ext: string): string {
  return EXT_LABELS[ext] ?? ext.replace(".", "").toUpperCase();
}

export default function AnalysisReportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const data = useProjectInsightsStore((s) => s.data);

  if (!data) return null;

  const maxCount = Math.max(...Object.values(data.tech_stack), 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px] bg-zinc-900 text-zinc-200 border-zinc-800/50">
        <DialogHeader>
          <DialogTitle className="text-lg">Análisis Completado</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Escaneo estático de archivos del proyecto
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex items-baseline gap-2 px-3 py-2 rounded-lg bg-zinc-800/50">
            <span className="text-2xl font-bold text-blue-400">{data.total_files.toLocaleString()}</span>
            <span className="text-sm text-zinc-400">archivos encontrados</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
              Tech Stack
            </span>

            <div className="flex flex-col gap-2 max-h-[260px] overflow-y-auto custom-scrollbar pr-1">
              {Object.entries(data.tech_stack).map(([ext, count]) => {
                const pct = Math.round((count / data.total_files) * 100);
                return (
                  <div key={ext} className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-300">{extLabel(ext)}</span>
                      <span className="font-mono text-zinc-500">
                        {count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all duration-500"
                        style={{ width: `${Math.round((count / maxCount) * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
