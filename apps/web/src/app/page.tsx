"use client";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";
import { useState } from "react";
import { scanProject, getFileContent } from "@/lib/api";
import Editor from "@monaco-editor/react";

const GraphScene = dynamic(() => import("@/components/GraphScene"), { ssr: false });

export default function Home() {
  const [path, setPath] = useState("");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const [selectedNode, setSelectedNode] = useState<any | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [loadingFile, setLoadingFile] = useState(false);

  const handleScan = async () => {
    if (!path) return;
    setLoading(true);
    try {
      const data = await scanProject(path);
      setProjectId(data.project_id);
      setSelectedNode(null); // Reset selection on new scan
    } catch (e) {
      console.error(e);
      alert("Error scanning project");
    } finally {
      setLoading(false);
    }
  };

  const handleNodeClick = async (node: any) => {
    if (!node.file_path) return;
    setSelectedNode(node);
    setLoadingFile(true);
    try {
      const content = await getFileContent(node.file_path);
      setFileContent(content);
    } catch (e) {
      console.error(e);
      setFileContent("// Error loading file contents");
    } finally {
      setLoadingFile(false);
    }
  };

  return (
    <div className="h-screen w-full bg-slate-950 text-slate-200 overflow-hidden">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel id="sidebar-left" defaultSize="260px" minSize="220px" maxSize="40%" className="bg-slate-900 border-r border-slate-800 flex flex-col min-w-0 overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="p-4 flex flex-col gap-4">
              <h2 className="text-lg font-semibold text-slate-100 truncate">SprintLogic IDE</h2>

              <Card className="bg-slate-800 border-slate-700 text-slate-200">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-medium">Load Project</CardTitle>
                </CardHeader>
                <CardContent className="p-4 flex flex-col gap-2">
                  <div className="flex w-full items-center space-x-2">
                    <input
                      type="text"
                      value={path}
                      onChange={(e) => setPath(e.target.value)}
                      placeholder="/path/to/project"
                      className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
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
                    {loading ? "Cargando..." : "Cargar Proyecto Local"}
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-slate-800 border-slate-700 text-slate-200">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-medium">Git Status</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 text-xs text-slate-400">
                  No changes detected.
                </CardContent>
              </Card>

              <Card className="bg-slate-800 border-slate-700 text-slate-200">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-medium">Active Tasks</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 text-xs text-slate-400">
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Initialize Tauri</li>
                    <li>Setup Shadcn layout</li>
                    <li>Add 2D graph canvas</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </ResizablePanel>

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
              <GraphScene projectId={projectId} onNodeClick={handleNodeClick} />
            )}
          </div>
        </ResizablePanel>

        {selectedNode && (
          <>
            <ResizableHandle className="bg-slate-800 w-1 hover:bg-blue-500 transition-colors" />
            <ResizablePanel id="sidebar-right" defaultSize="30%" minSize="200px" className="bg-[#1e1e1e] flex flex-col border-l border-slate-800 min-w-0 overflow-hidden">
              <div className="flex items-center justify-between p-3 border-b border-slate-800 bg-slate-900">
                <span className="text-sm font-mono text-slate-300 truncate" title={selectedNode.file_path}>
                  {selectedNode.name || "Archivo"}
                </span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 w-6 p-0 text-slate-400 hover:text-white"
                  onClick={() => setSelectedNode(null)}
                >
                  &times;
                </Button>
              </div>
              <div className="flex-1 relative">
                {loadingFile ? (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                    Cargando código...
                  </div>
                ) : (
                  <Editor
                    height="100%"
                    theme="vs-dark"
                    path={selectedNode.file_path}
                    value={fileContent}
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
