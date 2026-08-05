import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProjectState {
  projectId: string | null;
  projectPath: string | null;
  isSwitchingProject: boolean;
  setProjectId: (id: string | null) => void;
  setProjectPath: (path: string | null) => void;
  setIsSwitchingProject: (loading: boolean) => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      projectId: null,
      projectPath: null,
      isSwitchingProject: false,
      setProjectId: (id) => set({ projectId: id }),
      setProjectPath: (path) => set({ projectPath: path }),
      setIsSwitchingProject: (loading) => set({ isSwitchingProject: loading }),
    }),
    {
      name: 'sprintlogic-project-storage',
      partialize: (state) => ({ projectId: state.projectId, projectPath: state.projectPath }),
    }
  )
);
