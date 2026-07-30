 
 
 
 
 

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PlanningState {
  projectStates: Record<string, {
    messages: { role: string; content: string }[];
    wbsData: unknown | null;
  }>;
  setProjectState: (projectId: string, state: { messages?: { role: string; content: string }[], wbsData?: unknown }) => void;
}

export const usePlanningStore = create<PlanningState>()(
  persist(
    (set) => ({
      projectStates: {},
      setProjectState: (projectId, state) => set((prev) => {
        const current = prev.projectStates[projectId] || { messages: [], wbsData: null };
        return {
          projectStates: {
            ...prev.projectStates,
            [projectId]: { ...current, ...state }
          }
        };
      })
    }),
    {
      name: 'sprintlogic-planning-storage'
    }
  )
);
