import { ZoomIn, ZoomOut, Maximize, Play, Pause, Zap, ZapOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { graphUI } from "@/lib/graph-theme";

interface GraphToolbarProps {
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleFitView: () => void;
  isPhysicsActive: boolean;
  togglePhysics: () => void;
  enableFlow: boolean;
  setEnableFlow: (enable: boolean) => void;
}

export function GraphToolbar({
  handleZoomIn,
  handleZoomOut,
  handleFitView,
  isPhysicsActive,
  togglePhysics,
  enableFlow,
  setEnableFlow
}: GraphToolbarProps) {
  return (
    <div className={cn("absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex flex-row items-center rounded-lg overflow-hidden", graphUI.background, graphUI.blur, graphUI.border, graphUI.shadow)}>
      <button
        onClick={handleZoomIn}
        className="p-2 transition-colors text-zinc-400 hover:text-white hover:bg-[#3f3f46] focus-visible:ring-2 focus-visible:outline-none"
        title="Acercar (Zoom In)"
        aria-label="Acercar (Zoom In)"
      >
        <ZoomIn className="w-4 h-4" aria-hidden="true" />
      </button>
      <button
        onClick={handleFitView}
        className="p-2 border-l border-[#3f3f46] transition-colors text-zinc-400 hover:text-white hover:bg-[#3f3f46] focus-visible:ring-2 focus-visible:outline-none"
        title="Ajustar a la pantalla"
        aria-label="Ajustar a la pantalla"
      >
        <Maximize className="w-4 h-4" aria-hidden="true" />
      </button>
      <button
        onClick={handleZoomOut}
        className="p-2 border-l border-[#3f3f46] transition-colors text-zinc-400 hover:text-white hover:bg-[#3f3f46] focus-visible:ring-2 focus-visible:outline-none"
        title="Alejar (Zoom Out)"
        aria-label="Alejar (Zoom Out)"
      >
        <ZoomOut className="w-4 h-4" aria-hidden="true" />
      </button>

      <button
        onClick={togglePhysics}
        className={`p-2 border-l border-[#3f3f46] transition-colors focus-visible:ring-2 focus-visible:outline-none ${isPhysicsActive ? "text-emerald-400 hover:text-emerald-300 bg-emerald-950/20" : "text-zinc-500 hover:text-zinc-300 hover:bg-[#3f3f46]"}`}
        title={isPhysicsActive ? "Pausar Simulación Física" : "Reanudar Simulación Física"}
        aria-label={isPhysicsActive ? "Pausar Simulación Física" : "Reanudar Simulación Física"}
      >
        {isPhysicsActive ? <Pause className="w-4 h-4" aria-hidden="true" /> : <Play className="w-4 h-4" aria-hidden="true" />}
      </button>
      <button
        onClick={() => setEnableFlow(!enableFlow)}
        className={`p-2 border-l border-[#3f3f46] transition-colors focus-visible:ring-2 focus-visible:outline-none ${enableFlow ? "text-yellow-400 hover:text-yellow-300 bg-yellow-950/20" : "text-zinc-500 hover:text-zinc-300 hover:bg-[#3f3f46]"}`}
        title={enableFlow ? "Desactivar Flujo de Corriente" : "Activar Flujo de Corriente"}
        aria-label={enableFlow ? "Desactivar Flujo de Corriente" : "Activar Flujo de Corriente"}
      >
        {enableFlow ? <Zap className="w-4 h-4" aria-hidden="true" /> : <ZapOff className="w-4 h-4" aria-hidden="true" />}
      </button>
    </div>
  );
}
