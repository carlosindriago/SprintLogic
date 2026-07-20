'use client';

import { useState, useEffect } from 'react';
import { useTabsStore } from '@/store/tabsStore';
import { useMarkersStore } from '@/store/markersStore';
import { useUnsavedStore } from '@/store/unsavedStore';
import { draftStore } from '@/lib/draftStore';
import { X, BarChart3, Layout, Network, GitBranch, FilePlus, FolderGit2, Save, Trash2, AlertTriangle } from 'lucide-react';
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
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md mx-4 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
        {/* Header */}
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

        {/* Divider */}
        <div className="border-t border-zinc-800" />

        {/* Body */}
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

export default function TabBar({ onToggleAi, aiOpen, onNewFile, projectId }: TabBarProps) {
  const { tabs, activeTabId, setActiveTab, removeTab, dirtyFiles } = useTabsStore();
  const markersFiles = useMarkersStore((s) => s.files);
  const [closeConfirm, setCloseConfirm] = useState<CloseConfirmState | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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

  const handleCloseRequest = (e: React.MouseEvent, tab: (typeof tabs)[number]) => {
    e.stopPropagation();
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
      // Clear the draft after save
      if (projectId && closeConfirm.filePath) {
        draftStore.clear(projectId, closeConfirm.filePath);
      }
      removeTab(closeConfirm.tabId);
      setCloseConfirm(null);
    } catch {
      // Save failed — keep modal open
    } finally {
      setIsSaving(false);
    }
  };

  const handleModalDiscardRequest = () => {
    // Require double-confirmation before discarding
    setCloseConfirm(prev => prev ? { ...prev, phase: 'discard-confirm' } : null);
  };

  const handleModalDiscardConfirm = () => {
    if (!closeConfirm) return;
    // Wipe drafts and close immediately
    if (projectId && closeConfirm.filePath) {
      draftStore.clear(projectId, closeConfirm.filePath);
    }
    useUnsavedStore.getState().clearContent(closeConfirm.filePath ?? closeConfirm.tabId);
    removeTab(closeConfirm.tabId);
    setCloseConfirm(null);
  };

  const handleModalCancel = () => setCloseConfirm(null);

  return (
    <>
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
            {!isGlobalTool && dirtyFiles[tab.id] && (
              <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" title="Unsaved changes" />
            )}
            {!isGlobalTool && <TabMarkerBadge path={getTabPath(tab)} markersFiles={markersFiles} />}
            
            {!isFixed && (
              <button
                type="button"
                aria-label={`Cerrar pestaña ${tab.title}`}
                className={cn(
                  "rounded-sm hover:bg-zinc-700 p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                  activeTabId === tab.id ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                )}
                onClick={(e) => handleCloseRequest(e, tab)}
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        )})}
        <div className="ml-auto flex items-center shrink-0">
        {onNewFile && (
          <button
            onClick={onNewFile}
            aria-label="Nuevo archivo"
            className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium transition-colors text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
            title="Nuevo Archivo (Ctrl+N)"
          >
            <FilePlus className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
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
