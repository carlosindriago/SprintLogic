import { create } from 'zustand';

interface FimState {
  explanation: string | null;
  setExplanation: (text: string | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  isFimEnabled: boolean;
  toggleFim: () => void;
}

export const useFimStore = create<FimState>((set) => ({
  explanation: null,
  setExplanation: (text) => set({ explanation: text }),
  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),
  isFimEnabled: false,
  toggleFim: () => set((state) => ({ isFimEnabled: !state.isFimEnabled })),
}));
