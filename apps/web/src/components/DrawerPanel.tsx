import React from 'react';
import { useLayoutStore } from '@/store/layoutStore';
import { useProjectStore } from '@/store/projectStore';
import FileTree from '@/components/FileTree';
import ProjectInsightsPanel from '@/components/ProjectInsightsPanel';
import { Button } from '@/components/ui/button';
import { FilePlus, RefreshCw, RotateCcw, ScanSearch } from 'lucide-react';

interface DrawerPanelProps {
  onFileSelect: (path: string) => void;
  onNewFile: (directory?: string) => void;
  fileTreeRefreshKey: number;
  onRefreshFileTree: () => void;
  onRescanProject: () => void;
  onAnalyzeProject: () => void;
  onNavigateToMarker: (filePath: string, line: number, column: number) => void;
  onFileRename: (path: string) => void;
  onFileDuplicate: (path: string) => void;
  onFileDelete: (path: string) => void;
}

export default function DrawerPanel(props: DrawerPanelProps) {
  const { 
    drawerWidth, 
    isDrawerOpen, 
    activeSidebarPanel, 
    isDragging, 
    setDrawerWidth, 
    setIsDragging 
  } = useLayoutStore();
  const { projectId } = useProjectStore();

  const getTitle = () => {
    switch (activeSidebarPanel) {
      case 'explorer': return 'EXPLORADOR';
      case 'search': return 'BÚSQUEDA';
      case 'git': return 'GIT';
      default: return '';
    }
  };

  return (
    <div
      className={`relative flex-shrink-0 flex flex-col bg-[#0a0a0a] border-r border-zinc-800 overflow-hidden ${isDragging ? 'transition-none' : 'transition-[width] duration-200 ease-in-out'}`}
      style={{ width: isDrawerOpen ? drawerWidth : 0 }}
    >
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden w-full h-full relative" style={{ width: drawerWidth }}>
        <div className="p-3 pb-2 text-xs font-semibold text-zinc-300 tracking-wider flex items-center justify-between shrink-0">
          <span>{getTitle()}</span>
          {activeSidebarPanel === 'explorer' && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-white hover:bg-zinc-700" onClick={() => props.onNewFile()} title="Nuevo Archivo">
                <FilePlus className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-white hover:bg-zinc-700" onClick={props.onRefreshFileTree} title="Refrescar Explorador">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-white hover:bg-zinc-700" onClick={props.onRescanProject} title="Re-escanear Proyecto">
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-white hover:bg-zinc-700" onClick={props.onAnalyzeProject} title="Analizar Proyecto">
                <ScanSearch className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
          {activeSidebarPanel === 'explorer' && (
            projectId ? (
              <>
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <FileTree
                    projectId={projectId}
                    onFileSelect={props.onFileSelect}
                    onNewFile={props.onNewFile}
                    refreshKey={props.fileTreeRefreshKey}
                    onNavigateToMarker={props.onNavigateToMarker}
                    onFileRename={props.onFileRename}
                    onFileDuplicate={props.onFileDuplicate}
                    onFileDelete={props.onFileDelete}
                  />
                </div>
                <div className="shrink-0 p-2 border-t border-zinc-800">
                  <ProjectInsightsPanel />
                </div>
              </>
            ) : (
              <div className="p-4 text-zinc-500 text-sm">Ningún proyecto seleccionado.</div>
            )
          )}
          {activeSidebarPanel === 'search' && (
            <div className="p-4 text-zinc-500 text-sm">Búsqueda próximamente...</div>
          )}
          {activeSidebarPanel === 'git' && (
            <div className="p-4 text-zinc-500 text-sm">Git panel próximamente...</div>
          )}
        </div>
      </div>

      <div
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500 transition-colors z-10"
        onMouseDown={(e) => {
          e.preventDefault();
          setIsDragging(true);
          const startX = e.clientX;
          const startWidth = drawerWidth;
          
          const onMouseMove = (ev: MouseEvent) => {
            setDrawerWidth(startWidth + ev.clientX - startX);
          };
          
          const onMouseUp = () => {
            setIsDragging(false);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
          };
          
          window.addEventListener('mousemove', onMouseMove);
          window.addEventListener('mouseup', onMouseUp);
        }}
      />
    </div>
  );
}
