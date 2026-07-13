import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import { KeyRound, Cpu, Send, Loader2, Terminal } from "lucide-react";
import { useLLMConfigStore } from "@/store/llmConfigStore";
import { useChatStore } from "@/store/chatStore";
import DraftReviewer from "./DraftReviewer";
import { API_BASE_URL } from "@/lib/api";
import { cn } from "@/lib/utils";
import { MarkdownLink } from "./MarkdownLink";

interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  isError?: boolean;
  tool_call_id?: string;
  name?: string;
}

interface SprintLogicChatProps {
  projectId: string | null;
  onOpenSettings?: () => void;
}

function asValidModel(model: string): string | null {
  const trimmed = model.trim();
  if (!trimmed || !trimmed.includes("/")) return null;
  return trimmed;
}

export default function SprintLogicChat({ projectId, onOpenSettings }: SprintLogicChatProps) {
  const defaultModel = useLLMConfigStore((s) => s.defaultModel);
  const setDefaultModel = useLLMConfigStore((s) => s.setDefaultModel);
  const activeModel = useMemo(() => asValidModel(defaultModel), [defaultModel]);
  const { isDraftMode, setDraftMode, draftPayload, clearDraftMode } = useChatStore();
  const [sessionModel, setSessionModel] = useState<string | null>(null);

  const currentModel = sessionModel ?? activeModel;

  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hola, soy SprintLogic AI. ¿En qué te ayudo hoy?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState<{ completion_tokens?: number; total_tokens?: number } | null>(null);
  const [availableModels, setAvailableModels] = useState<{
    provider: string;
    provider_id: string;
    is_configured: boolean;
    models: { id: string; name: string }[];
  }[]>([]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/ai/models`)
      .then(res => res.json())
      .then(data => setAvailableModels(data))
      .catch(() => {});
  }, []);

  const configuredGroups = useMemo(
    () => availableModels.filter((g) => g.is_configured),
    [availableModels],
  );

  const SLASH_COMMANDS = [
    { command: '/explain', description: 'Explica el archivo o código actual', prompt: 'Explica qué hace este archivo y su rol en la arquitectura del proyecto.' },
    { command: '/architecture', description: 'Resume la arquitectura del proyecto', prompt: 'Hazme un resumen de la arquitectura de este proyecto.' },
    { command: '/improve', description: 'Sugiere mejoras en el código', prompt: 'Analiza este código y sugiere mejoras concretas de rendimiento, legibilidad y mantenibilidad.' },
    { command: '/review', description: 'Revisa el código en busca de bugs', prompt: 'Revisa este código en busca de posibles bugs, edge cases no manejados y vulnerabilidades de seguridad.' },
    { command: '/test', description: 'Sugiere casos de prueba', prompt: 'Sugiere casos de prueba unitarios y de integración para este código.' },
    { command: '/docs', description: 'Genera documentación', prompt: 'Genera documentación concisa para este código: qué hace, parámetros, valores de retorno y ejemplo de uso.' },
  ];

  const [slashMenu, setSlashMenu] = useState<{ open: boolean; selectedIndex: number; filtered: typeof SLASH_COMMANDS }>({
    open: false, selectedIndex: 0, filtered: SLASH_COMMANDS,
  });



  if (!activeModel) {
    return (
      <div className="flex flex-col h-full bg-[#0f0f0f] text-zinc-200">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800/50 bg-[#0a0a0a] shrink-0">
          <Cpu className="w-4 h-4 text-blue-400" aria-hidden="true" />
          <span className="text-xs font-semibold text-zinc-300">SprintLogic AI</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-zinc-800/60 border border-zinc-700/50 flex items-center justify-center">
              <KeyRound className="w-6 h-6 text-zinc-400" aria-hidden="true" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-400">Configura un proveedor de IA</h3>
            <p className="text-xs text-zinc-500 max-w-[240px] leading-relaxed">
              Para chatear con SprintLogic AI necesitas definir tu modelo
              predeterminado y guardar una API Key en IA & Modelos.
            </p>
            {onOpenSettings && (
              <Button
                type="button"
                size="sm"
                onClick={onOpenSettings}
                className="bg-blue-600 hover:bg-blue-700 text-xs h-8 mt-1"
              >
                Abrir ajustes de IA
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const sendMessage = async (overrideMessage?: ChatMessage) => {
    const trimmed = input.trim();
    
    // Feedback loop rejection
    if (!overrideMessage && isDraftMode && draftPayload) {
      if (!trimmed) return;
      const rejectPayload: ChatMessage = {
        role: "tool",
        tool_call_id: draftPayload.tool_call_id,
        name: draftPayload.type === 'task' ? 'generate_task_spec' : 'generate_adr',
        content: `El usuario rechazó el borrador con este comentario: ${trimmed}. Genera una nueva versión.`
      };
      clearDraftMode();
      setInput("");
      return sendMessage(rejectPayload);
    }

    if (!trimmed && !overrideMessage) return;
    if (!currentModel) return;

    const newMessages: ChatMessage[] = overrideMessage ? [
      ...messages,
      overrideMessage
    ] : [
      ...messages,
      { role: "user", content: trimmed },
    ];
    setMessages(newMessages);
    if (!overrideMessage) setInput("");
    setLoading(true);
    setUsage(null);

    try {
      const res = await fetch(`${API_BASE_URL}/chat/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          model: currentModel,
          project_id: projectId,
        }),
      });
      if (!res.ok) throw new Error("Chat request failed");
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let buffer = "";
      let streamedText = "";
      let isError = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.error) isError = true;
              if (parsed.text !== undefined) {
                streamedText = parsed.text;
                
                if (streamedText.startsWith("__DRAFT_PROPOSAL__:")) {
                  try {
                    const jsonStr = streamedText.replace("__DRAFT_PROPOSAL__:", "");
                    const payload = JSON.parse(jsonStr);
                    setDraftMode(payload);
                    setMessages((prev) => {
                      const next = [...prev];
                      const last = next[next.length - 1];
                      const msg: ChatMessage = { role: "assistant", content: `Generando borrador de ${payload.type === 'task' ? 'especificación' : 'ADR'}... Esperando revisión del usuario.` };
                      if (last?.role === "assistant") {
                        next[next.length - 1] = msg;
                      } else {
                        next.push(msg);
                      }
                      return next;
                    });
                  } catch (e) {
                    console.error("Failed to parse draft proposal", e);
                  }
                  continue; // Skip rendering raw JSON
                }

                setMessages((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.role === "assistant") {
                     next[next.length - 1] = { ...last, content: streamedText, isError };
                  } else {
                     next.push({ role: "assistant", content: streamedText, isError });
                  }
                  return next;
                });
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [...prev, { role: "system", content: "Hubo un error al procesar el mensaje. Por favor intenta de nuevo." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (val: string) => {
    setInput(val);
    if (val.startsWith('/') && !val.includes(' ')) {
      const term = val.slice(1).toLowerCase();
      const filtered = SLASH_COMMANDS.filter(c => c.command.slice(1).startsWith(term));
      setSlashMenu({ open: true, selectedIndex: 0, filtered });
    } else {
      setSlashMenu(prev => prev.open ? { ...prev, open: false } : prev);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (slashMenu.open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashMenu(prev => ({
          ...prev,
          selectedIndex: Math.min(prev.selectedIndex + 1, prev.filtered.length - 1),
        }));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashMenu(prev => ({
          ...prev,
          selectedIndex: Math.max(prev.selectedIndex - 1, 0),
        }));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = slashMenu.filtered[slashMenu.selectedIndex];
        if (selected) {
          setInput(selected.command + ' ');
          setSlashMenu(prev => ({ ...prev, open: false }));
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashMenu(prev => ({ ...prev, open: false }));
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex h-full w-full bg-[#0f0f0f] text-zinc-200">
      <div className={`flex flex-col h-full transition-all duration-300 ${isDraftMode ? 'w-[30%] border-r border-zinc-800' : 'w-full'}`}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800/50 bg-[#0a0a0a] shrink-0">
        <Cpu className="w-4 h-4 text-blue-400" aria-hidden="true" />
        <span className="text-xs font-semibold text-zinc-300">SprintLogic AI</span>
        <div className="flex-1" />
        <div className="flex gap-2 relative">
          <div className="relative flex items-center hover:bg-zinc-800 px-2 py-1 rounded transition-colors">
            <Cpu className="w-3 h-3 mr-1 text-zinc-400" aria-hidden="true" />
            <select
              aria-label="Seleccionar modelo de IA"
              value={currentModel || ""}
              onChange={(e) => {
                if (e.target.value === "clear") {
                  setSessionModel(null);
                } else {
                  setDefaultModel(e.target.value);
                  setSessionModel(e.target.value);
                }
              }}
              disabled={configuredGroups.length === 0}
              className="appearance-none bg-transparent border-none text-xs text-zinc-300 focus:outline-none pr-4 cursor-pointer disabled:cursor-not-allowed disabled:text-zinc-500"
            >
              {configuredGroups.length === 0 ? (
                <option disabled value="">Sin Modelos Disponibles</option>
              ) : (
                <>
                  <option disabled value="">Seleccionar Modelo</option>
                  {configuredGroups.map((group) => (
                    <optgroup key={group.provider_id} label={group.provider}>
                      {group.models.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </optgroup>
                  ))}
                  <option value="clear">Cerrar Sesión de Modelo</option>
                </>
              )}
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              'text-xs leading-relaxed rounded-lg px-3 py-2 max-w-[88%]',
              m.role === 'user'
                ? 'bg-blue-500/10 text-blue-200 self-end'
                : m.role === 'system'
                ? 'bg-red-900/20 text-red-200 border border-red-800/30 self-start'
                : m.isError
                ? "bg-orange-900/20 text-orange-200 border border-orange-800/30 self-start"
                : 'bg-zinc-800/50 text-zinc-300 self-start'
            )}
          >
            {m.role === 'assistant' ? (
              <ReactMarkdown
                components={{
                  a: MarkdownLink,
                  code: ({ children }) => (
                    <code className="bg-zinc-900 px-1 py-0.5 rounded text-[11px] text-blue-300 font-mono">
                      {children}
                    </code>
                  ),
                  pre: ({ children }) => (
                    <pre className="bg-zinc-900 p-2 rounded text-[11px] text-zinc-300 overflow-x-auto my-1">
                      {children}
                    </pre>
                  ),
                }}
              >
                {m.content}
              </ReactMarkdown>
            ) : (
              <div className="whitespace-pre-wrap">{m.content}</div>
            )}
          </div>
        ))}

        {loading && (
          <div className="self-start flex items-center gap-2 text-xs text-zinc-500 px-3 py-2">
            <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
            SprintLogic AI está pensando...
          </div>
        )}

        {usage && !loading && (
          <div className="self-start text-[10px] text-zinc-600 px-3">
            ⚡ {usage.completion_tokens} / {usage.total_tokens} tokens
          </div>
        )}
      </div>

      <div className="border-t border-zinc-800/50 p-2 shrink-0">
        <div className="relative">
          {slashMenu.open && slashMenu.filtered.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-zinc-800 border border-zinc-700/50 rounded-lg shadow-xl overflow-hidden z-50">
              {slashMenu.filtered.map((cmd, i) => (
                <div
                  key={cmd.command}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors",
                    i === slashMenu.selectedIndex
                      ? "bg-blue-500/10 text-blue-300"
                      : "text-zinc-400 hover:bg-zinc-700/50"
                  )}
                  onMouseEnter={() => setSlashMenu(prev => ({ ...prev, selectedIndex: i }))}
                  onClick={() => {
                    setInput(cmd.command + ' ');
                    setSlashMenu(prev => ({ ...prev, open: false }));
                  }}
                >
                  <Terminal className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[11px] font-medium">{cmd.command}</span>
                    <span className="text-[10px] text-zinc-500 truncate">{cmd.description}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 bg-zinc-900 rounded-lg px-3 py-1.5">
            <input
              type="text"
              aria-label="Mensaje para SprintLogic AI"
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="/ para comandos…"
              className="flex-1 bg-transparent text-xs text-zinc-200 placeholder-zinc-500 outline-none"
            />
          <button
            aria-label="Enviar mensaje"
            onClick={() => sendMessage()}
            disabled={loading || !input.trim() || !currentModel}
            title={currentModel ? "Enviar mensaje" : "Seleccioná un modelo para enviar mensajes"}
            className="text-zinc-400 hover:text-white disabled:opacity-30 shrink-0"
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
        </div>
      </div>
      </div>
      {isDraftMode && (
        <div className="w-[70%] h-full flex flex-col bg-[#1e1e1e]">
          <DraftReviewer onSubmitResponse={(msg) => sendMessage(JSON.parse(msg))} />
        </div>
      )}
    </div>
  );
}
