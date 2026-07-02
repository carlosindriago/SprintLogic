import { create } from 'zustand';

export interface FileMarkerCounts {
  errors: number;
  warnings: number;
}

interface MarkersState {
  files: Record<string, FileMarkerCounts>;
  setMarkers: (uri: string, counts: FileMarkerCounts) => void;
  clearFile: (uri: string) => void;
  clearAll: () => void;
}

export const useMarkersStore = create<MarkersState>((set) => ({
  files: {},

  setMarkers: (uri, counts) =>
    set((state) => {
      if (counts.errors === 0 && counts.warnings === 0) {
        const next = { ...state.files };
        delete next[uri];
        return { files: next };
      }
      return {
        files: {
          ...state.files,
          [uri]: counts,
        },
      };
    }),

  clearFile: (uri) =>
    set((state) => {
      const next = { ...state.files };
      delete next[uri];
      return { files: next };
    }),

  clearAll: () => set({ files: {} }),
}));
