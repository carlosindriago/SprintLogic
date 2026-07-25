"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, Send, Download, Play, Check } from "lucide-react";
import { DiffEditor } from "@monaco-editor/react";
import { useProjectStore } from "@/store/projectStore";
import ReactMarkdown from "react-markdown";
import { applyPatch, getProjectTasks } from "@/lib/api";
import { toast } from "sonner";
import { Task } from "@/types";
import { API_BASE_URL } from "@/lib/api";

interface DiffBlock {
  id: string;
  original: string;
  modified: string;
}

function ExecutionRoomContent() {
  const searchParams = useSearchParams();
  const ticketId = searchParams.get("ticketId");
  const router = useRouter();
  const projectId = useProjectStore((s) => s.projectId);

  const [ticket, setTicket] = useState<Task | null>(null);
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [diffBlocks, setDiffBlocks] = useState<DiffBlock[]>([]);
  const [activeDiff, setActiveDiff] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!projectId) {
      toast.error("No hay proyecto activo");
      router.push("/");
      return;
    }
    const loadTicket = async () => {
      try {
        const data = await getProjectTasks(projectId);
        const task = data.tasks.find((t) => t.id === ticketId);
        if (task) {
          setTicket(task);
          setMessages([
            { role: "assistant", content: `Hola, soy tu Execution Agent. Estoy listo para resolver la tarea:\n\n**${task.content}**\n\n¿En qué archivo empezamos a trabajar?` }
          ]);
        }
      } catch (err) {
        console.error("Failed to load ticket", err);
      }
    };
    loadTicket();
  }, [projectId, ticketId, router]);

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
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/execute_agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: ticketId, prompt: userMsg, history: messages }),
      });

      if (!res.ok) {
        throw new Error("Failed to communicate with agent");
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
            const newMessages = [...prev];
            newMessages[newMessages.length - 1].content = assistantMsg;
            return newMessages;
          });
        }
      }

      const blocks = extractDiffBlocks(assistantMsg);
      if (blocks.length > 0) {
        setDiffBlocks((prev) => [...prev, ...blocks]);
        setActiveDiff(blocks[0].id);
      }
    } catch (err) {
      toast.error("Error al comunicarse con el agente");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyPatch = async (block: DiffBlock) => {
    if (!projectId) return;
    try {
      // Simplification: the backend needs to know WHICH file. 
      // For now, we assume the AI includes the file path right before the block or we pass a generic request.
      // In a real scenario, the file path would be parsed from the markdown.
      // Since the prompt instructs to just call `apply_patch`, we'll pass the ticket's affected_nodes[0] if available, 
      // or prompt the user, or let the backend figure it out.
      const targetFile = ticket?.affected_nodes?.[0] || "unknown"; 

      await applyPatch(projectId, targetFile, block.original, block.modified);
      toast.success("Parche aplicado exitosamente");
      // Remove the applied block from the UI
      setDiffBlocks(prev => prev.filter(b => b.id !== block.id));
      if (activeDiff === block.id) setActiveDiff(null);
    } catch (err) {
      toast.error("Fallo al aplicar el parche");
      console.error(err);
    }
  };

  const currentDiff = diffBlocks.find(b => b.id === activeDiff);

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-200 overflow-hidden font-sans">
      {/* Header */}
      <div className="h-14 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors bg-zinc-800/50 hover:bg-zinc-800 px-3 py-1.5 rounded-md"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al Kanban
          </button>
          <div className="h-4 w-px bg-zinc-700 mx-2"></div>
          <div className="flex flex-col">
            <span className="text-xs text-zinc-500">Execution Room</span>
            <span className="text-sm font-semibold truncate max-w-md" title={ticket?.content}>
              {ticket?.id} - {ticket?.content.split('\n')[0]}
            </span>
          </div>
        </div>
      </div>

      {/* Split Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat Left Pane */}
        <div className="w-1/3 min-w-[350px] border-r border-zinc-800 bg-[#121212] flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg max-w-[90%] text-sm ${
                  msg.role === "user"
                    ? "bg-blue-900/30 text-blue-100 border border-blue-800/50 self-end"
                    : "bg-zinc-900 text-zinc-300 border border-zinc-800 self-start"
                }`}
              >
                <div className="font-semibold text-xs mb-1 opacity-50 uppercase tracking-wider">
                  {msg.role === "user" ? "Tú" : "Agente IA"}
                </div>
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="text-xs text-zinc-500 animate-pulse flex items-center gap-2 self-start p-3">
                <Play className="w-3 h-3 animate-spin" /> Escribiendo...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          {/* Chat Input */}
          <div className="p-4 bg-zinc-900 border-t border-zinc-800">
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                placeholder="Indica al agente qué hacer..."
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
                className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-md transition-colors disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Diff Right Pane */}
        <div className="flex-1 bg-[#1e1e1e] flex flex-col overflow-hidden relative">
          {diffBlocks.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-zinc-500 flex-col gap-3">
              <Download className="w-8 h-8 opacity-50" />
              <p>Los parches de código propuestos aparecerán aquí</p>
            </div>
          ) : (
            <>
              {/* Diff Tabs / Controls */}
              <div className="h-12 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4 shrink-0">
                <div className="flex gap-2 overflow-x-auto custom-scrollbar">
                  {diffBlocks.map((b, idx) => (
                    <button
                      key={b.id}
                      onClick={() => setActiveDiff(b.id)}
                      className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
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
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-900/40 text-green-400 hover:bg-green-900/60 border border-green-800/50 rounded-md text-xs font-semibold transition-colors"
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
    </div>
  );
}

export default function ExecutionRoomPage() {
  return (
    <Suspense fallback={<div className="h-screen w-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Cargando...</div>}>
      <ExecutionRoomContent />
    </Suspense>
  );
}
