"use client";

/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { DndContext, closestCenter, DragEndEvent, DragOverlay, DragStartEvent, useSensor, useSensors, PointerSensor, useDroppable } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import ReactMarkdown from "react-markdown";
import { getProjectTasks, saveProjectTasks, getKanbanConfig, saveKanbanConfig, syncKanbanCommits, KanbanColumn, fetchProjectTickets, updateKanbanTicket, deleteKanbanTicket, createKanbanTicket, createGitBranch, commitChanges, commitAndSwitchGitBranch, fetchEpics, fetchSprints, getGitStatus, discardGitChanges, checkoutGitBranch, deleteGitBranch } from '@/lib/api';
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
  Zap,
  Loader2,
  GitCommit,
  FileCode,
  Trash2,
  Lock
} from "lucide-react";
import TicketMentorDrawer from "./TicketMentorDrawer";
import { useRouter } from "next/navigation";

interface KanbanBoardProps {
  projectId: string | null;
  onNodeClick?: (nodeId: string) => void;
}

function getTaskDependencies(task: Task, allTasks: Task[], rawTicketsMap: Map<string, KanbanTicket>): {
  isBlocked: boolean;
  blockingTasks: string[];
} {
  const content = task.content || "";
  const raw = rawTicketsMap.get(task.id);
  const desc = raw?.description || "";
  const combinedText = `${content}\n${desc}`;

  // Look for explicit dependency tags: [Depends: ...], [Deps: ...], [Depende de: ...], [Bloqueada por: ...], [Prereq: ...]
  const depMatches = Array.from(combinedText.matchAll(/\[(?:Depends|Deps|Depende|Depende de|Bloqueada por|Prereq|Prerequisite):\s*([^\]]+)\]/gi));
  
  const explicitDepQueries: string[] = [];
  for (const m of depMatches) {
    const parts = m[1].split(/[,;]/).map(p => p.trim()).filter(Boolean);
    explicitDepQueries.push(...parts);
  }

  const blockingTasks: string[] = [];

  if (explicitDepQueries.length > 0) {
    for (const query of explicitDepQueries) {
      const qLower = query.toLowerCase().replace(/^[#]/, '').trim();
      const target = allTasks.find(t => {
        if (t.id === task.id) return false;
        if (t.id.toLowerCase().startsWith(qLower) || t.id.toLowerCase().includes(qLower)) return true;
        const firstLine = t.content.split('\n')[0].toLowerCase();
        return firstLine.includes(qLower);
      });

      if (target) {
        const isDone = (target.status || '').toLowerCase() === 'done';
        if (!isDone) {
          const targetTitle = target.content.split('\n')[0].replace(/^[#\s\-*\[\]]+/, '').trim().substring(0, 30);
          blockingTasks.push(targetTitle || target.id.substring(0, 6));
        }
      }
    }
  }

  return {
    isBlocked: blockingTasks.length > 0,
    blockingTasks,
  };
}

function SortableTask({ 
  task, 
  onNodeClick,
  onMentorClick,
  onAutoFixClick,
  onClick,
  epic,
  sprint,
  orderIndex,
  isBlocked,
  blockingTasks,
  selectable,
  selected,
  onToggleSelect,
  onDeleteClick,
}: { 
  task: Task & { subtasks?: any[] }; 
  onNodeClick?: (nodeId: string) => void; 
  onMentorClick?: (ticketId: string, nodeId: string) => void;
  onAutoFixClick?: (ticketId: string, nodeId: string, instruction: string) => void;
  onClick?: () => void;
  epic?: Epic;
  sprint?: Sprint;
  orderIndex?: number;
  isBlocked?: boolean;
  blockingTasks?: string[];
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (taskId: string) => void;
  onDeleteClick?: (taskId: string) => void;
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
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={onClick} className="mb-2 cursor-grab active:cursor-grabbing group w-full min-w-0">
      <Card className={cn(
        "bg-zinc-800 border transition-colors w-full min-w-0 overflow-hidden",
        selected ? "border-blue-500/80 bg-blue-950/20" : isBlocked ? "border-amber-700/60 hover:border-amber-500/80 bg-zinc-850" : "border-zinc-700/50 hover:border-zinc-600"
      )}>
        <CardContent className="p-3 text-xs text-zinc-200 flex flex-col gap-2 min-w-0">
          {/* Header with task Order, ID, Priority and Blocked status */}
          <div className="flex items-center justify-between min-w-0 gap-1.5 flex-wrap">
            <div className="flex items-center gap-1.5 shrink-0">
              {selectable && (
                <input
                  type="checkbox"
                  checked={!!selected}
                  onChange={(e) => {
                    e.stopPropagation();
                    if (onToggleSelect) onToggleSelect(task.id);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-blue-600 shrink-0"
                  title="Seleccionar tarea"
                />
              )}
              {orderIndex !== undefined && (
                <span className="text-[9px] bg-amber-950/50 text-amber-300 font-mono px-1.5 py-0.5 rounded border border-amber-800/50 font-bold" title="Orden sugerido de ejecución">
                  #{orderIndex}
                </span>
              )}
              <span className="text-[9px] bg-zinc-900 text-zinc-300 font-mono px-1.5 py-0.5 rounded border border-zinc-700 font-semibold select-all shrink-0" title="Copiar ID para commit">
                {task.id.length > 8 ? task.id.substring(0, 8) : task.id}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              {isBlocked && (
                <span 
                  className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-red-950/80 text-red-300 border border-red-800/80 flex items-center gap-1 shadow-sm"
                  title={`🔒 Bloqueada. Requiere completar antes: ${blockingTasks?.join(", ")}`}
                >
                  <Lock className="w-2.5 h-2.5 text-red-400" /> Bloqueada
                </span>
              )}
              {task.priority && (
                <span className={cn(
                  "text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0",
                  task.priority === "High" ? "bg-red-950/40 text-red-400 border border-red-900/30" :
                  task.priority === "Medium" ? "bg-blue-950/40 text-blue-400 border border-blue-900/30" :
                  "bg-zinc-900 text-zinc-400 border border-zinc-700"
                )}>
                  {task.priority}
                </span>
              )}
              {selectable && onDeleteClick && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteClick(task.id);
                  }}
                  className="text-zinc-500 hover:text-red-400 p-0.5 rounded hover:bg-red-950/30 transition-colors opacity-60 hover:opacity-100 group-hover:opacity-100"
                  title="Eliminar tarea de To Do"
                  aria-label="Eliminar tarea"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Epics & Sprints Badges + Dependencies notification */}
          {(epic || sprint || (isBlocked && blockingTasks && blockingTasks.length > 0)) && (
            <div className="flex flex-wrap items-center gap-1 text-[10px] min-w-0">
              {epic && (
                <span 
                  className={cn(
                    "text-[9px] px-1.5 py-0.5 rounded font-medium truncate max-w-[140px] border",
                    epic.color ? `${epic.color}/20 text-blue-300 border-blue-800/40` : "bg-blue-950/40 text-blue-300 border-blue-800/40"
                  )} 
                  title={`Épica: ${epic.name}`}
                >
                  🎯 {epic.name}
                </span>
              )}
              {sprint && (
                <span 
                  className="text-[9px] px-1.5 py-0.5 rounded font-medium truncate max-w-[120px] bg-purple-950/40 text-purple-300 border border-purple-800/40" 
                  title={`Sprint: ${sprint.name}`}
                >
                  🏃 {sprint.name}
                </span>
              )}
              {isBlocked && blockingTasks && blockingTasks.length > 0 && (
                <div className="w-full text-[9px] text-red-300 bg-red-950/40 border border-red-900/40 px-1.5 py-0.5 rounded flex items-center gap-1 truncate mt-0.5">
                  <AlertTriangle className="w-2.5 h-2.5 shrink-0 text-red-400" />
                  <span className="truncate">Requiere: {blockingTasks.join(", ")}</span>
                </div>
              )}
            </div>
          )}

          <div className="prose prose-invert prose-sm max-w-none prose-p:my-0 text-zinc-200 break-words [word-break:break-word] overflow-hidden">
            <ReactMarkdown>{task.content}</ReactMarkdown>
          </div>

          {/* Metadata badges: Pomodoros, Time, Commit, Tags */}
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-400 mt-1 min-w-0">
            {task.commit && (
              <span className="flex items-center gap-1 bg-green-950/30 text-green-400 border border-green-900/40 px-1.5 py-0.5 rounded shrink-0">
                <GitBranch className="w-3 h-3" />
                {task.commit.substring(0, 7)}
              </span>
            )}
            {task.time_spent ? (
              <span className="flex items-center gap-1 bg-zinc-900 text-zinc-400 border border-zinc-700 px-1.5 py-0.5 rounded shrink-0">
                <Clock className="w-3 h-3 text-zinc-500" />
                {task.time_spent ? ` (${formatTime(task.time_spent)})` : ""}
              </span>
            ) : null}
            {task.tags && task.tags.map(tag => (
              <span key={tag} className="bg-zinc-900 text-zinc-500 px-1.5 py-0.5 rounded border border-zinc-700 truncate max-w-full">
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
            <div className="flex flex-col gap-1 border-t border-zinc-700/30 pt-2 mt-1 min-w-0">
              {task.affected_nodes.map((node) => (
                <div key={node} className="flex items-center gap-1 group/node min-w-0">
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
                    <div className="flex items-center gap-1 opacity-0 group-hover/node:opacity-100 transition-opacity shrink-0">
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
    <div ref={setNodeRef} id={id} className="min-h-[150px] w-full flex flex-col">
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
      const res = await syncKanbanCommits(projectId);
      await fetchTasks();
      if (res && res.updated_tasks && res.updated_tasks.length > 0) {
        toast.success(`Sincronización exitosa: ${res.updated_tasks.length} tarea(s) actualizada(s)`, {
          description: `Tickets sincronizados: ${res.updated_tasks.join(", ")}${res.tests_passing !== undefined && res.tests_passing !== null ? (res.tests_passing ? " • Tests pasaron ✅" : " • Tests fallaron ❌") : ""}`,
        });
      } else {
        toast.info("Sincronización finalizada", {
          description: res?.message || "No se detectaron nuevos commits asociados a tickets pendientes.",
        });
      }
    } catch (e) {
      console.error("Manual commit sync failed", e);
      toast.error("Error al sincronizar commits", {
        description: e instanceof Error ? e.message : "Ocurrió un error al consultar el repositorio Git.",
      });
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
    ticketTitle: string,
    branchName: string,
    modifiedFiles: string[],
    untrackedFiles: string[],
    activeTask: Task,
    newStatus: string,
    newTasks: Task[],
    prevTasksState: Task[]
  } | null>(null);
  const [unsavedCommitMsg, setUnsavedCommitMsg] = useState("");
  const [isProcessingUnsavedAction, setIsProcessingUnsavedAction] = useState(false);

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

  // To Do Selection & Batch Delete State
  const [selectedTodoIds, setSelectedTodoIds] = useState<Set<string>>(new Set());
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    ticketIds: string[];
    confirmInput: string;
    isDeleting: boolean;
  } | null>(null);

  // Icebox Drawer State
  const [showIceboxDrawer, setShowIceboxDrawer] = useState(false);
  const [quickAddIceboxText, setQuickAddIceboxText] = useState("");
  const [isQuickAddingIcebox, setIsQuickAddingIcebox] = useState(false);

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

  const handleToggleSelectTodo = useCallback((taskId: string) => {
    setSelectedTodoIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  const handleSelectAllTodo = useCallback((todoTasks: Task[]) => {
    setSelectedTodoIds(prev => {
      if (prev.size === todoTasks.length && todoTasks.length > 0) {
        return new Set();
      } else {
        return new Set(todoTasks.map(t => t.id));
      }
    });
  }, []);

  const handleOpenDeleteModal = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setDeleteConfirmModal({
      ticketIds: ids,
      confirmInput: '',
      isDeleting: false
    });
  }, []);

  const handleExecuteDelete = useCallback(async () => {
    if (!deleteConfirmModal || !projectId) return;
    setDeleteConfirmModal(prev => prev ? { ...prev, isDeleting: true } : null);
    
    const idsToDelete = new Set(deleteConfirmModal.ticketIds);
    try {
      for (const id of deleteConfirmModal.ticketIds) {
        const isDbTicket = rawTickets.some(r => r.id === id);
        if (isDbTicket) {
          try {
            await deleteKanbanTicket(id);
          } catch (err) {
            console.error(`Failed to delete DB ticket ${id}`, err);
          }
        }
      }

      // Also remove from tasks.md file-based tasks if present
      const remainingTasks = tasks.filter(t => !idsToDelete.has(t.id));
      if (remainingTasks.length !== tasks.length) {
        await saveProjectTasks(projectId, remainingTasks);
      }

      toast.success(`${deleteConfirmModal.ticketIds.length} ${deleteConfirmModal.ticketIds.length === 1 ? 'tarea eliminada' : 'tareas eliminadas'} de To Do`);
      setSelectedTodoIds(new Set());
      setDeleteConfirmModal(null);
      await fetchTasks();
    } catch (error) {
      console.error('Error deleting tasks', error);
      toast.error('Error al eliminar las tareas seleccionadas');
      setDeleteConfirmModal(prev => prev ? { ...prev, isDeleting: false } : null);
    }
  }, [deleteConfirmModal, projectId, rawTickets, tasks, fetchTasks]);

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

    const isOverColumn = columns.some((c) => c.id === overIdStr) || overIdStr === "icebox";
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
      if (overIdStr === "icebox") {
        activeTask.category = "Icebox";
      } else {
        const targetCol = columns.find((c) => c.id === overIdStr);
        if (targetCol) {
          activeTask.category = targetCol.title;
        }
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

    // Dependencies Guard: prevent moving blocked tasks into in_progress or done
    if (newStatus !== originalStatus && (newStatus === "in_progress" || newStatus === "done")) {
      const depInfo = getTaskDependencies(activeTask, tasks, rawTicketsMap);
      if (depInfo.isBlocked) {
        toast.warning("🔒 Tarea Bloqueada", {
          description: `No puedes avanzar esta tarea hasta completar primero sus dependencias pendientes: ${depInfo.blockingTasks.join(", ")}`,
          duration: 5000,
        });
        return;
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
          const raw = rawTicketsMap.get(activeIdStr);
          if (raw && projectId) {
            const gitStatus = await getGitStatus(projectId);
            const ticketIdPrefix = raw.id.substring(0, 6).toUpperCase();
            const isTicketBranch = gitStatus.branch === raw.branch_name || gitStatus.branch.includes(ticketIdPrefix);

            if (isTicketBranch) {
              const isDirty = gitStatus.modified > 0 || gitStatus.untracked > 0 || !!gitStatus.is_dirty;
              if (isDirty) {
                const rawTitle = raw.title || (activeTask.content ? activeTask.content.split("\n")[0] : "Tarea");
                setUnsavedCommitMsg(`save: WIP para ticket SL-${raw.id.substring(0, 6).toUpperCase()} - ${rawTitle}`);
                // Abort optimistic update, show modal
                setUnsavedChangesModal({
                  ticketId: activeIdStr,
                  ticketTitle: rawTitle,
                  branchName: gitStatus.branch,
                  modifiedFiles: gitStatus.modified_files || [],
                  untrackedFiles: gitStatus.untracked_files || [],
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
            const raw = rawTicketsMap.get(activeIdStr);
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
            const raw = rawTicketsMap.get(activeIdStr);
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

  const rawTicketsMap = useMemo(() => {
    const map = new Map<string, KanbanTicket>();
    for (const r of rawTickets) {
      map.set(r.id, r);
    }
    return map;
  }, [rawTickets]);

  const epicsMap = useMemo(() => {
    const map = new Map<string, Epic>();
    for (const e of epics) {
      map.set(e.id, e);
    }
    return map;
  }, [epics]);

  const sprintsMap = useMemo(() => {
    const map = new Map<string, Sprint>();
    for (const s of sprints) {
      map.set(s.id, s);
    }
    return map;
  }, [sprints]);

  const filteredTasks = useMemo(() => {
    let filtered = tasks;
    if (sprintFilter !== "Todas") {
      filtered = filtered.filter(t => {
        const raw = rawTicketsMap.get(t.id);
        return raw?.sprint_id === sprintFilter;
      });
    }
    if (epicFilter !== "Todas") {
      filtered = filtered.filter(t => {
        const raw = rawTicketsMap.get(t.id);
        return raw?.epic_id === epicFilter;
      });
    }
    return filtered;
  }, [tasks, sprintFilter, epicFilter, rawTicketsMap]);

  const iceboxTasks = useMemo(() => {
    return tasks.filter((t) => (t.status || "").toLowerCase() === "icebox");
  }, [tasks]);

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

  const tasksById = useMemo(() => {
    const map = new Map<string, Task>();
    for (const t of tasks) {
      map.set(t.id, t);
    }
    return map;
  }, [tasks]);

  const taskIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < tasks.length; i++) {
      map.set(tasks[i].id, i);
    }
    return map;
  }, [tasks]);

  if (!projectId) {
    return <div className="h-full flex items-center justify-center text-zinc-500">Selecciona un proyecto para ver el Sprint Center.</div>;
  }

  const activeTask = activeId ? (tasksById.get(activeId as string) || null) : null;

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
            onClick={() => setShowIceboxDrawer(!showIceboxDrawer)}
            className={cn(
              "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded transition-all border shadow-sm font-medium",
              showIceboxDrawer
                ? "bg-cyan-950/80 text-cyan-200 border-cyan-500/60 ring-1 ring-cyan-500/30"
                : "bg-[#18181b] text-cyan-400 hover:text-cyan-200 hover:bg-cyan-950/40 border-cyan-800/40"
            )}
          >
            <span>🧊</span>
            <span>Icebox</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-cyan-900/60 text-cyan-300 font-mono">
              {iceboxTasks.length}
            </span>
          </button>
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

      {/* Main Board View with Left Drawer & Kanban Columns */}
      <div className="flex-1 flex overflow-hidden relative bg-[#111112]">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {/* Collapsible Left Icebox Drawer */}
          {showIceboxDrawer && (
            <div className="w-[320px] min-w-[300px] border-r border-zinc-800 bg-[#0e0e11] flex flex-col shrink-0 z-10 transition-all shadow-2xl h-full max-h-full min-h-0">
              <div className="p-3 border-b border-zinc-800/80 bg-[#141418] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-base">🧊</span>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                      Icebox / Ideas
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/50 font-mono">
                        {iceboxTasks.length}
                      </span>
                    </span>
                    <span className="text-[10px] text-zinc-500">Aparcadas fuera del sprint activo</span>
                  </div>
                </div>
                <button
                  onClick={() => setShowIceboxDrawer(false)}
                  className="p-1 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
                  title="Cerrar Icebox"
                  aria-label="Cerrar Icebox"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 border-b border-zinc-800/50 bg-[#101014] shrink-0">
                <input
                  type="text"
                  placeholder="+ Añadir idea al Icebox..."
                  className="w-full bg-[#18181b] border border-cyan-900/40 rounded-md px-3 py-2 text-[11px] font-medium text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
                  value={quickAddIceboxText}
                  onChange={(e) => setQuickAddIceboxText(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && quickAddIceboxText.trim() && projectId) {
                      setIsQuickAddingIcebox(true);
                      try {
                        await createKanbanTicket(projectId, {
                          title: quickAddIceboxText.trim(),
                          type: "Feature",
                          status: "icebox" as any,
                          priority: "Low",
                          description: "Idea estacionada en Icebox",
                        });
                        setQuickAddIceboxText("");
                        await fetchTasks();
                        toast.success("💡 Idea guardada en el Icebox");
                      } catch (err) {
                        console.error(err);
                        toast.error("Error al crear idea");
                      } finally {
                        setIsQuickAddingIcebox(false);
                      }
                    }
                  }}
                  disabled={isQuickAddingIcebox}
                />
              </div>

              <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 custom-scrollbar min-h-0">
                <SortableContext items={iceboxTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                  <DroppableColumn id="icebox">
                    {iceboxTasks.length === 0 ? (
                      <div className="flex flex-col items-center justify-center p-6 text-center text-zinc-500 my-8 space-y-2">
                        <span className="text-2xl opacity-40">🧊</span>
                        <p className="text-xs text-zinc-400 font-medium">Icebox Vacío</p>
                        <p className="text-[10px] text-zinc-600 max-w-[200px] leading-relaxed">
                          Arrastra tarjetas aquí o escribe arriba para aparcar ideas sin contaminar el backlog activo.
                        </p>
                      </div>
                    ) : (
                      iceboxTasks.map((task, idx) => {
                        const raw = rawTicketsMap.get(task.id);
                        const epic = raw?.epic_id ? epicsMap.get(raw.epic_id) : undefined;
                        const sprint = raw?.sprint_id ? sprintsMap.get(raw.sprint_id) : undefined;
                        const depInfo = getTaskDependencies(task, tasks, rawTicketsMap);
                        const orderIndex = (taskIndexMap.get(task.id) ?? -1) + 1;

                        return (
                          <SortableTask
                            key={task.id}
                            task={task}
                            epic={epic}
                            sprint={sprint}
                            orderIndex={orderIndex > 0 ? orderIndex : idx + 1}
                            isBlocked={depInfo.isBlocked}
                            blockingTasks={depInfo.blockingTasks}
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
                        );
                      })
                    )}
                  </DroppableColumn>
                </SortableContext>
              </div>
            </div>
          )}

          {/* Kanban Columns view */}
          <div className="flex-1 flex p-6 gap-4 overflow-x-auto overflow-y-hidden custom-scrollbar bg-[#111112] h-full min-h-0 items-stretch">
          {columns.map((col, idx) => {
            const columnTasks = tasksByStatus[col.id] || [];
            const isTodoCol = idx === 0 || col.id.toLowerCase() === 'todo';

            return (
              <div key={col.id} className={cn("flex flex-col bg-zinc-900 rounded-lg min-w-[280px] max-w-[320px] w-[300px] border-t-2 shrink-0 border-zinc-800 h-full max-h-full min-h-0 overflow-hidden shadow-lg", col.color)}>
                <div className="p-3 font-semibold text-zinc-300 text-sm border-b border-zinc-800/50 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    {isTodoCol && columnTasks.length > 0 && (
                      <input
                        type="checkbox"
                        checked={columnTasks.length > 0 && columnTasks.every(t => selectedTodoIds.has(t.id))}
                        onChange={() => handleSelectAllTodo(columnTasks)}
                        className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-blue-600 shrink-0"
                        title={columnTasks.every(t => selectedTodoIds.has(t.id)) ? "Deseleccionar todas" : "Seleccionar todas las tareas de To Do"}
                      />
                    )}
                    <span className="truncate">{col.title}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isTodoCol && selectedTodoIds.size > 0 && (
                      <button
                        type="button"
                        onClick={() => handleOpenDeleteModal(Array.from(selectedTodoIds))}
                        className="flex items-center gap-1 bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-800/80 text-[10px] font-semibold px-2 py-0.5 rounded transition-colors shadow-sm"
                        title="Eliminar tareas seleccionadas"
                      >
                        <Trash2 className="w-3 h-3 text-red-400" />
                        <span>Eliminar ({selectedTodoIds.size})</span>
                      </button>
                    )}
                    <span className="text-xs bg-zinc-850 px-2 py-0.5 rounded-full text-zinc-500 font-medium">
                      {columnTasks.length}
                    </span>
                  </div>
                </div>
                {idx === 0 && (
                  <div className="px-3 pt-3 shrink-0">
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
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 custom-scrollbar min-h-0">
                  <SortableContext items={columnTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    <DroppableColumn id={col.id}>
                      {columnTasks.map((task, taskIdx) => {
                        const raw = rawTicketsMap.get(task.id);
                        const epic = raw?.epic_id ? epicsMap.get(raw.epic_id) : undefined;
                        const sprint = raw?.sprint_id ? sprintsMap.get(raw.sprint_id) : undefined;
                        const depInfo = getTaskDependencies(task, tasks, rawTicketsMap);
                        const orderIndex = (taskIndexMap.get(task.id) ?? -1) + 1;

                        return (
                          <SortableTask
                            key={task.id}
                            task={task}
                            epic={epic}
                            sprint={sprint}
                            orderIndex={orderIndex > 0 ? orderIndex : taskIdx + 1}
                            isBlocked={depInfo.isBlocked}
                            blockingTasks={depInfo.blockingTasks}
                            selectable={isTodoCol}
                            selected={selectedTodoIds.has(task.id)}
                            onToggleSelect={handleToggleSelectTodo}
                            onDeleteClick={(id) => handleOpenDeleteModal([id])}
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
                        );
                      })}
                    </DroppableColumn>
                  </SortableContext>
                </div>
              </div>
            );
          })}
          </div>

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
      {activeDrawerTicketId && rawTicketsMap.get(activeDrawerTicketId) && (
        <TicketDrawer
          ticket={rawTicketsMap.get(activeDrawerTicketId)!}
          allSprints={sprints}
          allEpics={epics}
          columns={columns}
          allTickets={rawTickets}
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
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#18181b] border border-zinc-700/80 p-6 rounded-xl max-w-lg w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 mt-0.5 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-zinc-100 font-bold text-base flex items-center gap-2">
                  Cambios pendientes en rama efímera
                </h3>
                <p className="text-zinc-400 text-xs mt-1 leading-relaxed">
                  Detectamos archivos sin confirmar en la rama <span className="font-mono text-zinc-200 bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700">{unsavedChangesModal.branchName}</span>. Elige una acción antes de mover el ticket a <strong>To Do</strong>:
                </p>
              </div>
            </div>

            {/* Listado de Archivos Afectados (TAREA 1) */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-zinc-400 mb-2 font-medium">
                <span className="flex items-center gap-1.5 text-zinc-300">
                  <FileCode className="w-3.5 h-3.5 text-zinc-400" />
                  Archivos con cambios pendientes:
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 font-mono">
                  {unsavedChangesModal.modifiedFiles.length + unsavedChangesModal.untrackedFiles.length} archivo(s)
                </span>
              </div>

              <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-2.5 max-h-36 overflow-y-auto space-y-1.5 font-mono text-xs select-text">
                {unsavedChangesModal.modifiedFiles.length === 0 && unsavedChangesModal.untrackedFiles.length === 0 ? (
                  <p className="text-zinc-500 text-xs italic py-1 px-1">Existen modificaciones en el árbol de trabajo.</p>
                ) : (
                  <>
                    {unsavedChangesModal.modifiedFiles.map((file, idx) => (
                      <div key={`mod-${idx}`} className="flex items-center gap-2 text-zinc-300 hover:text-zinc-100 py-0.5 px-1 rounded hover:bg-zinc-900/50 transition-colors">
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                          MOD
                        </span>
                        <span className="truncate text-zinc-300 text-[11px]" title={file}>
                          {file}
                        </span>
                      </div>
                    ))}
                    {unsavedChangesModal.untrackedFiles.map((file, idx) => (
                      <div key={`unt-${idx}`} className="flex items-center gap-2 text-zinc-300 hover:text-zinc-100 py-0.5 px-1 rounded hover:bg-zinc-900/50 transition-colors">
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                          NEW
                        </span>
                        <span className="truncate text-zinc-300 text-[11px]" title={file}>
                          {file}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* Input de Mensaje de Commit */}
            <div className="mb-5">
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Mensaje de commit para guardar el progreso:
              </label>
              <input
                type="text"
                value={unsavedCommitMsg}
                onChange={(e) => setUnsavedCommitMsg(e.target.value)}
                disabled={isProcessingUnsavedAction}
                placeholder="save: WIP para ticket..."
                className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none font-mono disabled:opacity-50 transition-all"
              />
            </div>

            {/* Botones de Acción (TAREA 2) */}
            <div className="flex flex-col gap-2">
              {/* Botón 1: Commit y Guardar (Recomendado) */}
              <button
                type="button"
                disabled={isProcessingUnsavedAction || !unsavedCommitMsg.trim()}
                onClick={async () => {
                  const m = unsavedChangesModal;
                  setIsProcessingUnsavedAction(true);
                  try {
                    const commitMsg = unsavedCommitMsg.trim() || `save: WIP para ticket ${m.ticketId.substring(0, 6)}`;
                    await commitAndSwitchGitBranch(projectId, commitMsg, "main");
                    toast.success("Progreso guardado y rama cambiada a main", {
                      description: "Se confirmó todo el trabajo en Git y el ticket volvió a To Do."
                    });

                    setTasks(m.newTasks);
                    await updateKanbanTicket(m.ticketId, { status: m.newStatus as TicketStatus });
                    setUnsavedChangesModal(null);
                  } catch (e: unknown) {
                    const errMsg = e instanceof Error ? e.message : "Revisa la consola para más detalles.";
                    toast.error("Error al guardar y cambiar de rama", {
                      description: errMsg
                    });
                  } finally {
                    setIsProcessingUnsavedAction(false);
                  }
                }}
                className="w-full px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-blue-500/20 disabled:opacity-50 cursor-pointer"
              >
                {isProcessingUnsavedAction ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Guardando cambios en Git...
                  </>
                ) : (
                  <>
                    <GitCommit className="w-4 h-4" />
                    💾 Commit y Guardar Progreso (Recomendado)
                  </>
                )}
              </button>

              {/* Botón 2: Descartar Todos los Cambios (Peligro) */}
              <button
                type="button"
                disabled={isProcessingUnsavedAction}
                onClick={async () => {
                  const m = unsavedChangesModal;
                  setIsProcessingUnsavedAction(true);
                  try {
                    await discardGitChanges(projectId, "main");
                    toast.success("Cambios descartados y rama cambiada a main", {
                      description: "El espacio de trabajo quedó completamente limpio."
                    });

                    setTasks(m.newTasks);
                    await updateKanbanTicket(m.ticketId, { status: m.newStatus as TicketStatus });
                    setUnsavedChangesModal(null);
                  } catch (e: unknown) {
                    const errMsg = e instanceof Error ? e.message : "Revisa la consola para más detalles.";
                    toast.error("Error al descartar cambios", {
                      description: errMsg
                    });
                  } finally {
                    setIsProcessingUnsavedAction(false);
                  }
                }}
                className="w-full px-4 py-2 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-900/60 text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isProcessingUnsavedAction ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" />
                    Descartando cambios...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    🗑️ Descartar Todos los Cambios (Peligro)
                  </>
                )}
              </button>

              {/* Botón 3: Cancelar (Abortar) */}
              <button
                type="button"
                disabled={isProcessingUnsavedAction}
                onClick={() => {
                  setUnsavedChangesModal(null);
                }}
                className="w-full px-4 py-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-medium transition-colors disabled:opacity-50 mt-1 cursor-pointer"
              >
                ❌ Cancelar
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

      {/* Double Confirmation Delete Tasks Modal */}
      {deleteConfirmModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1c] border border-red-900/50 rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2 bg-red-950/60 border border-red-900/60 rounded-lg shrink-0">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-100">
                  Eliminar {deleteConfirmModal.ticketIds.length === 1 ? 'tarea' : `${deleteConfirmModal.ticketIds.length} tareas`} de To Do
                </h3>
                <p className="text-xs text-zinc-400">Esta acción no se puede deshacer.</p>
              </div>
            </div>

            <div className="bg-[#121214] border border-zinc-800 rounded-lg p-3 max-h-36 overflow-y-auto custom-scrollbar space-y-1.5 text-xs text-zinc-300">
              {deleteConfirmModal.ticketIds.map((id) => {
                const raw = rawTicketsMap.get(id);
                const task = tasks.find(t => t.id === id);
                const title = raw?.title || (task ? task.content.split('\n')[0].replace(/^[#\s\-*\[\]]+/, '') : id);
                return (
                  <div key={id} className="flex items-center justify-between gap-2 border-b border-zinc-800/40 pb-1 last:border-0 last:pb-0">
                    <span className="truncate font-medium text-zinc-200">{title}</span>
                    <span className="text-[10px] text-zinc-500 font-mono shrink-0">#{id.substring(0, 6)}</span>
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              <label className="text-xs text-zinc-300 font-medium block">
                Para confirmar la eliminación, escribe <strong className="text-red-400 font-mono bg-red-950/50 px-1.5 py-0.5 rounded border border-red-900/60">delete</strong> a continuación:
              </label>
              <input
                type="text"
                value={deleteConfirmModal.confirmInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setDeleteConfirmModal(prev => prev ? { ...prev, confirmInput: val } : null);
                }}
                placeholder='Escribe "delete" para confirmar'
                autoFocus
                className="w-full bg-[#121214] border border-zinc-700 rounded-md px-3 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:border-red-500 focus:ring-1 focus:ring-red-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setDeleteConfirmModal(null)}
                disabled={deleteConfirmModal.isDeleting}
                className="px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteDelete}
                disabled={deleteConfirmModal.confirmInput.trim().toLowerCase() !== 'delete' || deleteConfirmModal.isDeleting}
                className="px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-500 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:border-zinc-700 text-white rounded-md transition-colors flex items-center gap-1.5 border border-red-500 disabled:border-transparent"
              >
                {deleteConfirmModal.isDeleting ? 'Eliminando...' : 'Eliminar definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

