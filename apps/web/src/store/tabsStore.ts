import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { GraphNode } from '../types';

export type TabType = 'dashboard' | 'editor' | 'git-graph' | 'diff';

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
  addTab: (tab: TabData) => void;
  removeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
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
        if (id === 'dashboard') return; // Cannot close dashboard

        const { tabs, activeTabId } = get();
        const newTabs = tabs.filter(t => t.id !== id);
        
        // If we are closing the active tab, switch to another tab
        if (activeTabId === id) {
          const closedIndex = tabs.findIndex(t => t.id === id);
          const nextTab = newTabs[closedIndex] || newTabs[closedIndex - 1] || newTabs[0];
          set({ tabs: newTabs, activeTabId: nextTab ? nextTab.id : null });
        } else {
          set({ tabs: newTabs });
        }
      },

      setActiveTab: (id) => {
        set({ activeTabId: id });
      }
    }),
    {
      name: 'sprintlogic-tabs-storage',
    }
  )
);
