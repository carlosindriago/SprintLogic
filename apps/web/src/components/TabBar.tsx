'use client';

import { useState, useEffect } from 'react';
import { useTabsStore, TabData } from '@/store/tabsStore';
import { useMarkersStore } from '@/store/markersStore';
import { useUnsavedStore } from '@/store/unsavedStore';
import { draftStore } from '@/lib/draftStore';
import { X, BarChart3, Layout, Network, GitBranch, FilePlus, FolderGit2, Save, Trash2, AlertTriangle, Bot, NotebookPen, Zap, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import FileIcon from './FileIcon';
import { useOmniPadStore } from '@/store/omniPadStore';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, ContextMenuSeparator } from '@/components/ui/context-menu';

const TAB_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: BarChart3,
  insights: BarChart3,
  kanban: Layout,
  graph: Network,
  'git-graph': GitBranch,
  'prompt-studio': Bot,
  audit: FolderGit2,
  'execution-room': Zap,
  'security-studio': ShieldAlert,
};

interface TabBarProps {
  onToggleAi?: () => void;
  aiOpen?: boolean;
  onNewFile?: () => void;
  projectId?: string;
}

interface CloseConfirmState {
  tabId: string;
  tabTitle: string;
  filePath: string | null;
  phase: 'confirm' | 'discard-confirm';
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

function CloseConfirmModal({
  state,
  onSave,
  onDiscard,
  onCancel,
  isSaving,
}: {
  state: CloseConfirmState;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  // Trap focus inside modal
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-modal-title"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      <div className="relative z-10 w-full max-w-md mx-4 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          <div className="shrink-0 w-9 h-9 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
            <AlertTriangle className="w-4.5 h-4.5 text-yellow-400" />
          </div>
          <div className="min-w-0">
            <h2 id="close-modal-title" className="text-sm font-semibold text-white">
              {state.phase === 'discard-confirm'
                ? 'Are you sure you want to discard changes?'
                : 'Unsaved changes'}
            </h2>
            <p className="mt-1 text-xs text-zinc-400 truncate">
              <span className="text-zinc-300 font-medium">{state.tabTitle}</span>
              {' '}has unsaved changes that will be lost if you close it.
            </p>
          </div>
        </div>

        <div className="border-t border-zinc-800" />

        {state.phase === 'discard-confirm' ? (
          <div className="px-5 py-4">
            <p className="text-xs text-zinc-400 mb-4">
              This action is <span className="text-red-400 font-semibold">permanent and cannot be undone</span>.
              All unsaved changes will be lost forever.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={onCancel}
                className="px-3 py-1.5 text-xs rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                Keep editing
              </button>
              <button
                onClick={onDiscard}
                className="px-3 py-1.5 text-xs rounded-md bg-red-600 hover:bg-red-500 text-white font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/50 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                Discard permanently
              </button>
            </div>
          </div>
        ) : (
          <div className="px-5 py-4 flex gap-2 justify-end">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-xs rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              Cancel
            </button>
            <button
              onClick={onDiscard}
              disabled={isSaving}
              className="px-3 py-1.5 text-xs rounded-md border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/50 disabled:opacity-40"
            >
              Don&apos;t save
            </button>
            <button
              onClick={onSave}
              disabled={isSaving}
              className="px-3 py-1.5 text-xs rounded-md bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 flex items-center gap-1.5 disabled:opacity-40"
            >
              <Save className="w-3.5 h-3.5" aria-hidden="true" />
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SortableTab({ 
  tab, 
  activeTabId, 
  dirtyFiles, 
  markersFiles, 
  setActiveTab, 
  handleCloseRequest, 
  getTabPath, 
  tabs, 
  onNewFile 
}: {
  tab: TabData;
  activeTabId: string | null;
  dirtyFiles: Record<string, boolean>;
  markersFiles: Record<string, { errors: number; warnings: number }>;
  setActiveTab: (id: string) => void;
  handleCloseRequest: (e: React.MouseEvent, tab: TabData) => void;
  getTabPath: (tab: TabData) => string | null;
  tabs: TabData[];
  onNewFile?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tab.id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  const IconComponent = TAB_ICONS[tab.type];
  const isFixed = false;
  const isPinned = !!tab.pinned;
  const currentIndex = tabs.findIndex(t => t.id === tab.id);
  const tabTitle = (tab.id === 'kanban' || tab.type === 'kanban') && (tab.title === 'Kanban' || !tab.title) ? 'Sprint Center' : tab.title;

  const handleClose = (ids: string[]) => {
    useTabsStore.getState().closeTabs(ids);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger className="contents">
        <div
          ref={setNodeRef}
          style={style}
          {...attributes}
          {...listeners}
          role="tab"
          aria-selected={activeTabId === tab.id}
          tabIndex={0}
          className={cn(
            "group flex items-center gap-2 border-r border-zinc-800/50 text-sm cursor-pointer select-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:ring-inset",
            isPinned ? "px-2.5 py-2 w-12 justify-center" : "px-4 py-2 min-w-32 max-w-48",
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
          title={isPinned ? tabTitle : undefined}
        >
          {IconComponent ? (
            <IconComponent className="w-4 h-4 shrink-0" />
          ) : (
            <FileIcon fileName={tabTitle} className="w-3.5 h-3.5 shrink-0" />
          )}
          
          {!isPinned && (
            <>
              <span className="truncate flex-1" title={tabTitle}>{tabTitle}</span>
              {dirtyFiles[tab.id] && (
                <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" title="Unsaved changes" />
              )}
              <TabMarkerBadge path={getTabPath(tab)} markersFiles={markersFiles} />
              
              {!isFixed && (
                <button
                  type="button"
                  aria-label={`Cerrar pestaña ${tabTitle}`}
                  className={cn(
                    "rounded-sm hover:bg-zinc-700 p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                    activeTabId === tab.id ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  )}
                  onPointerDown={(e) => e.stopPropagation()} // Prevent drag start when clicking close
                  onClick={(e) => handleCloseRequest(e, tab)}
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </>
          )}
        </div>
      </ContextMenuTrigger>
      
      <ContextMenuContent className="w-48 bg-zinc-900 border-zinc-700 text-zinc-200">
        <ContextMenuItem className="focus:bg-zinc-800 focus:text-white cursor-pointer" onSelect={() => useTabsStore.getState().togglePinTab(tab.id)}>
          {isPinned ? "Desfijar pestaña" : "Fijar pestaña"}
        </ContextMenuItem>
        {onNewFile && (
          <ContextMenuItem className="focus:bg-zinc-800 focus:text-white cursor-pointer" onSelect={() => onNewFile()}>
            Nueva pestaña
          </ContextMenuItem>
        )}
        
        <ContextMenuSeparator className="bg-zinc-700" />
        
        <ContextMenuItem 
          disabled={isFixed || isPinned}
          className="focus:bg-zinc-800 focus:text-white cursor-pointer"
          onSelect={() => handleCloseRequest({ stopPropagation: () => {} } as unknown as React.MouseEvent, tab)}
        >
          Cerrar
        </ContextMenuItem>
        <ContextMenuItem 
          className="focus:bg-zinc-800 focus:text-white cursor-pointer"
          onSelect={() => {
            const others = tabs.filter(t => t.id !== tab.id).map(t => t.id);
            handleClose(others);
          }}
        >
          Cerrar las demás
        </ContextMenuItem>
        <ContextMenuItem 
          disabled={currentIndex === 0}
          className="focus:bg-zinc-800 focus:text-white cursor-pointer"
          onSelect={() => {
            const left = tabs.slice(0, currentIndex).map(t => t.id);
            handleClose(left);
          }}
        >
          Cerrar a la izquierda
        </ContextMenuItem>
        <ContextMenuItem 
          disabled={currentIndex === tabs.length - 1}
          className="focus:bg-zinc-800 focus:text-white cursor-pointer"
          onSelect={() => {
            const right = tabs.slice(currentIndex + 1).map(t => t.id);
            handleClose(right);
          }}
        >
          Cerrar a la derecha
        </ContextMenuItem>
        
        <ContextMenuSeparator className="bg-zinc-700" />
        <ContextMenuItem 
          className="focus:bg-zinc-800 focus:text-white cursor-pointer text-red-400 focus:text-red-300"
          onSelect={() => {
            const all = tabs.map(t => t.id);
            handleClose(all);
          }}
        >
          Cerrar todo
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export default function TabBar({ onToggleAi, aiOpen, onNewFile, projectId }: TabBarProps) {
  const { tabs, activeTabId, setActiveTab, removeTab, dirtyFiles } = useTabsStore();
  const markersFiles = useMarkersStore((s) => s.files);
  const [closeConfirm, setCloseConfirm] = useState<CloseConfirmState | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = tabs.findIndex((t) => t.id === active.id);
      const newIndex = tabs.findIndex((t) => t.id === over.id);
      useTabsStore.getState().reorderTabs(oldIndex, newIndex);
    }
  };

  const getTabPath = (tab: (typeof tabs)[number]): string | null => {
    if (tab.type === 'editor') return tab.id;
    if (tab.type === 'diff') return tab.data?.filePath ?? null;
    return null;
  };

  const handleCloseRequest = (e: React.MouseEvent, tab: (typeof tabs)[number]) => {
    e?.stopPropagation?.();
    const isDirty = !!dirtyFiles[tab.id];
    if (!isDirty) {
      removeTab(tab.id);
      return;
    }
    const filePath = tab.data?.node?.file_path ?? tab.data?.filePath ?? null;
    setCloseConfirm({ tabId: tab.id, tabTitle: tab.title, filePath, phase: 'confirm' });
  };

  const handleModalSave = async () => {
    if (!closeConfirm) return;
    setIsSaving(true);
    try {
      await new Promise<void>((resolve, reject) => {
        const doneEvent = `save-done-${closeConfirm.tabId}`;
        const timeout = setTimeout(() => {
          window.removeEventListener(doneEvent, onDone);
          reject(new Error('Save timeout'));
        }, 10000);
        const onDone = () => {
          clearTimeout(timeout);
          window.removeEventListener(doneEvent, onDone);
          resolve();
        };
        window.addEventListener(doneEvent, onDone, { once: true });
        window.dispatchEvent(new CustomEvent(`save-request-${closeConfirm.tabId}`));
      });
      if (projectId && closeConfirm.filePath) {
        draftStore.clear(projectId, closeConfirm.filePath);
      }
      removeTab(closeConfirm.tabId);
      setCloseConfirm(null);
    } catch {
    } finally {
      setIsSaving(false);
    }
  };

  const handleModalDiscardRequest = () => {
    setCloseConfirm(prev => prev ? { ...prev, phase: 'discard-confirm' } : null);
  };

  const handleModalDiscardConfirm = () => {
    if (!closeConfirm) return;
    if (projectId && closeConfirm.filePath) {
      draftStore.clear(projectId, closeConfirm.filePath);
    }
    useUnsavedStore.getState().clearContent(closeConfirm.filePath ?? closeConfirm.tabId);
    removeTab(closeConfirm.tabId);
    setCloseConfirm(null);
  };

  const handleModalCancel = () => setCloseConfirm(null);

  const safeTabs = Array.isArray(tabs) ? tabs : [];

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="flex bg-zinc-900 border-b border-zinc-800/50 overflow-x-auto overflow-y-hidden shrink-0" role="tablist" aria-label="Tabs">
          <SortableContext items={safeTabs.map(t => t.id)} strategy={horizontalListSortingStrategy}>
            {safeTabs.map((tab) => (
              <SortableTab 
                key={tab.id} 
                tab={tab}
                activeTabId={activeTabId}
                dirtyFiles={dirtyFiles}
                markersFiles={markersFiles}
                setActiveTab={setActiveTab}
                handleCloseRequest={handleCloseRequest}
                getTabPath={getTabPath}
                tabs={safeTabs}
                onNewFile={onNewFile}
              />
            ))}
          </SortableContext>
          <div className="ml-auto flex items-center shrink-0">
            {onNewFile && (
              <button
                onClick={onNewFile}
                aria-label="Nuevo archivo"
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                title="Nuevo Archivo (Ctrl+N)"
              >
                <FilePlus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Nuevo</span>
              </button>
            )}
            <button
              onClick={() => useOmniPadStore.getState().toggle()}
              aria-label="Alternar Omni-Pad"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-l border-zinc-800/50 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
              title="Omni-Pad"
            >
              <NotebookPen className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Notas</span>
            </button>
            {onToggleAi && (
              <button
                onClick={onToggleAi}
                aria-label="Alternar SprintLogic AI"
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-l border-zinc-800/50",
                  aiOpen
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                )}
                title="SprintLogic AI"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>
                <span>AI</span>
              </button>
            )}
          </div>
        </div>
      </DndContext>

      {closeConfirm && (
        <CloseConfirmModal
          state={closeConfirm}
          onSave={handleModalSave}
          onDiscard={closeConfirm.phase === 'discard-confirm' ? handleModalDiscardConfirm : handleModalDiscardRequest}
          onCancel={handleModalCancel}
          isSaving={isSaving}
        />
      )}
    </>
  );
}
