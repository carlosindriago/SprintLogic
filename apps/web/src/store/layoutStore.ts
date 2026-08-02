import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type SidebarPanel = 'explorer' | 'search' | 'git' | null;

interface LayoutState {
  activeSidebarPanel: SidebarPanel;
  isDrawerOpen: boolean;
  drawerWidth: number;
  isDragging: boolean;
  setActiveSidebarPanel: (panel: SidebarPanel) => void;
  setDrawerWidth: (width: number) => void;
  setIsDragging: (v: boolean) => void;
  toggleDrawer: () => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      activeSidebarPanel: 'explorer',
      isDrawerOpen: true,
      drawerWidth: 240,
      isDragging: false,
      setActiveSidebarPanel: (panel) =>
        set({
          activeSidebarPanel: panel,
          isDrawerOpen:
            panel === null ? false
            : panel === get().activeSidebarPanel ? !get().isDrawerOpen
            : true,
        }),
      setDrawerWidth: (width) =>
        set({ drawerWidth: Math.max(160, Math.min(480, width)) }),
      setIsDragging: (v) => set({ isDragging: v }),
      toggleDrawer: () => set((s) => ({ isDrawerOpen: !s.isDrawerOpen })),
    }),
    { name: 'sprintlogic-layout' }
  )
);
