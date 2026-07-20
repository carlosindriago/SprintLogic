"use client";

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { DndContext, closestCenter, DragEndEvent, DragOverlay, DragStartEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import { getProjectTasks, saveProjectTasks, getKanbanConfig, saveKanbanConfig, syncKanbanCommits, generateWBS, WBSResponse, WBSTask, KanbanColumn } from '@/lib/api';
import { useLLMConfigStore } from '@/store/llmConfigStore';
import { Task } from "@/types";
import { cn } from "@/lib/utils";
import { 
  Settings, 
  Plus, 
  Trash, 
  Play, 
  Check, 
  Clock, 
  Brain, 
  Tag, 
  ChevronLeft, 
  ChevronRight, 
  Edit2, 
  AlertTriangle, 
  GitBranch,
  X
} from "lucide-react";

interface KanbanBoardProps {
  projectId: string | null;
  onNodeClick?: (nodeId: string) => void;
}

function SortableTask({ 
  task, 
  onNodeClick
}: { 
  task: Task; 
  onNodeClick?: (nodeId: string) => void; 
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const formatTime = (mins?: number) => {
    if (!mins) return "0m";
    const hrs = Math.floor(mins / 60);
    const m = mins % 60;
    return hrs > 0 ? `${hrs}h ${m}m` : `${m}m`;
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="mb-2 cursor-grab active:cursor-grabbing">
      <Card className="bg-zinc-800 border-zinc-700/50 hover:border-zinc-600 transition-colors">
        <CardContent className="p-3 text-xs text-zinc-200 flex flex-col gap-2">
          {/* Header with task ID and priority */}
          <div className="flex items-center justify-between">
            <span className="text-[9px] bg-zinc-900 text-zinc-300 font-mono px-1.5 py-0.5 rounded border border-zinc-700 font-semibold select-all" title="Copiar ID para commit">
              {task.id}
            </span>
            <div className="flex items-center gap-1.5">
              {task.priority && (
                <span className={cn(
                  "text-[9px] px-1.5 py-0.5 rounded font-medium",
                  task.priority === "High" ? "bg-red-950/40 text-red-400 border border-red-900/30" :
                  task.priority === "Medium" ? "bg-blue-950/40 text-blue-400 border border-blue-900/30" :
                  "bg-zinc-900 text-zinc-400 border border-zinc-700"
                )}>
                  {task.priority}
                </span>
              )}
            </div>
          </div>

          <div className="prose prose-invert prose-sm max-w-none prose-p:my-0 text-zinc-200">
            <ReactMarkdown>{task.content}</ReactMarkdown>
          </div>

          {/* Metadata badges: Pomodoros, Time, Commit, Tags */}
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-400 mt-1">
            {task.commit && (
              <span className="flex items-center gap-1 bg-green-950/30 text-green-400 border border-green-900/40 px-1.5 py-0.5 rounded">
                <GitBranch className="w-3 h-3" />
                {task.commit.substring(0, 7)}
              </span>
            )}
            {task.time_spent ? (
              <span className="flex items-center gap-1 bg-zinc-900 text-zinc-400 border border-zinc-700 px-1.5 py-0.5 rounded">
                <Clock className="w-3 h-3 text-zinc-500" />
                {task.time_spent ? ` (${formatTime(task.time_spent)})` : ""}
              </span>
            ) : null}
            {task.tags && task.tags.map(tag => (
              <span key={tag} className="bg-zinc-900 text-zinc-500 px-1.5 py-0.5 rounded border border-zinc-700">
                #{tag}
              </span>
            ))}
          </div>

          {task.affected_nodes && task.affected_nodes.length > 0 && (
            <div className="flex flex-wrap gap-1 border-t border-zinc-700/30 pt-2 mt-1">
              {task.affected_nodes.map((node) => (
                <span
                  key={node}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onNodeClick) onNodeClick(node);
                  }}
                  className="px-1.5 py-0.5 bg-blue-900/30 text-blue-300 rounded border border-blue-800 text-[9px] cursor-pointer hover:bg-blue-800 transition-colors"
                >
                  {node}
                </span>
              ))}
            </div>
          )}


        </CardContent>
      </Card>
    </div>
  );
}

export default function KanbanBoard({ projectId, onNodeClick }: KanbanBoardProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncCommits = async () => {
    if (!projectId) return;
    setIsSyncing(true);
    try {
      await syncKanbanCommits(projectId);
      const data = await getProjectTasks(projectId);
      setTasks(data.tasks);
    } catch (e) {
      console.error("Manual commit sync failed", e);
    } finally {
      setIsSyncing(false);
    }
  };
  
  // Columns Config Modal States
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [editingColumns, setEditingColumns] = useState<KanbanColumn[]>([]);
  const [newColTitle, setNewColTitle] = useState("");
  const [newColColor, setNewColColor] = useState("border-zinc-500");
  const [newColRule, setNewColRule] = useState<'manual' | 'auto-on-test-fail' | 'auto-on-test-pass'>('manual');
  const [colError, setColError] = useState<string | null>(null);

  // WBS Planner States
  const [showWbsModal, setShowWbsModal] = useState(false);
  const [wbsRequirements, setWbsRequirements] = useState("");
  const [wbsResponse, setWbsResponse] = useState<WBSResponse | null>(null);
  const [isWbsGenerating, setIsWbsGenerating] = useState(false);
  const wbsModel = useLLMConfigStore((s) => s.defaultModel);
  const [wbsError, setWbsError] = useState<string | null>(null);

  const handleGenerateWbs = async () => {
    if (!projectId || !wbsRequirements.trim()) return;
    setIsWbsGenerating(true);
    setWbsError(null);
    setWbsResponse(null);
    try {
      const data = await generateWBS(projectId, wbsRequirements, wbsModel);
      setWbsResponse(data);
    } catch (e: any) {
      setWbsError(e.message || "Fallo al generar el plan WBS.");
    } finally {
      setIsWbsGenerating(false);
    }
  };

  const handleImportWbs = async () => {
    if (!projectId || !wbsResponse) return;
    
    const firstCol = columns[0] || { id: "todo", title: "To Do" };
    
    try {
      const newTasks: Task[] = wbsResponse.tasks.map((t, idx) => ({
        id: `wbs-temp-${idx}`,
        content: t.title,
        status: firstCol.id,
        category: firstCol.title,
        priority: t.priority,
        tags: t.tags,
        raw_line: -1,
        time_spent: 0
      }));

      const mergedTasks = [...tasks, ...newTasks];
      await saveProjectTasks(projectId, mergedTasks);
      
      const data = await getProjectTasks(projectId);
      setTasks(data.tasks);
      
      setShowWbsModal(false);
      setWbsRequirements("");
      setWbsResponse(null);
    } catch (e: any) {
      setWbsError("Fallo al importar las tareas en tasks.md");
    }
  };

  const fetchConfig = useCallback(async () => {
    if (!projectId) return;
    try {
      const config = await getKanbanConfig(projectId);
      setColumns(config.columns);
      setEditingColumns(config.columns);
    } catch (e) {
      console.error("Failed to fetch kanban config", e);
    }
  }, [projectId]);

  const fetchTasks = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await getProjectTasks(projectId);
      setTasks(data.tasks);
    } catch (e) {
      console.error("Failed to fetch tasks", e);
    }
  }, [projectId]);

  const saveTasks = useCallback(async (newTasks: Task[]) => {
    if (!projectId) return;
    try {
      await saveProjectTasks(projectId, newTasks);
    } catch (e) {
      console.error("Failed to save tasks", e);
    }
  }, [projectId]);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      await fetchConfig();
      await fetchTasks();
      try {
        if (projectId) await syncKanbanCommits(projectId);
      } catch (e) {
        console.error("Auto sync commits failed", e);
      }
    };

    loadData();

    if (!projectId) return;

    // SSE setup for real-time updates
    const evtSource = new EventSource(`http://127.0.0.1:8000/api/v1/projects/${projectId}/events`);
    evtSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "kanban_update" && active) {
        fetchConfig();
        fetchTasks();
      }
    };

    return () => {
      active = false;
      evtSource.close();
    };
  }, [projectId, fetchTasks, fetchConfig]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;

    if (!over) return;

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;

    if (activeIdStr === overIdStr) return;

    // Check if dragging over a column container
    const isOverColumn = columns.some(c => c.id === overIdStr);

    setTasks(prevTasks => {
      const activeIndex = prevTasks.findIndex(t => t.id === activeIdStr);
      const overIndex = prevTasks.findIndex(t => t.id === overIdStr);

      const newTasks = [...prevTasks];
      const activeTask = { ...newTasks[activeIndex] };

      if (isOverColumn) {
        activeTask.status = overIdStr;
        
        // Find column title to keep tasks category updated
        const targetCol = columns.find(c => c.id === overIdStr);
        if (targetCol) {
          activeTask.category = targetCol.title;
        }
        
        newTasks[activeIndex] = activeTask;
      } else {
        const overTask = prevTasks[overIndex];
        if (activeTask.status !== overTask.status) {
          activeTask.status = overTask.status;
          activeTask.category = overTask.category;
          newTasks[activeIndex] = activeTask;
        }
        const moved = arrayMove(newTasks, activeIndex, overIndex);
        saveTasks(moved);
        return moved;
      }

      saveTasks(newTasks);
      return newTasks;
    });
  };



  // Add Column Handler
  const handleAddColumn = () => {
    setColError(null);
    if (!newColTitle.trim()) {
      setColError("El título de la columna no puede estar vacío");
      return;
    }
    const id = newColTitle.toLowerCase().trim().replace(/[-\s]+/g, "-").replace(/[^\w-]/g, "");
    if (editingColumns.some(c => c.id === id)) {
      setColError("Ya existe una columna con este nombre");
      return;
    }

    const newCol: KanbanColumn = {
      id,
      title: newColTitle.trim(),
      color: newColColor,
      rule: newColRule
    };

    setEditingColumns([...editingColumns, newCol]);
    setNewColTitle("");
    setNewColColor("border-zinc-500");
    setNewColRule("manual");
  };

  // Delete Column Handler (validating tasks exist first)
  const handleDeleteColumn = (colId: string) => {
    setColError(null);
    const hasTasks = tasks.some(t => t.status === colId);
    if (hasTasks) {
      setColError("No podés eliminar una columna que tiene tareas activas. Mové las tareas antes.");
      return;
    }

    setEditingColumns(editingColumns.filter(c => c.id !== colId));
  };

  // Move Column Position
  const handleMoveColumn = (index: number, direction: 'left' | 'right') => {
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= editingColumns.length) return;
    
    const nextCols = [...editingColumns];
    const temp = nextCols[index];
    nextCols[index] = nextCols[targetIndex];
    nextCols[targetIndex] = temp;
    setEditingColumns(nextCols);
  };

  // Save Columns Configuration
  const handleSaveConfig = async () => {
    if (!projectId) return;
    try {
      await saveKanbanConfig(projectId, editingColumns);
      setColumns(editingColumns);
      setShowConfigModal(false);
      setColError(null);
    } catch (e) {
      setColError("Error al guardar la configuración de columnas");
    }
  };

  // ⚡ Bolt: Performance Optimization
  // Groups tasks by status in a single pass O(N).
  // Prevents filtering the entire tasks array 3 times per column on every render,
  // reducing complexity from O(C * N) to O(N) and improving drag-and-drop responsiveness.
  const tasksByStatus = useMemo(() => {
    return tasks.reduce((acc, task) => {
      const status = task.status;
      if (!acc[status]) acc[status] = [];
      acc[status].push(task);
      return acc;
    }, {} as Record<string, Task[]>);
  }, [tasks]);

  if (!projectId) {
    return <div className="h-full flex items-center justify-center text-zinc-500">Selecciona un proyecto para ver el Kanban.</div>;
  }

  const activeTask = activeId ? tasks.find(t => t.id === activeId) : null;

  return (
    <div className="h-full bg-[#1e1e1e] flex flex-col relative overflow-hidden">
      {/* Sub-Header with controls */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800/50 bg-[#161618] shrink-0">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-zinc-200">Tablero Kanban del Proyecto</span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowWbsModal(true)}
            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded bg-blue-950/20 hover:bg-blue-950/30 transition-colors border border-blue-900/30"
          >
            <Brain className="w-3.5 h-3.5" />
            Planificador IA (WBS)
          </button>
          <button 
            onClick={handleSyncCommits}
            disabled={isSyncing}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 px-3 py-1.5 rounded bg-[#27272a] hover:bg-[#3f3f46] transition-colors border border-zinc-700/50 disabled:opacity-50"
          >
            <GitBranch className={cn("w-3.5 h-3.5", isSyncing && "animate-spin")} />
            {isSyncing ? "Sincronizando..." : "Sincronizar Commits"}
          </button>
          <button 
            onClick={() => {
              setEditingColumns(columns);
              setShowConfigModal(true);
            }}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 px-3 py-1.5 rounded bg-[#27272a] hover:bg-[#3f3f46] transition-colors border border-zinc-700/50"
          >
            <Settings className="w-3.5 h-3.5" />
            Configurar Columnas
          </button>
        </div>
      </div>

      {/* Kanban Columns view */}
      <div className="flex-1 flex p-6 gap-4 overflow-x-auto overflow-y-hidden custom-scrollbar bg-[#111112]">
        <DndContext collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {columns.map(col => {
            const columnTasks = tasksByStatus[col.id] || [];

            return (
              <div key={col.id} className={cn("flex flex-col bg-zinc-900 rounded-lg min-w-[280px] max-w-[320px] border-t-2 shrink-0 border-zinc-800", col.color)}>
                <div className="p-3 font-semibold text-zinc-300 text-sm border-b border-zinc-800/50 flex items-center justify-between">
                  <span>{col.title}</span>
                  <span className="text-xs bg-zinc-850 px-2 py-0.5 rounded-full text-zinc-500 font-medium">
                    {columnTasks.length}
                  </span>
                </div>
                <ScrollArea className="flex-1 p-3">
                  <SortableContext items={columnTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    <div id={col.id} className="min-h-[300px]">
                      {columnTasks.map(task => (
                        <SortableTask
                          key={task.id}
                          task={task}
                          onNodeClick={onNodeClick}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </ScrollArea>
              </div>
            );
          })}

          <DragOverlay>
            {activeTask ? (
              <Card className="bg-zinc-700 border-zinc-600 shadow-xl opacity-90">
                <CardContent className="p-3 text-xs text-zinc-200">
                  <div className="text-[10px] text-zinc-400 mb-1 font-semibold">{activeTask.category}</div>
                  <div className="prose prose-invert prose-sm max-w-none prose-p:my-0">
                    <ReactMarkdown>{activeTask.content}</ReactMarkdown>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Columns Config Modal */}
      {showConfigModal && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setShowConfigModal(false)}>
          <div 
            className="bg-[#18181b] border border-[#3f3f46] w-full max-w-xl max-h-[85vh] flex flex-col rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3f3f46]">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-400" />
                <h3 className="text-md font-bold text-zinc-100">Configurar Columnas Kanban</h3>
              </div>
              <button aria-label="Cerrar configuración" onClick={() => setShowConfigModal(false)} className="text-zinc-400 hover:text-zinc-250">
                <X aria-hidden="true" className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 custom-scrollbar text-sm">
              {colError && (
                <div className="bg-red-950/40 border border-red-900/50 p-3 rounded-md text-red-400 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{colError}</span>
                </div>
              )}

              {/* Column list */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Columnas Activas</label>
                <div className="flex flex-col gap-2 bg-[#111112] p-3 rounded-md border border-[#27272a]">
                  {editingColumns.length === 0 ? (
                    <div className="text-xs text-zinc-500 py-2 text-center">No hay columnas configuradas. Crea una abajo.</div>
                  ) : (
                    editingColumns.map((col, idx) => (
                      <div key={col.id} className="flex items-center justify-between bg-zinc-800/50 border border-zinc-700/50 px-3 py-2 rounded-md">
                        <div className="flex items-center gap-2.5">
                          <span className={cn("w-2.5 h-2.5 rounded-full bg-zinc-500", col.color.replace('border-', 'bg-'))} />
                          <span className="font-medium text-zinc-200">{col.title}</span>
                          <span className="text-[10px] text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-700/50 uppercase font-mono">
                            Regla: {col.rule || 'manual'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button 
                            disabled={idx === 0} 
                            onClick={() => handleMoveColumn(idx, 'left')}
                            className="p-1 rounded text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-400"
                            aria-label="Mover columna a la izquierda"
                          >
                            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                          </button>
                          <button 
                            disabled={idx === editingColumns.length - 1} 
                            onClick={() => handleMoveColumn(idx, 'right')}
                            className="p-1 rounded text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-400"
                            aria-label="Mover columna a la derecha"
                          >
                            <ChevronRight className="w-4 h-4" aria-hidden="true" />
                          </button>
                          <button 
                            onClick={() => handleDeleteColumn(col.id)}
                            className="p-1 rounded text-red-400 hover:text-red-300 hover:bg-red-950/20"
                            aria-label="Eliminar columna"
                          >
                            <Trash className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Add Column section */}
              <div className="flex flex-col gap-3 border-t border-[#27272a] pt-4 mt-1">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Crear Nueva Columna</label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 flex flex-col gap-1.5">
                    <span className="text-xs text-zinc-400">Título</span>
                    <input 
                      type="text" 
                      placeholder="Ej. QA, Code Review..."
                      className="bg-[#111112] border border-[#3f3f46] rounded-md px-3 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-zinc-500"
                      value={newColTitle}
                      onChange={(e) => setNewColTitle(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs text-zinc-400">Color del Borde</span>
                    <select 
                      className="bg-[#111112] border border-[#3f3f46] rounded-md px-3 py-1.5 text-zinc-200 text-xs focus:outline-none"
                      value={newColColor}
                      onChange={(e) => setNewColColor(e.target.value)}
                    >
                      <option value="border-zinc-500">Gris</option>
                      <option value="border-blue-500">Azul</option>
                      <option value="border-green-500">Verde</option>
                      <option value="border-purple-500">Morado</option>
                      <option value="border-orange-500">Naranja</option>
                      <option value="border-red-500">Rojo</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs text-zinc-400">Regla de Automatización</span>
                    <select 
                      className="bg-[#111112] border border-[#3f3f46] rounded-md px-3 py-1.5 text-zinc-200 text-xs focus:outline-none"
                      value={newColRule}
                      onChange={(e) => setNewColRule(e.target.value as any)}
                    >
                      <option value="manual">Manual (100% control)</option>

                      <option value="auto-on-test-fail">Test (Auto si falla test)</option>
                      <option value="auto-on-test-pass">Done (Auto si commit + test OK)</option>
                    </select>
                  </div>
                </div>
                <button 
                  onClick={handleAddColumn}
                  className="flex items-center justify-center gap-1.5 text-xs py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors mt-2"
                >
                  <Plus className="w-4 h-4" />
                  Agregar Columna
                </button>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-[#3f3f46] flex justify-end gap-3 bg-[#131315] rounded-b-lg">
              <button 
                onClick={() => setShowConfigModal(false)}
                className="text-zinc-400 hover:text-zinc-200 text-xs font-semibold px-4 py-2 rounded-md bg-[#27272a] hover:bg-[#3f3f46] transition-colors border border-[#3f3f46]"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveConfig}
                className="text-white text-xs font-semibold px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 transition-colors"
              >
                Guardar Configuración
              </button>
            </div>
          </div>
        </div>
      )}
      {/* WBS Planner Modal */}
      {showWbsModal && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setShowWbsModal(false)}>
          <div 
            className="bg-[#18181b] border border-[#3f3f46] w-full max-w-2xl max-h-[85vh] flex flex-col rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#3f3f46]">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-blue-400" />
                <h3 className="text-md font-bold text-zinc-100">Planificador de Tareas IA (WBS)</h3>
              </div>
              <button aria-label="Cerrar planificador" onClick={() => setShowWbsModal(false)} className="text-zinc-400 hover:text-zinc-250">
                <X aria-hidden="true" className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5 custom-scrollbar text-sm text-zinc-300">
              {wbsError && (
                <div className="bg-red-950/40 border border-red-900/50 p-3 rounded-md text-red-400 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{wbsError}</span>
                </div>
              )}

              {/* Requirement Input */}
              {!wbsResponse && (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Ingresá los requerimientos o descripción en lenguaje natural de la feature que querés construir. La IA la dividirá en tareas técnicas atómicas y lógicamente ordenadas.
                  </p>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs text-zinc-400 font-semibold">Requerimientos de la Feature</span>
                    <textarea
                      placeholder="Ej: Necesitamos implementar autenticación JWT. Debe incluir un middleware para validar tokens en la API FastAPI, endpoints de login/registro, y almacenamiento seguro del token en localStorage en el frontend React con persistencia de estado."
                      className="bg-[#111112] border border-[#3f3f46] rounded-md px-3 py-2 text-zinc-250 text-xs focus:outline-none focus:border-zinc-500 h-32 resize-none custom-scrollbar"
                      value={wbsRequirements}
                      onChange={(e) => setWbsRequirements(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs text-zinc-400 font-semibold">Modelo de IA (Global)</span>
                    <input
                      readOnly
                      className="bg-[#111112] border border-[#3f3f46] rounded-md px-3 py-1.5 text-zinc-500 text-xs focus:outline-none w-64 cursor-not-allowed"
                      value={wbsModel}
                    />
                  </div>

                  <button 
                    disabled={isWbsGenerating || !wbsRequirements.trim()}
                    onClick={handleGenerateWbs}
                    className="flex items-center justify-center gap-1.5 text-xs py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors disabled:opacity-50 font-semibold"
                  >
                    {isWbsGenerating ? "Descomponiendo requerimientos con IA..." : "Generar Planificación WBS"}
                  </button>
                </div>
              )}

              {/* Show WBS Plan Results */}
              {wbsResponse && (
                <div className="flex flex-col gap-4">
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Tareas Sugeridas (WBS)</h4>
                    <div className="flex flex-col gap-2 bg-[#111112] p-3 rounded-md border border-[#27272a]">
                      {wbsResponse.tasks.map((task, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-zinc-800/40 border border-zinc-700/30 px-3 py-2 rounded">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-zinc-200 font-medium text-xs">{task.title}</span>
                            <div className="flex items-center gap-2 text-[9px] text-zinc-500 mt-0.5">
                              <span>⏱️ {task.estimated_mins} mins</span>
                              <span>•</span>
                              <span className={cn(
                                "font-medium",
                                task.priority === "High" ? "text-red-400" :
                                task.priority === "Medium" ? "text-blue-400" :
                                "text-zinc-400"
                              )}>
                                {task.priority}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {task.tags.slice(0, 2).map(tag => (
                              <span key={tag} className="text-[9px] bg-zinc-900 border border-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Razonamiento & Dependencias</h4>
                    <div className="bg-[#111112] p-4 rounded-md border border-[#27272a] max-h-48 overflow-y-auto custom-scrollbar text-xs leading-relaxed text-zinc-300 prose prose-invert max-w-none">
                      <ReactMarkdown>{wbsResponse.explanation}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-[#3f3f46] flex justify-end gap-3 bg-[#131315] rounded-b-lg">
              {wbsResponse ? (
                <>
                  <button 
                    onClick={() => setWbsResponse(null)}
                    className="text-zinc-400 hover:text-zinc-200 text-xs font-semibold px-4 py-2 rounded-md bg-[#27272a] hover:bg-[#3f3f46] transition-colors border border-[#3f3f46]"
                  >
                    Volver a Editar
                  </button>
                  <button 
                    onClick={handleImportWbs}
                    className="text-white text-xs font-semibold px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 transition-colors flex items-center gap-1"
                  >
                    <Check className="w-4 h-4" />
                    Importar al To Do
                  </button>
                </>
              ) : (
                <button 
                  onClick={() => setShowWbsModal(false)}
                  className="text-zinc-400 hover:text-zinc-200 text-xs font-semibold px-4 py-2 rounded-md bg-[#27272a] hover:bg-[#3f3f46] transition-colors border border-[#3f3f46]"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

