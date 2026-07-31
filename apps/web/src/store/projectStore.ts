import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProjectState {
  projectId: string | null;
  projectPath: string | null;
  setProjectId: (id: string | null) => void;
  setProjectPath: (path: string | null) => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      projectId: null,
      projectPath: null,
      setProjectId: (id) => set({ projectId: id }),
      setProjectPath: (path) => set({ projectPath: path }),
    }),
    {
      name: 'sprintlogic-project-storage',
    }
  )
);
