import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FimState {
  explanation: string | null;
  setExplanation: (text: string | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  
  // Persistent FIM Configuration
  fimEnabled: boolean;
  setFimEnabled: (enabled: boolean) => void;
  toggleFim: () => void;
  
  groqApiKey: string;
  setGroqApiKey: (key: string) => void;
  
  fimModel: string;
  setFimModel: (model: string) => void;
}

export const useFimStore = create<FimState>()(
  persist(
    (set) => ({
      explanation: null,
      setExplanation: (text) => set({ explanation: text }),
      isLoading: false,
      setIsLoading: (loading) => set({ isLoading: loading }),
      
      fimEnabled: false,
      setFimEnabled: (enabled) => set({ fimEnabled: enabled }),
      toggleFim: () => set((state) => ({ fimEnabled: !state.fimEnabled })),
      
      groqApiKey: '',
      setGroqApiKey: (key) => set({ groqApiKey: key }),
      
      fimModel: 'llama-3.1-8b-instant',
      setFimModel: (model) => set({ fimModel: model }),
    }),
    {
      name: 'sprintlogic-fim-config',
      partialize: (state) => ({
        fimEnabled: state.fimEnabled,
        groqApiKey: state.groqApiKey,
        fimModel: state.fimModel,
      }),
    }
  )
);
