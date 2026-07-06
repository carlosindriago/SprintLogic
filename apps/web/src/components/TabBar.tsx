import { useEffect } from 'react';
import { useTabsStore } from '@/store/tabsStore';
import { useMarkersStore } from '@/store/markersStore';
import { X, BarChart3, Layout, Network, GitBranch, FilePlus, FolderGit2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import FileIcon from './FileIcon';

const TAB_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: BarChart3,
  insights: BarChart3,
  kanban: Layout,
  graph: Network,
  'git-graph': GitBranch,
  audit: FolderGit2,
};

interface TabBarProps {
  onToggleAi?: () => void;
  aiOpen?: boolean;
  onNewFile?: () => void;
}

function TabMarkerBadge({
  path,
  markersFiles,
}: {
  path: string | null;
  markersFiles: Record<string, { errors: number; warnings: number }>;
}) {
  if (!path) return null;
  const markers = markersFiles[path];
  if (!markers || (markers.errors === 0 && markers.warnings === 0)) return null;
  return (
    <span className="flex items-center gap-0.5 shrink-0">
      {markers.errors > 0 && (
        <span className="inline-flex items-center justify-center min-w-[14px] h-3.5 px-1 rounded-full bg-red-500/20 text-[9px] font-semibold text-red-400 leading-none">
          <span className="sr-only">Errors: </span>
          {markers.errors}
        </span>
      )}
      {markers.warnings > 0 && (
        <span className="inline-flex items-center justify-center min-w-[14px] h-3.5 px-1 rounded-full bg-yellow-500/20 text-[9px] font-semibold text-yellow-400 leading-none">
          <span className="sr-only">Warnings: </span>
          {markers.warnings}
        </span>
      )}
    </span>
  );
}

export default function TabBar({ onToggleAi, aiOpen, onNewFile }: TabBarProps) {
  const { tabs, activeTabId, setActiveTab, removeTab } = useTabsStore();
  const markersFiles = useMarkersStore((s) => s.files);

  const getTabPath = (tab: (typeof tabs)[number]): string | null => {
    if (tab.type === 'editor') return tab.id;
    if (tab.type === 'diff') return tab.data?.filePath ?? null;
    return null;
  };

  useEffect(() => {
    const tabPaths = tabs.map(getTabPath).filter(Boolean);
    const matched = tabPaths.filter(p => p && markersFiles[p!]);
    if (matched.length > 0) {
      console.log('[tabbar] tabs with markers:', matched.map(p => `${p}: errors=${markersFiles[p!]?.errors} warnings=${markersFiles[p!]?.warnings}`));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, markersFiles]);

  return (
    <div className="flex bg-zinc-900 border-b border-zinc-800/50 overflow-x-auto overflow-y-hidden shrink-0" role="tablist" aria-label="Tabs">
      {tabs.map((tab) => {
        const IconComponent = TAB_ICONS[tab.type];
        const isFixed = tab.type === 'dashboard';
        const isGlobalTool = IconComponent != null;

        return (
        <div
          key={tab.id}
          role="tab"
          aria-selected={activeTabId === tab.id}
          tabIndex={0}
          className={cn(
            "group flex items-center gap-2 border-r border-zinc-800/50 text-sm cursor-pointer select-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:ring-inset",
            isGlobalTool ? "px-2.5 py-2" : "px-4 py-2 min-w-32 max-w-48",
            activeTabId === tab.id 
              ? "bg-zinc-800 text-blue-400 border-t-2 border-t-blue-500" 
              : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300 border-t-2 border-t-transparent"
          )}
          onClick={() => setActiveTab(tab.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveTab(tab.id);
            }
          }}
          title={isGlobalTool ? tab.title : undefined}
        >
          {isGlobalTool && IconComponent ? (
            <IconComponent className="w-4 h-4 shrink-0" />
          ) : tab.type === 'editor' ? (
            <FileIcon fileName={tab.title} className="w-3.5 h-3.5 shrink-0" />
          ) : null}
          
          {!isGlobalTool && <span className="truncate flex-1" title={tab.title}>{tab.title}</span>}
          {!isGlobalTool && <TabMarkerBadge path={getTabPath(tab)} markersFiles={markersFiles} />}
          
          {!isFixed && (
            <button
              type="button"
              aria-label={`Close ${tab.title} tab`}
              className={cn(
                "rounded-sm hover:bg-zinc-700 p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                activeTabId === tab.id ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              )}
              onClick={(e) => {
                e.stopPropagation();
                removeTab(tab.id);
              }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )})}
      <div className="ml-auto flex items-center shrink-0">
      {onNewFile && (
        <button
          onClick={onNewFile}
          className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium transition-colors text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
          title="Nuevo Archivo (Ctrl+N)"
        >
          <FilePlus className="w-3.5 h-3.5" />
        </button>
      )}
      {onToggleAi && (
        <button
          onClick={onToggleAi}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-l border-zinc-800/50",
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
    </div>
  );
}
