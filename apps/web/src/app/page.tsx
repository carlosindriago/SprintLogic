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
import { scanProject } from "@/lib/api";

const GraphScene = dynamic(() => import("@/components/GraphScene"), { ssr: false });

export default function Home() {
  const [path, setPath] = useState("");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const handleScan = async () => {
    if (!path) return;
    setLoading(true);
    try {
      const data = await scanProject(path);
      setProjectId(data.project_id);
    } catch (e) {
      console.error(e);
      alert("Error scanning project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-full bg-slate-950 text-slate-200 overflow-hidden">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={20} minSize={15} maxSize={40} className="bg-slate-900 border-r border-slate-800">
          <ScrollArea className="h-full">
            <div className="p-4 flex flex-col gap-4">
              <h2 className="text-lg font-semibold text-slate-100">SprintLogic IDE</h2>

              <Card className="bg-slate-800 border-slate-700 text-slate-200">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-medium">Load Project</CardTitle>
                </CardHeader>
                <CardContent className="p-4 flex flex-col gap-2">
                  <input
                    type="text"
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                    placeholder="/path/to/project"
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                  <Button onClick={handleScan} disabled={loading} className="w-full">
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
                    <li>Add 3D graph canvas</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </ResizablePanel>

        <ResizableHandle className="bg-slate-800 w-1 hover:bg-blue-500 transition-colors" />

        <ResizablePanel defaultSize={80}>
          <div className="h-full w-full relative">
            {projectId === null ? (
              <div className="flex flex-col items-center justify-center h-full bg-slate-950 text-center px-4">
                <div className="w-16 h-16 bg-blue-500/10 text-blue-400 rounded-full flex items-center justify-center mb-6">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
                </div>
                <h3 className="text-3xl font-bold tracking-tight text-slate-100 mb-3">Bienvenido a SprintLogic</h3>
                <p className="text-slate-400 max-w-md mb-8 leading-relaxed">
                  Para comenzar, carga un proyecto local ingresando la ruta absoluta del repositorio. El motor AST escaneará y renderizará tu base de código en 3D.
                </p>
                <div className="flex w-full max-w-md items-center space-x-2">
                  <input
                    type="text"
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                    placeholder="/ruta/absoluta/a/tu/proyecto"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-md p-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                  <Button onClick={handleScan} disabled={loading || !path} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md">
                    {loading ? "Escaneando..." : "Cargar Proyecto"}
                  </Button>
                </div>
              </div>
            ) : (
              <GraphScene projectId={projectId} />
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
