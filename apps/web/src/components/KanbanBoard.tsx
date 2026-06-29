"use client";

import React, { useState, useEffect } from "react";
import { DndContext, closestCenter, DragEndEvent, DragOverlay, DragStartEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";

interface Task {
  id: string;
  content: string;
  status: "todo" | "in-progress" | "done";
  category: string;
  raw_line: number;
}

interface KanbanBoardProps {
  projectId: string | null;
}

const COLUMNS = [
  { id: "todo", title: "To Do", color: "border-slate-500" },
  { id: "in-progress", title: "In Progress", color: "border-blue-500" },
  { id: "done", title: "Done", color: "border-green-500" }
];

function SortableTask({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="mb-2 cursor-grab active:cursor-grabbing">
      <Card className="bg-slate-800 border-slate-700 hover:border-slate-600 transition-colors">
        <CardContent className="p-3 text-xs text-slate-200">
          <div className="text-[10px] text-slate-400 mb-1 font-semibold">{task.category}</div>
          <div className="prose prose-invert prose-sm max-w-none prose-p:my-0">
            <ReactMarkdown>{task.content}</ReactMarkdown>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function KanbanBoard({ projectId }: KanbanBoardProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const fetchTasks = async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`http://localhost:8000/api/v1/projects/${projectId}/tasks`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks);
      }
    } catch (e) {
      console.error("Failed to fetch tasks", e);
    }
  };

  const saveTasks = async (newTasks: Task[]) => {
    if (!projectId) return;
    try {
      await fetch(`http://localhost:8000/api/v1/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks: newTasks })
      });
    } catch (e) {
      console.error("Failed to save tasks", e);
    }
  };

  useEffect(() => {
    fetchTasks();
    
    if (!projectId) return;
    
    // SSE setup for real-time updates
    const evtSource = new EventSource(`http://localhost:8000/api/v1/projects/${projectId}/events`);
    evtSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "kanban_update") {
        fetchTasks();
      }
    };
    
    return () => {
      evtSource.close();
    };
  }, [projectId]);

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
      let overIndex = prevTasks.findIndex(t => t.id === overIdStr);
      
      const newTasks = [...prevTasks];
      const activeTask = { ...newTasks[activeIndex] };
      
      if (isOverColumn) {
        activeTask.status = overIdStr as any;
        newTasks[activeIndex] = activeTask;
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
    return <div className="h-full flex items-center justify-center text-slate-500">Select a project to view tasks.</div>;
  }

  const getTasksByStatus = (status: string) => tasks.filter(t => t.status === status);
  const activeTask = activeId ? tasks.find(t => t.id === activeId) : null;

  return (
    <div className="h-full bg-[#1e1e1e] flex p-4 gap-4 overflow-x-auto">
      <DndContext collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {COLUMNS.map(col => (
          <div key={col.id} className={`flex flex-col bg-slate-900 rounded-lg min-w-[280px] border-t-2 ${col.color}`}>
            <div className="p-3 font-semibold text-slate-300 text-sm border-b border-slate-800">
              {col.title} <span className="ml-2 text-xs bg-slate-800 px-2 py-0.5 rounded-full text-slate-500">{getTasksByStatus(col.id).length}</span>
            </div>
            <ScrollArea className="flex-1 p-3">
              <SortableContext items={getTasksByStatus(col.id).map(t => t.id)} strategy={verticalListSortingStrategy}>
                <div id={col.id} className="min-h-[200px]">
                  {getTasksByStatus(col.id).map(task => (
                    <SortableTask key={task.id} task={task} />
                  ))}
                </div>
              </SortableContext>
            </ScrollArea>
          </div>
        ))}
        
        <DragOverlay>
          {activeTask ? (
            <Card className="bg-slate-700 border-slate-600 shadow-xl opacity-90">
              <CardContent className="p-3 text-xs text-slate-200">
                <div className="text-[10px] text-slate-400 mb-1 font-semibold">{activeTask.category}</div>
                <div className="prose prose-invert prose-sm max-w-none prose-p:my-0">
                  <ReactMarkdown>{activeTask.content}</ReactMarkdown>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
