"use client";

import { useEffect, useReducer, useRef, useCallback, type RefObject } from "react";
import type { editor as monacoEditor } from "monaco-editor";
import { Keyboard, ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type VimTutorMode = "locked" | "visual" | "editable";

interface VimTutorHUDProps {
  editorRef: RefObject<monacoEditor.IStandaloneCodeEditor | null>;
  mode: VimTutorMode;
  vimEnabled: boolean;
  coachExplanation?: string | null;
}

const TIPS: Record<VimTutorMode, string[]> = {
  locked: [
    "i entra a Insert para editar texto · Esc vuelve a Normal",
    "v entra a Visual para seleccionar · y copia, d corta",
    "dd borra la línea completa, yy la copia, p la pega",
    "gg salta al inicio del archivo, G al final",
    "/texto busca, n salta a la siguiente coincidencia",
    "u deshace, Ctrl+r rehace",
    ":w guarda el archivo, :q sale del editor",
  ],
  visual: [
    "y copia la selección, d la corta, x la intercambia con el portapapeles",
    "> indenta la selección, < la des-indenta",
    "Esc vuelve a Normal en cualquier momento",
  ],
  editable: [
    "Esc vuelve a Normal",
    "Ctrl+o ejecuta un comando de Normal y vuelve a Insert",
    "Ctrl+n y Ctrl+p autocompletan palabras ya escritas en el archivo",
  ],
};

const MODE_LABELS: Record<VimTutorMode, string> = {
  locked: "NORMAL",
  visual: "VISUAL",
  editable: "INSERT",
};

const MODE_DOT: Record<VimTutorMode, string> = {
  locked: "bg-amber-400",
  visual: "bg-purple-400",
  editable: "bg-emerald-400",
};

const DOUBLE_KEY_WINDOW_MS = 500;
const CONTEXTUAL_TIP_DURATION_MS = 5000;
const ROTATION_INTERVAL_MS = 8000;

const ALL_MODES: VimTutorMode[] = ["locked", "visual", "editable"];

interface State {
  tipIndex: Record<VimTutorMode, number>;
  contextual: Record<VimTutorMode, string | null>;
}

const initialState: State = {
  tipIndex: { locked: 0, visual: 0, editable: 0 },
  contextual: { locked: null, visual: null, editable: null },
};

type Action =
  | { type: "rotate"; mode: VimTutorMode; total: number }
  | { type: "setTip"; mode: VimTutorMode; index: number }
  | { type: "setContextual"; mode: VimTutorMode; text: string | null };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "rotate": {
      if (action.total === 0) return state;
      const current = state.tipIndex[action.mode];
      return {
        ...state,
        tipIndex: { ...state.tipIndex, [action.mode]: (current + 1) % action.total },
      };
    }
    case "setTip":
      return { ...state, tipIndex: { ...state.tipIndex, [action.mode]: action.index } };
    case "setContextual":
      return { ...state, contextual: { ...state.contextual, [action.mode]: action.text } };
    default:
      return state;
  }
}

export default function ContextHUD({ editorRef, mode, vimEnabled, coachExplanation }: VimTutorHUDProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const lastKeyRef = useRef<{ key: string; time: number }>({ key: "", time: 0 });
  const contextualTimersRef = useRef<Partial<Record<VimTutorMode, ReturnType<typeof setTimeout>>>>({});

  const tipIndex = state.tipIndex[mode];
  const contextualTip = state.contextual[mode];
  const tips = TIPS[mode];

  const flashContextual = useCallback((text: string) => {
    const prev = contextualTimersRef.current[mode];
    if (prev) clearTimeout(prev);
    dispatch({ type: "setContextual", mode, text });
    contextualTimersRef.current[mode] = setTimeout(() => {
      dispatch({ type: "setContextual", mode, text: null });
    }, CONTEXTUAL_TIP_DURATION_MS);
  }, [mode]);

  useEffect(() => {
    if (!vimEnabled) return;
    if (tips.length === 0) return;
    const id = setInterval(() => {
      dispatch({ type: "rotate", mode, total: tips.length });
    }, ROTATION_INTERVAL_MS);
    return () => clearInterval(id);
  }, [vimEnabled, mode, tips.length]);

  useEffect(() => {
    if (!vimEnabled) return;
    const editor = editorRef.current;
    if (!editor) return;

    const sub = editor.onKeyDown((e) => {
      if (mode !== "locked") return;
      const key = e.browserEvent.key;
      if (!key || key.length !== 1) {
        lastKeyRef.current = { key: "", time: 0 };
        return;
      }
      const lower = key.toLowerCase();
      const now = Date.now();
      const last = lastKeyRef.current;
      const recent = now - last.time < DOUBLE_KEY_WINDOW_MS;

      if (recent && last.key === "d" && lower === "d") {
        flashContextual("dd: borra la línea completa. Vuelve a Normal.");
        lastKeyRef.current = { key: "", time: 0 };
        return;
      }
      if (recent && last.key === "y" && lower === "y") {
        flashContextual("yy: copia (yank) la línea completa. p la pega.");
        lastKeyRef.current = { key: "", time: 0 };
        return;
      }
      if (recent && last.key === "g" && lower === "g") {
        flashContextual("gg: salta al inicio. G (mayúscula) va al final.");
        lastKeyRef.current = { key: "", time: 0 };
        return;
      }

      if (lower === "i") {
        flashContextual("i: entrando a Insert. Pulsa Esc para volver a Normal.");
      } else if (lower === "v") {
        flashContextual("v: entrando a Visual. Selecciona y pulsa y para copiar o d para cortar.");
      } else if (key === "/") {
        flashContextual("/: modo búsqueda. Escribe el texto y Enter. n salta a la siguiente.");
      } else if (lower === "u") {
        flashContextual("u: deshace el último cambio. Ctrl+r lo rehace.");
      }

      lastKeyRef.current = { key: lower, time: now };
    });

    return () => sub.dispose();
  }, [editorRef, vimEnabled, mode, flashContextual]);

  useEffect(() => {
    const timers = contextualTimersRef.current;
    return () => {
      for (const m of ALL_MODES) {
        const t = timers[m];
        if (t) clearTimeout(t);
      }
    };
  }, []);

  if (!vimEnabled) return null;

  const displayTip = contextualTip ?? tips[tipIndex] ?? "";
  const modeLabel = MODE_LABELS[mode];

  return (
    <div
      data-testid="vim-tutor-hud"
      className="flex items-center gap-2 px-3 py-1 bg-[#0d0d0d] border-t border-amber-500/20 text-xs shrink-0"
    >
      <Keyboard className="w-3 h-3 text-amber-400 shrink-0" />
      <span className="text-[10px] font-semibold tracking-wider text-amber-400 shrink-0 uppercase">
        Context HUD
      </span>
      <span className="text-zinc-700">|</span>
      <span className="flex items-center gap-1 shrink-0">
        <span className={cn("inline-block w-1.5 h-1.5 rounded-full", MODE_DOT[mode])} />
        <span className="font-mono text-[11px] text-zinc-200">{modeLabel}</span>
      </span>
      <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />
      
      {coachExplanation ? (
        <span className="flex items-center gap-1.5 truncate flex-1 text-emerald-300">
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{coachExplanation}</span>
        </span>
      ) : (
        <span
          className={cn(
            "truncate flex-1 opacity-70",
            contextualTip ? "text-amber-100" : "text-zinc-300",
          )}
        >
          {displayTip}
        </span>
      )}

      {!coachExplanation && !contextualTip && tips.length > 1 && (
        <div className="flex gap-0.5 shrink-0">
          {tips.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => dispatch({ type: "setTip", mode, index: i })}
              className={cn(
                "w-1 h-1 rounded-full transition-colors",
                i === tipIndex ? "bg-amber-400" : "bg-zinc-700 hover:bg-zinc-500",
              )}
              aria-label={`Ver sugerencia ${i + 1} de ${tips.length}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
