import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface DaemonInsight {
  type?: string;
  message: string;
  anomaly?: { rule?: string };
  timestamp?: string;
}

interface NotificationState {
  insights: DaemonInsight[];
  addInsight: (insight: DaemonInsight) => void;
  drain: () => DaemonInsight[];
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      insights: [],

      addInsight: (insight) =>
        set((state) => ({ insights: [...state.insights, insight] })),

      drain: () => {
        const all = get().insights;
        set({ insights: [] });
        return all;
      },
    }),
    {
      name: 'sprintlogic-notifications',
      partialize: (state) => ({ insights: state.insights }),
      merge: (persisted, current) => {
        const raw = persisted as { insights?: DaemonInsight[] };
        const now = Date.now();
        const ttlMs = 4 * 60 * 60 * 1000;
        const filtered = (raw?.insights ?? []).filter((i) => {
          if (!i.timestamp) return true;
          const age = now - new Date(i.timestamp).getTime();
          return age < ttlMs;
        });
        return { ...current, insights: filtered };
      },
    },
  ),
);
