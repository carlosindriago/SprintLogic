import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import { KeyRound, Sparkles } from "lucide-react";
import { useLLMConfigStore } from "@/store/llmConfigStore";
import { sendChatMessage, ChatMessage } from "@/lib/api";

interface SprintLogicChatProps {
  projectId: string | null;
  onOpenSettings?: () => void;
}

/**
 * Validates that the configured model is usable (must include a `/` so the
 * backend can route to the correct provider). Returns null if invalid so
 * the UI can render the empty-state CTA instead of attempting a call.
 */
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

  // Empty-state CTA: no model configured. The chat cannot operate without
  // a target model, so we block input + send and invite the user to settings.
  if (!activeModel) {
    return (
      <div className="flex flex-col h-full bg-[#1e1e1e] text-zinc-200">
        <div className="flex justify-between items-center p-2 border-b border-zinc-800/50 bg-zinc-900 text-xs">
          <span className="font-semibold px-2 text-zinc-400">SprintLogic AI</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-sm flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-zinc-800/60 border border-zinc-700/50 flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-zinc-400" />
            </div>
            <h3 className="text-zinc-200 font-semibold text-sm">
              Configura un proveedor de IA para comenzar
            </h3>
            <p className="text-zinc-500 text-xs leading-relaxed">
              Para chatear con SprintLogic AI necesitas definir tu modelo
              predeterminado y guardar una API Key en
              <span className="text-zinc-300"> IA &amp; Modelos</span>.
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
      console.error(e);
      const errMsg = e instanceof Error ? e.message : String(e);
      setMessages([...newMessages, { role: "system", content: `Error: ${errMsg}` }]);
    } finally {
      setLoading(false);
    }
  };

  // Display the model identifier in a friendlier "provider / model" form
  // for the header badge. We never expose secrets here.
  const [provider, ...rest] = activeModel.split("/");
  const modelShort = rest.join("/") || activeModel;

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] text-zinc-200">
      <div className="flex justify-between items-center p-2 border-b border-zinc-800/50 bg-zinc-900 text-xs">
        <span className="font-semibold px-2 text-zinc-400 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" /> SprintLogic AI
        </span>
        <span
          className="text-[10px] font-mono text-zinc-500 px-2 py-1 rounded bg-zinc-800/60 border border-zinc-700/50 max-w-[220px] truncate"
          title={activeModel}
        >
          {provider}/{modelShort}
        </span>
      </div>

      <ScrollArea className="flex-1 p-4 custom-scrollbar">
        <div className="flex flex-col gap-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-lg p-3 text-sm ${
                  m.role === "user"
                    ? "bg-blue-600 text-white"
                    : m.role === "system"
                    ? "bg-red-900/50 text-red-200 border border-red-800"
                    : "bg-zinc-800 text-zinc-200 border border-zinc-700/50"
                }`}
              >
                {m.role === "assistant" ? (
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">{m.content}</div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex flex-col items-start">
              <div className="max-w-[85%] rounded-lg p-3 text-sm bg-zinc-800 text-zinc-400 border border-zinc-700/50 animate-pulse">
                SprintLogic AI está pensando…
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-3 bg-zinc-900 border-t border-zinc-800/50">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Escribe un comando…"
            className="flex-1 bg-zinc-800 border border-zinc-700/50 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
          <Button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="bg-blue-600 hover:bg-blue-700 px-4"
          >
            Enviar
          </Button>
        </div>
      </div>
    </div>
  );
}
