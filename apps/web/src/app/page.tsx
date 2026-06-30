"use client";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
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
import { Settings, FolderOpen, Plus } from "lucide-react";
import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { scanProject, getFileContent, getProjects } from "@/lib/api";
import { Switch } from "@/components/ui/switch";
import JarvisChat from "@/components/JarvisChat";
import KanbanBoard from "@/components/KanbanBoard";
import Editor, { useMonaco } from "@monaco-editor/react";
import FileTree from "@/components/FileTree";

const GraphScene = dynamic(() => import("@/components/GraphScene"), { ssr: false });

export default function Home() {
  const [path, setPath] = useState("");
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [geminiKey, setGeminiKey] = useState("");
  const [openAiKey, setOpenAiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openRouterKey, setOpenRouterKey] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [vimMode, setVimMode] = useState(false);
  const [centerTab, setCenterTab] = useState<'graph' | 'kanban'>('graph');
  const [activeRightTab, setActiveRightTab] = useState<'inspector' | 'jarvis'>('jarvis');
  const [vimInstance, setVimInstance] = useState<any>(null);
  
  const monaco = useMonaco();

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

  const [selectedNode, setSelectedNode] = useState<any | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [loadingFile, setLoadingFile] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  const handleScan = async () => {
    if (!path) return;
    setLoading(true);
    setAddProjectOpen(false);
    try {
      const data = await scanProject(path);
      setProjectId(data.project_id);
      setSelectedNode(null); // Reset selection on new scan
      fetchProjects(); // Refresh the list
    } catch (e) {
      console.error(e);
      alert("Error scanning project");
    } finally {
      setLoading(false);
    }
  };

  const handleNodeClick = async (node: any) => {
    setSelectedNode(node);
    setActiveRightTab('inspector');
    if (!node.file_path) return;
    
    setLoadingFile(true);
    try {
      const content = await getFileContent(projectId!, node.file_path);
      setFileContent(content);
    } catch (e) {
      console.error(e);
      setFileContent("// Error loading file");
    } finally {
      setLoadingFile(false);
    }
  };

  const handleKanbanNodeClick = async (nodeId: string) => {
    if (!projectId) return;
    try {
      // Decode node ID (e.g., file:app.py) if necessary, but backend path variable handles it mostly.
      // Wait, we need to URI encode the node ID because it contains slashes
      const res = await fetch(`http://localhost:8000/api/v1/projects/${projectId}/nodes/${encodeURIComponent(nodeId)}`);
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

  return (
    <div className="h-screen w-full bg-slate-950 text-slate-200 overflow-hidden">
      <ResizablePanelGroup direction="horizontal">
        {!isMaximized && (
          <>
            <ResizablePanel id="sidebar-left" defaultSize="260px" minSize="220px" maxSize="40%" className="bg-slate-900 border-r border-slate-800 flex flex-col min-w-0 overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="p-4 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-100 truncate">SprintLogic IDE</h2>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white" onClick={() => setSettingsOpen(true)}>
                  <Settings className="h-4 w-4" />
                </Button>
                <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                  <DialogContent className="sm:max-w-[425px] bg-slate-900 text-slate-200 border-slate-800">
                    <DialogHeader>
                      <DialogTitle>Configuración de Modelos (LLMs)</DialogTitle>
                      <DialogDescription className="text-slate-400">
                        Ingresa las API Keys para los diferentes proveedores que desees usar con Jarvis.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="gemini" className="text-right text-xs">Gemini Key</Label>
                        <Input
                          id="gemini"
                          type="password"
                          value={geminiKey}
                          onChange={(e) => setGeminiKey(e.target.value)}
                          className="col-span-3 bg-slate-800 border-slate-700"
                        />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="openai" className="text-right text-xs">OpenAI Key</Label>
                        <Input
                          id="openai"
                          type="password"
                          value={openAiKey}
                          onChange={(e) => setOpenAiKey(e.target.value)}
                          className="col-span-3 bg-slate-800 border-slate-700"
                        />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="anthropic" className="text-right text-xs">Anthropic Key</Label>
                        <Input
                          id="anthropic"
                          type="password"
                          value={anthropicKey}
                          onChange={(e) => setAnthropicKey(e.target.value)}
                          className="col-span-3 bg-slate-800 border-slate-700"
                        />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="openrouter" className="text-right text-xs">OpenRouter Key</Label>
                        <Input
                          id="openrouter"
                          type="password"
                          value={openRouterKey}
                          onChange={(e) => setOpenRouterKey(e.target.value)}
                          className="col-span-3 bg-slate-800 border-slate-700"
                        />
                      </div>
                      <div className="flex items-center space-x-2 pt-2 border-t border-slate-800 mt-2">
                        <Switch id="vim-mode" checked={vimMode} onCheckedChange={setVimMode} />
                        <Label htmlFor="vim-mode">Habilitar Modo Vim</Label>
                      </div>
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

              <Card className="bg-slate-800 border-slate-700 text-slate-200">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-medium">Proyectos</CardTitle>
                </CardHeader>
                <CardContent className="p-4 flex flex-col gap-2">
                  {projects.length > 0 ? (
                    <ul className="space-y-1 mb-2">
                      {projects.map((p) => (
                        <li key={p.id}>
                          <button
                            onClick={() => setProjectId(p.id)}
                            className={`w-full text-left px-2 py-1.5 rounded text-sm truncate transition-colors flex items-center gap-2 ${projectId === p.id ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-slate-700/50 text-slate-300'}`}
                          >
                            <FolderOpen className="w-4 h-4 shrink-0" />
                            {p.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-xs text-slate-400 mb-2">No hay proyectos guardados.</div>
                  )}

                  <Button variant="outline" className="w-full bg-slate-900 border-slate-700 hover:bg-slate-800 text-xs" onClick={() => setAddProjectOpen(true)}>
                    <Plus className="w-3 h-3 mr-2" /> Añadir Proyecto Local
                  </Button>
                  <Dialog open={addProjectOpen} onOpenChange={setAddProjectOpen}>
                    <DialogContent className="sm:max-w-[425px] bg-slate-900 text-slate-200 border-slate-800">
                      <DialogHeader>
                        <DialogTitle>Añadir Proyecto Local</DialogTitle>
                        <DialogDescription className="text-slate-400">
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
                            className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded p-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
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
                          }} variant="outline" className="px-3 bg-slate-800 border-slate-700 hover:bg-slate-700 whitespace-nowrap">
                            Examinar...
                          </Button>
                        </div>
                        <Button onClick={handleScan} disabled={loading || !path} className="w-full">
                          {loading ? "Cargando..." : "Registrar y Analizar"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              <Card className="bg-slate-800 border-slate-700 text-slate-200">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-medium">Explorador de Archivos</CardTitle>
                </CardHeader>
                <CardContent className="p-0 text-xs text-slate-400">
                  {projectId ? <FileTree projectId={projectId} onFileSelect={(path) => handleNodeClick({ file_path: path })} /> : <div className="p-4">Selecciona un proyecto...</div>}
                </CardContent>
              </Card>

              <Card className="bg-slate-800 border-slate-700 text-slate-200">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-medium">Sprints & KPIs</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 text-xs text-slate-400">
                  Pronto...
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </ResizablePanel>
          </>
        )}

        {!isMaximized && (
          <>
            <ResizableHandle className="bg-slate-800 w-1 hover:bg-blue-500 transition-colors" />

            <ResizablePanel id="main-graph" defaultSize="60%" minSize="300px" className="min-w-0 overflow-hidden flex flex-col">
              <div className="flex-1 relative min-w-0 overflow-hidden">
                {projectId === null ? (
                  <div className="flex flex-col items-center justify-center h-full bg-slate-950 text-center px-4">
                    <div className="w-16 h-16 bg-blue-500/10 text-blue-400 rounded-full flex items-center justify-center mb-6">
                      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
                    </div>
                    <h3 className="text-3xl font-bold tracking-tight text-slate-100 mb-3">Bienvenido a SprintLogic</h3>
                    <p className="text-slate-400 max-w-md mb-8 leading-relaxed">
                      Para comenzar, carga un proyecto local ingresando la ruta absoluta del repositorio. El motor AST escaneará y renderizará tu base de código en 2D.
                    </p>
                    <div className="flex w-full max-w-lg items-center space-x-2">
                      <div className="flex flex-1 items-center space-x-2">
                        <input
                          type="text"
                          value={path}
                          onChange={(e) => setPath(e.target.value)}
                          placeholder="/ruta/absoluta/a/tu/proyecto"
                          className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-md p-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
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
                        }} variant="outline" className="px-3 bg-slate-800 border-slate-700 hover:bg-slate-700 h-10 whitespace-nowrap">
                          Examinar...
                        </Button>
                      </div>
                      <Button onClick={handleScan} disabled={loading || !path} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md h-10 whitespace-nowrap">
                        {loading ? "Escaneando..." : "Cargar Proyecto"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col h-full">
                    <div className="flex items-center gap-2 px-4 pt-2 border-b border-slate-800 bg-slate-900">
                      <button onClick={() => setCenterTab('graph')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${centerTab === 'graph' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-300'}`}>Grafo 2D</button>
                      <button onClick={() => setCenterTab('kanban')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${centerTab === 'kanban' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-300'}`}>Kanban (Sprints)</button>
                    </div>
                    <div className="flex-1 relative overflow-hidden bg-slate-950">
                      {centerTab === 'graph' ? (
                        <GraphScene projectId={projectId} onNodeClick={handleNodeClick} />
                      ) : (
                        <KanbanBoard projectId={projectId} onNodeClick={handleKanbanNodeClick} />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </ResizablePanel>
          </>
        )}

        {(selectedNode || true) && (
          <>
            {!isMaximized && <ResizableHandle className="bg-slate-800 w-1 hover:bg-blue-500 transition-colors" />}
            <ResizablePanel id="sidebar-right" defaultSize={isMaximized ? 100 : 30} minSize={isMaximized ? 100 : 20} className="bg-[#1e1e1e] flex flex-col border-l border-slate-800 min-w-0 overflow-hidden">
              <div className="flex items-center gap-2 px-2 pt-2 border-b border-slate-800 bg-slate-900">
                <button onClick={() => setActiveRightTab('inspector')} className={`px-3 py-1.5 text-xs font-medium rounded-t border-b-2 ${activeRightTab === 'inspector' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-300'}`}>Inspector</button>
                <button onClick={() => setActiveRightTab('jarvis')} className={`px-3 py-1.5 text-xs font-medium rounded-t border-b-2 ${activeRightTab === 'jarvis' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-300'}`}>Jarvis</button>
                
                <div className="ml-auto flex items-center gap-1">
                  {selectedNode && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 px-2 py-0 text-xs text-slate-400 hover:text-white mb-1"
                      onClick={() => setIsMaximized(!isMaximized)}
                    >
                      {isMaximized ? "Contraer" : "Expandir"}
                    </Button>
                  )}
                  {selectedNode && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 w-6 p-0 text-slate-400 hover:text-white mb-1"
                      onClick={() => {
                        setSelectedNode(null);
                        setIsMaximized(false);
                      }}
                    >
                      &times;
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex-1 relative overflow-hidden">
                {activeRightTab === 'jarvis' ? (
                  <JarvisChat projectId={projectId} />
                ) : !selectedNode ? (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
                    Selecciona un archivo en el explorador o el grafo.
                  </div>
                ) : loadingFile ? (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                    Cargando código...
                  </div>
                ) : (
                  <Editor
                    height="100%"
                    theme="vs-dark"
                    path={selectedNode.file_path}
                    value={fileContent}
                    onMount={(editor, monaco) => {
                      if (vimMode) {
                        import("monaco-vim").then(({ initVimMode }) => {
                          const statusNode = document.createElement('div');
                          statusNode.style.padding = '2px 8px';
                          statusNode.style.fontSize = '12px';
                          statusNode.style.backgroundColor = '#1e1e1e';
                          statusNode.style.borderTop = '1px solid #333';
                          statusNode.style.color = '#fff';
                          editor.getContainerDomNode().parentElement?.appendChild(statusNode);
                          
                          const vim = initVimMode(editor, statusNode);
                          setVimInstance(vim);
                        });
                      }
                      
                      // Auto-scroll logic if AST metadata exists
                      if (selectedNode.metadata) {
                        try {
                          const meta = JSON.parse(selectedNode.metadata);
                          if (meta.start_line) {
                            editor.revealLineInCenter(meta.start_line);
                            editor.setPosition({ lineNumber: meta.start_line, column: 1 });
                          }
                        } catch (e) {}
                      }
                    }}
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      fontSize: 13,
                      wordWrap: "on",
                      padding: { top: 16 }
                    }}
                  />
                )}
              </div>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}
