import { create } from 'zustand';

export interface MarkerData {
  line: number;
  column: number;
  message: string;
  severity: number; // 8=Error, 4=Warning, 2=Info, 1=Hint
}

export interface FileMarkerCounts {
  errors: number;
  warnings: number;
  markers: MarkerData[];
}

interface MarkersState {
  files: Record<string, FileMarkerCounts>;
  setMarkers: (uri: string, markers: MarkerData[]) => void;
  clearFile: (uri: string) => void;
  clearAll: () => void;
}

export const useMarkersStore = create<MarkersState>((set) => ({
  files: {},

  setMarkers: (uri, markers) =>
    set((state) => {
      if (markers.length === 0) {
        const next = { ...state.files };
        delete next[uri];
        return { files: next };
      }
      const errors = markers.filter((m) => m.severity === 8).length;
      const warnings = markers.filter((m) => m.severity === 4).length;
      return {
        files: {
          ...state.files,
          [uri]: { errors, warnings, markers },
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
