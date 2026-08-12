"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Send, Download, Play, Zap, GraduationCap, Layout, Settings2, CheckCircle2, ClipboardCopy, FileInput, Save, FileCode2, Plus } from "lucide-react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { Panel, Group, Separator } from "react-resizable-panels";
import { useProjectStore } from "@/store/projectStore";
import ReactMarkdown from "react-markdown";
import { getKanbanTicket, API_BASE_URL, getFileContent, saveFileContent } from "@/lib/api";
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

  const [ticket, setTicket] = useState<Task | any>(null);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>(
    (data?.executionMode as ExecutionMode) || "exec_mode_surgeon"
  );
  const [showTriageModal, setShowTriageModal] = useState<boolean>(!data?.executionMode);
  
  // Left Panel State
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPlanInput, setShowPlanInput] = useState(false);
  const [externalPlan, setExternalPlan] = useState("");
  
  // Right Panel State (Editor)
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [originalContent, setOriginalContent] = useState<string>("");
  const [isDiffMode, setIsDiffMode] = useState<boolean>(false);
  const [diffOriginal, setDiffOriginal] = useState<string>("");
  const [diffModified, setDiffModified] = useState<string>("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [showOpenFileModal, setShowOpenFileModal] = useState(false);
  const [newFilePathInput, setNewFilePathInput] = useState("");
  const [projectContextMd, setProjectContextMd] = useState<string>("");

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!projectId) return;
    const loadTicket = async () => {
      try {
        if (!ticketId) return;
        const task = await getKanbanTicket(ticketId) as any;
        if (task) {
          setTicket(task);
          
          // Pre-carguen como pestañas los archivos listados en affected_nodes
          if (task.affected_nodes && task.affected_nodes.length > 0) {
            const files = task.affected_nodes.map((n: any) => n.file_path || n.node_id || n);
            setOpenFiles(files);
            if (files.length > 0) {
              setActiveFilePath(files[0]);
            }
          }

          let subtasksStr = "";
          if (task.subtasks && task.subtasks.length > 0) {
            subtasksStr = `\n\n**Subtareas:**\n${task.subtasks.map((st: any) => `- [ ] ${st.title}`).join('\n')}`;
          }
          setMessages([
            {
              role: "assistant",
              content: `👋 **Bienvenido al Quirófano de SprintLogic**\n\n🎯 **Ejecutando Ticket:** ${task.title} (Rama: ${task.branch_name || 'N/A'})\n\n**Descripción:**\n${task.description}${subtasksStr}\n\nSeleccioná un modo de asistencia arriba para comenzar.`,
            },
          ]);
        }
      } catch (err) {
        console.error("Failed to load ticket", err);
      }
    };
    loadTicket();
  }, [projectId, ticketId]);

  // Fetch codebase context
  useEffect(() => {
    if (!projectId) return;
    const loadContext = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/projects/${projectId}/graph/export/md`);
        if (res.ok) {
          const txt = await res.text();
          setProjectContextMd(txt);
        }
      } catch (err) {
        console.error("Failed to load project context", err);
      }
    };
    loadContext();
  }, [projectId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle active file loading
  useEffect(() => {
    const loadFile = async () => {
      if (!projectId || !activeFilePath) return;
      try {
        const contentResponse = await getFileContent(projectId, activeFilePath);
        const code = contentResponse.content;
        setFileContent(code);
        setOriginalContent(code);
        setHasUnsavedChanges(false);
        setIsDiffMode(false);
      } catch (err) {
        console.error("Failed to load file content", err);
        toast.error("Error al cargar el archivo");
      }
    };
    loadFile();
  }, [projectId, activeFilePath]);

  const copyStructuredPrompt = () => {
    if (!ticket) return;
    const t = ticket as any;
    const ticketTitle = t.title;
    const branchName = t.branch_name || 'N/A';
    const ticketDescription = t.description;
    const subtasks = t.subtasks && t.subtasks.length > 0 
      ? t.subtasks.map((st: any) => `- [ ] ${st.title}`).join('\n')
      : "No hay subtareas definidas.";

    const promptText = `# CONTEXTO GLOBAL DEL PROYECTO
A continuación se detalla la arquitectura, estructura de directorios y mapa de dependencias de nuestro proyecto actual:
\`\`\`markdown
${projectContextMd}
\`\`\`

---

# CONTEXTO DE LA TAREA (TICKET)
**Ticket:** ${ticketTitle}
**Rama de trabajo:** ${branchName}

## Descripción del requerimiento:
${ticketDescription}

## Subtareas a cumplir:
${subtasks}

---

# INSTRUCCIÓN DEL SISTEMA (PERFECT ATOMIC PROMPT)
Actúa como un Staff Engineer y Tech Lead Senior. Tu objetivo es leer el "Contexto Global del Proyecto" para entender nuestra arquitectura y dependencias, y luego diseñar un Plan de Ejecución Quirúrgica paso a paso para resolver el "Contexto de la Tarea".

Debes adherirte a los siguientes estándares de ingeniería:
1. **Excelencia Técnica:** Aplica principios SOLID, Clean Code y respeta la arquitectura existente del proyecto (usa los repositorios, servicios y utilidades que ya existen en el mapa). Cero hardcoding.
2. **Seguridad y Robustez:** Incluye manejo de errores y validaciones de tipos.
3. **Claridad Pedagógica:** Explica brevemente el *por qué* de cada decisión para que el desarrollador entienda el propósito.

**FORMATO DE SALIDA ESPERADO:**
Genera tu respuesta estrictamente estructurada de la siguiente manera:
- **Análisis de Impacto:** Qué componentes del mapa topológico se verán afectados.
- **Plan de Ejecución:** Una lista de tareas enumeradas usando checkboxes (ej. \`- [ ] Paso 1: ...\`). Cada paso debe indicar claramente la ruta ABSOLUTA del archivo a modificar (basada en el mapa proporcionado), seguido del bloque de código exacto y las instrucciones precisas de dónde insertarlo.
- **Validación:** Qué pruebas realizar para asegurar que el código funciona.`;

    navigator.clipboard.writeText(promptText);
    toast.success("Prompt copiado al portapapeles");
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

      if (!res.ok) throw new Error("Error en la llamada al endpoint de ejecución");

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
    } catch (err) {
      toast.error("Error al comunicarse con el agente de ejecución");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to extract a single patch for the IA button (from the last assistant message)
  const applyIAPatchToEditor = () => {
    if (!activeFilePath) {
      toast.error("No hay ningún archivo activo para aplicar el parche");
      return;
    }
    
    // Find the last diff block in the chat history
    let foundPatch: DiffBlock | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "assistant") {
        const regex = /<<<<([\s\S]*?)====([\s\S]*?)>>>>/g;
        let match;
        let lastMatch = null;
        while ((match = regex.exec(msg.content)) !== null) {
          lastMatch = match;
        }
        if (lastMatch) {
          foundPatch = {
            id: `patch`,
            original: lastMatch[1].replace(/^\n/, ""),
            modified: lastMatch[2].replace(/^\n/, ""),
          };
          break;
        }
      }
    }

    if (!foundPatch) {
      toast.error("No se encontró ningún parche en el último mensaje de la IA");
      return;
    }

    // Apply patch logic to fileContent
    try {
      const newContent = fileContent.replace(foundPatch.original, foundPatch.modified);
      if (newContent === fileContent) {
        toast.error("El parche no coincide con el contenido actual del archivo");
        return;
      }
      
      // Enter diff mode
      setDiffOriginal(fileContent);
      setDiffModified(newContent);
      setFileContent(newContent);
      setIsDiffMode(true);
      setHasUnsavedChanges(true);
      toast.success("Parche aplicado. Revisa el diff y guarda los cambios.");
    } catch (err) {
      toast.error("Error al aplicar el parche");
    }
  };

  const handleSaveFile = async () => {
    if (!projectId || !activeFilePath) return;
    try {
      await saveFileContent(projectId, activeFilePath, fileContent);
      setOriginalContent(fileContent);
      setHasUnsavedChanges(false);
      setIsDiffMode(false);
      toast.success("Archivo guardado exitosamente");
    } catch (error) {
      console.error(error);
      toast.error("Error al guardar el archivo");
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setFileContent(value);
      setHasUnsavedChanges(value !== originalContent);
    }
  };

  const openNewFile = () => {
    if (newFilePathInput.trim()) {
      const path = newFilePathInput.trim();
      if (!openFiles.includes(path)) {
        setOpenFiles([...openFiles, path]);
      }
      setActiveFilePath(path);
      setShowOpenFileModal(false);
      setNewFilePathInput("");
    }
  };

  const activeModeConfig = useMemo(() => MODES.find((m) => m.id === executionMode) || MODES[0], [executionMode]);

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950 text-zinc-200 overflow-hidden font-sans relative">
      {/* Header / Sub-bar */}
      <div className="h-12 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span className="text-sm font-semibold text-zinc-200">Quirófano (Execution Room)</span>
          </div>
          {ticket && (
            <>
              <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded border border-zinc-700 font-mono truncate max-w-xs">
                🎯 {ticket.title}
              </span>
              <span className="text-xs text-emerald-400 px-2 py-0.5 rounded bg-emerald-950/30 border border-emerald-900/50">
                🌿 Rama: {ticket.branch_name || 'main'}
              </span>
            </>
          )}
        </div>

        {/* Actions & Triage */}
        <div className="flex items-center gap-3">
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

      {/* Main Workspace: Split View */}
      <div className="flex-1 overflow-hidden">
        <Group orientation="horizontal">
          
          {/* Left Panel: Instruments / AI Chat */}
          <Panel defaultSize={35} minSize={25}>
            <div className="h-full bg-[#121212] flex flex-col border-r border-zinc-800">
              
              {/* Whiteboard Actions Top Bar */}
              {executionMode === "exec_mode_whiteboard" && (
                <div className="p-3 bg-zinc-900/50 border-b border-zinc-800 flex flex-wrap gap-2">
                  <button
                    onClick={copyStructuredPrompt}
                    disabled={!projectContextMd}
                    className={`flex-1 flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors ${
                      projectContextMd 
                        ? 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700' 
                        : 'bg-zinc-900 border-zinc-800 text-zinc-500 cursor-not-allowed'
                    }`}
                  >
                    <ClipboardCopy className="w-3.5 h-3.5" />
                    {projectContextMd ? "Copiar Prompt con Contexto" : "Cargando contexto del proyecto..."}
                  </button>
                  <button
                    onClick={() => setShowPlanInput(true)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-md border border-zinc-700 transition-colors"
                  >
                    <FileInput className="w-3.5 h-3.5" />
                    Inyectar Plan Externo
                  </button>
                </div>
              )}

              {/* Chat Area */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-lg max-w-[95%] text-xs leading-relaxed ${
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
              <div className="p-3 bg-zinc-900 border-t border-zinc-800 shrink-0">
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                    placeholder={`Consulta rápida a la IA...`}
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
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </Panel>
          
          <Separator className="w-1 bg-zinc-800 hover:bg-blue-500 transition-colors cursor-col-resize" />
          
          {/* Right Panel: Code Editor */}
          <Panel defaultSize={65} minSize={30}>
            <div className="h-full flex flex-col bg-[#1e1e1e]">
              
              {/* Tabs Bar */}
              <div className="flex items-center bg-zinc-900 border-b border-zinc-800 overflow-x-auto custom-scrollbar shrink-0">
                {openFiles.map((file) => (
                  <button
                    key={file}
                    onClick={() => setActiveFilePath(file)}
                    className={`flex items-center gap-2 px-4 py-2 text-xs border-r border-zinc-800 transition-colors ${
                      activeFilePath === file
                        ? "bg-[#1e1e1e] text-blue-400 border-t-2 border-t-blue-500"
                        : "bg-zinc-900 text-zinc-500 hover:bg-zinc-800 border-t-2 border-t-transparent"
                    }`}
                  >
                    <FileCode2 className="w-3.5 h-3.5" />
                    <span className="truncate max-w-[200px]">{file.split('/').pop()}</span>
                    {hasUnsavedChanges && activeFilePath === file && (
                      <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                    )}
                  </button>
                ))}
                <button
                  onClick={() => setShowOpenFileModal(true)}
                  className="flex items-center gap-1 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Abrir Archivo
                </button>
              </div>

              {/* Editor Workspace */}
              <div className="flex-1 relative">
                {!activeFilePath ? (
                  <div className="absolute inset-0 flex items-center justify-center text-zinc-500 flex-col gap-3 p-6 text-center">
                    <FileCode2 className="w-10 h-10 opacity-30" />
                    <p className="text-xs">Selecciona o abre un archivo para comenzar a editar.</p>
                  </div>
                ) : isDiffMode ? (
                  <DiffEditor
                    original={diffOriginal}
                    modified={diffModified}
                    theme="vs-dark"
                    options={{
                      renderSideBySide: true,
                      minimap: { enabled: false },
                      wordWrap: "on",
                      readOnly: true,
                    }}
                  />
                ) : (
                  <Editor
                    path={activeFilePath}
                    value={fileContent}
                    theme="vs-dark"
                    onChange={handleEditorChange}
                    options={{
                      minimap: { enabled: false },
                      wordWrap: "on",
                      scrollBeyondLastLine: false,
                      fontSize: 13,
                    }}
                  />
                )}
              </div>

              {/* Editor Actions Bottom Bar */}
              <div className="h-12 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between px-4 shrink-0">
                <div className="text-xs text-zinc-500 font-mono truncate max-w-md">
                  {activeFilePath || "Ningún archivo activo"}
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (isDiffMode) {
                        setIsDiffMode(false);
                      } else {
                        setDiffOriginal(originalContent);
                        setDiffModified(fileContent);
                        setIsDiffMode(true);
                      }
                    }}
                    disabled={!activeFilePath}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 rounded border border-zinc-700 text-xs font-semibold transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {isDiffMode ? "Ocultar Diff" : "Ver Diff"}
                  </button>
                  
                  <button
                    onClick={applyIAPatchToEditor}
                    disabled={!activeFilePath}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-950/60 hover:bg-yellow-900/80 text-yellow-400 disabled:opacity-50 rounded border border-yellow-800/60 text-xs font-semibold transition-colors"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Aplicar Parche IA
                  </button>

                  <button
                    onClick={handleSaveFile}
                    disabled={!hasUnsavedChanges || !activeFilePath}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900/50 disabled:text-blue-400/50 text-white rounded text-xs font-semibold transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Guardar
                  </button>
                </div>
              </div>

            </div>
          </Panel>
        </Group>
      </div>

      {/* Open File Modal */}
      {showOpenFileModal && (
        <div className="absolute inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-[#18181b] border border-[#3f3f46] w-full max-w-md rounded-xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-zinc-800">
              <h3 className="text-lg font-bold text-zinc-100">Abrir Archivo</h3>
            </div>
            <div className="p-4 flex-1">
              <input
                type="text"
                autoFocus
                className="w-full bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 p-3 rounded focus:outline-none focus:border-blue-500"
                placeholder="Ruta del archivo (ej. src/main.tsx)..."
                value={newFilePathInput}
                onChange={(e) => setNewFilePathInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && openNewFile()}
              />
            </div>
            <div className="p-4 bg-zinc-900/80 border-t border-zinc-800 flex justify-end gap-2">
              <button
                onClick={() => setShowOpenFileModal(false)}
                className="text-zinc-400 hover:text-white px-4 py-2 rounded text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={openNewFile}
                disabled={!newFilePathInput.trim()}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded transition-colors"
              >
                Abrir
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Inyectar Plan Modal */}
      {showPlanInput && (
        <div className="absolute inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-[#18181b] border border-[#3f3f46] w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-4 border-b border-zinc-800">
              <h3 className="text-lg font-bold text-zinc-100">Inyectar Plan Externo</h3>
            </div>
            <div className="p-4 flex-1">
              <textarea
                className="w-full h-64 bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 p-3 rounded custom-scrollbar focus:outline-none focus:border-blue-500"
                placeholder="Pega aquí la respuesta de Claude / ChatGPT..."
                value={externalPlan}
                onChange={(e) => setExternalPlan(e.target.value)}
              />
            </div>
            <div className="p-4 bg-zinc-900/80 border-t border-zinc-800 flex justify-end gap-2">
              <button
                onClick={() => setShowPlanInput(false)}
                className="text-zinc-400 hover:text-white px-4 py-2 rounded text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (externalPlan.trim()) {
                    setMessages(prev => [...prev, { role: "assistant", content: `**[Plan Inyectado]**\n\n${externalPlan}` }]);
                    setShowPlanInput(false);
                    setExternalPlan("");
                    toast.success("Plan inyectado al contexto local");
                  }
                }}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded transition-colors"
              >
                Inyectar y Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
