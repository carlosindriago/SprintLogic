import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import { KeyRound, Sparkles, Cpu, Send, Loader2 } from "lucide-react";
import { useLLMConfigStore } from "@/store/llmConfigStore";
import { sendChatMessage, ChatMessage } from "@/lib/api";
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

  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hola, soy SprintLogic AI. ¿En qué te ayudo hoy?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

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
    if (!trimmed || !activeModel) return;

    const newMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const data = await sendChatMessage({
        messages: newMessages,
        model: activeModel,
        project_id: projectId,
      });
      setMessages([...newMessages, { role: "assistant", content: data.response }]);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      setMessages([...newMessages, { role: "system", content: `Error: ${errMsg}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const [provider, ...rest] = activeModel.split("/");
  const modelShort = rest.join("/") || activeModel;

  return (
    <div className="flex flex-col h-full bg-[#0f0f0f] text-zinc-200">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800/50 bg-[#0a0a0a] shrink-0">
        <Cpu className="w-4 h-4 text-blue-400" />
        <span className="text-xs font-semibold text-zinc-300">SprintLogic AI</span>
        <div className="flex-1" />
        <span
          className="text-[10px] font-mono text-zinc-500 px-1.5 py-0.5 rounded bg-zinc-800/40 border border-zinc-700/30 max-w-[180px] truncate"
          title={activeModel}
        >
          {provider}/{modelShort}
        </span>
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
      </div>

      <div className="border-t border-zinc-800/50 p-2 shrink-0">
        <div className="flex items-center gap-2 bg-zinc-900 rounded-lg px-3 py-1.5">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un comando…"
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
  );
}
