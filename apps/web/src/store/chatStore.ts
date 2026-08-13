import { create } from 'zustand';

export interface DraftPayload {
  action: string;
  filepath: string;
  type: string;
  content: Record<string, unknown>;
  tool_call_id: string;
}

interface ChatStore {
  isDraftMode: boolean;
  draftPayload: DraftPayload | null;
  activeConversationId: number | null;
  pendingQuery: string | null;
  isChatOpen: boolean;
  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
  setDraftMode: (payload: DraftPayload | null) => void;
  clearDraftMode: () => void;
  setActiveConversationId: (id: number | null) => void;
  setPendingQuery: (query: string | null) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  isDraftMode: false,
  draftPayload: null,
  activeConversationId: null,
  pendingQuery: null,
  isChatOpen: false,
  openChat: () => set({ isChatOpen: true }),
  closeChat: () => set({ isChatOpen: false }),
  toggleChat: () => set((state) => ({ isChatOpen: !state.isChatOpen })),
  setDraftMode: (payload) => set({ isDraftMode: true, draftPayload: payload }),
  clearDraftMode: () => set({ isDraftMode: false, draftPayload: null }),
  setActiveConversationId: (id) => set({ activeConversationId: id }),
  setPendingQuery: (query) => set({ pendingQuery: query }),
}));
