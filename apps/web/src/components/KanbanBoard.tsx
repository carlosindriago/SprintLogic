"use client";

import React, { useState, useEffect, useCallback } from "react";
import { DndContext, closestCenter, DragEndEvent, DragOverlay, DragStartEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import { getProjectTasks, saveProjectTasks } from '@/lib/api';
import { Task } from "@/types";

interface KanbanBoardProps {
  projectId: string | null;
  onNodeClick?: (nodeId: string) => void;
}

const COLUMNS = [
  { id: "todo", title: "To Do", color: "border-zinc-500" },
  { id: "in-progress", title: "In Progress", color: "border-blue-500" },
  { id: "done", title: "Done", color: "border-green-500" }
];

function SortableTask({ task, onNodeClick }: { task: Task, onNodeClick?: (nodeId: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="mb-2 cursor-grab active:cursor-grabbing">
      <Card className="bg-zinc-800 border-zinc-700/50 hover:border-zinc-600 transition-colors">
        <CardContent className="p-3 text-xs text-zinc-200">
          <div className="text-[10px] text-zinc-400 mb-1 font-semibold">{task.category}</div>
          <div className="prose prose-invert prose-sm max-w-none prose-p:my-0">
            <ReactMarkdown>{task.content}</ReactMarkdown>
          </div>
          {task.affected_nodes && task.affected_nodes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {task.affected_nodes.map((node) => (
                <span
                  key={node}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onNodeClick) onNodeClick(node);
                  }}
                  className="px-1.5 py-0.5 bg-blue-900/50 text-blue-300 rounded border border-blue-800 text-[9px] cursor-pointer hover:bg-blue-800 transition-colors"
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
  const [activeId, setActiveId] = useState<string | null>(null);

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
      await fetchTasks();
    };

    loadData();

    if (!projectId) return;

    // SSE setup for real-time updates
    const evtSource = new EventSource(`http://127.0.0.1:8000/api/v1/projects/${projectId}/events`);
    evtSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "kanban_update" && active) {
        fetchTasks();
      }
    };

    return () => {
      active = false;
      evtSource.close();
    };
  }, [projectId, fetchTasks]);

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
    const isOverColumn = COLUMNS.some(c => c.id === overIdStr);

    setTasks(prevTasks => {
      const activeIndex = prevTasks.findIndex(t => t.id === activeIdStr);
      const overIndex = prevTasks.findIndex(t => t.id === overIdStr);

      const newTasks = [...prevTasks];
      const activeTask = { ...newTasks[activeIndex] };

      if (isOverColumn) {
        if (overIdStr === "todo" || overIdStr === "in-progress" || overIdStr === "done") {
          activeTask.status = overIdStr;
          newTasks[activeIndex] = activeTask;
        }
      } else {
        const overTask = prevTasks[overIndex];
        if (activeTask.status !== overTask.status) {
          activeTask.status = overTask.status;
          newTasks[activeIndex] = activeTask;
        }
        return arrayMove(newTasks, activeIndex, overIndex);
      }

      // Update backend in background
      saveTasks(newTasks);
      return newTasks;
    });
  };

  if (!projectId) {
    return <div className="h-full flex items-center justify-center text-zinc-500">Select a project to view tasks.</div>;
  }

  const getTasksByStatus = (status: string) => tasks.filter(t => t.status === status);
  const activeTask = activeId ? tasks.find(t => t.id === activeId) : null;

  return (
    <div className="h-full bg-[#1e1e1e] flex p-4 gap-4 overflow-x-auto">
      <DndContext collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {COLUMNS.map(col => (
          <div key={col.id} className={`flex flex-col bg-zinc-900 rounded-lg min-w-[280px] border-t-2 ${col.color}`}>
            <div className="p-3 font-semibold text-zinc-300 text-sm border-b border-zinc-800/50">
              {col.title} <span className="ml-2 text-xs bg-zinc-800 px-2 py-0.5 rounded-full text-zinc-500">{getTasksByStatus(col.id).length}</span>
            </div>
            <ScrollArea className="flex-1 p-3">
              <SortableContext items={getTasksByStatus(col.id).map(t => t.id)} strategy={verticalListSortingStrategy}>
                <div id={col.id} className="min-h-[200px]">
                  {getTasksByStatus(col.id).map(task => (
                    <SortableTask key={task.id} task={task} onNodeClick={onNodeClick} />
                  ))}
                </div>
              </SortableContext>
            </ScrollArea>
          </div>
        ))}

        <DragOverlay>
          {activeTask ? (
            <Card className="bg-zinc-700 border-zinc-600 shadow-xl opacity-90">
              <CardContent className="p-3 text-xs text-zinc-200">
                <div className="text-[10px] text-zinc-400 mb-1 font-semibold">{activeTask.category}</div>
                <div className="prose prose-invert prose-sm max-w-none prose-p:my-0">
                  <ReactMarkdown>{activeTask.content}</ReactMarkdown>
                </div>
                {activeTask.affected_nodes && activeTask.affected_nodes.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {activeTask.affected_nodes.map((node) => (
                      <span key={node} className="px-1.5 py-0.5 bg-blue-900/50 text-blue-300 rounded border border-blue-800 text-[9px]">
                        {node}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
