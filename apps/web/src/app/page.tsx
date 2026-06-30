"use client";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { PanelImperativeHandle } from "react-resizable-panels";
import { Project, GraphNode } from "@/types";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { Settings, FolderOpen, Plus, GitBranch, GitCommit, ChevronRight } from "lucide-react";
import dynamic from "next/dynamic";
import { useState, useEffect, useRef } from "react";
import { scanProject, getProjects, saveApiKey } from "@/lib/api";
import { Switch } from "@/components/ui/switch";
import SprintLogicChat from "@/components/SprintLogicChat";
import KanbanBoard from "@/components/KanbanBoard";
import FileTree from "@/components/FileTree";
import { useTabsStore } from '@/store/tabsStore';
import { useProjectStore } from '@/store/projectStore';
import TabBar from '@/components/TabBar';
import EditorTab from '@/components/EditorTab';
import { useThemeStore } from '@/store/themeStore';
import GitStatusWidget from '@/components/GitStatusWidget';
import GitGraphTab from '@/components/GitGraphTab';
import DiffTab from '@/components/DiffTab';
import InsightDashboard from '@/components/InsightDashboard';

const GraphScene = dynamic(() => import("@/components/GraphScene"), { ssr: false });

export default function Home() {
  const [path, setPath] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const { projectId, setProjectId } = useProjectStore();
  const [loading, setLoading] = useState(false);

  const [geminiKey, setGeminiKey] = useState("");
  const [openAiKey, setOpenAiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openRouterKey, setOpenRouterKey] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [vimMode, setVimMode] = useState(false);
  
  const [dashboardTab, setDashboardTab] = useState<'graph' | 'kanban' | 'insights'>('insights');
  
  // Dashboard Tabs (Graph vs Kanban vs Insights)
  const { tabs, activeTabId, addTab } = useTabsStore();
  const { accentColor, setAccentColor, uiScale, setUiScale } = useThemeStore();
  
  const [settingsTab, setSettingsTab] = useState<'llms' | 'appearance'>('llms');

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const data = await getProjects();
      setProjects(data.projects || []);
    } catch (e) {
      console.error("Failed to load projects", e);
    }
  };

  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const leftPanelRef = useRef<PanelImperativeHandle | null>(null);
  const rightPanelRef = useRef<PanelImperativeHandle | null>(null);

  const toggleLeftSidebar = () => {
    if (leftSidebarOpen) {
      leftPanelRef.current?.collapse();
      setLeftSidebarOpen(false);
    } else {
      leftPanelRef.current?.expand();
      setLeftSidebarOpen(true);
    }
  };

  const toggleRightSidebar = () => {
    if (rightSidebarOpen) {
      rightPanelRef.current?.collapse();
      setRightSidebarOpen(false);
    } else {
      rightPanelRef.current?.expand();
      setRightSidebarOpen(true);
    }
  };

  const handleScan = async () => {
    if (!path) return;
    setLoading(true);
    setAddProjectOpen(false);
    try {
      const data = await scanProject(path);
      setProjectId(data.project_id);
      fetchProjects(); // Refresh the list
    } catch (e) {
      console.error(e);
      alert("Error scanning project");
    } finally {
      setLoading(false);
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
        return (
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 px-4 pt-2 border-b border-zinc-800/50 bg-zinc-900">
              <button onClick={() => setDashboardTab('insights')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${dashboardTab === 'insights' ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-400 hover:text-zinc-300'}`}>Insights</button>
              <button onClick={() => setDashboardTab('graph')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${dashboardTab === 'graph' ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-400 hover:text-zinc-300'}`}>Grafo 2D</button>
              <button onClick={() => setDashboardTab('kanban')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${dashboardTab === 'kanban' ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-400 hover:text-zinc-300'}`}>Kanban (Sprints)</button>
            </div>
            <div className="flex-1 relative overflow-hidden bg-[#151515]">
              {dashboardTab === 'insights' ? (
                projectId ? <InsightDashboard projectId={projectId} key={projectId} /> : <div className="p-4 text-zinc-400">Selecciona un proyecto...</div>
              ) : dashboardTab === 'graph' ? (
                <GraphScene projectId={projectId} key={projectId} onNodeClick={handleNodeClick} />
              ) : (
                <KanbanBoard projectId={projectId} key={projectId} onNodeClick={handleKanbanNodeClick} />
              )}
            </div>
          </div>
        );
      case 'editor':
        if (!projectId) return null;
        return <EditorTab projectId={projectId} node={activeTab.data.node} vimMode={vimMode} />;
      case 'git-graph':
        if (!projectId) return null;
        return <GitGraphTab projectId={projectId} />;
      case 'diff':
        if (!projectId) return null;
        return <DiffTab projectId={projectId} hash={activeTab.data.hash} filePath={activeTab.data.filePath} />;
      default:
        return <div className="p-4">Tipo de pestaña desconocido.</div>;
    }
  };

  return (
    <div className="h-[100dvh] w-full bg-[#0d0d0d] text-zinc-200 overflow-hidden relative">
      <ResizablePanelGroup
        direction="horizontal"
        className="h-full w-full relative"
      >
        {/* LEFT SIDEBAR — always in DOM, collapsible */}
        <ResizablePanel
          panelRef={leftPanelRef}
          defaultSize={20}
          minSize={15}
          maxSize={40}
          collapsible={true}
          collapsedSize={0}
          onResize={(size) => setLeftSidebarOpen(size.asPercentage > 0)}
          className="bg-[#0a0a0a] border-r border-zinc-800/50 flex flex-col overflow-hidden relative min-w-0 min-h-0"
        >
          <ScrollArea className="flex-1">
            <div className="p-4 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-zinc-100 truncate">SprintLogic IDE</h2>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white" onClick={toggleLeftSidebar} title="Ocultar barra lateral">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white" onClick={() => setSettingsOpen(true)}>
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
                <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                  <DialogContent className="sm:max-w-[425px] bg-zinc-900 text-zinc-200 border-zinc-800/50">
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
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="gemini" className="text-right text-xs">Gemini Key</Label>
                            <Input
                              id="gemini"
                              type="password"
                              value={geminiKey}
                              onChange={(e) => setGeminiKey(e.target.value)}
                              className="col-span-3 bg-zinc-800 border-zinc-700/50"
                            />
                          </div>
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="openai" className="text-right text-xs">OpenAI Key</Label>
                            <Input
                              id="openai"
                              type="password"
                              value={openAiKey}
                              onChange={(e) => setOpenAiKey(e.target.value)}
                              className="col-span-3 bg-zinc-800 border-zinc-700/50"
                            />
                          </div>
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="anthropic" className="text-right text-xs">Anthropic Key</Label>
                            <Input
                              id="anthropic"
                              type="password"
                              value={anthropicKey}
                              onChange={(e) => setAnthropicKey(e.target.value)}
                              className="col-span-3 bg-zinc-800 border-zinc-700/50"
                            />
                          </div>
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="openrouter" className="text-right text-xs">OpenRouter Key</Label>
                            <Input
                              id="openrouter"
                              type="password"
                              value={openRouterKey}
                              onChange={(e) => setOpenRouterKey(e.target.value)}
                              className="col-span-3 bg-zinc-800 border-zinc-700/50"
                            />
                          </div>
                          <div className="flex items-center space-x-2 pt-2 border-t border-zinc-800/50 mt-2">
                            <Switch id="vim-mode" checked={vimMode} onCheckedChange={setVimMode} />
                            <Label htmlFor="vim-mode">Habilitar Modo Vim</Label>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right text-xs">Color de Acento</Label>
                            <Select value={accentColor} onValueChange={(val: any) => setAccentColor(val)}>
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
                            <Select value={uiScale} onValueChange={(val: any) => setUiScale(val)}>
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
                    <div className="flex justify-end">
                      <Button onClick={async () => {
                        try {
                          if (geminiKey) await saveApiKey("gemini", geminiKey);
                          if (openAiKey) await saveApiKey("openai", openAiKey);
                          if (anthropicKey) await saveApiKey("anthropic", anthropicKey);
                          if (openRouterKey) await saveApiKey("openrouter", openRouterKey);
                          setSettingsOpen(false);
                          alert("Configuración guardada correctamente");
                        } catch (e) {
                          alert("Error al guardar la configuración");
                        }
                      }}>Guardar Configuración</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {/* 1. Selector de Proyectos */}
              <div className="flex items-center gap-2">
                <Select value={projectId || ""} onValueChange={setProjectId}>
                  <SelectTrigger className="flex-1 bg-zinc-800 border-zinc-700/50 text-zinc-200">
                    <SelectValue placeholder="Selecciona un proyecto..." />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700/50 text-zinc-200">
                    {projects.length > 0 ? (
                      projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="p-2 text-xs text-zinc-500">No hay proyectos</div>
                    )}
                  </SelectContent>
                </Select>
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="shrink-0 bg-zinc-800 border-zinc-700/50 text-zinc-300 hover:text-white"
                  onClick={() => setAddProjectOpen(true)}
                  title="Gestionar Proyectos"
                >
                  <Settings className="h-4 w-4" />
                </Button>
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

              {/* 2. Widget de Git Status */}
              {projectId && <GitStatusWidget projectId={projectId} key={projectId} />}

              {/* 3. Explorador de Archivos */}
              <Card className="bg-zinc-800 border-zinc-700/50 text-zinc-200 mt-2 flex-1 flex flex-col min-h-0">
                <CardHeader className="p-3 pb-2 shrink-0 border-b border-zinc-700/50/50">
                  <CardTitle className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Explorador</CardTitle>
                </CardHeader>
                <CardContent className="p-0 text-xs text-zinc-400 flex-1 overflow-hidden">
                  {projectId ? (
                    <div className="h-full overflow-y-auto">
                      <FileTree projectId={projectId} key={projectId} onFileSelect={(path) => handleNodeClick({ id: path, label: "File", name: path.split('/').pop() || path, file_path: path })} />
                    </div>
                  ) : (
                    <div className="p-4 text-center">Selecciona un proyecto...</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </ResizablePanel>

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

        <ResizableHandle className="bg-zinc-800 w-1 hover:bg-blue-500 transition-colors" />

        {/* MAIN CONTENT */}
        <ResizablePanel defaultSize={rightSidebarOpen ? 50 : 80} minSize={30} className="min-w-0 min-h-0 overflow-hidden flex flex-col bg-[#151515]">
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
              <TabBar />
              <div className="flex-1 relative overflow-hidden bg-[#151515]">
                {renderActiveTabContent()}
              </div>
            </>
          )}
        </ResizablePanel>

        <ResizableHandle className="bg-zinc-800 w-1 hover:bg-blue-500 transition-colors" />

        {/* RIGHT AI SIDEBAR — always in DOM, collapsible */}
        <ResizablePanel
          panelRef={rightPanelRef}
          defaultSize={0}
          minSize={20}
          maxSize={40}
          collapsible={true}
          collapsedSize={0}
          onResize={(size) => setRightSidebarOpen(size.asPercentage > 0)}
          className="bg-[#151515] flex flex-col border-l border-zinc-800/50 min-w-0 min-h-0 overflow-hidden"
        >
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
            <SprintLogicChat projectId={projectId} />
          </div>
        </ResizablePanel>

        {/* FAB to open AI sidebar when collapsed */}
        {!rightSidebarOpen && (
          <div className="absolute right-4 bottom-4 z-50">
            <Button 
              variant="default" 
              className="rounded-full shadow-lg shadow-blue-500/20 h-12 w-12 p-0 bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center border-none"
              onClick={toggleRightSidebar}
              title="Abrir AI"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>
            </Button>
          </div>
        )}
      </ResizablePanelGroup>
    </div>
  );
}
