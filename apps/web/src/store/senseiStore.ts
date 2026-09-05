import { create } from 'zustand';
import { apiWsUrl } from '@/lib/api';

/** WebSocket payloads dispatched through the unified socket channel. */
export interface ChatChunkEvent {
  type: 'chat_chunk';
  message_id: string;
  text: string;
  is_done: boolean;
  conversation_id?: number;
  error?: boolean;
}

export interface MarkerUpdateEvent {
  type: 'marker_update';
  markers: Array<{
    severity?: number;
    message: string;
    line: number;
    column?: number;
  }>;
}

export interface SyncOutOfOrderEvent {
  type: 'sync_out_of_order';
}

export type SocketEvent = ChatChunkEvent | MarkerUpdateEvent | SyncOutOfOrderEvent;

/**
 * Represents the live editor state for a specific tab.
 * Kept up-to-date by each EditorTab instance as the user moves the cursor.
 */
export interface SenseiEditorContext {
  /** Absolute path of the active file. */
  filePath: string;
  /** 1-indexed line number of the cursor or start of selection. */
  cursorLine: number;
  /** 1-indexed line number of the end of selection (optional). */
  endLine?: number;
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

  // ── Unified WebSocket Channel ──────────────────────────────────────────────
  /** Global WebSocket instance for syncing the active file and streaming Sensei chat */
  socket: WebSocket | null;
  /** Whether the socket is currently connected */
  isSocketConnected: boolean;
  /**
   * Number of active consumers (mounted EditorTab instances) sharing the
   * socket. connectSocket()/disconnectSocket() increment/decrement it; the
   * underlying WebSocket is only actually closed once it reaches zero, so
   * closing one editor tab (in split view) no longer kills sync/linting
   * for every other tab still open.
   */
  socketRefCount: number;
  /** The project the current socket connection was opened for, if any. */
  socketProjectId: string | null;
  /** Initializes the global WebSocket (reusing it, or switching projects). */
  connectSocket: (projectId: string) => void;
  /** Releases this consumer's hold on the global WebSocket. */
  disconnectSocket: () => void;
  /** Used by EditorTab to subscribe to marker updates or sync errors */
  addSocketListener: (listener: (data: SocketEvent) => void) => () => void;
  socketListeners: Array<(data: SocketEvent) => void>;
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

  socket: null,
  isSocketConnected: false,
  socketRefCount: 0,
  socketProjectId: null,
  socketListeners: [],
  addSocketListener: (listener) => {
    set((state) => ({ socketListeners: [...state.socketListeners, listener] }));
    return () => {
      set((state) => ({
        socketListeners: state.socketListeners.filter((l) => l !== listener),
      }));
    };
  },
  connectSocket: (projectId) => {
    const { socket, socketProjectId } = get();

    if (socket && socketProjectId !== projectId) {
      // A different project's tab is connecting: the existing connection's
      // server-side DocumentState (file_path/content/versionId) belongs to
      // the previous project's file and must not leak into this one. Hard
      // switch instead of reusing it, regardless of how many consumers the
      // old connection had (assumes switching the active project unmounts
      // its editor tabs first, as the app's single-project workspace does).
      socket.close();
      set({ socket: null, isSocketConnected: false, socketRefCount: 0, socketProjectId: null });
    } else if (socket) {
      // Same project, another tab: just register as another consumer.
      set((state) => ({ socketRefCount: state.socketRefCount + 1 }));
      return;
    }

    set((state) => ({ socketRefCount: state.socketRefCount + 1, socketProjectId: projectId }));

    const wsUrl = apiWsUrl('/sync/ws');
    const ws = new window.WebSocket(wsUrl);

    ws.onopen = () => {
      // Guard against a superseded connection's late event (see the
      // project-switch path above) overwriting the current socket's state.
      if (get().socket === ws) set({ isSocketConnected: true });
    };

    ws.onmessage = (event) => {
      if (get().socket !== ws) return;
      try {
        const data = JSON.parse(event.data);
        const { socketListeners } = get();
        socketListeners.forEach((listener) => listener(data));
      } catch (e) {
        console.error('Failed to parse WebSocket message', e);
      }
    };

    ws.onclose = () => {
      if (get().socket === ws) {
        set({ isSocketConnected: false, socket: null });
      }
      // In a real app we'd have reconnection logic here with backoff
    };

    set({ socket: ws });
  },
  disconnectSocket: () => {
    const { socket, socketRefCount } = get();
    const remaining = Math.max(0, socketRefCount - 1);
    if (remaining > 0) {
      set({ socketRefCount: remaining });
      return;
    }
    if (socket) socket.close();
    set({ socket: null, isSocketConnected: false, socketRefCount: 0, socketProjectId: null });
  },
}));
