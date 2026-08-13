"use client";

/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { DndContext, closestCenter, DragEndEvent, DragOverlay, DragStartEvent, useSensor, useSensors, PointerSensor, useDroppable } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import { getProjectTasks, saveProjectTasks, getKanbanConfig, saveKanbanConfig, syncKanbanCommits, KanbanColumn, fetchProjectTickets, updateKanbanTicket, deleteKanbanTicket, createKanbanTicket, createGitBranch, commitChanges, fetchEpics, fetchSprints, getGitStatus, discardGitChanges, checkoutGitBranch, deleteGitBranch } from '@/lib/api';
import { KanbanTicket, Epic, Sprint } from '@/types';
import TicketDrawer from "./TicketDrawer";
import { SprintEpicManagerModal } from "./SprintEpicManagerModal";
import { toast } from "sonner";
import { useLLMConfigStore } from '@/store/llmConfigStore';
import { useTabsStore } from '@/store/tabsStore';
import { Task, TicketStatus } from "@/types";
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
  X,
  GraduationCap,
  Zap
} from "lucide-react";
import TicketMentorDrawer from "./TicketMentorDrawer";
import { useRouter } from "next/navigation";

interface KanbanBoardProps {
  projectId: string | null;
  onNodeClick?: (nodeId: string) => void;
}

function SortableTask({ 
  task, 
  onNodeClick,
  onMentorClick,
  onAutoFixClick,
  onClick
}: { 
  task: Task & { subtasks?: any[] }; 
  onNodeClick?: (nodeId: string) => void; 
  onMentorClick?: (ticketId: string, nodeId: string) => void;
  onAutoFixClick?: (ticketId: string, nodeId: string, instruction: string) => void;
  onClick?: () => void;
}) {
  const router = useRouter();
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
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={onClick} className="mb-2 cursor-grab active:cursor-grabbing group">
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

          {task.subtasks && task.subtasks.length > 0 && (
            <div className="mt-2 w-full bg-zinc-900 rounded-full h-1">
              <div 
                className="bg-blue-500 h-1 rounded-full" 
                style={{ width: `${(task.subtasks.filter((s: any) => s.completed).length / task.subtasks.length) * 100}%` }} 
              />
            </div>
          )}

          {task.affected_nodes && task.affected_nodes.length > 0 && (
            <div className="flex flex-col gap-1 border-t border-zinc-700/30 pt-2 mt-1">
              {task.affected_nodes.map((node) => (
                <div key={node} className="flex items-center gap-1 group/node">
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onNodeClick) onNodeClick(node);
                    }}
                    className="px-1.5 py-0.5 bg-blue-900/30 text-blue-300 rounded border border-blue-800 text-[9px] cursor-pointer hover:bg-blue-800 transition-colors truncate max-w-[200px]"
                    title={node}
                  >
                    {node}
                  </span>
                  {task.has_id && (
                    <div className="flex items-center gap-1 opacity-0 group-hover/node:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => { e.stopPropagation(); onMentorClick?.(task.id, node); }}
                        className="p-1 rounded hover:bg-indigo-900/50 text-indigo-400"
                        title="Mentor IA"
                      ><GraduationCap className="w-3 h-3" /></button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); onAutoFixClick?.(task.id, node, task.content); }}
                        className="p-1 rounded hover:bg-emerald-900/50 text-emerald-400"
                        title="Parche Rápido"
                      ><Zap className="w-3 h-3" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {task.status === "in_progress" && (
            <div className="mt-2 border-t border-zinc-700/30 pt-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  useTabsStore.getState().addTab({
                    id: `execution-${task.id}`,
                    title: `Quirófano: ${task.id}`,
                    type: 'execution-room',
                    data: { ticketId: task.id },
                  });
                }}
                className="w-full flex items-center justify-center gap-1.5 text-[10px] py-1.5 bg-yellow-950/40 text-yellow-500 hover:bg-yellow-900/60 rounded border border-yellow-900/50 transition-colors"
              >
                <Zap className="w-3 h-3" />
                Entrar al Quirófano
              </button>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
}

function DroppableColumn({ id, children }: { id: string, children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} id={id} className="min-h-[300px]">
      {children}
    </div>
  );
}

export default function KanbanBoard({ projectId, onNodeClick }: KanbanBoardProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [activeMentorTicket, setActiveMentorTicket] = useState<{ticketId: string, projectId: string, filePath: string} | null>(null);
  const addTab = useTabsStore(state => state.addTab);

  const handleSyncCommits = async () => {
    if (!projectId) return;
    setIsSyncing(true);
    try {
      await syncKanbanCommits(projectId);
      await fetchTasks();
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
  const [newColRule, setNewColRule] = useState<'manual' | 'auto-on-test-fail' | 'auto-on-test-pass' | 'create_ephemeral_branch' | 'prompt_commit_push' | 'require_pull_request'>('manual');
  const [colError, setColError] = useState<string | null>(null);

  // Filters State
  const [sprintFilter, setSprintFilter] = useState("Todas");
  const [epicFilter, setEpicFilter] = useState("Todas");

  // Data
  const [epics, setEpics] = useState<Epic[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [showManagerModal, setShowManagerModal] = useState(false);

  // Ticket Drawer State
  const [rawTickets, setRawTickets] = useState<KanbanTicket[]>([]);
  const [activeDrawerTicketId, setActiveDrawerTicketId] = useState<string | null>(null);

  // Prompts State
  const [branchPrompt, setBranchPrompt] = useState<{ticketId: string, title: string, type: string, currentBranch: string} | null>(null);
  const [commitPrompt, setCommitPrompt] = useState<{ticketId: string, title: string} | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [blockedBranchModal, setBlockedBranchModal] = useState<{currentBranch: string, rawTicket: any} | null>(null);

  // Unsaved Changes Modal State
  const [unsavedChangesModal, setUnsavedChangesModal] = useState<{
    ticketId: string,
    branchName: string,
    activeTask: Task,
    newStatus: string,
    newTasks: Task[],
    prevTasksState: Task[]
  } | null>(null);

  // Delete Clean Branch Modal State
  const [deleteCleanBranchModal, setDeleteCleanBranchModal] = useState<{
    ticketId: string,
    branchName: string,
    activeTask: Task,
    newStatus: string,
    newTasks: Task[],
    prevTasksState: Task[]
  } | null>(null);

  // Quick Add State
  const [quickAddText, setQuickAddText] = useState("");
  const [isQuickAdding, setIsQuickAdding] = useState(false);

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

  const fetchReferenceData = useCallback(async () => {
    if (!projectId) return;
    try {
      const [epicsData, sprintsData] = await Promise.all([
        fetchEpics(projectId),
        fetchSprints(projectId)
      ]);
      setEpics(epicsData);
      setSprints(sprintsData);
    } catch (e) {
      console.error("Failed to fetch epics/sprints", e);
    }
  }, [projectId]);

  const fetchTasks = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await getProjectTasks(projectId);
      let combinedTasks = [...data.tasks];

      try {
        const dbTickets = await fetchProjectTickets(projectId);
        setRawTickets(dbTickets);
        const ticketTasks: Task[] = dbTickets.map((t) => ({
          id: t.id,
          content: t.title + (t.description ? `\n\n${t.description}` : ""),
          status: t.status,
          category: t.type,
          priority: t.priority,
          affected_nodes: t.affected_nodes.map((n) => n.file_path || n.node_id),
          raw_line: -1,
          tags: [t.type],
          has_id: true,
          subtasks: t.subtasks
        } as any));

        const existingIds = new Set(data.tasks.map((t) => t.id));
        const newDbTasks = ticketTasks.filter((t) => !existingIds.has(t.id));
        combinedTasks = [...combinedTasks, ...newDbTasks];
      } catch (err) {
        console.error("Failed to fetch DB tickets", err);
      }

      setTasks(combinedTasks);
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
      await fetchReferenceData();
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
        fetchReferenceData();
        fetchTasks();
      }
    };

    return () => {
      active = false;
      evtSource.close();
    };
  }, [projectId, fetchTasks, fetchConfig]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;

    if (!over) return;

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;

    if (activeIdStr === overIdStr) return;

    const isOverColumn = columns.some((c) => c.id === overIdStr);
    const prevTasksState = [...tasks];

    const activeIndex = tasks.findIndex((t) => t.id === activeIdStr);
    if (activeIndex === -1) return;

    let newTasks = [...tasks];
    const activeTask = { ...newTasks[activeIndex] };
    const originalStatus = activeTask.status;
    let newStatus = activeTask.status;

    if (isOverColumn) {
      newStatus = overIdStr;
      activeTask.status = overIdStr;
      const targetCol = columns.find((c) => c.id === overIdStr);
      if (targetCol) {
        activeTask.category = targetCol.title;
      }
      newTasks[activeIndex] = activeTask;
      
      const lastIndex = newTasks.map(t => t.status).lastIndexOf(newStatus);
      if (lastIndex !== -1 && lastIndex !== activeIndex) {
        newTasks = arrayMove(newTasks, activeIndex, lastIndex);
      }
    } else {
      const overIndex = tasks.findIndex((t) => t.id === overIdStr);
      if (overIndex !== -1) {
        const overTask = tasks[overIndex];
        if (activeTask.status !== overTask.status) {
          newStatus = overTask.status;
          activeTask.status = overTask.status;
          activeTask.category = overTask.category;
          newTasks[activeIndex] = activeTask;
        }
        newTasks = arrayMove(newTasks, activeIndex, overIndex);
      }
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(activeIdStr);

    // GitFlow Guards Validation
    if (isUuid && newStatus !== originalStatus) {
      const targetCol = columns.find((c) => c.id === newStatus);
      const prevCol = columns.find((c) => c.id === originalStatus);
      const targetIndex = columns.findIndex((c) => c.id === newStatus);
      const prevIndex = columns.findIndex((c) => c.id === originalStatus);

      // In Progress Interceptor (removed blocking logic to let BranchPrompt handle it)

      // To Do Interceptor (moving backwards)
      if (targetIndex < prevIndex) {
        try {
          const raw = rawTickets.find(r => r.id === activeIdStr);
          if (raw && projectId) {
            const gitStatus = await getGitStatus(projectId);
            const ticketIdPrefix = raw.id.substring(0, 6).toUpperCase();
            const isTicketBranch = gitStatus.branch === raw.branch_name || gitStatus.branch.includes(ticketIdPrefix);

            if (isTicketBranch) {
              const isDirty = gitStatus.modified > 0 || gitStatus.untracked > 0;
              if (isDirty) {
                // Abort optimistic update, show modal
                setUnsavedChangesModal({
                  ticketId: activeIdStr,
                  branchName: gitStatus.branch,
                  activeTask,
                  newStatus,
                  newTasks,
                  prevTasksState
                });
                return;
              } else {
                // Branch is clean, ask if they want to delete it
                setDeleteCleanBranchModal({
                  ticketId: activeIdStr,
                  branchName: gitStatus.branch,
                  activeTask,
                  newStatus,
                  newTasks,
                  prevTasksState
                });
                return;
              }
            }
          }
        } catch (e) {
          console.error("Failed to check git status for backward move", e);
        }
      }
    }

    // ⚡ Optimistic UI update: instant feedback for the user
    setTasks(newTasks);

    if (isUuid) {
      try {
        await updateKanbanTicket(activeIdStr, { status: newStatus as TicketStatus });
        const targetCol = columns.find(c => c.id === newStatus);
        if (targetCol) {
          if (targetCol.rule === 'create_ephemeral_branch') {
            const raw = rawTickets.find(r => r.id === activeIdStr);
            if (raw && projectId) {
              const gitStatus = await getGitStatus(projectId);
              const isBaseBranch = ['main', 'master', 'develop'].includes(gitStatus.branch);
              
              if (!isBaseBranch) {
                setBlockedBranchModal({ currentBranch: gitStatus.branch, rawTicket: raw });
              } else {
                setBranchPrompt({ ticketId: activeIdStr, title: raw.title, type: raw.type, currentBranch: gitStatus.branch });
              }
            }
          } else if (targetCol.rule === 'prompt_commit_push') {
            const raw = rawTickets.find(r => r.id === activeIdStr);
            if (raw) {
              setCommitPrompt({ ticketId: activeIdStr, title: raw.title });
              setCommitMessage(`${raw.type.toLowerCase()}(SL-${raw.id.substring(0,6).toUpperCase()}): ${raw.title}`);
            }
          }
        }
      } catch (err) {
        // Rollback Optimistic UI state on error!
        setTasks(prevTasksState);
        toast.error("Error al actualizar estado en el servidor", {
          description: "Se ha revertido el movimiento de la tarjeta.",
        });
      }
    } else {
      saveTasks(newTasks);
    }
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

  const filteredTasks = useMemo(() => {
    let filtered = tasks;
    if (sprintFilter !== "Todas") {
      filtered = filtered.filter(t => {
        const raw = rawTickets.find(r => r.id === t.id);
        return raw?.sprint_id === sprintFilter;
      });
    }
    if (epicFilter !== "Todas") {
      filtered = filtered.filter(t => {
        const raw = rawTickets.find(r => r.id === t.id);
        return raw?.epic_id === epicFilter;
      });
    }
    return filtered;
  }, [tasks, sprintFilter, epicFilter, rawTickets]);

  // ⚡ Bolt: Performance Optimization
  // Groups tasks by status in a single pass O(N).
  // Prevents filtering the entire tasks array 3 times per column on every render,
  // reducing complexity from O(C * N) to O(N) and improving drag-and-drop responsiveness.
  const tasksByStatus = useMemo(() => {
    return filteredTasks.reduce((acc, task) => {
      const status = task.status;
      if (!acc[status]) acc[status] = [];
      acc[status].push(task);
      return acc;
    }, {} as Record<string, Task[]>);
  }, [filteredTasks]);

  const uniqueSprints = useMemo(() => {
    return sprints.map(s => s.id);
  }, [sprints]);

  const uniqueEpics = useMemo(() => {
    return epics.map(e => e.id);
  }, [epics]);

  if (!projectId) {
    return <div className="h-full flex items-center justify-center text-zinc-500">Selecciona un proyecto para ver el Sprint Center.</div>;
  }

  const activeTask = activeId ? tasks.find(t => t.id === activeId) : null;

  return (
    <div className="h-full bg-[#1e1e1e] flex flex-col relative overflow-hidden">
      {/* Sub-Header with controls */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800/50 bg-[#161618] shrink-0">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-zinc-200">Sprint Center</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-400 font-medium">Sprint:</span>
              <select 
                value={sprintFilter} 
                onChange={e => setSprintFilter(e.target.value)}
                style={{ colorScheme: 'dark' }}
                className="bg-[#18181b] text-zinc-100 text-xs px-2.5 py-1 rounded-md border border-[#3f3f46] hover:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-sm max-w-[120px] truncate"
              >
                <option value="Todas" className="bg-[#18181b] text-zinc-100">Todos</option>
                {sprints.map(s => <option key={s.id} value={s.id} className="bg-[#18181b] text-zinc-100">{s.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-400 font-medium">Épica:</span>
              <select 
                value={epicFilter} 
                onChange={e => setEpicFilter(e.target.value)}
                style={{ colorScheme: 'dark' }}
                className="bg-[#18181b] text-zinc-100 text-xs px-2.5 py-1 rounded-md border border-[#3f3f46] hover:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-sm max-w-[120px] truncate"
              >
                <option value="Todas" className="bg-[#18181b] text-zinc-100">Todas</option>
                {epics.map(e => <option key={e.id} value={e.id} className="bg-[#18181b] text-zinc-100">{e.name}</option>)}
              </select>
            </div>
          </div>
          <button 
            onClick={() => setShowManagerModal(true)}
            className="flex items-center gap-1.5 text-xs text-indigo-300 hover:text-white px-3 py-1.5 rounded bg-indigo-950/60 hover:bg-indigo-900/80 transition-colors border border-indigo-800/60 shadow-sm font-medium"
          >
            <Tag className="w-3.5 h-3.5 text-indigo-400" />
            Manage Epics & Sprints
          </button>
          <button 
            onClick={() => {
              useTabsStore.getState().addTab({
                id: 'planning-studio',
                title: 'Planning Studio',
                type: 'planning-studio',
              });
            }}
            className="flex items-center gap-1.5 text-xs text-blue-300 hover:text-white px-3 py-1.5 rounded bg-blue-950/60 hover:bg-blue-900/80 transition-colors border border-blue-800/60 shadow-sm font-medium"
          >
            <Brain className="w-3.5 h-3.5 text-blue-400" />
            Planning Studio
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {columns.map((col, idx) => {
            const columnTasks = tasksByStatus[col.id] || [];

            return (
              <div key={col.id} className={cn("flex flex-col bg-zinc-900 rounded-lg min-w-[280px] max-w-[320px] border-t-2 shrink-0 border-zinc-800", col.color)}>
                <div className="p-3 font-semibold text-zinc-300 text-sm border-b border-zinc-800/50 flex items-center justify-between">
                  <span>{col.title}</span>
                  <span className="text-xs bg-zinc-850 px-2 py-0.5 rounded-full text-zinc-500 font-medium">
                    {columnTasks.length}
                  </span>
                </div>
                {idx === 0 && (
                  <div className="px-3 pt-3">
                    <input
                      type="text"
                      placeholder="+ Añadir tarea..."
                      className="w-full bg-[#18181b] border border-zinc-700/50 rounded-md px-3 py-2 text-[11px] font-medium text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
                      value={quickAddText}
                      onChange={(e) => setQuickAddText(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter" && quickAddText.trim() && projectId) {
                          setIsQuickAdding(true);
                          try {
                            await createKanbanTicket(projectId, {
                              title: quickAddText.trim(),
                              type: "Feature",
                              priority: "Medium",
                              description: ""
                            });
                            setQuickAddText("");
                            await fetchTasks();
                          } catch (err) {
                            console.error(err);
                            toast.error("Error al crear tarea");
                          } finally {
                            setIsQuickAdding(false);
                          }
                        }
                      }}
                      disabled={isQuickAdding}
                    />
                  </div>
                )}
                <ScrollArea className="flex-1 p-3">
                  <SortableContext items={columnTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    <DroppableColumn id={col.id}>
                      {columnTasks.map(task => (
                        <SortableTask
                          key={task.id}
                          task={task}
                          onNodeClick={onNodeClick}
                          onClick={() => {
                            const isDbTicket = rawTickets.some(r => r.id === task.id);
                            if (isDbTicket) {
                              setActiveDrawerTicketId(task.id);
                            }
                          }}
                          onMentorClick={(ticketId, nodeId) => {
                            setActiveMentorTicket({ ticketId, projectId: projectId!, filePath: nodeId });
                          }}
                          onAutoFixClick={(ticketId, nodeId, instruction) => {
                            const tabId = `autofix-${ticketId}-${nodeId}`;
                            addTab({
                              id: tabId,
                              title: `Fix: ${nodeId.split('/').pop()}`,
                              type: 'auto-fix',
                              data: { hash: ticketId, filePath: nodeId, markdown: instruction }
                            });
                          }}
                        />
                      ))}
                    </DroppableColumn>
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
                <h3 className="text-md font-bold text-zinc-100">Configurar Columnas de Sprint Center</h3>
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
                      onChange={(e) => {
                        const val = e.target.value as KanbanColumn['rule'];
                        if (
                          val === 'manual' || 
                          val === 'auto-on-test-fail' || 
                          val === 'auto-on-test-pass' || 
                          val === 'create_ephemeral_branch' || 
                          val === 'prompt_commit_push' || 
                          val === 'require_pull_request'
                        ) {
                          setNewColRule(val);
                        }
                      }}
                    >
                      <option value="manual">Manual (100% control)</option>
                      <option value="create_ephemeral_branch">Git: Prompt Crear Rama (In Progress)</option>
                      <option value="prompt_commit_push">Git: Prompt Commit & Push</option>
                      <option value="require_pull_request">Git: Requerir PR (Bloqueo)</option>
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

      {/* Ticket Mentor Drawer */}
      {activeMentorTicket && (
        <TicketMentorDrawer
          ticketId={activeMentorTicket.ticketId}
          projectId={activeMentorTicket.projectId}
          filePath={activeMentorTicket.filePath}
          onClose={() => setActiveMentorTicket(null)}
        />
      )}

      {/* Ticket Drawer */}
      {activeDrawerTicketId && (
        <TicketDrawer
          ticket={rawTickets.find(r => r.id === activeDrawerTicketId)!}
          allSprints={sprints}
          allEpics={epics}
          columns={columns}
          onClose={() => setActiveDrawerTicketId(null)}
          onUpdate={(updated) => {
            fetchTasks();
          }}
        />
      )}

      {/* Sprint & Epic Manager Modal */}
      <SprintEpicManagerModal
        projectId={projectId}
        isOpen={showManagerModal}
        onClose={() => setShowManagerModal(false)}
        onDataChanged={() => fetchReferenceData()}
      />

      {/* Ephemeral Branch Prompt */}
      {branchPrompt && projectId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#18181b] border border-zinc-700 p-6 rounded-lg max-w-sm w-full shadow-2xl">
            <h3 className="text-zinc-100 font-semibold mb-2 flex items-center gap-2"><GitBranch size={18}/> Crear Rama Efímera</h3>
            <p className="text-zinc-400 text-xs mb-4">Se ha detectado el arrastre a una columna que requiere una rama git.</p>
            
            <div className="bg-zinc-950 border border-zinc-800 p-3 rounded text-sm text-zinc-300 font-mono mb-4 break-words">
              {`${branchPrompt.type.toLowerCase()}/${branchPrompt.ticketId.substring(0,6).toUpperCase()}-${(() => {
                const sanitize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                return sanitize(branchPrompt.title);
              })()}`}
            </div>

            <div className="flex justify-end gap-2">
              <button 
                onClick={() => setBranchPrompt(null)}
                className="px-3 py-1.5 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-xs font-semibold"
              >Omitir</button>
              <button 
                onClick={async () => {
                  try {
                    const sanitizedTitle = branchPrompt.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                    const newBranchName = `${branchPrompt.type.toLowerCase()}/${branchPrompt.ticketId.substring(0,6).toUpperCase()}-${sanitizedTitle}`;
                    await createGitBranch(projectId, newBranchName);
                    await updateKanbanTicket(branchPrompt.ticketId, { branch_name: newBranchName });
                    toast.success("Rama creada exitosamente");
                  } catch (e) {
                    toast.error("Error al crear rama");
                  }
                  setBranchPrompt(null);
                }}
                className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-500 text-xs font-semibold"
              >Crear Rama</button>
            </div>
          </div>
        </div>
      )}

      {/* Commit & Push Prompt */}
      {commitPrompt && projectId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#18181b] border border-zinc-700 p-6 rounded-lg max-w-md w-full shadow-2xl">
            <h3 className="text-zinc-100 font-semibold mb-2 flex items-center gap-2"><Check size={18}/> Hacer Commit & Push</h3>
            <p className="text-zinc-400 text-xs mb-4">Has terminado esta tarea. ¿Deseas guardar los cambios locales?</p>
            
            <textarea 
              value={commitMessage}
              onChange={e => setCommitMessage(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-sm text-zinc-200 mb-4 font-mono focus:border-blue-500 outline-none"
              rows={3}
            />

            <div className="flex justify-end gap-2">
              <button 
                onClick={() => setCommitPrompt(null)}
                className="px-3 py-1.5 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-xs font-semibold"
              >Más Tarde</button>
              <button 
                onClick={async () => {
                  try {
                    await commitChanges(projectId, commitMessage);
                    toast.success("Commit & Push exitoso");
                  } catch (e) {
                    toast.error("Error en Commit & Push");
                  }
                  setCommitPrompt(null);
                }}
                className="px-3 py-1.5 rounded bg-green-600 text-white hover:bg-green-500 text-xs font-semibold"
              >Commit & Push</button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved Changes Modal */}
      {unsavedChangesModal && projectId && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#18181b] border border-zinc-700 p-6 rounded-lg max-w-md w-full shadow-2xl">
            <h3 className="text-zinc-100 font-bold mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Tienes cambios sin guardar
            </h3>
            <p className="text-zinc-400 text-sm mb-6">
              Detectamos que tienes archivos sin hacer commit en esta tarea (rama <strong>{unsavedChangesModal.branchName}</strong>). ¿Qué deseas hacer?
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  const m = unsavedChangesModal;
                  setUnsavedChangesModal(null);
                  addTab({
                    id: `ExecutionRoom-${m.ticketId}`,
                    type: "execution-room",
                    title: `Quirófano: ${m.ticketId.substring(0, 8)}`,
                    data: { ticketId: m.ticketId, executionMode: "exec_mode_surgeon" }
                  });
                }}
                className="w-full px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-500 text-sm font-semibold transition-colors"
              >
                Ir al Quirófano a Guardar
              </button>
              
              <button
                onClick={async () => {
                  const m = unsavedChangesModal;
                  setUnsavedChangesModal(null);
                  try {
                    await discardGitChanges(projectId);
                    await checkoutGitBranch(projectId, "main");
                    toast.success("Cambios descartados y rama cambiada a main");
                    
                    // Proceed with the drag drop action
                    setTasks(m.newTasks);
                    await updateKanbanTicket(m.ticketId, { status: m.newStatus as TicketStatus });
                  } catch (e) {
                    toast.error("Error al descartar cambios", {
                      description: "Revisa la consola para más detalles."
                    });
                  }
                }}
                className="w-full px-4 py-2 rounded bg-red-950/40 text-red-400 border border-red-900/50 hover:bg-red-900/60 text-sm font-semibold transition-colors"
              >
                Descartar Todo y Abandonar
              </button>

              <button
                onClick={() => setUnsavedChangesModal(null)}
                className="w-full px-4 py-2 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-sm font-semibold transition-colors mt-2"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Blocked Branch Modal */}
      {blockedBranchModal && projectId && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#18181b] border border-zinc-700 p-6 rounded-lg max-w-md w-full shadow-2xl">
            <h3 className="text-zinc-100 font-bold mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Estás en otra rama efímera
            </h3>
            <p className="text-zinc-400 text-sm mb-6">
              Actualmente estás en la rama <strong>{blockedBranchModal.currentBranch}</strong>. Para mantener un buen orden de GitFlow, debes hacer un PR o mergearla con main antes de crear una nueva rama efímera.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => setBlockedBranchModal(null)}
                className="w-full px-4 py-2 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-sm font-semibold transition-colors"
              >
                Entendido
              </button>
              <button
                onClick={() => {
                  setBranchPrompt({ 
                    ticketId: blockedBranchModal.rawTicket.id, 
                    title: blockedBranchModal.rawTicket.title, 
                    type: blockedBranchModal.rawTicket.type, 
                    currentBranch: blockedBranchModal.currentBranch 
                  });
                  setBlockedBranchModal(null);
                }}
                className="w-full px-4 py-2 rounded bg-red-950/40 text-red-400 border border-red-900/50 hover:bg-red-900/60 text-sm font-semibold transition-colors mt-2"
              >
                Continuar bajo mi responsabilidad
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Clean Branch Modal */}
      {deleteCleanBranchModal && projectId && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#18181b] border border-zinc-700 p-6 rounded-lg max-w-md w-full shadow-2xl">
            <h3 className="text-zinc-100 font-bold mb-2 flex items-center gap-2">
              <Check className="w-5 h-5 text-blue-500" />
              Abandonando rama limpia
            </h3>
            <p className="text-zinc-400 text-sm mb-6">
              Esta rama (<strong>{deleteCleanBranchModal.branchName}</strong>) no tiene cambios pendientes. ¿Deseas eliminarla localmente para mantener tu entorno limpio, o prefieres conservarla?
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={async () => {
                  const m = deleteCleanBranchModal;
                  setDeleteCleanBranchModal(null);
                  try {
                    await checkoutGitBranch(projectId, "main");
                    await deleteGitBranch(projectId, m.branchName, true);
                    toast.success("Rama eliminada y de vuelta a main.");
                    
                    // Proceed with the drag drop action
                    setTasks(m.newTasks);
                    await updateKanbanTicket(m.ticketId, { status: m.newStatus as TicketStatus });
                  } catch (e) {
                    toast.error("Error al eliminar la rama", {
                      description: "Es posible que ya haya sido eliminada o requiera forzado manual."
                    });
                  }
                }}
                className="w-full px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-500 text-sm font-semibold transition-colors"
              >
                Eliminar rama y volver a main
              </button>
              
              <button
                onClick={async () => {
                  const m = deleteCleanBranchModal;
                  setDeleteCleanBranchModal(null);
                  try {
                    await checkoutGitBranch(projectId, "main");
                    toast.success("De vuelta a main (rama conservada).");
                    
                    // Proceed with the drag drop action
                    setTasks(m.newTasks);
                    await updateKanbanTicket(m.ticketId, { status: m.newStatus as TicketStatus });
                  } catch (e) {
                    toast.error("Error al cambiar a main");
                  }
                }}
                className="w-full px-4 py-2 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-sm font-semibold transition-colors"
              >
                Conservar rama y volver a main
              </button>

              <button
                onClick={() => setDeleteCleanBranchModal(null)}
                className="w-full px-4 py-2 rounded bg-transparent text-zinc-400 hover:text-zinc-200 text-sm font-semibold transition-colors mt-2"
              >
                Cancelar movimiento
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

