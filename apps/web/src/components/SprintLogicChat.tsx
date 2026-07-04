import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import { KeyRound, Cpu, Send, Loader2, ChevronDown, Terminal } from "lucide-react";
import { useLLMConfigStore } from "@/store/llmConfigStore";
import { sendChatMessage, ChatMessage, API_BASE_URL } from "@/lib/api";
import { cn } from "@/lib/utils";

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
  const activeModel = useMemo(() => asValidModel(defaultModel), [defaultModel]);
  const [sessionModel, setSessionModel] = useState<string | null>(null);

  const currentModel = sessionModel ?? activeModel;

  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hola, soy SprintLogic AI. ¿En qué te ayudo hoy?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState<{ completion_tokens?: number; total_tokens?: number } | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [modelGroups, setModelGroups] = useState<{
    provider: string; provider_id?: string; label?: string; models: { id: string; name: string }[];
  }[]>([]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/ai/models`)
      .then(res => res.json())
      .then(data => setModelGroups(data))
      .catch(() => {});
  }, []);

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
          <Cpu className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-semibold text-zinc-300">SprintLogic AI</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-zinc-800/60 border border-zinc-700/50 flex items-center justify-center">
              <KeyRound className="w-6 h-6 text-zinc-400" />
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

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || !currentModel) return;

    const newMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];
    setMessages(newMessages);
    setInput("");
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
    <div className="flex flex-col h-full bg-[#0f0f0f] text-zinc-200">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800/50 bg-[#0a0a0a] shrink-0">
        <Cpu className="w-4 h-4 text-blue-400" />
        <span className="text-xs font-semibold text-zinc-300">SprintLogic AI</span>
        <div className="flex-1" />
        <div className="relative">
          <button
            onClick={() => setModelMenuOpen(!modelMenuOpen)}
            className="flex items-center gap-1 text-[10px] bg-zinc-800/40 border border-zinc-700/30 rounded px-2 py-0.5 text-zinc-400 hover:bg-zinc-700/40 transition-colors"
          >
            {currentModel ? currentModel.split("/").pop() : "default"}
            <ChevronDown className="w-3 h-3" />
          </button>
          {modelMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setModelMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-zinc-800 border border-zinc-700/50 rounded-lg shadow-xl overflow-hidden">
                {modelGroups.length === 0 ? (
                  <div className="px-3 py-2 text-[11px] text-zinc-500 text-center italic cursor-not-allowed">
                    Configura una API Key en Ajustes
                  </div>
                ) : (
                  modelGroups.map((group) => (
                    <div key={group.provider}>
                      <div className="px-3 py-1 text-[9px] font-semibold text-zinc-500 uppercase tracking-wider bg-zinc-800/50">
                        {group.label || group.provider}
                      </div>
                    {group.models.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setSessionModel(m.id);
                          setModelMenuOpen(false);
                        }}
                        className={cn(
                          "w-full text-left px-3 py-1.5 text-[11px] transition-colors",
                          currentModel === m.id
                            ? "bg-blue-500/10 text-blue-300"
                            : "text-zinc-300 hover:bg-zinc-700"
                        )}
                      >
                        {m.name}
                      </button>
                    ))}
                  </div>
                )))}
                {sessionModel && (
                  <button
                    onClick={() => {
                      setSessionModel(null);
                      setModelMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-500 hover:bg-zinc-700 border-t border-zinc-700/50"
                  >
                    Usar predeterminado
                  </button>
                )}
              </div>
            </>
          )}
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
            <Loader2 className="w-3 h-3 animate-spin" />
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
                  <Terminal className="w-3 h-3 shrink-0" />
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
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="/ para comandos…"
              className="flex-1 bg-transparent text-xs text-zinc-200 placeholder-zinc-500 outline-none"
            />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="text-zinc-400 hover:text-white disabled:opacity-30 shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
