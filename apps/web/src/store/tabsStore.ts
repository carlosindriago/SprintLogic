import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { GraphNode } from '../types';

export type TabType = 'dashboard' | 'editor' | 'git-graph' | 'diff' | 'insights' | 'kanban' | 'graph' | 'audit' | 'ai-report' | 'ai-history';

const FIXED_TABS = new Set(['dashboard']);

export interface TabData {
  id: string;
  title: string;
  type: TabType;
  data?: {
    node?: GraphNode;
    hash?: string;
    filePath?: string;
    reportId?: string;
    markdown?: string;
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

export const useTabsStore = create<TabsState>()(
  persist(
    (set, get) => ({
      tabs: DEFAULT_SESSION.tabs,
      activeTabId: DEFAULT_SESSION.activeTabId,
      dirtyFiles: {},
      currentProjectId: null,
      projectSessions: {},

      addTab: (tab) => {
        const { tabs } = get();
        const exists = tabs.find(t => t.id === tab.id);
        if (exists) {
          set({ activeTabId: tab.id });
          return;
        }
        set({ tabs: [...tabs, tab], activeTabId: tab.id });
      },

      removeTab: (id) => {
        const { tabs, activeTabId, dirtyFiles } = get();
        const tab = tabs.find(t => t.id === id);
        if (!tab) return;
        if (FIXED_TABS.has(tab.type)) {
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

        // Save current session
        const nextSessions = { ...projectSessions };
        if (currentProjectId) {
          nextSessions[currentProjectId] = { tabs, activeTabId };
        }

        // Load target session (or default if no previous session)
        const target = projectId
          ? (nextSessions[projectId] ?? { ...DEFAULT_SESSION, tabs: [...DEFAULT_SESSION.tabs] })
          : DEFAULT_SESSION;

        set({
          currentProjectId: projectId,
          projectSessions: nextSessions,
          tabs: target.tabs,
          activeTabId: target.activeTabId,
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
