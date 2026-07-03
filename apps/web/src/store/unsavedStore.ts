import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UnsavedState {
  files: Record<string, string>;
  getContent: (id: string) => string;
  setContent: (id: string, content: string) => void;
  clearContent: (id: string) => void;
}

export const useUnsavedStore = create<UnsavedState>()(
  persist(
    (set, get) => ({
      files: {},

      getContent: (id) => get().files[id] ?? '',

      setContent: (id, content) =>
        set((state) => {
          if (!content && state.files[id] === undefined) return state;
          if (!content) {
            const next = { ...state.files };
            delete next[id];
            return { files: next };
          }
          return { files: { ...state.files, [id]: content } };
        }),

      clearContent: (id) =>
        set((state) => {
          const next = { ...state.files };
          delete next[id];
          return { files: next };
        }),
    }),
    {
      name: 'sprintlogic-unsaved-storage',
    }
  )
);
