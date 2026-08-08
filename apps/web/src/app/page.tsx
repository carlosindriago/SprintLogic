"use client";

// Removed react-resizable-panels imports
import { Project, GraphNode } from "@/types";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Settings, ChevronRight, Edit2, Trash2, PlusCircle, FilePlus, RefreshCw, RotateCcw, ScanSearch, Layout, Network, GitBranch, BarChart3, HelpCircle, FolderOpen, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useState, useEffect, useCallback, useRef } from "react";
import { scanProject, getProjects, updateProject, deleteProject, rescanProject, analyzeProject, renameFile, duplicateFile, deleteFile, initSidecarPort } from "@/lib/api";
import { Switch } from "@/components/ui/switch";
import SprintLogicChat from "@/components/SprintLogicChat";
import KanbanBoard from "@/components/KanbanBoard";
import LLMSettingsPanel from "@/components/LLMSettingsPanel";
import SettingsTab from "@/components/Settings/SettingsTab";
import PlanningStudioTab from "@/components/PlanningStudioTab";

import { useTabsStore, TabType } from '@/store/tabsStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useProjectStore } from '@/store/projectStore';
import { useBackgroundJobsStore } from '@/store/backgroundJobsStore';
import { useChatStore } from '@/store/chatStore';
import TabBar from '@/components/TabBar';
import { useThemeStore, AccentColor, UiScale } from '@/store/themeStore';

import ActivityBar from '@/components/ActivityBar';
import DrawerPanel from '@/components/DrawerPanel';
import { StatusBar } from '@/components/StatusBar';
import { useLayoutStore } from '@/store/layoutStore';


import GitGraphTab from '@/components/GitGraphTab';
import InsightDashboard from '@/components/InsightDashboard';

import NewFileDialog from "@/components/NewFileDialog";

import AnalysisReportDialog from "@/components/AnalysisReportDialog";
import OmniSearchModal from "@/components/OmniSearchModal";
import CodeMentorPanel from "@/components/CodeMentorPanel";
import { useProjectInsightsStore } from "@/store/projectInsightsStore";
import { toast } from "sonner";
import { useDoubleShift } from "@/hooks/useDoubleShift";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { HelpModal } from "@/components/HelpModal";
import { CheatSheetModal } from "@/components/CheatSheetModal";

// Monaco bundles are large and depend on `window`/`document`. They MUST
// never enter the server bundle — that is what was pegging the CPU on
// every page render. Lazy-load them on the client only, identical to
// the pattern already in use for `GraphScene` below.
const EditorTab = dynamic(
  () => import('@/components/editor').then((m) => m.default),
  { ssr: false },
);
const DiffTab = dynamic(
  () => import('@/components/DiffTab').then((m) => m.default),
  { ssr: false },
);

const AutoFixTab = dynamic(
  () => import('@/components/AutoFixTab').then((m) => m.default),
  { ssr: false },
);


const AIAuditPanel = dynamic(
  () => import('@/components/AIAuditPanel').then((m) => m.default),
  { ssr: false },
);

const AIReportViewer = dynamic(
  () => import('@/components/AIReportViewer').then((m) => m.AIReportViewer),
  { ssr: false },
);

const ReportHistoryPanel = dynamic(
  () => import('@/components/ReportHistoryPanel').then((m) => m.ReportHistoryPanel),
  { ssr: false },
);

const GraphScene = dynamic(() => import("@/components/graph/GraphScene"), { ssr: false });
const DatabaseStudioTab = dynamic(() => import("@/components/DatabaseStudio/DatabaseStudioTab"), { ssr: false });
const TestStudioTab = dynamic(() => import("@/components/TestStudioTab"), { ssr: false });
const DocumentStudioTab = dynamic(() => import("@/components/DocumentStudioTab"), { ssr: false });
const ExecutionRoomTab = dynamic(() => import("@/components/ExecutionRoomTab"), { ssr: false });

export default function Home() {
  const [path, setPath] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const { projectId, setProjectId, setProjectPath, isSwitchingProject, setIsSwitchingProject } = useProjectStore();
  const [loading, setLoading] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const isVimEnabled = useSettingsStore((s) => s.isVimEnabled);
  const setVimEnabled = useSettingsStore((s) => s.setVimEnabled);
  const { isDraftMode } = useChatStore();
  
  const { tabs, activeTabId, addTab, switchProject } = useTabsStore();
  const { accentColor, setAccentColor, uiScale, setUiScale } = useThemeStore();
  const startScan = useBackgroundJobsStore(state => state.startScan);

    const [newFileDialogOpen, setNewFileDialogOpen] = useState(false);
  const [newFileDirectory, setNewFileDirectory] = useState('');
  const [newFileInitialContent, setNewFileInitialContent] = useState('');
  const [fileTreeRefreshKey, setFileTreeRefreshKey] = useState(0);
  const [analysisDialogOpen, setAnalysisDialogOpen] = useState(false);
  const { omniSearchOpen, setOmniSearchOpen } = useLayoutStore();
  const [mentorOpen, setMentorOpen] = useState(false);
  const [mentorFile, setMentorFile] = useState('');
  const [mentorContent, setMentorContent] = useState('');
  const [mentorTechStack, setMentorTechStack] = useState<Record<string, number>>({});
  const untitledCounter = useRef(0);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameFilePath, setRenameFilePath] = useState('');
  const [renameNewName, setRenameNewName] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteFilePath, setDeleteFilePath] = useState('');
  const [fileOperationError, setFileOperationError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const data = await getProjects();
      setProjects(data.projects || []);
    } catch (e) {
      console.error("Failed to load projects", e);
    }
  }, []);

  useDoubleShift(() => setOmniSearchOpen(true));
  useGlobalShortcuts();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (projectId) {
      switchProject(projectId);
    }
  }, [projectId, switchProject]);

  useEffect(() => {
    if (projectId && projects.length > 0) {
      const proj = projects.find(p => p.id === projectId);
      if (proj) setProjectPath(proj.path);
    }
  }, [projectId, projects, setProjectPath]);

  useEffect(() => {
    const handleToggleHelp = () => setHelpOpen((prev) => !prev);
    window.addEventListener("toggle-help", handleToggleHelp);
    return () => window.removeEventListener("toggle-help", handleToggleHelp);
  }, []);

  useEffect(() => {
    const handleToggleCheatSheet = () => {
      setCheatSheetOpen((prev) => !prev);
    };
    window.addEventListener("toggle-cheat-sheet", handleToggleCheatSheet);
    return () => window.removeEventListener("toggle-cheat-sheet", handleToggleCheatSheet);
  }, []);

  const handleSearchSelect = (result: { path: string; line?: number | null }) => {
    const filePath = result.path.split(':')[0];
    const line = result.line ?? undefined;
    handleNodeClick({
      id: filePath,
      label: "File",
      name: filePath.split('/').pop() || filePath,
      file_path: filePath,
      ...(line && { metadata: { position: { line, column: 1 } } }),
    });
  };

  const handleOpenMentor = (filePath: string, content: string) => {
    const insights = useProjectInsightsStore.getState().data;
    setMentorFile(filePath);
    setMentorContent(content);
    setMentorTechStack(insights?.tech_stack ?? {});
    setMentorOpen(true);
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      await initSidecarPort();
      if (active) {
        setApiReady(true);
        await fetchProjects();
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [fetchProjects]);

  const { isChatOpen: rightSidebarOpen, toggleChat: toggleRightSidebar } = useChatStore();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        useLayoutStore.getState().toggleDrawer();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleScan = async () => {
    if (!path) return;
    setLoading(true);
    setAddProjectOpen(false);
    try {
      const data = await scanProject(path);
      setProjectId(data.project_id);
      startScan(data.project_id);
      fetchProjects();
    } catch (e: unknown) {
      console.error(e);
      const apiErr = e as { status?: number; message?: string };
      if (apiErr.status === 409) {
        toast.error(apiErr.message || "El proyecto ya existe");
      } else {
        toast.error("Error al escanear el proyecto");
      }
    } finally {
      setLoading(false);
    }
  };

  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [editProjectName, setEditProjectName] = useState("");
  const [editProjectPath, setEditProjectPath] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<Project | null>(null);

  const handleEditProject = async () => {
    if (!projectToEdit) return;
    try {
      await updateProject(projectToEdit.id, { name: editProjectName, path: editProjectPath });
      await fetchProjects();
      setEditProjectOpen(false);
    } catch (e) {
      console.error(e);
      alert("Error al editar el proyecto");
    }
  };

  const handleDeleteProject = (proj: Project) => {
    setDeleteConfirm(proj);
  };

  const confirmDeleteProject = async (proj: Project) => {
    try {
      await deleteProject(proj.id);
      if (projectId === proj.id) {
        setProjectId(null);
      }
      await fetchProjects();
      toast.success(`Proyecto "${proj.name}" eliminado de la lista`);
    } catch (e) {
      console.error(e);
      toast.error("Error al borrar el proyecto");
    } finally {
      setDeleteConfirm(null);
    }
  };

  const handleNodeClick = async (node: GraphNode) => {
    if (!node.file_path) return;
    
    addTab({
      id: node.file_path,
      title: node.file_path.split('/').pop() || node.file_path,
      type: 'editor',
      data: { node }
    });
  };

  const handleNewFile = (directory?: string) => {
    setNewFileDirectory(directory || '');
    setNewFileInitialContent('');
    setNewFileDialogOpen(true);
  };

  const handleNewUntitled = () => {
    if (!projectId) return;
    untitledCounter.current += 1;
    const id = `untitled-${Date.now()}-${untitledCounter.current}`;
    addTab({
      id,
      title: `Sin título ${untitledCounter.current}`,
      type: 'editor',
      data: {
        node: {
          id,
          label: "File" as const,
          name: `Sin título ${untitledCounter.current}`,
          file_path: '',
        }
      }
    });
  };

  const handleSaveUntitled = (tabId: string, content: string) => {
    setNewFileDirectory('');
    setNewFileInitialContent(content);
    setNewFileDialogOpen(true);
  };

  const refreshFileTree = () => setFileTreeRefreshKey((k) => k + 1);

  const handleFileRename = (path: string) => {
    setFileOperationError(null);
    setRenameFilePath(path);
    setRenameNewName(path.split('/').pop() || '');
    setRenameDialogOpen(true);
  };

  const handleConfirmRename = async () => {
    if (!projectId || !renameNewName.trim()) return;
    setFileOperationError(null);
    try {
      await renameFile(projectId, renameFilePath, renameNewName.trim());
      setRenameDialogOpen(false);
      refreshFileTree();
    } catch (err) {
      setFileOperationError(err instanceof Error ? err.message : 'Error al renombrar');
    }
  };

  const handleFileDuplicate = async (path: string) => {
    if (!projectId) return;
    try {
      await duplicateFile(projectId, path);
      refreshFileTree();
    } catch {
      // silently fail
    }
  };

  const handleFileDelete = (path: string) => {
    setFileOperationError(null);
    setDeleteFilePath(path);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!projectId) return;
    setFileOperationError(null);
    try {
      await deleteFile(projectId, deleteFilePath);
      setDeleteDialogOpen(false);
      refreshFileTree();
    } catch (err) {
      setFileOperationError(err instanceof Error ? err.message : 'Error al eliminar');
    }
  };

  const handleFileCreated = (filePath: string) => {
    setFileTreeRefreshKey(k => k + 1);
    const { tabs, activeTabId, updateTab } = useTabsStore.getState();
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab && activeTab.type === 'editor' && activeTab.data?.node && !activeTab.data.node.file_path) {
      updateTab(activeTabId!, {
        id: filePath,
        title: filePath.split('/').pop() || filePath,
        data: {
          node: {
            id: filePath,
            label: "File" as const,
            name: filePath.split('/').pop() || filePath,
            file_path: filePath,
          }
        }
      });
    } else {
      handleNodeClick({
        id: filePath,
        label: "File",
        name: filePath.split('/').pop() || filePath,
        file_path: filePath,
      });
    }
  };

  const handleNavigateToMarker = (filePath: string, line: number, column: number) => {
    addTab({
      id: filePath,
      title: filePath.split('/').pop() || filePath,
      type: 'editor',
      data: {
        node: {
          id: filePath,
          label: "File" as const,
          name: filePath.split('/').pop() || filePath,
          file_path: filePath,
          metadata: { position: { line, column } },
        }
      }
    });
  };

  const handleAnalyzeProject = async () => {
    if (!projectId) return;
    const { setLoading, setData } = useProjectInsightsStore.getState();
    setLoading(true);
    try {
      const result = await analyzeProject(projectId);
      setData(result);
      toast.success(`Análisis completado: ${result.total_files} archivos escaneados`);
      setAnalysisDialogOpen(true);
    } catch {
      toast.error("Error al analizar el proyecto");
      useProjectInsightsStore.getState().setLoading(false);
    }
  };

  const handleFileTreeSelect = (path: string) => {
    handleNodeClick({
      id: path,
      label: "File",
      name: path.split('/').pop() || path,
      file_path: path,
    });
  };

  const launchTool = (tabId: string, title: string, type: TabType) => {
    addTab({ id: tabId, title, type });
  };

  const handleKanbanNodeClick = async (nodeId: string) => {
    if (!projectId) return;
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/v1/projects/${projectId}/nodes/${encodeURIComponent(nodeId)}`);
      if (res.ok) {
        const node = await res.json();
        handleNodeClick(node);
      } else {
        console.error("Node not found", nodeId);
      }
    } catch (e) {
      console.error("Error fetching node", e);
    }
  };

  const renderActiveTabContent = () => {
    const safeTabs = Array.isArray(tabs) ? tabs : [];
    const activeTab = safeTabs.find(t => t.id === activeTabId);
    if (!activeTab) return null;

    switch (activeTab.type) {
      case 'dashboard':
      case 'insights':
        return (
          <div className="flex-1 relative overflow-hidden bg-[#151515]">
            {projectId ? <InsightDashboard projectId={projectId} key={projectId} /> : <div className="p-4 text-zinc-400">Selecciona un proyecto...</div>}
          </div>
        );
      case 'planning-studio':
        return <PlanningStudioTab key={activeTab.id} />;
      case 'database-studio':
        return <DatabaseStudioTab key={activeTab.id} />;
      case 'test-studio':
        return <TestStudioTab key={activeTab.id} />;
      case 'document-studio':
        return <DocumentStudioTab key={activeTab.id} />;
      case 'settings':
        return <SettingsTab data={activeTab.data} key={activeTab.id} />;
      case 'graph':
        return <GraphScene projectId={projectId} key={projectId} onNodeClick={handleNodeClick} />;
      case 'kanban':
        return <KanbanBoard projectId={projectId} key={projectId} onNodeClick={handleKanbanNodeClick} />;
      case 'editor':
        if (!projectId || !activeTab.data?.node) return null;
        return (
          <EditorTab
            projectId={projectId}
            node={activeTab.data.node}
            vimMode={isVimEnabled}
            onSaveUntitled={activeTab.data.node.file_path ? undefined : (content) => handleSaveUntitled(activeTab.id, content)}
            onMentor={handleOpenMentor}
          />
        );
      case 'git-graph':
        if (!projectId) return null;
        return <GitGraphTab projectId={projectId} />;
      case 'diff':
        if (!projectId || !activeTab.data?.hash || !activeTab.data?.filePath) return null;
        return <DiffTab projectId={projectId} hash={activeTab.data.hash} filePath={activeTab.data.filePath} />;
      case 'auto-fix':
        if (!projectId || !activeTab.data?.hash || !activeTab.data?.filePath || !activeTab.data?.markdown) return null;
        return <AutoFixTab projectId={projectId} ticketId={activeTab.data.hash} filePath={activeTab.data.filePath} instruction={activeTab.data.markdown} />;
      case 'audit':
        if (!projectId) return null;
        return <AIAuditPanel projectId={projectId} />;
      case 'ai-history':
        return <ReportHistoryPanel />;
      case 'ai-report':
        if (!projectId) return null;
        return <AIReportViewer projectId={projectId} reportId={activeTab.data?.reportId} markdown={activeTab.data?.markdown} />;
      case 'execution-room':
        return <ExecutionRoomTab data={activeTab.data} key={activeTab.id} />;
      default:
        return <div className="p-4">Tipo de pestaña desconocido.</div>;
    }
  };

  if (!isMounted) {
    return (
      <div className="h-[100dvh] w-full flex flex-col bg-[#0d0d0d] text-zinc-200 overflow-hidden items-center justify-center">
        <div className="w-8 h-8 border-4 border-zinc-800 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-[#0d0d0d] text-zinc-200 overflow-hidden relative">
      <div className="flex-1 flex overflow-hidden">
        <ActivityBar />
        <DrawerPanel 
        onFileSelect={handleFileTreeSelect}
        onNewFile={handleNewFile}
        fileTreeRefreshKey={fileTreeRefreshKey}
        onRefreshFileTree={() => setFileTreeRefreshKey(k => k + 1)}
        onRescanProject={async () => {
          if (!projectId) return;
          try {
            await rescanProject(projectId);
            toast.success("Re-escaneo iniciado. El grafo se actualizará en unos segundos.");
          } catch {
            toast.error("Error al re-escanear");
          }
        }}
        onAnalyzeProject={handleAnalyzeProject}
        onNavigateToMarker={handleNavigateToMarker}
        onFileRename={handleFileRename}
        onFileDuplicate={handleFileDuplicate}
        onFileDelete={handleFileDelete}
      />
      {/* MAIN CONTENT */}
      <div className="flex-1 min-w-0 flex flex-col relative bg-[#151515] overflow-hidden">
          {(!projectId || tabs.length === 0) ? (
            <div className="flex-1 relative min-w-0 overflow-hidden">
              <div className="flex flex-col items-center justify-center h-full bg-[#151515] text-center px-4">
                <div className="w-16 h-16 bg-blue-500/10 text-blue-400 rounded-full flex items-center justify-center mb-6">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
                </div>
                <h3 className="text-3xl font-bold tracking-tight text-zinc-100 mb-3">Bienvenido a SprintLogic</h3>
                <p className="text-zinc-400 max-w-md mb-8 leading-relaxed">
                  Para comenzar, carga un proyecto local ingresando la ruta absoluta del repositorio.
                </p>
                <Button
                  onClick={() => setAddProjectOpen(true)}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 text-sm font-medium shadow-lg shadow-blue-500/20"
                >
                  <FolderOpen className="w-4 h-4 mr-2" />
                  Cargar Proyecto
                </Button>

                {/* LISTA DE PROYECTOS */}
                {projects.length > 0 && (
                  <div className="mt-12 w-full max-w-2xl text-left animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h4 className="text-xs font-semibold text-zinc-500 mb-4 uppercase tracking-wider">Proyectos Recientes</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {projects.map((p) => {
                        const isActive = p.id === projectId;
                        return (
                          <div 
                            key={p.id} 
                            onClick={() => {
                              if (isActive) {
                                // Add dashboard tab if the user clicks the active project
                                useTabsStore.getState().addTab({
                                  id: 'dashboard',
                                  type: 'dashboard',
                                  title: 'Dashboard',
                                  pinned: false
                                });
                                return;
                              }
                              setIsSwitchingProject(true);
                              setTimeout(() => {
                                setProjectId(p.id);
                                setTimeout(() => setIsSwitchingProject(false), 300);
                              }, 600);
                            }}
                            className={cn(
                              "group p-4 border rounded-xl cursor-pointer transition-all duration-200 hover:shadow-md hover:shadow-black/20",
                              isActive 
                                ? "bg-blue-500/10 border-blue-500/50 hover:bg-blue-500/20 hover:border-blue-500/80" 
                                : "bg-zinc-900/50 hover:bg-zinc-800 border-zinc-800/50 hover:border-zinc-700/80"
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center min-w-0 pr-3">
                                <div className="p-2 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors mr-3 shrink-0">
                                  <FolderOpen className="w-5 h-5 text-blue-500/70 group-hover:text-blue-400 transition-colors" />
                                </div>
                                <div className="overflow-hidden">
                                  <h5 className="text-zinc-200 font-medium truncate text-sm">{p.name}</h5>
                                  <p className="text-xs text-zinc-500 truncate mt-0.5">{p.path}</p>
                                </div>
                              </div>
                              {isActive && (
                                <span className="shrink-0 text-[10px] uppercase font-bold tracking-wider text-blue-400 bg-blue-500/20 px-2.5 py-1 rounded-md">
                                  Proyecto Actual
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <TabBar onToggleAi={toggleRightSidebar} aiOpen={rightSidebarOpen} onNewFile={handleNewUntitled} projectId={projectId ?? undefined} />
              <div className="flex-1 relative overflow-hidden bg-[#151515] flex flex-col" key={activeTabId}>
                {apiReady ? (
                  renderActiveTabContent()
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4 text-zinc-500">
                      <div className="w-8 h-8 border-4 border-zinc-800 border-t-blue-500 rounded-full animate-spin" />
                      <p className="text-sm font-medium tracking-wide animate-pulse">Despertando núcleo...</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
      </div>

      {/* RIGHT AI SIDEBAR — fixed width, css transitioned */}
      <div 
        className={`flex-shrink-0 flex flex-col transition-all duration-300 ease-in-out border-zinc-800/50 bg-[#151515] overflow-hidden ${isDraftMode ? 'w-full absolute inset-0 z-50' : (rightSidebarOpen ? 'w-[400px] border-l' : 'w-0 border-l-0')}`}
      >
        <div className={`flex-1 flex flex-col min-h-0 overflow-hidden ${isDraftMode ? 'w-full' : 'w-[400px]'}`}>
          <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800/50 bg-[#0a0a0a]">
            <span className="text-sm font-medium text-zinc-300">SprintLogic AI</span>
            <div className="ml-auto flex items-center gap-1">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 p-0 text-zinc-400 hover:text-white"
                onClick={toggleRightSidebar}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex-1 relative overflow-hidden">
            <SprintLogicChat
              projectId={projectId}
              onOpenSettings={() => {
                // The CTA in the chat always invites the user to configure
                // their LLM provider, so land them on the 'llms' tab even
                // if the dialog was last closed on 'appearance'.
                addTab({ id: 'settings', title: '⚙️ Configuración', type: 'settings' });
              }}
            />
          </div>
        </div>
      </div>
      </div>
      
      <StatusBar
        projects={projects}
        onEditProject={(p) => {
          setProjectToEdit(p);
          setEditProjectName(p.name);
          setEditProjectPath(p.path);
          setEditProjectOpen(true);
        }}
        onDeleteProject={(p) => handleDeleteProject(p)}
        onAddProject={() => setAddProjectOpen(true)}
      />

        <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
          <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-200 sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-sm">Renombrar archivo</DialogTitle>
              <DialogDescription className="text-xs text-zinc-500">
                {renameFilePath}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                value={renameNewName}
                onChange={(e) => setRenameNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirmRename()}
                placeholder="Nuevo nombre"
                autoFocus
                className="bg-zinc-800 border-zinc-700 text-zinc-200 text-sm"
              />
              {fileOperationError && (
                <p className="text-xs text-red-400">{fileOperationError}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setRenameDialogOpen(false)}
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs">
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleConfirmRename}
                  disabled={!renameNewName.trim()}
                  className="bg-blue-600 hover:bg-blue-500 text-xs">
                  Renombrar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-200 sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-sm">Eliminar archivo</DialogTitle>
              <DialogDescription className="text-xs text-zinc-500">
                {deleteFilePath}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-xs text-zinc-400">
                Esta acción eliminará el archivo del disco de forma permanente. Asegurate de que esté en Git o de que tengas un backup si querés recuperarlo después.
              </p>
              {fileOperationError && (
                <p className="text-xs text-red-400">{fileOperationError}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)}
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs">
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleConfirmDelete}
                  className="bg-red-600 hover:bg-red-500 text-xs">
                  Eliminar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {projectId && (
          <NewFileDialog
            open={newFileDialogOpen}
            onOpenChange={setNewFileDialogOpen}
            projectId={projectId}
            defaultDirectory={newFileDirectory}
            initialContent={newFileInitialContent}
            onCreated={handleFileCreated}
          />
        )}
        <AnalysisReportDialog open={analysisDialogOpen} onOpenChange={setAnalysisDialogOpen} />
        <OmniSearchModal open={omniSearchOpen} onClose={() => setOmniSearchOpen(false)} onSelect={handleSearchSelect} />
        {mentorOpen && (
          <CodeMentorPanel
            open={mentorOpen}
            onToggle={() => setMentorOpen(!mentorOpen)}
            filePath={mentorFile}
            fileContent={mentorContent}
            techStack={mentorTechStack}
            onOpenSettings={() => {
              addTab({ id: 'settings', title: '⚙️ Configuración', type: 'settings' });
            }}
          />
        )}
        <HelpModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
        <CheatSheetModal
        isOpen={cheatSheetOpen}
        onClose={() => setCheatSheetOpen(false)}
      />

      {/* Loading Modal */}
      <Dialog open={isSwitchingProject} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md bg-[#111] border border-zinc-800/80 text-zinc-100 flex flex-col items-center justify-center py-12 [&>button]:hidden outline-none shadow-2xl shadow-black/80">
          <div className="relative flex items-center justify-center mb-6">
            <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full" />
            <div className="w-14 h-14 border-4 border-zinc-800 border-t-blue-500 rounded-full animate-spin shadow-[0_0_15px_rgba(59,130,246,0.5)]" />
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight text-white mb-2">Cargando Proyecto</DialogTitle>
          <DialogDescription className="text-zinc-400 text-center animate-pulse">
            Sincronizando estado e inicializando componentes...
          </DialogDescription>
        </DialogContent>
      </Dialog>
    
        <Dialog open={addProjectOpen} onOpenChange={setAddProjectOpen}>
                <DialogContent className="sm:max-w-[425px] bg-zinc-900 text-zinc-200 border-zinc-800/50">
                  <DialogHeader>
                    <DialogTitle>Añadir Proyecto Local</DialogTitle>
                    <DialogDescription className="text-zinc-400">
                      Ingresa la ruta absoluta del repositorio Git local que deseas analizar.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-4 py-4">
                    <div className="flex w-full items-center space-x-2">
                      <input
                        type="text"
                        value={path}
                        onChange={(e) => setPath(e.target.value)}
                        placeholder="/ruta/al/proyecto"
                        className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700/50 rounded p-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
                      />
                      <Button onClick={async () => {
                        try {
                          const { open } = await import("@tauri-apps/plugin-dialog");
                          const selected = await open({
                            directory: true,
                            multiple: false,
                          });
                          if (selected && typeof selected === "string") {
                            setPath(selected);
                          }
                        } catch (err) {
                          console.error("Failed to open dialog:", err);
                        }
                      }} variant="outline" className="px-3 bg-zinc-800 border-zinc-700/50 hover:bg-zinc-700 whitespace-nowrap">
                        Examinar...
                      </Button>
                    </div>
                    <Button onClick={handleScan} disabled={loading || !path} className="w-full bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/20 text-white border-none">
                      {loading ? "Cargando..." : "Registrar y Analizar"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
        <Dialog open={editProjectOpen} onOpenChange={setEditProjectOpen}>
                <DialogContent className="sm:max-w-[425px] bg-zinc-900 text-zinc-200 border-zinc-800/50">
                  <DialogHeader>
                    <DialogTitle>Editar Proyecto</DialogTitle>
                    <DialogDescription className="text-zinc-400">
                      Modifica el nombre o la ruta del proyecto.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-4 py-4">
                    <div className="flex flex-col space-y-2">
                      <Label htmlFor="editName" className="text-xs text-zinc-400">Nombre del Proyecto</Label>
                      <Input
                        id="editName"
                        type="text"
                        value={editProjectName}
                        onChange={(e) => setEditProjectName(e.target.value)}
                        className="bg-zinc-800 border-zinc-700/50 focus-visible:ring-blue-500 text-zinc-200"
                      />
                    </div>
                    <div className="flex flex-col space-y-2">
                      <Label htmlFor="editPath" className="text-xs text-zinc-400">Ruta (Path)</Label>
                      <div className="flex w-full items-center space-x-2">
                        <Input
                          id="editPath"
                          type="text"
                          value={editProjectPath}
                          onChange={(e) => setEditProjectPath(e.target.value)}
                          className="flex-1 bg-zinc-800 border-zinc-700/50 focus-visible:ring-blue-500 text-zinc-200"
                        />
                        <Button onClick={async () => {
                          try {
                            const { open } = await import("@tauri-apps/plugin-dialog");
                            const selected = await open({
                              directory: true,
                              multiple: false,
                            });
                            if (selected && typeof selected === "string") {
                              setEditProjectPath(selected);
                            }
                          } catch (err) {
                            console.error("Failed to open dialog:", err);
                          }
                        }} variant="outline" className="px-3 bg-zinc-800 border-zinc-700/50 hover:bg-zinc-700 text-zinc-300">
                          ...
                        </Button>
                      </div>
                    </div>
                    <Button onClick={handleEditProject} disabled={!editProjectName || !editProjectPath} className="w-full bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/20 text-white border-none mt-2">
                      Guardar Cambios
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
        <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
                <DialogContent className="sm:max-w-[400px] bg-zinc-900 text-zinc-200 border-zinc-800/50">
                  <DialogHeader>
                    <DialogTitle>Eliminar proyecto</DialogTitle>
                    <DialogDescription className="text-zinc-400">
                      ¿Estás seguro de que deseas eliminar el proyecto &quot;{deleteConfirm?.name}&quot;?
                      Solo se eliminará de la lista, los archivos en disco no se borrarán.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter className="gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setDeleteConfirm(null)}
                      className="bg-zinc-800 border-zinc-700/50 hover:bg-zinc-700 text-zinc-300"
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={() => deleteConfirm && confirmDeleteProject(deleteConfirm)}
                      className="bg-red-600 hover:bg-red-500 text-white"
                    >
                      Eliminar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
    </div>
  );
}
