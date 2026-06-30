import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProjectState {
  projectId: string | null;
  setProjectId: (id: string | null) => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      projectId: null,
      setProjectId: (id) => set({ projectId: id }),
    }),
    {
      name: 'sprintlogic-project-storage',
    }
  )
);
