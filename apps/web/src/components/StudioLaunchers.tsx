import React from 'react';
import { Button } from '@/components/ui/button';
import { BarChart3, Network, Layout, FolderGit2, Bot, Play, Database, Beaker, BookOpen, ChevronsUpDown, Edit2, Trash2, PlusCircle } from 'lucide-react';
import { useTabsStore, TabType } from '@/store/tabsStore';
import { Project } from '@/types';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

interface StudioLaunchersProps {
  projects: Project[];
  projectId: string | null;
  setProjectId: (id: string) => void;
  onEditProject: (p: Project) => void;
  onDeleteProject: (p: Project) => void;
  onAddProject: () => void;
}

export default function StudioLaunchers({ projects, projectId, setProjectId, onEditProject, onDeleteProject, onAddProject }: StudioLaunchersProps) {
  const addTab = useTabsStore((s) => s.addTab);

  const launchTool = (tabId: string, title: string, type: TabType) => {
    addTab({ id: tabId, title, type });
  };

  return (
    <div className="flex items-center gap-2 p-2 bg-[#0a0a0a] border-b border-zinc-800 shrink-0">
      <div className="flex items-center gap-1 bg-zinc-800/50 rounded-lg p-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700" onClick={() => launchTool('insights', 'Insights', 'insights')} title="Insights"><BarChart3 className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700" onClick={() => launchTool('graph', 'Análisis Gráfico', 'graph')} title="Análisis Gráfico"><Network className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700" onClick={() => launchTool('kanban', 'Kanban', 'kanban')} title="Kanban"><Layout className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700" onClick={() => launchTool('git-graph', 'Git Studio', 'git-graph')} title="Git Studio"><FolderGit2 className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700" onClick={() => launchTool('ai-history', 'Historial IA', 'ai-history')} title="Historial IA"><Bot className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700" onClick={() => launchTool('planning-studio', 'Planning Studio', 'planning-studio')} title="Planning Studio"><Play className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700" onClick={() => launchTool('database-studio', 'Database Studio', 'database-studio')} title="Database Studio"><Database className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700" onClick={() => launchTool('test-studio', 'Test Studio', 'test-studio')} title="Test Studio"><Beaker className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700" onClick={() => launchTool('document-studio', 'Document Studio', 'document-studio')} title="Document Studio"><BookOpen className="w-4 h-4" /></Button>
      </div>

      <div className="w-[240px]">
        <DropdownMenu>
          <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline" }), "w-full justify-between bg-zinc-800 border-zinc-700/50 text-zinc-200 hover:bg-zinc-700 hover:text-white truncate")}>
            <span className="truncate">
              {projects.find(p => p.id === projectId)?.name || "Selecciona un proyecto..."}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[240px] bg-zinc-800 border-zinc-700/50 text-zinc-200">
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
                        onEditProject(p);
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
                        onDeleteProject(p);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="bg-zinc-700/50" />
            <DropdownMenuItem onClick={onAddProject} className="cursor-pointer focus:bg-zinc-700">
              <PlusCircle className="mr-2 h-4 w-4 text-zinc-400" />
              <span>Añadir Proyecto</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
