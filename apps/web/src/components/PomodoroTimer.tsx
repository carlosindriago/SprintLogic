"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Play, Pause, RotateCcw, X, Clock, AlertCircle, ChevronDown, ChevronUp, Check, ShieldAlert } from "lucide-react";
import { getProjectTasks, saveProjectTasks } from "@/lib/api";
import { Task } from "@/types";
import { cn } from "@/lib/utils";

interface PomodoroTimerProps {
  projectId: string | null;
}

export default function PomodoroTimer({ projectId }: PomodoroTimerProps) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  
  // Timer States
  const [duration, setDuration] = useState(25 * 60); // 25 mins default
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [pomodorosCompleted, setPomodorosCompleted] = useState(0);
  
  // Config States
  const [preset, setPreset] = useState<'25-5' | '50-10' | 'custom'>('25-5');
  const [customWorkTime, setCustomWorkTime] = useState(25);
  const [customBreakTime, setCustomBreakTime] = useState(5);
  
  // Post-Session Prompt Modal
  const [showCompletionPrompt, setShowCompletionPrompt] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Recommendations based on Task description/priority
  const recommendedPreset = useMemo(() => {
    if (!activeTask) return null;
    const contentLower = activeTask.content.toLowerCase();
    if (
      contentLower.includes("arquitectura") || 
      contentLower.includes("refactor") || 
      contentLower.includes("design") ||
      activeTask.priority === "High"
    ) {
      return {
        preset: '50-10' as const,
        reason: "Sugerido (50/10) para trabajo profundo o arquitectura compleja"
      };
    }
    return {
      preset: '25-5' as const,
      reason: "Sugerido (25/5) para correcciones rápidas o tareas simples"
    };
  }, [activeTask]);

  // Apply recommended preset when task is loaded
  useEffect(() => {
    if (recommendedPreset && preset !== recommendedPreset.preset) {
      handleSelectPreset(recommendedPreset.preset);
    }
  }, [recommendedPreset]);

  // Listen to Global Task Trigger
  useEffect(() => {
    const handleStartPomodoroEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ task: Task }>;
      if (customEvent.detail && customEvent.detail.task) {
        const task = customEvent.detail.task;
        setActiveTask(task);
        setIsExpanded(true);
        // Reset timer for the new task
        setIsRunning(false);
        setIsBreak(false);
        
        // Match recommendation immediately if possible
        const contentLower = task.content.toLowerCase();
        const nextPreset = (
          contentLower.includes("arquitectura") || 
          contentLower.includes("refactor") || 
          contentLower.includes("design") ||
          task.priority === "High"
        ) ? '50-10' : '25-5';
        
        handleSelectPreset(nextPreset);
      }
    };

    window.addEventListener("start-pomodoro", handleStartPomodoroEvent);
    return () => {
      window.removeEventListener("start-pomodoro", handleStartPomodoroEvent);
    };
  }, []);

  // Timer Tick Engine
  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      timerRef.current = setTimeout(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isRunning) {
      handleTimerComplete();
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isRunning, timeLeft]);

  // Handle Preset selection
  const handleSelectPreset = (p: '25-5' | '50-10' | 'custom', customWork = 25, customBreak = 5) => {
    setPreset(p);
    setIsRunning(false);
    setIsBreak(false);
    
    let workSecs = 25 * 60;
    if (p === '25-5') {
      workSecs = 25 * 60;
    } else if (p === '50-10') {
      workSecs = 50 * 60;
    } else {
      workSecs = customWork * 60;
    }
    
    setDuration(workSecs);
    setTimeLeft(workSecs);
  };

  // Timer Completion Handler
  const handleTimerComplete = () => {
    setIsRunning(false);
    
    // Play chime sound (Subtle HTML5 Audio synthesis)
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5 Note
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15); // A5 Note
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } catch (e) {
      console.warn("Chime failed to play", e);
    }

    if (!isBreak) {
      // Completed a work session
      setPomodorosCompleted(prev => prev + 1);
      if (activeTask) {
        setShowCompletionPrompt(true);
      } else {
        // Just switch to break
        startBreakSession();
      }
    } else {
      // Completed a break session
      setIsBreak(false);
      const nextWorkSecs = preset === '25-5' ? 25 * 60 : preset === '50-10' ? 50 * 60 : customWorkTime * 60;
      setDuration(nextWorkSecs);
      setTimeLeft(nextWorkSecs);
    }
  };

  const startBreakSession = () => {
    setIsBreak(true);
    const breakSecs = preset === '25-5' ? 5 * 60 : preset === '50-10' ? 10 * 60 : customBreakTime * 60;
    setDuration(breakSecs);
    setTimeLeft(breakSecs);
    setIsRunning(true);
  };

  // Handle Post-session Task Save
  const handlePostSessionDecision = async (moveToTest: boolean) => {
    if (!activeTask || !projectId) return;
    
    try {
      const data = await getProjectTasks(projectId);
      const updatedTasks = data.tasks.map(t => {
        if (t.id === activeTask.id) {
          const prevPomodoros = t.pomodoros || 0;
          const prevTime = t.time_spent || 0;
          const workMins = Math.round(duration / 60);
          
          return {
            ...t,
            pomodoros: prevPomodoros + 1,
            time_spent: prevTime + workMins,
            // If user marks as ready for QA, move to first test-rule column or fallback to 'test'
            status: moveToTest ? 'test' : t.status,
            category: moveToTest ? 'Test' : t.category
          };
        }
        return t;
      });

      await saveProjectTasks(projectId, updatedTasks);
      
      // Update local task reference
      const nextActive = updatedTasks.find(t => t.id === activeTask.id);
      setActiveTask(nextActive || null);
    } catch (e) {
      console.error("Failed to update task post pomodoro", e);
    }

    setShowCompletionPrompt(false);
    startBreakSession();
  };

  // Toggle Pause/Play
  const handleTogglePlay = () => {
    // If starting and pomodoro is linked to task, make sure task moves to 'in-progress' if needed
    if (!isRunning && activeTask && activeTask.status === 'todo') {
      moveTaskToInProgress();
    }
    setIsRunning(!isRunning);
  };

  const moveTaskToInProgress = async () => {
    if (!activeTask || !projectId) return;
    try {
      const data = await getProjectTasks(projectId);
      const updatedTasks = data.tasks.map(t => {
        if (t.id === activeTask.id) {
          return {
            ...t,
            status: 'in-progress',
            category: 'In Progress'
          };
        }
        return t;
      });
      await saveProjectTasks(projectId, updatedTasks);
      setActiveTask((prev: Task | null) => prev ? { ...prev, status: 'in-progress', category: 'In Progress' } : null);
    } catch (e) {
      console.error("Failed to move task to in-progress", e);
    }
  };

  // Reset Timer
  const handleReset = () => {
    setIsRunning(false);
    setTimeLeft(duration);
  };

  // Format MM:SS
  const formatTimeLeft = () => {
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // SVG Progress calculation
  const percentage = duration > 0 ? (timeLeft / duration) * 100 : 0;
  const strokeDashoffset = 264 - (264 * percentage) / 100;

  if (!projectId) return null;

  return (
    <>
      <div 
        className={cn(
          "fixed bottom-6 right-6 z-40 transition-all duration-300 rounded-xl border border-zinc-700 bg-zinc-900/90 backdrop-blur-md shadow-2xl flex flex-col overflow-hidden text-xs text-zinc-300",
          isExpanded ? "w-[200px]" : "w-[44px] h-[44px] rounded-full justify-center items-center cursor-pointer border-blue-500/50"
        )}
        onClick={() => !isExpanded && setIsExpanded(true)}
      >
        {/* Collapsed State */}
        {!isExpanded && (
          <div className="relative flex items-center justify-center w-full h-full">
            <span className="text-[9px] font-mono font-bold text-blue-400">
              {Math.floor(timeLeft / 60)}m
            </span>
            <div className="absolute inset-0.5 rounded-full border border-blue-500/20 animate-pulse" />
          </div>
        )}

        {/* Expanded State */}
        {isExpanded && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800 bg-zinc-950/40">
              <div className="flex items-center gap-1 font-semibold text-zinc-200">
                <Clock className="w-3 h-3 text-orange-500" />
                <span className="text-[11px]">Enfoque Pomodoro</span>
                {isBreak && <span className="text-[8px] bg-green-950/40 border border-green-900/30 text-green-400 px-1 py-0.5 rounded font-mono font-bold animate-pulse">BREAK</span>}
              </div>
              <div className="flex items-center gap-0.5">
                <button 
                  onClick={() => setIsExpanded(false)} 
                  className="p-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
                <button 
                  onClick={() => {
                    setActiveTask(null);
                    setIsRunning(false);
                  }} 
                  className="p-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Timer circle & control actions */}
            <div className="p-2.5 flex flex-col items-center gap-3">
              <div className="relative w-24 h-24 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="transparent" stroke="#27272a" strokeWidth="3" />
                  <circle 
                    cx="50" 
                    cy="50" 
                    r="42" 
                    fill="transparent" 
                    stroke={isBreak ? "#10b981" : "#f97316"} 
                    strokeWidth="3" 
                    strokeDasharray="264"
                    strokeDashoffset={strokeDashoffset}
                    className="transition-all duration-300"
                  />
                </svg>
                <div className="absolute flex flex-col items-center font-mono">
                  <span className="text-lg font-bold text-zinc-100">{formatTimeLeft()}</span>
                  <span className="text-[8px] text-zinc-500">Sesiones: {pomodorosCompleted}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleReset}
                  className="p-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
                <button 
                  onClick={handleTogglePlay}
                  className={cn(
                    "p-2 rounded-full text-white shadow-lg transition-transform active:scale-95",
                    isRunning ? "bg-zinc-700 hover:bg-zinc-600" : "bg-orange-600 hover:bg-orange-500"
                  )}
                >
                  {isRunning ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
                </button>
              </div>

              {/* Active Task Link */}
              {activeTask ? (
                <div className="w-full flex flex-col gap-1 p-2 rounded-lg border border-zinc-800 bg-zinc-950/20">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] font-mono text-zinc-400">TAREA VINCULADA</span>
                    <span className="text-[8px] font-semibold text-zinc-500 font-mono">{activeTask.id}</span>
                  </div>
                  <p className="text-zinc-200 font-medium break-words text-[10px] line-clamp-2">
                    {activeTask.content}
                  </p>
                  
                  {recommendedPreset && (
                    <div className="flex items-start gap-1 text-[8px] text-blue-400 mt-1 border-t border-zinc-800/40 pt-1.5">
                      <AlertCircle className="w-3 h-3 shrink-0 text-blue-500" />
                      <span>{recommendedPreset.reason}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[9px] text-zinc-500 text-center py-1.5">
                  Arrastrá o iniciá un pomodoro desde una tarjeta en el Kanban.
                </div>
              )}

              {/* Presets settings */}
              <div className="w-full flex flex-col gap-1.5 border-t border-zinc-800 pt-2 mt-0.5">
                <div className="flex justify-between items-center text-[9px] text-zinc-500">
                  <span>AJUSTES DE TIEMPO</span>
                  <span>{preset === 'custom' ? 'Personalizado' : preset === '25-5' ? '25m / 5m' : '50m / 10m'}</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button 
                    onClick={() => handleSelectPreset('25-5')}
                    className={cn(
                      "py-1 rounded-md border text-[9px] font-medium transition-colors",
                      preset === '25-5' ? "border-orange-500/40 bg-orange-950/10 text-orange-400" : "border-zinc-800 bg-zinc-950/20 text-zinc-400 hover:border-zinc-700"
                    )}
                  >
                    25/5 (Clásico)
                  </button>
                  <button 
                    onClick={() => handleSelectPreset('50-10')}
                    className={cn(
                      "py-1 rounded-md border text-[9px] font-medium transition-colors",
                      preset === '50-10' ? "border-orange-500/40 bg-orange-950/10 text-orange-400" : "border-zinc-800 bg-zinc-950/20 text-zinc-400 hover:border-zinc-700"
                    )}
                  >
                    50/10 (Deep)
                  </button>
                  <button 
                    onClick={() => handleSelectPreset('custom', customWorkTime, customBreakTime)}
                    className={cn(
                      "py-1 rounded-md border text-[9px] font-medium transition-colors",
                      preset === 'custom' ? "border-orange-500/40 bg-orange-950/10 text-orange-400" : "border-zinc-800 bg-zinc-950/20 text-zinc-400 hover:border-zinc-700"
                    )}
                  >
                    Pers.
                  </button>
                </div>

                {preset === 'custom' && (
                  <div className="grid grid-cols-2 gap-1.5 mt-0.5">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[8px] text-zinc-500">Trabajo (mins)</span>
                      <input 
                        type="number" 
                        min="1" 
                        max="180"
                        className="bg-zinc-950/40 border border-zinc-800 px-1.5 py-0.5 rounded text-[11px] text-zinc-200 focus:outline-none"
                        value={customWorkTime}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value) || 25);
                          setCustomWorkTime(val);
                          handleSelectPreset('custom', val, customBreakTime);
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[8px] text-zinc-500">Recreo (mins)</span>
                      <input 
                        type="number" 
                        min="1" 
                        max="60"
                        className="bg-zinc-950/40 border border-zinc-800 px-1.5 py-0.5 rounded text-[11px] text-zinc-200 focus:outline-none"
                        value={customBreakTime}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value) || 5);
                          setCustomBreakTime(val);
                          handleSelectPreset('custom', customWorkTime, val);
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Completion Modal Prompt */}
      {showCompletionPrompt && activeTask && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-[#18181b] border border-[#3f3f46] w-full max-w-sm flex flex-col rounded-lg shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#3f3f46] flex items-center gap-2 bg-zinc-950/40">
              <Clock className="w-5 h-5 text-orange-500" />
              <h3 className="text-sm font-bold text-zinc-100">¡Sesión de Enfoque Terminada!</h3>
            </div>
            
            <div className="p-5 flex flex-col gap-3">
              <div className="flex flex-col gap-1 bg-[#111112] p-3 rounded border border-zinc-800">
                <span className="text-[9px] text-zinc-500 font-semibold font-mono">{activeTask.id}</span>
                <span className="text-zinc-200 font-medium text-xs break-words">{activeTask.content}</span>
              </div>
              
              <p className="text-xs text-zinc-400 leading-relaxed">
                Logueamos **1 Pomodoro** ({Math.round(duration / 60)} min) para esta tarea. ¿Completaste el trabajo y querés mandarla a la columna **Test** para QA?
              </p>
            </div>

            <div className="px-5 py-3 border-t border-[#3f3f46] flex justify-end gap-2.5 bg-[#131315]">
              <button 
                onClick={() => handlePostSessionDecision(false)}
                className="text-zinc-400 hover:text-zinc-200 text-[11px] font-semibold px-3.5 py-2 rounded bg-[#27272a] hover:bg-[#3f3f46] transition-colors"
              >
                Seguir en Progreso
              </button>
              <button 
                onClick={() => handlePostSessionDecision(true)}
                className="text-white text-[11px] font-semibold px-3.5 py-2 rounded bg-green-600 hover:bg-green-500 transition-colors flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" />
                Mandar a Test
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
