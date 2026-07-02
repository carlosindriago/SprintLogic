import { create } from 'zustand';

export interface ProjectInsights {
  tech_stack: Record<string, number>;
  total_files: number;
  global_markers: Record<string, unknown>;
}

interface InsightsState {
  data: ProjectInsights | null;
  loading: boolean;
  setData: (data: ProjectInsights) => void;
  setLoading: (loading: boolean) => void;
  clear: () => void;
}

export const useProjectInsightsStore = create<InsightsState>((set) => ({
  data: null,
  loading: false,
  setData: (data) => set({ data, loading: false }),
  setLoading: (loading) => set({ loading }),
  clear: () => set({ data: null, loading: false }),
}));
