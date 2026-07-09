"use client";

import { useEffect } from "react";
import { useFocusStore } from "@/store/focusStore";
import { useTabsStore } from "@/store/tabsStore";

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function useGlobalShortcuts() {
  const triggerFocus = useFocusStore((s) => s.triggerFocus);

  const cycleTabs = useTabsStore((s) => s.cycleTabs);

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

      if (mod && e.key === "PageDown") {
        e.preventDefault();
        e.stopPropagation();
        cycleTabs("next");
        return;
      }

      if (mod && e.key === "PageUp") {
        e.preventDefault();
        e.stopPropagation();
        cycleTabs("prev");
        return;
      }

      if (mod && e.shiftKey && (e.key === "S" || e.key === "s")) {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent("trigger-sensei"));
        return;
      }
    };

    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [triggerFocus, cycleTabs]);
}
