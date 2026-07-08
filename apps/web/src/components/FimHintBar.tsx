"use client";

import { useEffect } from "react";
import { useFimStore } from "@/store/fimStore";
import { Loader2 } from "lucide-react";

export default function FimHintBar() {
  const explanation = useFimStore((s) => s.explanation);
  const setExplanation = useFimStore((s) => s.setExplanation);
  const isLoading = useFimStore((s) => s.isLoading);

  useEffect(() => {
    if (!explanation) return;
    const t = setTimeout(() => {
      setExplanation(null);
    }, 8000);
    return () => clearTimeout(t);
  }, [explanation, setExplanation]);

  if (!explanation) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-[#0d0d0d] border-t border-emerald-500/20 text-xs text-emerald-300/90 shrink-0">
      <span className="text-[10px]" aria-hidden>✨</span>
      <span className="truncate">
        {explanation}
      </span>
      <button
        onClick={() => setExplanation(null)}
        className="ml-auto text-zinc-500 hover:text-zinc-300 text-[10px] shrink-0"
        aria-label="Cerrar explicación"
      >
        ✕
      </button>
    </div>
  );
}
