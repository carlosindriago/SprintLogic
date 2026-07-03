"use client";

import { useState, useRef, useEffect } from 'react';
import { GraduationCap, Send, Loader2, ChevronRight, Brain, Settings } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { API_BASE_URL } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useLLMConfigStore } from '@/store/llmConfigStore';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  open: boolean;
  onToggle: () => void;
  filePath: string;
  fileContent: string;
  techStack: Record<string, number>;
  onOpenSettings?: () => void;
}

export default function CodeMentorPanel({ open, onToggle, filePath, fileContent, techStack, onOpenSettings }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const context7ApiKey = useLLMConfigStore((s) => s.context7ApiKey);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (query: string) => {
    if (!query.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: query };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/chat/mentor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: filePath,
          content: fileContent.slice(0, 8000),
          project_tech_stack: techStack,
          user_query: query,
          context7_api_key: context7ApiKey,
        }),
      });
      if (!res.ok) throw new Error('Mentor error');
      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Error al consultar al mentor.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = () => {
    setMessages([]);
    sendMessage('Hazme un desglose arquitectónico de este archivo');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div
      className={cn(
        'flex-shrink-0 flex flex-col border-l border-zinc-800/50 bg-[#0f0f0f] transition-all duration-300 overflow-hidden',
        open ? 'w-[360px]' : 'w-0 border-l-0'
      )}
    >
      <div className="w-[360px] flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800/50 bg-[#0a0a0a] shrink-0">
          <GraduationCap className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-semibold text-zinc-300">Modo Sensei</span>
          <div className="flex-1" />
          <button
            onClick={handleAnalyze}
            disabled={loading || !filePath}
            className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors disabled:opacity-30"
          >
            Analizar Archivo
          </button>
          <button onClick={onToggle} className="p-0.5 rounded hover:bg-zinc-800 text-zinc-400">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-3">
          {!context7ApiKey ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-zinc-500">
              <Brain className="w-12 h-12 text-zinc-700" />
              <h3 className="text-sm font-semibold text-zinc-400">Activa el Modo Sensei</h3>
              <p className="text-xs max-w-[240px] leading-relaxed">
                Para evitar alucinaciones, el Mentor necesita conectarse a Context7 para leer la documentación de tu Tech Stack en tiempo real.
              </p>
              {onOpenSettings && (
                <button
                  onClick={onOpenSettings}
                  className="text-[11px] mt-1 px-3 py-1.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors flex items-center gap-1.5"
                >
                  <Settings className="w-3 h-3" />
                  Ir a Ajustes
                </button>
              )}
            </div>
          ) : messages.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-2 text-zinc-600">
              <GraduationCap className="w-10 h-10 text-zinc-700" />
              <p className="text-xs max-w-[220px]">
                El Sensei te guía sin escribir código por vos. Preguntale sobre arquitectura, patrones o mejora de tu código.
              </p>
              <button
                onClick={handleAnalyze}
                disabled={!filePath}
                className="text-[11px] mt-2 px-3 py-1 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-30"
              >
                Analizar {filePath.split('/').pop() || 'archivo'}
              </button>
            </div>
          ) : null}

          {context7ApiKey && messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                'text-xs leading-relaxed rounded-lg px-3 py-2 max-w-[90%]',
                m.role === 'user'
                  ? 'bg-blue-500/10 text-blue-200 self-end'
                  : 'bg-zinc-800/50 text-zinc-300 self-start'
              )}
            >
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
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">
                      {children}
                    </a>
                  ),
                }}
              >
                {m.content}
              </ReactMarkdown>
            </div>
          ))}

          {context7ApiKey && loading && (
            <div className="self-start flex items-center gap-2 text-xs text-zinc-500 px-3 py-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              El Sensei está pensando...
            </div>
          )}
        </div>

        {context7ApiKey && (
        <div className="border-t border-zinc-800/50 p-2 shrink-0">
          <div className="flex items-center gap-2 bg-zinc-900 rounded-lg px-3 py-1.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Preguntale al Sensei..."
              className="flex-1 bg-transparent text-xs text-zinc-200 placeholder-zinc-500 outline-none"
              disabled={loading}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              className="text-zinc-400 hover:text-white disabled:opacity-30 shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
