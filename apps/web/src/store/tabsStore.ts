import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { GraphNode } from '../types';

export type TabType = 'dashboard' | 'editor' | 'git-graph' | 'diff' | 'insights' | 'kanban' | 'graph' | 'audit' | 'ai-report' | 'ai-history' | 'auto-fix' | 'settings' | 'planning-studio' | 'database-studio' | 'test-studio' | 'document-studio' | 'execution-room' | 'security-studio';

const FIXED_TABS = new Set<string>();

export interface TabData {
  id: string;
  title: string;
  type: TabType;
  pinned?: boolean;
  data?: {
    node?: GraphNode;
    hash?: string;
    filePath?: string;
    reportId?: string;
    markdown?: string;
    projectId?: string;
    initialSection?: string;
    ticketId?: string;
    executionMode?: string;
  };
}

interface ProjectSession {
  tabs: TabData[];
  activeTabId: string | null;
}

interface TabsState {
  tabs: TabData[];
  activeTabId: string | null;
  dirtyFiles: Record<string, boolean>;
  currentProjectId: string | null;
  projectSessions: Record<string, ProjectSession>;

  addTab: (tab: TabData) => void;
  removeTab: (id: string) => void;
  closeTabs: (ids: string[]) => void;
  reorderTabs: (oldIndex: number, newIndex: number) => void;
  togglePinTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, partial: Partial<TabData>) => void;
  markDirty: (id: string, dirty: boolean) => void;
  setAllClean: () => void;
  switchProject: (projectId: string | null) => void;
  cycleTabs: (direction: 'next' | 'prev') => void;
}

const DEFAULT_SESSION: ProjectSession = {
  tabs: [{ id: 'dashboard', title: 'Dashboard', type: 'dashboard' }],
  activeTabId: 'dashboard',
};

const normalizeTab = (tab: TabData): TabData => {
  if ((tab.id === 'kanban' || tab.type === 'kanban') && (tab.title === 'Kanban' || !tab.title)) {
    return { ...tab, title: 'Sprint Center' };
  }
  return tab;
};

export const useTabsStore = create<TabsState>()(
  persist(
    (set, get) => ({
      tabs: DEFAULT_SESSION.tabs.map(normalizeTab),
      activeTabId: DEFAULT_SESSION.activeTabId,
      dirtyFiles: {},
      currentProjectId: null,
      projectSessions: {},

      addTab: (rawTab) => {
        const tab = normalizeTab(rawTab);
        const { tabs } = get();
        const exists = tabs.find(t => t.id === tab.id);
        if (exists) {
          if (exists.title !== tab.title) {
            set({
              tabs: tabs.map(t => t.id === tab.id ? { ...t, title: tab.title } : t),
              activeTabId: tab.id
            });
            return;
          }
          set({ activeTabId: tab.id });
          return;
        }
        set({ tabs: [...tabs, tab], activeTabId: tab.id });
      },

      removeTab: (id) => {
        const { tabs, activeTabId, dirtyFiles } = get();
        const tab = tabs.find(t => t.id === id);
        if (!tab) return;
        if (FIXED_TABS.has(tab.type) || tab.pinned) {
          set({ activeTabId: id });
          return;
        }
        const newTabs = tabs.filter(t => t.id !== id);
        const newDirty = { ...dirtyFiles };
        delete newDirty[id];
        if (activeTabId === id) {
          const closedIndex = tabs.findIndex(t => t.id === id);
          const nextTab = newTabs[closedIndex] || newTabs[closedIndex - 1] || newTabs[0];
          set({ tabs: newTabs, activeTabId: nextTab ? nextTab.id : null, dirtyFiles: newDirty });
        } else {
          set({ tabs: newTabs, dirtyFiles: newDirty });
        }
      },

      closeTabs: (ids) => {
        const { tabs, activeTabId, dirtyFiles } = get();
        const idsToClose = new Set(ids);
        
        // Proteger pestañas fijas, fijadas, o sucias (para no perder cambios sin modal)
        const newTabs = tabs.filter(t => !idsToClose.has(t.id) || FIXED_TABS.has(t.type) || t.pinned || dirtyFiles[t.id]);
        
        const activeExists = newTabs.some(t => t.id === activeTabId);
        set({ 
          tabs: newTabs, 
          activeTabId: activeExists ? activeTabId : (newTabs[newTabs.length - 1]?.id || null)
        });
      },

      reorderTabs: (oldIndex, newIndex) => {
        const { tabs } = get();
        if (oldIndex < 0 || oldIndex >= tabs.length || newIndex < 0 || newIndex >= tabs.length) return;
        
        const newTabs = [...tabs];
        const [moved] = newTabs.splice(oldIndex, 1);
        newTabs.splice(newIndex, 0, moved);
        set({ tabs: newTabs });
      },

      togglePinTab: (id) => {
        const { tabs } = get();
        const newTabs = tabs.map(t => t.id === id ? { ...t, pinned: !t.pinned } : t);
        
        // Mantener las pestañas fijadas a la izquierda (opcional, pero buena práctica UX)
        // Para respetar la posición exacta que quiere el usuario (Drag & Drop), 
        // simplemente alteramos la propiedad sin reordenar automáticamente, el usuario decidirá su orden.
        set({ tabs: newTabs });
      },

      setActiveTab: (id) => set({ activeTabId: id }),

      updateTab: (id, partial) => {
        const { tabs } = get();
        set({ tabs: tabs.map(t => t.id === id ? { ...t, ...partial } : t) });
      },

      markDirty: (id, dirty) => {
        const { dirtyFiles } = get();
        if (dirty) {
          set({ dirtyFiles: { ...dirtyFiles, [id]: true } });
        } else {
          const next = { ...dirtyFiles };
          delete next[id];
          set({ dirtyFiles: next });
        }
      },

      setAllClean: () => set({ dirtyFiles: {} }),

      switchProject: (projectId) => {
        const { currentProjectId, tabs, activeTabId, projectSessions } = get();

        // If we are already on this project, no need to switch.
        // This prevents accidental resets on app startup due to hydration syncing.
        if (projectId === currentProjectId) {
          return;
        }

        // Save current session
        const nextSessions = { ...projectSessions };
        if (currentProjectId) {
          nextSessions[currentProjectId] = { tabs, activeTabId };
        }

        // Load target session (or default if no previous session)
        const savedSession = projectId ? nextSessions[projectId] : undefined;
        let targetTabs = savedSession?.tabs;
        let targetActiveId = savedSession?.activeTabId;

        // Fallback against corrupted localStorage
        if (!Array.isArray(targetTabs) || targetTabs.length === 0) {
          targetTabs = [...DEFAULT_SESSION.tabs];
          targetActiveId = DEFAULT_SESSION.activeTabId;
        } else {
          targetTabs = targetTabs.map(normalizeTab);
        }

        if (!targetActiveId) {
          targetActiveId = targetTabs[0]?.id || DEFAULT_SESSION.activeTabId;
        }

        set({
          currentProjectId: projectId,
          projectSessions: nextSessions,
          tabs: targetTabs,
          activeTabId: targetActiveId,
          dirtyFiles: {},
        });
      },

      cycleTabs: (direction) => {
        const { tabs, activeTabId } = get();
        if (tabs.length <= 1) return;
        const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
        if (currentIndex === -1) return;
        const nextIndex = direction === 'next' 
          ? (currentIndex + 1) % tabs.length 
          : (currentIndex - 1 + tabs.length) % tabs.length;
        set({ activeTabId: tabs[nextIndex].id });
      },
    }),
    {
      name: 'sprintlogic-tabs',
      merge: (persistedState: unknown, currentState) => {
        // Safe merge to prevent corrupted localStorage from crashing the app
        const merged = { ...currentState, ...(persistedState as Partial<TabsState>) };
        if (!Array.isArray(merged.tabs) || merged.tabs.length === 0) {
          merged.tabs = [...DEFAULT_SESSION.tabs];
        } else {
          merged.tabs = merged.tabs.map(normalizeTab);
        }
        if (!merged.activeTabId) {
          merged.activeTabId = DEFAULT_SESSION.activeTabId;
        }
        if (!merged.projectSessions) {
          merged.projectSessions = {};
        } else {
          for (const pid in merged.projectSessions) {
            if (Array.isArray(merged.projectSessions[pid].tabs)) {
              merged.projectSessions[pid].tabs = merged.projectSessions[pid].tabs.map(normalizeTab);
            }
          }
        }
        return merged;
      },
      partialize: (state) => {
        const { tabs, activeTabId, currentProjectId, projectSessions } = state;
        const sessions = { ...projectSessions };
        if (currentProjectId) {
          sessions[currentProjectId] = { tabs, activeTabId };
        }
        return {
          currentProjectId,
          projectSessions: sessions,
          tabs,
          activeTabId,
        };
      },
    }
  )
);
