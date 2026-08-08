import { cn } from "@/lib/utils";
import { graphUI } from "@/lib/graph-theme";

interface GraphModuleLegendProps {
  moduleLegend: { name: string; color: string }[];
}

export function GraphModuleLegend({ moduleLegend }: GraphModuleLegendProps) {
  if (moduleLegend.length === 0) return null;

  return (
    <div className={cn("absolute top-4 right-4 z-10 flex flex-col gap-1 p-2 rounded-lg max-h-64 overflow-y-auto", graphUI.background, graphUI.blur, graphUI.border, graphUI.shadow)}>
      <span className="text-[10px] text-zinc-500 px-1 mb-1">Módulos</span>
      {moduleLegend.map((item) => (
        <div key={item.name} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-[#3f3f46] cursor-pointer text-xs">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
          <span className="text-zinc-400 truncate max-w-[120px]">{item.name}</span>
        </div>
      ))}
    </div>
  );
}
