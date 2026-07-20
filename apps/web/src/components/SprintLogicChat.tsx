import { useState, useMemo, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import { KeyRound, Cpu, Send, Loader2, Terminal, GraduationCap, X, Plus, History } from "lucide-react";
import { useLLMConfigStore } from "@/store/llmConfigStore";
import { useChatStore } from "@/store/chatStore";
import { useSenseiStore } from "@/store/senseiStore";
import { useTabsStore } from "@/store/tabsStore";
import DraftReviewer from "./DraftReviewer";
import ProposalCard from "./ProposalCard";
import ChatHistoryDrawer from "./ChatHistoryDrawer";
import { API_BASE_URL } from "@/lib/api";
import { cn } from "@/lib/utils";
import { MarkdownLink } from "./MarkdownLink";

interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  isError?: boolean;
  tool_call_id?: string;
  name?: string;
  /** True when this message belongs to a Sensei interaction. */
  isSensei?: boolean;
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
  const { isDraftMode, setDraftMode, draftPayload, clearDraftMode, activeConversationId, setActiveConversationId } = useChatStore();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // ── Sensei store (single source of truth for editor context) ──────────────
  const isSenseiMode = useSenseiStore((s) => s.isSenseiMode);
  const anchoredContext = useSenseiStore((s) => s.anchoredContext);
  const activeTabId = useSenseiStore((s) => s.activeTabId);
  const editorContextByTabId = useSenseiStore((s) => s.editorContextByTabId);
  const activateSensei = useSenseiStore((s) => s.activateSensei);
  const deactivateSensei = useSenseiStore((s) => s.deactivateSensei);

  const [sessionModel, setSessionModel] = useState<string | null>(null);

  const currentModel = sessionModel ?? activeModel;

  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hola, soy SprintLogic AI. ¿En qué te ayudo hoy?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState<{ completion_tokens?: number; total_tokens?: number } | null>(null);
  const [proposals, setProposals] = useState<
    { id: string; filePath: string; description: string; diff: string }[]
  >([]);
  const [availableModels, setAvailableModels] = useState<{
    provider: string;
    provider_id: string;
    is_configured: boolean;
    models: { id: string; name: string }[];
  }[]>([]);

  // Referencia para limpiar el intervalo del "Manual Clutch" si el componente se desmonta
  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Smart Auto-Scroll Refs
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setIsAtBottom(distanceFromBottom < 50);
  };

  useEffect(() => {
    if (isAtBottom && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "auto" });
    }
  }, [messages, isAtBottom, proposals, loading]);

  useEffect(() => {
    return () => {
      // Limpiamos la memoria al desmontar para evitar el memory leak
      if (flushIntervalRef.current) clearInterval(flushIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (activeConversationId && projectId) {
      setLoading(true);
      fetch(`${API_BASE_URL}/chat/conversations/messages/${activeConversationId}`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            const historyMsgs = data.map(m => ({
              role: m.role,
              content: m.content
            }));
            setMessages(historyMsgs.length > 0 ? historyMsgs : [
              { role: "assistant", content: "Hola, soy SprintLogic AI. ¿En qué te ayudo hoy?" }
            ]);
          }
        })
        .catch(err => console.error("Error loading chat history:", err))
        .finally(() => setLoading(false));
    } else {
      setMessages([{ role: "assistant", content: "Hola, soy SprintLogic AI. ¿En qué te ayudo hoy?" }]);
    }
  }, [activeConversationId, projectId]);

  const handleNewChat = () => {
    setActiveConversationId(null);
    setMessages([{ role: "assistant", content: "Hola, soy SprintLogic AI. ¿En qué te ayudo hoy?" }]);
  };

  const apiKeys = useLLMConfigStore((s) => s.apiKeys);

  useEffect(() => {
    fetch(`${API_BASE_URL}/ai/models`)
      .then(res => res.json())
      .then(data => {
        setAvailableModels(data);
        // Hydrate active model if none is selected and there are configured models
        if (!activeModel && Array.isArray(data)) {
          const firstConfigured = data.find((g: any) => g.is_configured);
          if (firstConfigured && firstConfigured.models && firstConfigured.models.length > 0) {
            const defaultId = firstConfigured.models[0].id;
            setDefaultModel(defaultId);
            setSessionModel(defaultId);
          }
        }
      })
      .catch(() => {});
  }, [apiKeys, activeModel, setDefaultModel]);

  const configuredGroups = useMemo(
    () => availableModels.filter((g) => g.is_configured),
    [availableModels],
  );

  const SLASH_COMMANDS = [
    { command: '/sensei', description: '🎓 Invoca al mentor socrático sobre el código activo', prompt: '' },
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

    // ── /sensei command interception ────────────────────────────────────────
    const isSenseiCommand = !overrideMessage && trimmed.toLowerCase().startsWith('/sensei');
    const senseiQuery = isSenseiCommand
      ? trimmed.slice('/sensei'.length).trim()
      : '';

    if (isSenseiCommand && !senseiQuery) {
      // Bare /sensei with no query: freeze the context now and prompt the user to type
      activateSensei();
      setInput('/sensei ');
      return;
    }

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

    // Determine if this turn is Sensei-mode and resolve the context to send
    const isThisSensei = isSenseiCommand || (isSenseiMode && !!anchoredContext);

    // Context resolution (pure Zustand — no DOM events):
    //   - If this is a fresh /sensei invocation: freeze the live registry right now.
    //   - If we’re in an ongoing Sensei session: use the already-anchored context.
    //   - If neither: no context (e.g., /sensei <query> from an empty editor).
    let editorContext = anchoredContext;
    if (isSenseiCommand) {
      // activateSensei() already froze the context when the bare /sensei was sent;
      // if the user typed /sensei <query> directly, freeze now.
      if (!isSenseiMode) activateSensei();
      const liveCtx = activeTabId ? (editorContextByTabId[activeTabId] ?? null) : null;
      editorContext = useSenseiStore.getState().anchoredContext ?? liveCtx;
    }
    
    // Inject open tabs into editorContext (create one if null)
    const activeTabs = useTabsStore.getState().tabs;
    const openTabsList = activeTabs
      .map(t => t.data?.filePath || t.title)
      .filter((v, i, a) => v && a.indexOf(v) === i); // Unique names
      
    let apiEditorContext: Record<string, any> | undefined = undefined;
    
    if (editorContext) {
      apiEditorContext = { 
        file_path: editorContext.filePath, 
        cursor_line: editorContext.cursorLine, 
        active_code: editorContext.activeCode, 
        open_tabs: openTabsList 
      };
    } else if (openTabsList.length > 0) {
      apiEditorContext = { 
        file_path: "", 
        cursor_line: 1, 
        active_code: "", 
        open_tabs: openTabsList 
      };
    }

    const displayContent = isSenseiCommand ? senseiQuery : trimmed;

    const newMessages: ChatMessage[] = overrideMessage
      ? [...messages, overrideMessage]
      : [...messages, { role: "user", content: displayContent, isSensei: isThisSensei }];

    setMessages(newMessages);
    if (!overrideMessage) setInput("");
    setLoading(true);
    setUsage(null);

    try {
      const socket = useSenseiStore.getState().socket;
      if (isThisSensei && socket && socket.readyState === WebSocket.OPEN) {
        const messageId = Math.random().toString(36).substring(7);
        let isDone = false;

        // El Buffer Silencioso (La mutación que no dispara React ni presiona al GC)
        let bufferedText = "";
        
        // El Latido del Corazón (El embrague manual)
        if (flushIntervalRef.current) clearInterval(flushIntervalRef.current);
        flushIntervalRef.current = setInterval(() => {
          if (bufferedText) {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === "assistant") {
                next[next.length - 1] = { ...last, content: bufferedText };
              } else {
                next.push({ role: "assistant", content: bufferedText, isSensei: true });
              }
              return next;
            });
          }
          if (isDone && flushIntervalRef.current) {
            clearInterval(flushIntervalRef.current);
            flushIntervalRef.current = null;
          }
        }, 100);

        const removeListener = useSenseiStore.getState().addSocketListener((data) => {
          if (data.type === 'chat_chunk' && data.message_id === messageId) {
            // Llenamos el embudo sin despertar a React
            bufferedText = data.text;
            
            if (data.is_done) {
              isDone = true;
              removeListener();
              setLoading(false);
              
              if (data.conversation_id && !activeConversationId) {
                setActiveConversationId(data.conversation_id);
              }
              
              // Flush Final (El antídoto para el Token Fantasma)
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant") {
                  next[next.length - 1] = { ...last, content: bufferedText, isError: data.error };
                } else {
                  next.push({ role: "assistant", content: bufferedText, isError: data.error, isSensei: true });
                }
                return next;
              });
            }
          }
        });

        socket.send(JSON.stringify({
          type: 'chat_request',
          messages: newMessages,
          model: currentModel,
          project_id: projectId,
          message_id: messageId,
          cursor_line: editorContext?.cursorLine || 1,
          open_tabs: openTabsList,
          editor_context: apiEditorContext,
          conversation_id: activeConversationId || undefined
        }));
        
        return; // Skip HTTP fallback
      }

      const res = await fetch(`${API_BASE_URL}/chat/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          model: currentModel,
          project_id: projectId,
          is_sensei: isThisSensei,
          editor_context: apiEditorContext,
          conversation_id: activeConversationId || undefined
        }),
      });
      if (!res.ok) throw new Error("Chat request failed");
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let buffer = "";
      const streamBuffer = { text: "", isError: false };

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

              if (parsed.type === "code_proposal") {
                setProposals((prev) => [
                  ...prev,
                  {
                    id: parsed.id,
                    filePath: parsed.file_path,
                    description: parsed.description,
                    diff: parsed.diff,
                  },
                ]);
                continue;
              }

              // Skip non-content events (agent_state, tool_call, tool_result, etc.)
              if (parsed.type && parsed.type !== "message_chunk" && !parsed.is_done && !parsed.error) {
                continue;
              }

              // eslint-disable-next-line react-hooks/immutability
              if (parsed.error) streamBuffer.isError = true;

              if (parsed.is_done) {
                // Terminal event: don't touch text, just let the while loop end cleanly
                continue;
              }

              if (parsed.text !== undefined && parsed.text !== "") {
                // Accumulate delta text — backend sends incremental chunks
                // eslint-disable-next-line react-hooks/immutability
                streamBuffer.text += parsed.text;

                if (streamBuffer.text.startsWith("__DRAFT_PROPOSAL__:")) {
                  try {
                    const jsonStr = streamBuffer.text.replace("__DRAFT_PROPOSAL__:", "");
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

                if (parsed.conversation_id && !activeConversationId) {
                  setActiveConversationId(parsed.conversation_id);
                }

                setMessages((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.role === "assistant") {
                    next[next.length - 1] = {
                      ...last,
                      content: streamBuffer.text,
                      isError: streamBuffer.isError,
                      isSensei: isThisSensei,
                    };
                  } else {
                    next.push({
                      role: "assistant",
                      content: streamBuffer.text,
                      isError: streamBuffer.isError,
                      isSensei: isThisSensei,
                    });
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
        {isSenseiMode ? (
          <GraduationCap className="w-4 h-4 text-amber-400" aria-hidden="true" />
        ) : (
          <Cpu className="w-4 h-4 text-blue-400" aria-hidden="true" />
        )}
        <span className={cn('text-xs font-semibold', isSenseiMode ? 'text-amber-300' : 'text-zinc-300')}>
          {isSenseiMode ? 'Modo Sensei' : 'SprintLogic AI'}
        </span>
        {isSenseiMode && anchoredContext && (
          <span className="text-[10px] text-amber-500/70 truncate max-w-[120px]" title={anchoredContext.filePath}>
            {anchoredContext.filePath.split('/').pop()} :{anchoredContext.cursorLine}
          </span>
        )}
        <div className="flex-1" />
        {isSenseiMode && (
          <button
            onClick={deactivateSensei}
            className="p-0.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Desactivar Modo Sensei"
            aria-label="Desactivar Modo Sensei"
          >
            <X className="w-3 h-3" aria-hidden="true" />
          </button>
        )}
        <div className="flex gap-1 relative">
          <button
            onClick={handleNewChat}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Nuevo Chat"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors mr-1"
            title="Historial de Chats"
          >
            <History className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
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
              className="appearance-none bg-transparent border-none text-xs text-zinc-300 focus:outline-none pr-4 cursor-pointer disabled:cursor-not-allowed disabled:text-zinc-500 max-w-[140px]"
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
                  <option value="clear">— Limpiar selección</option>
                </>
              )}
            </select>
          </div>
        </div>
      </div>
      {/* Active model indicator */}
      {currentModel && (
        <div className="flex items-center gap-1.5 px-3 py-1 bg-zinc-900/60 border-b border-zinc-800/30 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
          <span className="text-[10px] text-zinc-500 truncate">
            Usando: <span className="text-zinc-400 font-mono">{currentModel.split('/').pop()}</span>
          </span>
        </div>
      )}

      <div 
        ref={chatContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-3"
      >
        {/* Sensei anchor banner */}
        {isSenseiMode && anchoredContext && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/5 border border-amber-500/20 text-[10px] text-amber-400/80">
            <GraduationCap className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span className="truncate">
              Anclado en <strong className="text-amber-400">{anchoredContext.filePath.split('/').pop()}</strong> — línea {anchoredContext.cursorLine}
            </span>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              'text-xs leading-relaxed rounded-lg px-3 py-2 max-w-[88%]',
              m.role === 'user' && m.isSensei
                ? 'bg-amber-500/10 text-amber-200 self-end border border-amber-500/20'
                : m.role === 'user'
                ? 'bg-blue-500/10 text-blue-200 self-end'
                : m.role === 'system'
                ? 'bg-red-900/20 text-red-200 border border-red-800/30 self-start'
                : m.isError
                ? 'bg-orange-900/20 text-orange-200 border border-orange-800/30 self-start'
                : m.isSensei
                ? 'bg-amber-900/10 text-zinc-200 border border-amber-500/15 self-start'
                : 'bg-zinc-800/50 text-zinc-300 self-start'
            )}
          >
            {/* Sensei badge on assistant responses */}
            {m.role === 'assistant' && m.isSensei && (
              <div className="flex items-center gap-1 mb-1.5 text-[10px] text-amber-400/70 font-medium">
                <GraduationCap className="w-2.5 h-2.5" aria-hidden="true" />
                Sensei
              </div>
            )}
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

        {proposals.map((p) => (
          <ProposalCard
            key={p.id}
            id={p.id}
            projectId={projectId ?? ''}
            filePath={p.filePath}
            description={p.description}
            diff={p.diff}
          />
        ))}

        {loading && (
          <div className={cn(
            'self-start flex items-center gap-2 text-xs px-3 py-2',
            isSenseiMode ? 'text-amber-500/70' : 'text-zinc-500'
          )}>
            {isSenseiMode ? (
              <GraduationCap className="w-3 h-3 animate-pulse" aria-hidden="true" />
            ) : (
              <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
            )}
            {isSenseiMode ? 'El Sensei está meditando tu pregunta...' : 'SprintLogic AI está pensando...'}
          </div>
        )}

        {usage && !loading && (
          <div className="self-start text-[10px] text-zinc-600 px-3">
            ⚡ {usage.completion_tokens} / {usage.total_tokens} tokens
          </div>
        )}

        <div ref={messagesEndRef} className="h-px w-full shrink-0" />
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
      <ChatHistoryDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        projectId={projectId}
        onSelectConversation={(id) => {
          setActiveConversationId(id === -1 ? null : id);
          setIsDrawerOpen(false);
        }}
        activeConversationId={activeConversationId}
      />
      </div>
      {isDraftMode && (
        <div className="w-[70%] h-full flex flex-col bg-[#1e1e1e]">
          <DraftReviewer onSubmitResponse={(msg) => sendMessage(JSON.parse(msg))} />
        </div>
      )}
    </div>
  );
}
