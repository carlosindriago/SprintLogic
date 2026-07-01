import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

const MODELS = [
  { value: "gemini/gemini-1.5-pro-latest", label: "Gemini 1.5 Pro" },
  { value: "openai/gpt-4o", label: "GPT-4o" },
  { value: "anthropic/claude-3-5-sonnet-20240620", label: "Claude 3.5 Sonnet" },
  { value: "openrouter/ollama/llama3", label: "Ollama (Llama 3)" }
];

export default function SprintLogicChat({ projectId }: { projectId: string | null }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hola, soy SprintLogic AI. ¿En qué te ayudo hoy?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(MODELS[0].value);

  const sendMessage = async () => {
    if (!input.trim()) return;
    
    const newMessages = [...messages, { role: "user", content: input } as Message];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("http://127.0.0.1:8000/api/v1/chat/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          project_id: projectId,
          model: selectedModel
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to fetch response");
      }

      const data = await response.json();
      setMessages([...newMessages, { role: "assistant", content: data.response }]);
    } catch (e) {
      console.error(e);
      const errMsg = e instanceof Error ? e.message : String(e);
      setMessages([...newMessages, { role: "system", content: `Error: ${errMsg}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] text-zinc-200">
      <div className="flex justify-between items-center p-2 border-b border-zinc-800/50 bg-zinc-900 text-xs">
        <span className="font-semibold px-2 text-zinc-400">SprintLogic AI</span>
        <Select value={selectedModel} onValueChange={(value) => setSelectedModel(value ?? selectedModel)}>
          <SelectTrigger className="w-[180px] h-7 text-xs bg-zinc-800 border-zinc-700/50">
            <SelectValue placeholder="Selecciona un modelo" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700/50 text-zinc-200">
            {MODELS.map(m => (
              <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ScrollArea className="flex-1 p-4">
        <div className="flex flex-col gap-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
              <div className={`max-w-[85%] rounded-lg p-3 text-sm ${
                m.role === "user" ? "bg-blue-600 text-white" : 
                m.role === "system" ? "bg-red-900/50 text-red-200 border border-red-800" :
                "bg-zinc-800 text-zinc-200 border border-zinc-700/50"
              }`}>
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
                SprintLogic AI está pensando...
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
            placeholder="Escribe un comando..."
            className="flex-1 bg-zinc-800 border border-zinc-700/50 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
          <Button onClick={sendMessage} disabled={loading || !input.trim()} className="bg-blue-600 hover:bg-blue-700 px-4">
            Enviar
          </Button>
        </div>
      </div>
    </div>
  );
}
