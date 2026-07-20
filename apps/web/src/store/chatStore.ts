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
  setDraftMode: (payload: DraftPayload | null) => void;
  clearDraftMode: () => void;
  setActiveConversationId: (id: number | null) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  isDraftMode: false,
  draftPayload: null,
  activeConversationId: null,
  setDraftMode: (payload) => set({ isDraftMode: true, draftPayload: payload }),
  clearDraftMode: () => set({ isDraftMode: false, draftPayload: null }),
  setActiveConversationId: (id) => set({ activeConversationId: id }),
}));
