import React from 'react';
import { useLayoutStore } from '@/store/layoutStore';
import { useTabsStore } from '@/store/tabsStore';
import { Folder, Search, GitBranch, Settings, BarChart3, Network, Layout, FolderGit2, Bot, Play, Database, Beaker, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ActivityBar() {
  const { activeSidebarPanel, isDrawerOpen, setActiveSidebarPanel, toggleDrawer, setOmniSearchOpen, omniSearchOpen } = useLayoutStore();
  const addTab = useTabsStore((s) => s.addTab);

  const launchStudio = (id: string, title: string, type: import('@/store/tabsStore').TabType) => {
    addTab({ id, title, type });
    if (isDrawerOpen) toggleDrawer();
  };

  const isActive = (panel: 'explorer' | 'git') => activeSidebarPanel === panel && isDrawerOpen;

  return (
    <div className="w-12 h-full flex flex-col bg-[#0d0d0d] border-r border-zinc-800 shrink-0">
      <div className="flex flex-col gap-1 pt-2">
        <button
          onClick={() => setActiveSidebarPanel('explorer')}
          aria-label="Explorer"
          title="Explorer"
          className={cn(
            "w-10 h-10 rounded-lg mx-auto flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-blue-500",
            isActive('explorer') ? "bg-zinc-700/60 text-white" : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50"
          )}
        >
          <Folder className="w-5 h-5" aria-hidden="true" />
        </button>
        <button
          onClick={() => {
            setOmniSearchOpen(true);
          }}
          aria-label="Search"
          title="Buscar (Omni Search - Double Shift / Ctrl+P)"
          className={cn(
            "w-10 h-10 rounded-lg mx-auto flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-blue-500",
            omniSearchOpen ? "bg-zinc-700/60 text-white" : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50"
          )}
        >
          <Search className="w-5 h-5" aria-hidden="true" />
        </button>
        <button
          onClick={() => setActiveSidebarPanel('git')}
          aria-label="Git"
          title="Git"
          className={cn(
            "w-10 h-10 rounded-lg mx-auto flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-blue-500",
            isActive('git') ? "bg-zinc-700/60 text-white" : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50"
          )}
        >
          <GitBranch className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      <div className="w-6 mx-auto border-t border-zinc-800 my-2" />

      <div className="flex flex-col gap-1 overflow-y-auto">
        <button onClick={() => launchStudio('insights', 'Insights', 'insights')} aria-label="Insights" title="Insights" className="w-10 h-10 rounded-lg mx-auto flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-blue-500 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50">
          <BarChart3 className="w-5 h-5" aria-hidden="true" />
        </button>
        <button onClick={() => launchStudio('graph', 'Análisis Gráfico', 'graph')} aria-label="Análisis Gráfico" title="Análisis Gráfico" className="w-10 h-10 rounded-lg mx-auto flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-blue-500 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50">
          <Network className="w-5 h-5" aria-hidden="true" />
        </button>
        <button onClick={() => launchStudio('kanban', 'Kanban', 'kanban')} aria-label="Kanban" title="Kanban" className="w-10 h-10 rounded-lg mx-auto flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-blue-500 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50">
          <Layout className="w-5 h-5" aria-hidden="true" />
        </button>
        <button onClick={() => launchStudio('git-graph', 'Git Studio', 'git-graph')} aria-label="Git Studio" title="Git Studio" className="w-10 h-10 rounded-lg mx-auto flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-blue-500 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50">
          <FolderGit2 className="w-5 h-5" aria-hidden="true" />
        </button>
        <button onClick={() => launchStudio('ai-history', 'Historial IA', 'ai-history')} aria-label="Historial IA" title="Historial IA" className="w-10 h-10 rounded-lg mx-auto flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-blue-500 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50">
          <Bot className="w-5 h-5" aria-hidden="true" />
        </button>
        <button onClick={() => launchStudio('planning-studio', 'Planning Studio', 'planning-studio')} aria-label="Planning Studio" title="Planning Studio" className="w-10 h-10 rounded-lg mx-auto flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-blue-500 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50">
          <Play className="w-5 h-5" aria-hidden="true" />
        </button>
        <button onClick={() => launchStudio('database-studio', 'Database Studio', 'database-studio')} aria-label="Database Studio" title="Database Studio" className="w-10 h-10 rounded-lg mx-auto flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-blue-500 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50">
          <Database className="w-5 h-5" aria-hidden="true" />
        </button>
        <button onClick={() => launchStudio('test-studio', 'Test Studio', 'test-studio')} aria-label="Test Studio" title="Test Studio" className="w-10 h-10 rounded-lg mx-auto flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-blue-500 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50">
          <Beaker className="w-5 h-5" aria-hidden="true" />
        </button>
        <button onClick={() => launchStudio('document-studio', 'Document Studio', 'document-studio')} aria-label="Document Studio" title="Document Studio" className="w-10 h-10 rounded-lg mx-auto flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-blue-500 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50">
          <BookOpen className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-auto pb-2 flex flex-col gap-1">
        <button
          onClick={() => addTab({ id: 'settings', title: '⚙️ Configuración', type: 'settings' })}
          aria-label="⚙️ Configuración"
          title="Settings"
          className="w-10 h-10 rounded-lg mx-auto flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-blue-500"
        >
          <Settings className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
