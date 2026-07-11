"use client";

// Removed react-resizable-panels imports
import { Project, GraphNode } from "@/types";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Settings, FolderOpen, ChevronRight, Edit2, Trash2, PlusCircle, ChevronsUpDown, FilePlus, RefreshCw, ScanSearch, Layout, Network, GitBranch, BarChart3, FolderGit2, HelpCircle, Bot } from "lucide-react";
import dynamic from "next/dynamic";
import { useState, useEffect, useCallback, useRef } from "react";
import { scanProject, getProjects, updateProject, deleteProject, analyzeProject, renameFile, duplicateFile, deleteFile } from "@/lib/api";
import { Switch } from "@/components/ui/switch";
import SprintLogicChat from "@/components/SprintLogicChat";
import KanbanBoard from "@/components/KanbanBoard";
import LLMSettingsPanel from "@/components/LLMSettingsPanel";
import FileTree from "@/components/FileTree";
import { useTabsStore } from '@/store/tabsStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useProjectStore } from '@/store/projectStore';
import { useBackgroundJobsStore } from '@/store/backgroundJobsStore';
import TabBar from '@/components/TabBar';
import { useThemeStore, AccentColor, UiScale } from '@/store/themeStore';
import GitStatusWidget from '@/components/GitStatusWidget';
import GitGraphTab from '@/components/GitGraphTab';
import InsightDashboard from '@/components/InsightDashboard';
import PomodoroTimer from "@/components/PomodoroTimer";
import NewFileDialog from "@/components/NewFileDialog";
import ProjectInsightsPanel from "@/components/ProjectInsightsPanel";
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
  () => import('@/components/EditorTab').then((m) => m.default),
  { ssr: false },
);
const DiffTab = dynamic(
  () => import('@/components/DiffTab').then((m) => m.default),
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

const GraphScene = dynamic(() => import("@/components/GraphScene"), { ssr: false });

export default function Home() {
  const [path, setPath] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const { projectId, setProjectId } = useProjectStore();
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const isVimEnabled = useSettingsStore((s) => s.isVimEnabled);
  const setVimEnabled = useSettingsStore((s) => s.setVimEnabled);
  
  const { tabs, activeTabId, addTab, switchProject } = useTabsStore();
  const { accentColor, setAccentColor, uiScale, setUiScale } = useThemeStore();
  const startScan = useBackgroundJobsStore(state => state.startScan);

  const [settingsTab, setSettingsTab] = useState<'llms' | 'appearance'>('llms');
  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false);
  const [newFileDirectory, setNewFileDirectory] = useState('');
  const [newFileInitialContent, setNewFileInitialContent] = useState('');
  const [fileTreeRefreshKey, setFileTreeRefreshKey] = useState(0);
  const [analysisDialogOpen, setAnalysisDialogOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
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

  useDoubleShift(() => setSearchOpen(true));
  useGlobalShortcuts();

  useEffect(() => {
    if (projectId) {
      switchProject(projectId);
    }
  }, [projectId, switchProject]);

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
    return () => {
      window.removeEventListener("toggle-cheat-sheet", handleToggleCheatSheet);
    };
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
      if (active) await fetchProjects();
    };
    load();
    return () => {
      active = false;
    };
  }, [fetchProjects]);

  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);

  const toggleLeftSidebar = () => setLeftSidebarOpen(prev => !prev);
  const toggleRightSidebar = () => setRightSidebarOpen(prev => !prev);

  const handleScan = async () => {
    if (!path) return;
    setLoading(true);
    setAddProjectOpen(false);
    try {
      const data = await scanProject(path);
      setProjectId(data.project_id);
      startScan(data.project_id);
      fetchProjects(); // Refresh the list
    } catch (e) {
      console.error(e);
      alert("Error scanning project");
    } finally {
      setLoading(false);
    }
  };

  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [editProjectName, setEditProjectName] = useState("");
  const [editProjectPath, setEditProjectPath] = useState("");

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

  const handleDeleteProject = async (proj: Project) => {
    if (confirm(`¿Estás seguro de que deseas borrar el proyecto "${proj.name}"?`)) {
      try {
        await deleteProject(proj.id);
        if (projectId === proj.id) {
          setProjectId(null);
        }
        await fetchProjects();
      } catch (e) {
        console.error(e);
        alert("Error al borrar el proyecto");
      }
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

  const launchTool = (tabId: string, title: string, type: 'insights' | 'kanban' | 'graph' | 'git-graph' | 'audit' | 'ai-history') => {
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
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return null;

    switch (activeTab.type) {
      case 'dashboard':
      case 'insights':
        return (
          <div className="flex-1 relative overflow-hidden bg-[#151515]">
            {projectId ? <InsightDashboard projectId={projectId} key={projectId} /> : <div className="p-4 text-zinc-400">Selecciona un proyecto...</div>}
          </div>
        );
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
      case 'audit':
        if (!projectId) return null;
        return <AIAuditPanel projectId={projectId} />;
      case 'ai-history':
        return <ReportHistoryPanel />;
      case 'ai-report':
        if (!projectId) return null;
        return <AIReportViewer projectId={projectId} reportId={activeTab.data?.reportId} markdown={activeTab.data?.markdown} />;
      default:
        return <div className="p-4">Tipo de pestaña desconocido.</div>;
    }
  };

  return (
    <div className="h-[100dvh] w-full flex bg-[#0d0d0d] text-zinc-200 overflow-hidden relative">
      {/* LEFT SIDEBAR — fixed width, css transitioned */}
      <div 
        className={`flex-shrink-0 flex flex-col transition-all duration-300 ease-in-out border-zinc-800/50 bg-[#0a0a0a] overflow-hidden ${leftSidebarOpen ? 'w-[280px] border-r' : 'w-0 border-r-0'}`}
      >
        <div className="w-[280px] flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="p-4 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-zinc-100 truncate">SprintLogic IDE</h2>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white" onClick={toggleLeftSidebar} title="Ocultar barra lateral">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                  </Button>
                </div>
                <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                  <DialogContent className="sm:max-w-5xl w-full bg-zinc-900 text-zinc-200 border-zinc-800/50 ring-zinc-700/50">
                    <DialogHeader>
                      <DialogTitle>Configuración</DialogTitle>
                      <DialogDescription className="text-zinc-400">
                        Ajusta tus preferencias de IA y Apariencia.
                      </DialogDescription>
                    </DialogHeader>
                    
                    <div className="flex items-center gap-2 mb-2 border-b border-zinc-800/50 pb-2">
                      <button 
                        className={`text-sm font-medium px-2 py-1 rounded transition-colors ${settingsTab === 'llms' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-300'}`}
                        onClick={() => setSettingsTab('llms')}
                      >
                        IA & Modelos
                      </button>
                      <button 
                        className={`text-sm font-medium px-2 py-1 rounded transition-colors ${settingsTab === 'appearance' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-300'}`}
                        onClick={() => setSettingsTab('appearance')}
                      >
                        Apariencia
                      </button>
                    </div>

                    <div className="grid gap-4 py-2">
                      {settingsTab === 'llms' ? (
                        <>
                          <LLMSettingsPanel />
                          <div className="flex items-center space-x-2 pt-2 border-t border-zinc-800/50 mt-2">
                            <Switch id="vim-mode" checked={isVimEnabled} onCheckedChange={setVimEnabled} />
                            <Label htmlFor="vim-mode">Habilitar Modo Vim</Label>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right text-xs">Color de Acento</Label>
                            <Select value={accentColor} onValueChange={(val: AccentColor | null) => { if (val) setAccentColor(val); }}>
                              <SelectTrigger className="col-span-3 bg-zinc-800 border-zinc-700/50 text-zinc-200">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-zinc-800 border-zinc-700/50 text-zinc-200">
                                <SelectItem value="blue">Azul</SelectItem>
                                <SelectItem value="purple">Púrpura</SelectItem>
                                <SelectItem value="emerald">Esmeralda</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid grid-cols-4 items-center gap-4 mt-2">
                            <Label className="text-right text-xs">Tamaño de UI</Label>
                            <Select value={uiScale} onValueChange={(val: UiScale | null) => { if (val) setUiScale(val); }}>
                              <SelectTrigger className="col-span-3 bg-zinc-800 border-zinc-700/50 text-zinc-200">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-zinc-800 border-zinc-700/50 text-zinc-200">
                                <SelectItem value="compact">Compacto</SelectItem>
                                <SelectItem value="normal">Normal</SelectItem>
                                <SelectItem value="large">Grande</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex justify-end mt-4">
                      <Button onClick={() => setSettingsOpen(false)}>Cerrar Configuración</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Activity Bar — global tool launchers */}
              <div className="flex items-center gap-1 px-1 py-1.5 bg-zinc-800/50 rounded-lg">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700"
                  onClick={() => launchTool('insights', 'Insights', 'insights')}
                  title="Insights"
                >
                  <BarChart3 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700"
                  onClick={() => launchTool('graph', 'Análisis Gráfico', 'graph')}
                  title="Análisis Gráfico"
                >
                  <Network className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700"
                  onClick={() => launchTool('kanban', 'Kanban', 'kanban')}
                  title="Kanban"
                >
                  <Layout className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700"
                  onClick={() => launchTool('git-graph', 'Control Git', 'git-graph')}
                  title="Control Git"
                >
                  <GitBranch className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700"
                  onClick={() => launchTool('audit', 'Auditoría IA', 'audit')}
                  title="Auditoría IA"
                >
                  <FolderGit2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700"
                  onClick={() => launchTool('ai-history', 'Historial IA', 'ai-history')}
                  title="Historial IA"
                >
                  <Bot className="w-4 h-4" />
                </Button>
              </div>

              {/* 1. Selector de Proyectos (Mejorado) */}
              <div className="flex w-full items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline" }), "flex-1 justify-between bg-zinc-800 border-zinc-700/50 text-zinc-200 hover:bg-zinc-700 hover:text-white truncate")}>
                    <span className="truncate">
                      {projects.find(p => p.id === projectId)?.name || "Selecciona un proyecto..."}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[248px] bg-zinc-800 border-zinc-700/50 text-zinc-200">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Tus Proyectos</DropdownMenuLabel>
                      {projects.map((p) => (
                        <DropdownMenuItem 
                          key={p.id} 
                          onClick={() => setProjectId(p.id)}
                          className={`cursor-pointer justify-between ${projectId === p.id ? 'bg-blue-500/10 text-blue-400' : ''}`}
                        >
                          <span className="truncate pr-2">{p.name}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 text-zinc-400 hover:text-blue-400"
                              onClick={(e) => {
                                e.stopPropagation();
                                setProjectToEdit(p);
                                setEditProjectName(p.name);
                                setEditProjectPath(p.path);
                                setEditProjectOpen(true);
                              }}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 text-zinc-400 hover:text-red-400"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteProject(p);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator className="bg-zinc-700/50" />
                    <DropdownMenuItem onClick={() => setAddProjectOpen(true)} className="cursor-pointer focus:bg-zinc-700">
                      <PlusCircle className="mr-2 h-4 w-4 text-zinc-400" />
                      <span>Añadir Proyecto</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

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

              {/* 2. Widget de Git Status */}
              {projectId && <GitStatusWidget projectId={projectId} key={projectId} />}

              {/* 3. Explorador de Archivos */}
              <Card className="bg-zinc-800 border-zinc-700/50 text-zinc-200 mt-2 flex-1 flex flex-col min-h-0">
                <CardHeader className="p-3 pb-2 shrink-0 border-b border-zinc-700/50/50">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Explorador</CardTitle>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-zinc-400 hover:text-white hover:bg-zinc-700"
                        onClick={() => handleNewFile()}
                        title="Nuevo Archivo"
                      >
                        <FilePlus className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-zinc-400 hover:text-white hover:bg-zinc-700"
                        onClick={() => setFileTreeRefreshKey(k => k + 1)}
                        title="Refrescar Explorador"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-zinc-400 hover:text-white hover:bg-zinc-700"
                        onClick={handleAnalyzeProject}
                        title="Analizar Proyecto"
                      >
                        <ScanSearch className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0 text-xs text-zinc-400 flex-1 overflow-hidden">
                  {projectId ? (
                    <div className="h-full overflow-y-auto">
                      <FileTree
                        projectId={projectId}
                        key={`${projectId}-${fileTreeRefreshKey}`}
                        onFileSelect={handleFileTreeSelect}
                        onNewFile={handleNewFile}
                        refreshKey={fileTreeRefreshKey}
                        onNavigateToMarker={handleNavigateToMarker}
                        onFileRename={handleFileRename}
                        onFileDuplicate={handleFileDuplicate}
                        onFileDelete={handleFileDelete}
                      />
                    </div>
                  ) : (
                    <div className="p-4 text-center">Selecciona un proyecto...</div>
                  )}
                </CardContent>
              </Card>

              <ProjectInsightsPanel />
            </div>
          </div>
          <div className="p-4 border-t border-zinc-800/50 bg-[#0a0a0a] flex items-center justify-between">
              <Button
                variant="ghost"
                className="justify-start text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 flex-1"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings className="mr-2 h-4 w-4" />
                Configuración
              </Button>
              <Button
                variant="ghost"
                className="w-10 h-10 p-0 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 ml-2"
                onClick={() => setHelpOpen(true)}
                title="Mostrar Hoja de Trucos (Ctrl + /)"
              >
                <HelpCircle className="h-4 w-4" />
              </Button>
            </div>
        </div>
      </div>

      {/* Toggle button visible only when left sidebar is collapsed */}
        {!leftSidebarOpen && (
          <div className="absolute left-2 top-4 z-50">
            <Button 
              variant="default" 
              className="h-8 w-8 p-0 bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-center border border-zinc-700/50 rounded"
              onClick={toggleLeftSidebar}
              title="Mostrar Proyectos"
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>
        )}

      {/* MAIN CONTENT */}
      <div className="flex-1 min-w-0 flex flex-col relative bg-[#151515] overflow-hidden">
          {projectId === null ? (
            <div className="flex-1 relative min-w-0 overflow-hidden">
              <div className="flex flex-col items-center justify-center h-full bg-[#151515] text-center px-4">
                <div className="w-16 h-16 bg-blue-500/10 text-blue-400 rounded-full flex items-center justify-center mb-6">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
                </div>
                <h3 className="text-3xl font-bold tracking-tight text-zinc-100 mb-3">Bienvenido a SprintLogic</h3>
                <p className="text-zinc-400 max-w-md mb-8 leading-relaxed">
                  Para comenzar, carga un proyecto local ingresando la ruta absoluta del repositorio.
                </p>
              </div>
            </div>
          ) : (
            <>
              <TabBar onToggleAi={toggleRightSidebar} aiOpen={rightSidebarOpen} onNewFile={handleNewUntitled} projectId={projectId ?? undefined} />
              <div className="flex-1 relative overflow-hidden bg-[#151515]" key={activeTabId}>
                {renderActiveTabContent()}
              </div>
            </>
          )}
      </div>

      {/* RIGHT AI SIDEBAR — fixed width, css transitioned */}
      <div 
        className={`flex-shrink-0 flex flex-col transition-all duration-300 ease-in-out border-zinc-800/50 bg-[#151515] overflow-hidden ${rightSidebarOpen ? 'w-[400px] border-l' : 'w-0 border-l-0'}`}
      >
        <div className="w-[400px] flex-1 flex flex-col min-h-0 overflow-hidden">
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
                setSettingsTab('llms');
                setSettingsOpen(true);
              }}
            />
          </div>
        </div>
      </div>

      <PomodoroTimer projectId={projectId} />

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
        <OmniSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={handleSearchSelect} />
        {mentorOpen && (
          <CodeMentorPanel
            open={mentorOpen}
            onToggle={() => setMentorOpen(!mentorOpen)}
            filePath={mentorFile}
            fileContent={mentorContent}
            techStack={mentorTechStack}
            onOpenSettings={() => {
              setSettingsTab('llms');
              setSettingsOpen(true);
            }}
          />
        )}
        <HelpModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
        <CheatSheetModal isOpen={cheatSheetOpen} onClose={() => setCheatSheetOpen(false)} />
    </div>
  );
}
