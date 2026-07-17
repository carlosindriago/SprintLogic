import { create } from 'zustand';

/**
 * Represents the live editor state for a specific tab.
 * Kept up-to-date by each EditorTab instance as the user moves the cursor.
 */
export interface SenseiEditorContext {
  /** Absolute path of the active file. */
  filePath: string;
  /** 1-indexed line number of the cursor. */
  cursorLine: number;
  /**
   * The most semantically relevant code block:
   *   1. Current text selection (preferred).
   *   2. Graceful fallback: content around the cursor.
   * Never the full file — kept under 4 000 chars to fit the LLM context window.
   */
  activeCode: string;
}

interface SenseiStore {
  // ── Sensei conversation state ──────────────────────────────────────────────
  /** True when a Sensei conversation is active. */
  isSenseiMode: boolean;
  /**
   * Context frozen at invocation time (when the user sent `/sensei <query>`).
   * Stays anchored until the user deactivates the mode or sends a new /sensei.
   * Can be null when the user asks a general question with no open file.
   */
  anchoredContext: SenseiEditorContext | null;

  // ── Live editor registry (Zustand replaces CustomEvent) ───────────────────
  /**
   * Maps tabId → live editor context, updated continuously by each EditorTab
   * as the cursor moves or the selection changes.
   * This is the Single Source of Truth for editor state — no DOM events needed.
   * Works correctly with Split View (multiple EditorTab instances).
   */
  editorContextByTabId: Record<string, SenseiEditorContext>;
  /**
   * The tab that currently has focus. Set by EditorTab on mount and on focus.
   * Used by SprintLogicChat to resolve which context to anchor.
   */
  activeTabId: string | null;

  // ── Actions ────────────────────────────────────────────────────────────────
  /**
   * Called by EditorTab on every cursor position change or selection change.
   * Keeps the registry fresh without triggering any DOM events.
   */
  updateEditorContext: (tabId: string, ctx: SenseiEditorContext) => void;
  /** Called by EditorTab on mount / focus-in to declare the active tab. */
  setActiveTabId: (tabId: string) => void;
  /** Called by EditorTab on unmount to avoid stale entries. */
  clearEditorContext: (tabId: string) => void;

  /**
   * Freezes the current live context of the active tab into `anchoredContext`
   * and activates Sensei mode. If no active tab exists, anchoredContext = null
   * (graceful: user can still ask general questions without code context).
   */
  activateSensei: () => void;
  deactivateSensei: () => void;
}

export const useSenseiStore = create<SenseiStore>((set, get) => ({
  isSenseiMode: false,
  anchoredContext: null,
  editorContextByTabId: {},
  activeTabId: null,

  updateEditorContext: (tabId, ctx) =>
    set((state) => ({
      editorContextByTabId: { ...state.editorContextByTabId, [tabId]: ctx },
    })),

  setActiveTabId: (tabId) => set({ activeTabId: tabId }),

  clearEditorContext: (tabId) =>
    set((state) => {
      const next = { ...state.editorContextByTabId };
      delete next[tabId];
      return { editorContextByTabId: next };
    }),

  activateSensei: () => {
    const { activeTabId, editorContextByTabId } = get();
    const ctx = activeTabId ? (editorContextByTabId[activeTabId] ?? null) : null;
    set({ isSenseiMode: true, anchoredContext: ctx });
  },

  deactivateSensei: () =>
    set({ isSenseiMode: false, anchoredContext: null }),
}));
