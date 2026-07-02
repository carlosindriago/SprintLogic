import { useTabsStore } from '@/store/tabsStore';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import FileIcon from './FileIcon';

interface TabBarProps {
  onToggleAi?: () => void;
  aiOpen?: boolean;
}

export default function TabBar({ onToggleAi, aiOpen }: TabBarProps) {
  const { tabs, activeTabId, setActiveTab, removeTab } = useTabsStore();

  return (
    <div className="flex bg-zinc-900 border-b border-zinc-800/50 overflow-x-auto overflow-y-hidden shrink-0">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={cn(
            "group flex items-center gap-2 px-4 py-2 border-r border-zinc-800/50 min-w-32 max-w-48 text-sm cursor-pointer select-none transition-colors",
            activeTabId === tab.id 
              ? "bg-zinc-800 text-blue-400 border-t-2 border-t-blue-500" 
              : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300 border-t-2 border-t-transparent"
          )}
          onClick={() => setActiveTab(tab.id)}
        >
          {tab.type === 'editor' && <FileIcon fileName={tab.title} className="w-3.5 h-3.5 shrink-0" />}
          <span className="truncate flex-1" title={tab.title}>{tab.title}</span>
          
          {tab.id !== 'dashboard' && (
            <div 
              className={cn(
                "rounded-sm hover:bg-zinc-700 p-0.5",
                activeTabId === tab.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}
              onClick={(e) => {
                e.stopPropagation();
                removeTab(tab.id);
              }}
            >
              <X className="w-3.5 h-3.5" />
            </div>
          )}
        </div>
      ))}

      {onToggleAi && (
        <button
          onClick={onToggleAi}
          className={cn(
            "ml-auto shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-l border-zinc-800/50",
            aiOpen
              ? "bg-blue-600/20 text-blue-400"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
          )}
          title="SprintLogic AI"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>
          <span>AI</span>
        </button>
      )}
    </div>
  );
}
