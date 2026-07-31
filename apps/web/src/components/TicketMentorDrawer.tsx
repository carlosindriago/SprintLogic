"use client";

import { useState, useRef, useEffect } from 'react';
import { GraduationCap, Send, Loader2, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { API_BASE_URL } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  ticketId: string;
  projectId: string;
  filePath: string;
  onClose: () => void;
}

export default function TicketMentorDrawer({ ticketId, projectId, filePath, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (query: string) => {
    if (!query.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: query };
    setMessages((prev) => [...prev, userMsg, { role: 'assistant', content: '' }]);
    setInput('');
    setLoading(true);
    setIsStreaming(true);

    try {
      const res = await fetch(`${API_BASE_URL}/chat/ticket-mentor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: ticketId,
          node_id: filePath,
          project_id: projectId,
          user_query: query,
        }),
      });

      if (!res.ok) throw new Error('Error al conectar con el Mentor de Ticket');

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (!dataStr) continue;
            try {
              const data = JSON.parse(dataStr);
              if (data.error) throw new Error(data.error);
              if (data.is_done) {
                setIsStreaming(false);
                break;
              }
              if (data.text) {
                setMessages((prev) => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1].content += data.text;
                  return newMsgs;
                });
              }
            } catch {
              // ignore parse errors for incomplete chunks
            }
          }
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const newMsgs = [...prev];
        newMsgs[newMsgs.length - 1].content = `**Error:** ${(err as Error).message}`;
        return newMsgs;
      });
    } finally {
      setLoading(false);
      setIsStreaming(false);
    }
  };

  return (
    <div className="absolute right-0 top-0 bottom-0 w-[400px] bg-zinc-900 border-l border-zinc-800 flex flex-col z-50 shadow-2xl animate-in slide-in-from-right">
      <div className="flex items-center justify-between p-3 border-b border-zinc-800">
        <div className="flex items-center gap-2 text-indigo-400">
          <GraduationCap className="w-5 h-5" />
          <div>
            <h3 className="font-semibold text-sm">Mentor de Ticket</h3>
            <p className="text-xs text-zinc-500 truncate w-48">{filePath.split('/').pop()}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-zinc-400 hover:text-white">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-center space-y-3">
            <GraduationCap className="w-12 h-12 text-indigo-500/20" />
            <p className="text-sm">Pregúntame sobre cómo implementar este ticket en este archivo. Analizaré el Blast Radius para darte contexto preciso.</p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={cn("flex flex-col max-w-[90%]", m.role === 'user' ? "ml-auto items-end" : "mr-auto items-start")}>
              <div className={cn(
                "p-3 rounded-lg text-sm shadow-sm",
                m.role === 'user' ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-300 border border-zinc-700/50 prose prose-invert prose-p:leading-snug prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-zinc-800 prose-sm"
              )}>
                {m.role === 'assistant' && !m.content && isStreaming && i === messages.length - 1 ? (
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                ) : (
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-3 border-t border-zinc-800 bg-zinc-900/50">
        <div className="relative flex items-center">
          <input
            type="text"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-full py-2.5 pl-4 pr-12 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all"
            placeholder="Pregunta sobre este ticket..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage(input)}
            disabled={loading && !isStreaming}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || (loading && !isStreaming)}
            className="absolute right-1.5 p-1.5 rounded-full bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-indigo-500"
            aria-label="Enviar mensaje"
          >
            {loading && !isStreaming ? <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> : <Send aria-hidden="true" className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
