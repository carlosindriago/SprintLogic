import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import GraphScene from "@/components/GraphScene";

export default function Home() {
  return (
    <div className="h-screen w-full bg-slate-950 text-slate-200 overflow-hidden">
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel defaultSize={20} minSize={15} maxSize={40} className="bg-slate-900 border-r border-slate-800">
          <ScrollArea className="h-full">
            <div className="p-4 flex flex-col gap-4">
              <h2 className="text-lg font-semibold text-slate-100">SprintLogic IDE</h2>
              
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
            <GraphScene />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
