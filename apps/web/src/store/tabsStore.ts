import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { GraphNode } from '../types';

export type TabType = 'dashboard' | 'editor' | 'git-graph' | 'diff' | 'insights' | 'kanban' | 'graph';

const FIXED_TABS = new Set(['dashboard', 'insights', 'kanban', 'graph', 'git-graph']);

export interface TabData {
  id: string;
  title: string;
  type: TabType;
  data?: {
    node?: GraphNode;
    hash?: string;
    filePath?: string;
  };
}

interface TabsState {
  tabs: TabData[];
  activeTabId: string | null;
  dirtyFiles: Record<string, boolean>;
  addTab: (tab: TabData) => void;
  removeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, partial: Partial<TabData>) => void;
  markDirty: (id: string, dirty: boolean) => void;
  setAllClean: () => void;
}

export const useTabsStore = create<TabsState>()(
  persist(
    (set, get) => ({
      tabs: [
        {
          id: 'dashboard',
          title: 'Dashboard',
          type: 'dashboard'
        }
      ],
      activeTabId: 'dashboard',
      dirtyFiles: {},

      addTab: (tab) => {
        const { tabs } = get();
        const exists = tabs.find(t => t.id === tab.id);
        
        if (exists) {
          set({ activeTabId: tab.id });
          return;
        }

        set({ 
          tabs: [...tabs, tab],
          activeTabId: tab.id
        });
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
        
        // If we are closing the active tab, switch to another tab
        if (activeTabId === id) {
          const closedIndex = tabs.findIndex(t => t.id === id);
          const nextTab = newTabs[closedIndex] || newTabs[closedIndex - 1] || newTabs[0];
          set({ tabs: newTabs, activeTabId: nextTab ? nextTab.id : null, dirtyFiles: newDirty });
        } else {
          set({ tabs: newTabs, dirtyFiles: newDirty });
        }
      },

      setActiveTab: (id) => {
        set({ activeTabId: id });
      },

      updateTab: (id, partial) => {
        const { tabs } = get();
        set({
          tabs: tabs.map(t => t.id === id ? { ...t, ...partial } : t)
        });
      },

      markDirty: (id, dirty) => {
        const { dirtyFiles } = get();
        if (dirty) {
          set({ dirtyFiles: { ...dirtyFiles, [id]: true } });
        } else {
          const newDirty = { ...dirtyFiles };
          delete newDirty[id];
          set({ dirtyFiles: newDirty });
        }
      },

      setAllClean: () => {
        set({ dirtyFiles: {} });
      }
    }),
    {
      name: 'sprintlogic-tabs-storage',
      partialize: (state) => {
        const { dirtyFiles, ...persisted } = state;
        return persisted;
      },
    }
  )
);
