import { create } from 'zustand';

export type ScanStatus = 'idle' | 'scanning' | 'abort_requested' | 'aborted' | 'completed' | 'failed';

interface ScanJob {
  status: ScanStatus;
  isMinimized: boolean;
}

interface BackgroundJobsState {
  activeScans: Record<string, ScanJob>;
  startScan: (projectId: string) => void;
  requestAbort: (projectId: string) => void;
  toggleMinimize: (projectId: string) => void;
  setScanStatus: (projectId: string, status: ScanStatus) => void;
  clearScan: (projectId: string) => void;
}

export const useBackgroundJobsStore = create<BackgroundJobsState>((set) => ({
  activeScans: {},

  startScan: (projectId) =>
    set((state) => ({
      activeScans: {
        ...state.activeScans,
        [projectId]: { status: 'scanning', isMinimized: false },
      },
    })),

  requestAbort: (projectId) =>
    set((state) => {
      const job = state.activeScans[projectId];
      if (!job || job.status !== 'scanning') return state;
      return {
        activeScans: {
          ...state.activeScans,
          [projectId]: { ...job, status: 'abort_requested' },
        },
      };
    }),

  toggleMinimize: (projectId) =>
    set((state) => {
      const job = state.activeScans[projectId];
      if (!job) return state;
      return {
        activeScans: {
          ...state.activeScans,
          [projectId]: { ...job, isMinimized: !job.isMinimized },
        },
      };
    }),

  setScanStatus: (projectId, status) =>
    set((state) => {
      const job = state.activeScans[projectId];
      if (!job) return state;
      return {
        activeScans: {
          ...state.activeScans,
          [projectId]: { ...job, status },
        },
      };
    }),

  clearScan: (projectId) =>
    set((state) => {
      const newScans = { ...state.activeScans };
      delete newScans[projectId];
      return { activeScans: newScans };
    }),
}));
