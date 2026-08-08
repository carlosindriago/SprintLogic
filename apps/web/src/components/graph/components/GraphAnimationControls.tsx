import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import { graphUI } from "@/lib/graph-theme";

interface GraphAnimationControlsProps {
  timeRange: { min: number; max: number } | null;
  animating: boolean;
  setAnimating: (animating: boolean) => void;
  animProgress: number;
  setAnimProgress: (progress: number) => void;
}

export function GraphAnimationControls({
  timeRange,
  animating,
  setAnimating,
  animProgress,
  setAnimProgress
}: GraphAnimationControlsProps) {
  if (!timeRange) return null;

  return (
    <div className={cn("absolute bottom-24 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 px-4 py-2 rounded-lg", graphUI.background, graphUI.blur, graphUI.border, graphUI.shadow)}>
      <button
        onClick={() => {
          if (animating) {
            setAnimating(false);
          } else {
            setAnimProgress(0);
            setAnimating(true);
          }
        }}
        className="p-1.5 rounded transition-colors text-zinc-400 hover:text-white hover:bg-[#3f3f46]"
        title={animating ? "Pausar" : "Animar"}
      >
        {animating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(animProgress * 100)}
        onChange={(e) => {
          setAnimating(false);
          setAnimProgress(Number(e.target.value) / 100);
        }}
        className="w-32 h-1 accent-blue-500 cursor-pointer"
      />
      <button
        onClick={() => { setAnimating(false); setAnimProgress(1); }}
        className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        {Math.round(animProgress * 100)}%
      </button>
    </div>
  );
}
