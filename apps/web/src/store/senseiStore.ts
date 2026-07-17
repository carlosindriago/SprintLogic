import { create } from 'zustand';

/**
 * The editor context captured when the user triggers Sensei mode.
 * Anchored to the specific code the user was looking at when they
 * invoked the command — NOT re-captured on tab switches.
 */
export interface SenseiEditorContext {
  /** Absolute path of the active file at invocation time. */
  filePath: string;
  /** 1-indexed line number of the cursor at invocation time. */
  cursorLine: number;
  /**
   * The relevant code block (up to 60 surrounding lines or the
   * selection, whichever is more specific). Never the full file.
   */
  activeCode: string;
}

interface SenseiStore {
  /** True when a Sensei conversation is currently anchored. */
  isSenseiMode: boolean;
  /**
   * The frozen editor context captured at invocation time.
   * Remains constant until the user sends a new /sensei command.
   */
  anchoredContext: SenseiEditorContext | null;

  activateSensei: (context: SenseiEditorContext) => void;
  deactivateSensei: () => void;
}

export const useSenseiStore = create<SenseiStore>((set) => ({
  isSenseiMode: false,
  anchoredContext: null,

  activateSensei: (context) =>
    set({ isSenseiMode: true, anchoredContext: context }),

  deactivateSensei: () =>
    set({ isSenseiMode: false, anchoredContext: null }),
}));
