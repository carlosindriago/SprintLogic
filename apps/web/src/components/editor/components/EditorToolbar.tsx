import React from 'react';
import { cn } from '@/lib/utils';
import {
  Code2,
  ChevronRight,
  Pencil,
  Eye,
  MousePointer2,
  GraduationCap,
  Save,
  SaveAll,
  Sparkles,
  Loader2,
  Focus
} from 'lucide-react';

const TOOLBAR_BUTTON = "p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50 disabled:pointer-events-none";

interface EditorToolbarProps {
  fileName: string;
  filePath: string;
  isDirty: boolean;
  isUntitled: boolean;
  saving: boolean;
  vimMode: boolean;
  editorMode: 'locked' | 'visual' | 'editable';
  isCoachEnabled: boolean;
  isLoadingCoach: boolean;
  fileMarkers: { errors: number; warnings: number } | null | undefined;
  
  onSave: () => void;
  onSaveAll: () => void;
  onZenMode: () => void;
  onToggleCoach: () => void;
  onMentor?: () => void;
  
  onUndo: () => void;
  onRedo: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onFind: () => void;
  
  onTriggerType: (text: string) => void;
}

export function CoachToggleButton({ 
  isCoachEnabled, 
  isLoading, 
  onToggle 
}: { 
  isCoachEnabled: boolean; 
  isLoading: boolean;
  onToggle: () => void 
}) {
  return (
    <button
      className={cn(TOOLBAR_BUTTON, isCoachEnabled ? 'text-emerald-400' : 'text-zinc-500')}
      onClick={onToggle}
      title={
        !isCoachEnabled ? 'Code Coach desactivado' :
        isLoading ? 'Code Coach analizando...' : 'Code Coach activado — análisis pedagógico en segundo plano'
      }
      aria-label="Alternar AI Code Coach"
    >
      {isLoading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Sparkles className={cn("w-3.5 h-3.5", isCoachEnabled && "animate-pulse")} style={{ animationDuration: '3s' }} />
      )}
    </button>
  );
}

export function EditorToolbar({
  fileName,
  filePath,
  isDirty,
  isUntitled,
  saving,
  vimMode,
  editorMode,
  isCoachEnabled,
  isLoadingCoach,
  fileMarkers,
  onSave,
  onSaveAll,
  onZenMode,
  onToggleCoach,
  onMentor,
  onUndo,
  onRedo,
  onCut,
  onCopy,
  onPaste,
  onFind,
  onTriggerType,
}: EditorToolbarProps) {
  return (
    <div className="flex flex-col shrink-0">
      <div className="flex items-center gap-1 px-3 py-1.5 bg-[#1e1e1e] border-b border-zinc-800/50 shrink-0">
        <Code2 className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <span className="text-xs text-zinc-300 truncate max-w-[200px]">
          {fileName}
          {isDirty && <span className="text-yellow-400 ml-0.5">&bull;</span>}
        </span>

        {vimMode && (
          <span className="flex items-center gap-0.5 shrink-0">
            <span className={cn(
              "px-1.5 py-0.5 rounded text-[10px] transition-colors flex items-center gap-0.5 border",
              editorMode === 'locked'
                ? "bg-white/20 text-white border-white/30"
                : "text-zinc-500 border-transparent"
            )}>
              <Eye className="w-3 h-3" />
              Normal
            </span>
            <span className={cn(
              "px-1.5 py-0.5 rounded text-[10px] transition-colors flex items-center gap-0.5 border",
              editorMode === 'visual'
                ? "bg-purple-500/30 text-purple-200 border-purple-400/40"
                : "text-zinc-500 border-transparent"
            )}>
              <MousePointer2 className="w-3 h-3" />
              Visual
            </span>
            <button
              onClick={() => onTriggerType('i')}
              className={cn(
                "px-1.5 py-0.5 rounded text-[10px] transition-colors flex items-center gap-0.5 border",
                editorMode === 'editable'
                  ? "bg-green-500/30 text-green-200 border-green-400/40"
                  : "text-zinc-500 border-transparent hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/20"
              )}
              title="Modo Edición (i)"
            >
              <Pencil className="w-3 h-3" />
              Editar
            </button>
            {editorMode === 'editable' && (
              <button
                onClick={() => onTriggerType('\x1b')}
                className="px-1.5 py-0.5 rounded text-[10px] transition-colors flex items-center gap-0.5 border text-zinc-500 border-transparent hover:bg-blue-500/10 hover:text-blue-400 hover:border-blue-500/20"
                title="Volver a Modo Normal (ESC)"
              >
                <Eye className="w-3 h-3" />
                ESC
              </button>
            )}
          </span>
        )}

        <div className="flex-1" />

        <div className="flex items-center gap-0.5">
          <button
            className={TOOLBAR_BUTTON}
            onClick={onSave}
            disabled={(!isDirty && !isUntitled) || saving}
            title={isUntitled ? "Guardar como nuevo archivo" : "Guardar archivo actual (Ctrl+S)"}
            aria-label="Guardar archivo actual"
          >
            <Save className="w-3.5 h-3.5" />
          </button>

          <button
            className={TOOLBAR_BUTTON}
            onClick={onSaveAll}
            title="Guardar todos los archivos modificados"
            aria-label="Guardar todos los archivos"
          >
            <SaveAll className="w-3.5 h-3.5" />
          </button>
        </div>

        {onMentor && (
          <>
            <div className="w-px h-5 bg-zinc-700/50 mx-1" />

            <button
              className={TOOLBAR_BUTTON}
              onClick={onZenMode}
              title="Modo Zen (Lectura y Marcadores Semánticos)"
              aria-label="Abrir Modo Zen"
            >
              <Focus className="w-3.5 h-3.5" />
            </button>

            <CoachToggleButton 
              isCoachEnabled={isCoachEnabled} 
              isLoading={isLoadingCoach} 
              onToggle={onToggleCoach} 
            />
            <button
              className={TOOLBAR_BUTTON}
              onClick={onMentor}
              title="Abrir chat con el Sensei (mentor IA)"
              aria-label="Abrir chat con el Sensei"
            >
              <GraduationCap className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        <div className="w-px h-5 bg-zinc-700/50 mx-1" />

        <div className="flex items-center gap-0.5">
          <button className={TOOLBAR_BUTTON} onClick={onUndo} title="Deshacer (Ctrl+Z)" aria-label="Deshacer">
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
          </button>

          <button className={TOOLBAR_BUTTON} onClick={onRedo} title="Rehacer (Ctrl+Y)" aria-label="Rehacer">
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>
          </button>
        </div>

        <div className="w-px h-5 bg-zinc-700/50 mx-1" />

        <div className="flex items-center gap-0.5">
          <button className={TOOLBAR_BUTTON} onClick={onCut} title="Cortar (Ctrl+X)" aria-label="Cortar">
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
          </button>

          <button className={TOOLBAR_BUTTON} onClick={onCopy} title="Copiar (Ctrl+C)" aria-label="Copiar">
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>

          <button className={TOOLBAR_BUTTON} onClick={onPaste} title="Pegar (Ctrl+V)" aria-label="Pegar">
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
          </button>
        </div>

        <div className="w-px h-5 bg-zinc-700/50 mx-1" />

        <button className={TOOLBAR_BUTTON} onClick={onFind} title="Buscar (Ctrl+F)" aria-label="Buscar">
          <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
      </div>

      {filePath && (
        <div className="flex items-center justify-between text-xs text-zinc-400 bg-zinc-900 px-3 py-1 border-b border-zinc-800/50 shrink-0">
          <div className="flex items-center gap-0.5 truncate min-w-0">
            {filePath.split('/').filter(Boolean).map((seg, i, arr) => (
              i < arr.length - 1 ? (
                <span key={i} className="flex items-center gap-0.5 min-w-0">
                  <span className="truncate text-zinc-500">{seg}</span>
                  <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />
                </span>
              ) : (
                <span key={i} className="text-zinc-300 font-medium truncate">{seg}</span>
              )
            ))}
          </div>
          <div className="shrink-0 ml-2 flex items-center gap-2">
            {fileMarkers && (
              <>
                {fileMarkers.errors > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-red-400 font-medium">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                    {fileMarkers.errors}
                  </span>
                )}
                {fileMarkers.warnings > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-yellow-400 font-medium">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500" />
                    {fileMarkers.warnings}
                  </span>
                )}
                {fileMarkers.errors === 0 && fileMarkers.warnings === 0 && (
                  <span className="text-[11px] text-zinc-600">Sin errores</span>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
