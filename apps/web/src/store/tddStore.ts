import { create } from 'zustand';

interface TddState {
  locks: Record<string, 'locked' | 'unlocked'>;
  fetchTddLocks: (taskId: string) => Promise<void>;
  initializeSseListener: (taskId: string) => void;
}

let eventSource: EventSource | null = null;

export const useTddStore = create<TddState>((set) => ({
  locks: {},
  fetchTddLocks: async (taskId) => {
    try {
      const response = await fetch(`/api/v1/tdd/locks?task_id=${taskId}`);
      if (response.ok) {
        const data = await response.json();
        set({ locks: data.locks });
      }
    } catch {
      set({ status: 'error', isScanning: false });
    }
  },
  initializeSseListener: (taskId) => {
    if (eventSource) {
      eventSource.close();
    }
    eventSource = new EventSource(`/api/v1/tdd/events?task_id=${taskId}`);
    eventSource.addEventListener('tdd_guard_passed', (event) => {
      try {
        const { file } = JSON.parse(event.data);
        set((state) => ({
          locks: { ...state.locks, [file]: 'unlocked' }
        }));
      } catch {
        // ignore
      }
    });
  }
}));
