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
      <ResizablePanelGroup orientation="horizontal">
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
            <GraphScene projectId={projectId} />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
