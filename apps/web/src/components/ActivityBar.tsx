import React from 'react';
import { useLayoutStore } from '@/store/layoutStore';
import { useTabsStore } from '@/store/tabsStore';
import { Folder, Search, GitBranch, Settings, BarChart3, Network, Layout, FolderGit2, Bot, Play, Database, Beaker, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ActivityBar() {
  const { activeSidebarPanel, isDrawerOpen, setActiveSidebarPanel, toggleDrawer } = useLayoutStore();
  const addTab = useTabsStore((s) => s.addTab);

  const launchStudio = (id: string, title: string, type: import('@/store/tabsStore').TabType) => {
    addTab({ id, title, type });
    if (isDrawerOpen) toggleDrawer();
  };

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

      <div className="w-6 mx-auto border-t border-zinc-800 my-2" />

      <div className="flex flex-col gap-1 overflow-y-auto">
        <button onClick={() => launchStudio('insights', 'Insights', 'insights')} title="Insights" className="w-10 h-10 rounded-lg mx-auto flex items-center justify-center transition-colors text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50">
          <BarChart3 className="w-5 h-5" />
        </button>
        <button onClick={() => launchStudio('graph', 'Análisis Gráfico', 'graph')} title="Análisis Gráfico" className="w-10 h-10 rounded-lg mx-auto flex items-center justify-center transition-colors text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50">
          <Network className="w-5 h-5" />
        </button>
        <button onClick={() => launchStudio('kanban', 'Kanban', 'kanban')} title="Kanban" className="w-10 h-10 rounded-lg mx-auto flex items-center justify-center transition-colors text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50">
          <Layout className="w-5 h-5" />
        </button>
        <button onClick={() => launchStudio('git-graph', 'Git Studio', 'git-graph')} title="Git Studio" className="w-10 h-10 rounded-lg mx-auto flex items-center justify-center transition-colors text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50">
          <FolderGit2 className="w-5 h-5" />
        </button>
        <button onClick={() => launchStudio('ai-history', 'Historial IA', 'ai-history')} title="Historial IA" className="w-10 h-10 rounded-lg mx-auto flex items-center justify-center transition-colors text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50">
          <Bot className="w-5 h-5" />
        </button>
        <button onClick={() => launchStudio('planning-studio', 'Planning Studio', 'planning-studio')} title="Planning Studio" className="w-10 h-10 rounded-lg mx-auto flex items-center justify-center transition-colors text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50">
          <Play className="w-5 h-5" />
        </button>
        <button onClick={() => launchStudio('database-studio', 'Database Studio', 'database-studio')} title="Database Studio" className="w-10 h-10 rounded-lg mx-auto flex items-center justify-center transition-colors text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50">
          <Database className="w-5 h-5" />
        </button>
        <button onClick={() => launchStudio('test-studio', 'Test Studio', 'test-studio')} title="Test Studio" className="w-10 h-10 rounded-lg mx-auto flex items-center justify-center transition-colors text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50">
          <Beaker className="w-5 h-5" />
        </button>
        <button onClick={() => launchStudio('document-studio', 'Document Studio', 'document-studio')} title="Document Studio" className="w-10 h-10 rounded-lg mx-auto flex items-center justify-center transition-colors text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50">
          <BookOpen className="w-5 h-5" />
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
