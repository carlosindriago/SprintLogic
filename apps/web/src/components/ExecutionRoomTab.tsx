"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Send, Download, Play, Zap, GraduationCap, Layout, Settings2, CheckCircle2 } from "lucide-react";
import { DiffEditor } from "@monaco-editor/react";
import { useProjectStore } from "@/store/projectStore";
import ReactMarkdown from "react-markdown";
import { applyPatch, getProjectTasks, API_BASE_URL } from "@/lib/api";
import { toast } from "sonner";
import { Task } from "@/types";

interface DiffBlock {
  id: string;
  original: string;
  modified: string;
}

interface ExecutionRoomTabProps {
  data?: {
    ticketId?: string;
    executionMode?: string;
  };
}

export type ExecutionMode = "exec_mode_surgeon" | "exec_mode_pair_programming" | "exec_mode_whiteboard";

interface ModeOption {
  id: ExecutionMode;
  title: string;
  badge: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  borderColor: string;
}

const MODES: ModeOption[] = [
  {
    id: "exec_mode_surgeon",
    title: "Modo Cirujano",
    badge: "🔪 Cirujano",
    description: "Entrega únicamente el parche exacto (diff) solicitado de forma quirúrgica, sin explicaciones ni rodeos.",
    icon: Zap,
    color: "text-red-400",
    bgColor: "bg-red-950/30",
    borderColor: "border-red-800/50",
  },
  {
    id: "exec_mode_pair_programming",
    title: "Modo Socrático",
    badge: "🧑‍🏫 Pair Programmer",
    description: "Te guía con preguntas socráticas, te ayuda a razonar la solución y escribe fragmentos clave para orientar el camino.",
    icon: GraduationCap,
    color: "text-indigo-400",
    bgColor: "bg-indigo-950/30",
    borderColor: "border-indigo-800/50",
  },
  {
    id: "exec_mode_whiteboard",
    title: "Modo Pizarra",
    badge: "📋 Pizarra",
    description: "Planificación de alto nivel. Genera diagramas de flujo Mermaid, pseudocódigo y esquemas de arquitectura sin código final.",
    icon: Layout,
    color: "text-amber-400",
    bgColor: "bg-amber-950/30",
    borderColor: "border-amber-800/50",
  },
];

export default function ExecutionRoomTab({ data }: ExecutionRoomTabProps) {
  const ticketId = data?.ticketId;
  const projectId = useProjectStore((s) => s.projectId);

  const [ticket, setTicket] = useState<Task | null>(null);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>(
    (data?.executionMode as ExecutionMode) || "exec_mode_surgeon"
  );
  const [showTriageModal, setShowTriageModal] = useState<boolean>(!data?.executionMode);
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [diffBlocks, setDiffBlocks] = useState<DiffBlock[]>([]);
  const [activeDiff, setActiveDiff] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!projectId) return;
    const loadTicket = async () => {
      try {
        if (!ticketId) return;
        const res = await getProjectTasks(projectId);
        const task = res.tasks.find((t) => t.id === ticketId);
        if (task) {
          setTicket(task);
          setMessages([
            {
              role: "assistant",
              content: `👋 **Bienvenido al Quirófano de SprintLogic**\n\nResolviendo ticket **[${task.id}]**: ${task.content}\n\nSeleccioná un modo de asistencia arriba para comenzar.`,
            },
          ]);
        }
      } catch (err) {
        console.error("Failed to load ticket", err);
      }
    };
    loadTicket();
  }, [projectId, ticketId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const extractDiffBlocks = (text: string) => {
    const blocks: DiffBlock[] = [];
    const regex = /<<<<([\s\S]*?)====([\s\S]*?)>>>>/g;
    let match;
    let index = 0;
    while ((match = regex.exec(text)) !== null) {
      blocks.push({
        id: `diff-${Date.now()}-${index++}`,
        original: match[1].replace(/^\n/, ""),
        modified: match[2].replace(/^\n/, ""),
      });
    }
    return blocks;
  };

  const handleSend = async () => {
    if (!input.trim() || !projectId) return;

    const userMsg = input.trim();
    setInput("");
    const updatedMessages = [...messages, { role: "user", content: userMsg }];
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/execute_agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket_id: ticketId,
          prompt: userMsg,
          history: updatedMessages,
          execution_mode: executionMode,
        }),
      });

      if (!res.ok) {
        throw new Error("Error en la llamada al endpoint de ejecución");
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMsg = "";

      if (reader) {
        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          assistantMsg += chunk;

          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1].content = assistantMsg;
            return copy;
          });
        }
      }

      const blocks = extractDiffBlocks(assistantMsg);
      if (blocks.length > 0) {
        setDiffBlocks((prev) => [...prev, ...blocks]);
        setActiveDiff(blocks[0].id);
      }
    } catch (err) {
      toast.error("Error al comunicarse con el agente de ejecución");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyPatch = async (block: DiffBlock) => {
    if (!projectId) return;
    try {
      const targetFile = ticket?.affected_nodes?.[0] || "unknown";
      await applyPatch(projectId, targetFile, block.original, block.modified);
      toast.success("Parche aplicado exitosamente");
      setDiffBlocks((prev) => prev.filter((b) => b.id !== block.id));
      if (activeDiff === block.id) setActiveDiff(null);
    } catch (err) {
      toast.error("Fallo al aplicar el parche");
      console.error(err);
    }
  };

  const currentDiff = useMemo(() => diffBlocks.find((b) => b.id === activeDiff), [diffBlocks, activeDiff]);
  const activeModeConfig = useMemo(() => MODES.find((m) => m.id === executionMode) || MODES[0], [executionMode]);

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950 text-zinc-200 overflow-hidden font-sans relative">
      {/* Header / Sub-bar */}
      <div className="h-12 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span className="text-sm font-semibold text-zinc-200">Quirófano (Execution Room)</span>
          </div>
          {ticket && (
            <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded border border-zinc-700 font-mono truncate max-w-xs">
              {ticket.id}
            </span>
          )}
        </div>

        {/* Triage Mode Selector Indicator */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 font-medium">Modo Activo:</span>
          <button
            onClick={() => setShowTriageModal(true)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-md border font-semibold transition-all hover:scale-105 ${activeModeConfig.bgColor} ${activeModeConfig.color} ${activeModeConfig.borderColor}`}
          >
            <activeModeConfig.icon className="w-3.5 h-3.5" />
            <span>{activeModeConfig.badge}</span>
            <Settings2 className="w-3 h-3 ml-1 opacity-70" />
          </button>
        </div>
      </div>

      {/* Main Workspace: Chat + Diff */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat Left Pane */}
        <div className="w-1/3 min-w-[360px] border-r border-zinc-800 bg-[#121212] flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg max-w-[92%] text-xs leading-relaxed ${
                  msg.role === "user"
                    ? "bg-blue-950/40 text-blue-100 border border-blue-800/50 self-end"
                    : "bg-zinc-900 text-zinc-300 border border-zinc-800 self-start"
                }`}
              >
                <div className="font-semibold text-[10px] mb-1 opacity-60 uppercase tracking-wider flex items-center justify-between">
                  <span>{msg.role === "user" ? "Desarrollador" : "Agente Quirúrgico"}</span>
                  {msg.role === "assistant" && (
                    <span className={`text-[9px] px-1 rounded ${activeModeConfig.bgColor} ${activeModeConfig.color}`}>
                      {activeModeConfig.title}
                    </span>
                  )}
                </div>
                <div className="prose prose-invert prose-xs max-w-none">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="text-xs text-zinc-500 animate-pulse flex items-center gap-2 self-start p-3">
                <Play className="w-3 h-3 animate-spin" /> Procesando instrucción...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <div className="p-3 bg-zinc-900 border-t border-zinc-800">
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                placeholder={`Instrucción para ${activeModeConfig.title}...`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={isLoading}
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-md transition-colors disabled:opacity-40 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-blue-500"
                aria-label="Enviar instrucción"
                title="Enviar instrucción"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {/* Diff Right Pane */}
        <div className="flex-1 bg-[#1e1e1e] flex flex-col overflow-hidden relative">
          {diffBlocks.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-zinc-500 flex-col gap-3 p-6 text-center">
              <Zap className="w-10 h-10 opacity-30 text-yellow-500" />
              <h4 className="text-sm font-semibold text-zinc-400">Sin Parches Pendientes</h4>
              <p className="text-xs max-w-sm text-zinc-500">
                Los cambios de código propuestos por el Agente Quirúrgico aparecerán en esta área como Diffs ejecutables.
              </p>
            </div>
          ) : (
            <>
              {/* Diff Tabs */}
              <div className="h-10 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4 shrink-0">
                <div className="flex gap-2 overflow-x-auto custom-scrollbar">
                  {diffBlocks.map((b, idx) => (
                    <button
                      key={b.id}
                      onClick={() => setActiveDiff(b.id)}
                      className={`px-3 py-1 text-xs rounded border transition-colors ${
                        activeDiff === b.id
                          ? "bg-zinc-800 text-white border-zinc-600"
                          : "bg-zinc-950 text-zinc-500 border-zinc-800 hover:text-zinc-300"
                      }`}
                    >
                      Parche #{idx + 1}
                    </button>
                  ))}
                </div>
                {currentDiff && (
                  <button
                    onClick={() => handleApplyPatch(currentDiff)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-emerald-950/60 text-emerald-400 hover:bg-emerald-900/80 border border-emerald-800/60 rounded text-xs font-semibold transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Aplicar Parche
                  </button>
                )}
              </div>

              {/* Monaco Diff Editor */}
              <div className="flex-1 relative">
                {currentDiff && (
                  <DiffEditor
                    original={currentDiff.original}
                    modified={currentDiff.modified}
                    theme="vs-dark"
                    options={{
                      readOnly: true,
                      renderSideBySide: true,
                      minimap: { enabled: false },
                      wordWrap: "on",
                      scrollBeyondLastLine: false,
                    }}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Triage UX Selector Modal */}
      {showTriageModal && (
        <div className="absolute inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-[#18181b] border border-[#3f3f46] w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-zinc-800">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-5 h-5 text-yellow-400" />
                <h3 className="text-lg font-bold text-zinc-100">Triage de Quirófano — Nivel de Asistencia IA</h3>
              </div>
              <p className="text-xs text-zinc-400">
                Selecciona cómo deseas resolver la tarea antes de iniciar la sesión de ejecución.
              </p>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              {MODES.map((mode) => {
                const Icon = mode.icon;
                const isSelected = executionMode === mode.id;

                return (
                  <div
                    key={mode.id}
                    onClick={() => setExecutionMode(mode.id)}
                    className={`flex flex-col p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      isSelected
                        ? `${mode.bgColor} ${mode.borderColor} ring-2 ring-blue-500/50`
                        : "bg-zinc-900/60 border-zinc-800 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className={`p-2 rounded-lg ${mode.bgColor} ${mode.color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
                    </div>
                    <h4 className="text-sm font-bold text-zinc-200 mb-1">{mode.title}</h4>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">{mode.description}</p>
                  </div>
                );
              })}
            </div>

            <div className="px-6 py-4 bg-zinc-900/80 border-t border-zinc-800 flex justify-end">
              <button
                onClick={() => setShowTriageModal(false)}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-5 py-2 rounded-md transition-colors"
              >
                Comenzar con {MODES.find((m) => m.id === executionMode)?.title}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
