import { create } from 'zustand';

interface FimState {
  explanation: string | null;
  setExplanation: (text: string | null) => void;
}

export const useFimStore = create<FimState>((set) => ({
  explanation: null,
  setExplanation: (text) => set({ explanation: text }),
}));
