import { useEffect, useRef } from "react";
import { X } from "lucide-react";


interface CheatSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="bg-zinc-800 border border-zinc-700 shadow-[0_2px_0_rgba(255,255,255,0.1)] text-zinc-300 rounded-md px-1.5 py-0.5 text-xs font-mono font-medium">
    {children}
  </kbd>
);

const ShortcutRow = ({ label, keys }: { label: string; keys: string[] }) => (
  <div className="flex items-center justify-between py-1.5 border-b border-zinc-800/50 last:border-0">
    <span className="text-sm text-zinc-400">{label}</span>
    <div className="flex items-center gap-1.5">
      {keys.map((k, i) => (
        <Kbd key={i}>{k}</Kbd>
      ))}
    </div>
  </div>
);

export function CheatSheetModal({ isOpen, onClose }: CheatSheetModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      modalRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cheat-sheet-title"
        className="relative w-full max-w-2xl bg-[#0e0e0e] border border-[#27272a] rounded-xl shadow-2xl overflow-hidden outline-none flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-[#27272a] bg-[#111112]">
          <h2 id="cheat-sheet-title" className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            <span className="text-zinc-500">⌘</span> Atajos de Teclado
          </h2>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            aria-label="Cerrar modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Sección 1: Global */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Navegación Global</h3>
              <div className="space-y-1">
                <ShortcutRow label="Mostrar atajos (Cheat Sheet)" keys={["?"]} />
                <ShortcutRow label="Foco al explorador de archivos" keys={["⌘ / Ctrl", "B"]} />
                <ShortcutRow label="Guardar archivo actual" keys={["⌘ / Ctrl", "S"]} />
                <ShortcutRow label="Abrir terminal (si existe)" keys={["⌘ / Ctrl", "`"]} />
              </div>
            </div>

            {/* Sección 2: Editor (Vim) */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Editor Mónaco (Vim Mode)</h3>
              <div className="space-y-1">
                <ShortcutRow label="Modo Normal" keys={["Esc"]} />
                <ShortcutRow label="Modo Inserción" keys={["i"]} />
                <ShortcutRow label="Guardar cambios" keys={[":", "w", "Enter"]} />
                <ShortcutRow label="Deshacer" keys={["u"]} />
                <ShortcutRow label="Rehacer" keys={["Ctrl", "r"]} />
              </div>
            </div>

            {/* Sección 3: Mentoría & AI */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Mentoría Contextual</h3>
              <div className="space-y-1">
                <ShortcutRow label="Pedir análisis a la IA" keys={["⌘ / Ctrl", "Enter"]} />
                <ShortcutRow label="Toggle modo Zen" keys={["⌘ / Ctrl", "K", "Z"]} />
              </div>
            </div>
            
            {/* Sección 4: Kanban */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Kanban / Tareas</h3>
              <div className="space-y-1">
                <ShortcutRow label="Nueva tarea" keys={["c"]} />
                <ShortcutRow label="Sincronizar commits a tareas" keys={["s"]} />
              </div>
            </div>

          </div>
        </div>
        
        <div className="p-4 border-t border-[#27272a] bg-[#111112] text-center">
          <p className="text-xs text-zinc-500">
            SprintLogic Monorepo - Presiona <Kbd>Esc</Kbd> para cerrar
          </p>
        </div>
      </div>
    </div>
  );
}
