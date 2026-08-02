import React from 'react';
import { useLayoutStore } from '@/store/layoutStore';
import { useTabsStore } from '@/store/tabsStore';
import { Folder, Search, GitBranch, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ActivityBar() {
  const { activeSidebarPanel, isDrawerOpen, setActiveSidebarPanel } = useLayoutStore();
  const addTab = useTabsStore((s) => s.addTab);

  const isActive = (panel: 'explorer' | 'search' | 'git') => activeSidebarPanel === panel && isDrawerOpen;

  return (
    <div className="w-12 h-full flex flex-col bg-[#0d0d0d] border-r border-zinc-800 shrink-0">
      <div className="flex flex-col gap-1 pt-2">
        <button
          onClick={() => setActiveSidebarPanel('explorer')}
          title="Explorer"
          className={cn(
            "w-10 h-10 rounded-lg mx-auto flex items-center justify-center transition-colors",
            isActive('explorer') ? "bg-zinc-700/60 text-white" : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50"
          )}
        >
          <Folder className="w-5 h-5" />
        </button>
        <button
          onClick={() => setActiveSidebarPanel('search')}
          title="Search"
          className={cn(
            "w-10 h-10 rounded-lg mx-auto flex items-center justify-center transition-colors",
            isActive('search') ? "bg-zinc-700/60 text-white" : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50"
          )}
        >
          <Search className="w-5 h-5" />
        </button>
        <button
          onClick={() => setActiveSidebarPanel('git')}
          title="Git"
          className={cn(
            "w-10 h-10 rounded-lg mx-auto flex items-center justify-center transition-colors",
            isActive('git') ? "bg-zinc-700/60 text-white" : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50"
          )}
        >
          <GitBranch className="w-5 h-5" />
        </button>
      </div>

      <div className="mt-auto pb-2 flex flex-col gap-1">
        <button
          onClick={() => addTab({ id: 'settings', title: '⚙️ Configuración', type: 'settings' })}
          title="Settings"
          className="w-10 h-10 rounded-lg mx-auto flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
