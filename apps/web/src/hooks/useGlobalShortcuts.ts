"use client";

import { useEffect } from "react";
import { useFocusStore } from "@/store/focusStore";

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function useGlobalShortcuts() {
  const triggerFocus = useFocusStore((s) => s.triggerFocus);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      if ((mod && e.shiftKey && e.key === "E") || (mod && e.shiftKey && e.key === "e")) {
        const tag = (e.target as HTMLElement).tagName;
        if (EDITABLE_TAGS.has(tag)) return;

        e.preventDefault();
        e.stopPropagation();
        triggerFocus("explorer");
        return;
      }

      if (mod && e.key === "1") {
        const tag = (e.target as HTMLElement).tagName;
        if (EDITABLE_TAGS.has(tag)) return;

        e.preventDefault();
        e.stopPropagation();
        triggerFocus("editor");
        return;
      }
    };

    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [triggerFocus]);
}
