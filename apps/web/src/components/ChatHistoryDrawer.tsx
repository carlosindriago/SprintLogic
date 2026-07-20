import { useState, useEffect } from "react";
import { X, Trash2 } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface Conversation {
  id: number;
  title: string;
  created_at: string;
}

interface ChatHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string | null;
  onSelectConversation: (id: number) => void;
  activeConversationId: number | null;
}

export default function ChatHistoryDrawer({
  isOpen,
  onClose,
  projectId,
  onSelectConversation,
  activeConversationId
}: ChatHistoryDrawerProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && projectId) {
      // eslint-disable-next-line
      setLoading(true);
      fetch(`${API_BASE_URL}/chat/conversations/${projectId}`)
        .then((res) => res.json())
        .then((data) => setConversations(data))
        .catch((err) => console.error("Failed to load history", err))
        .finally(() => setLoading(false));
    }
  }, [isOpen, projectId]);

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm("¿Eliminar este chat?")) return;
    
    try {
      await fetch(`${API_BASE_URL}/chat/conversations/${id}`, { method: "DELETE" });
      setConversations(prev => prev.filter(c => c.id !== id));
      if (activeConversationId === id) {
        onSelectConversation(-1); // Signal to reset chat
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 bg-zinc-950 z-50 flex flex-col border-l border-zinc-800 shadow-xl overflow-hidden transition-all duration-300">
      <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50">
        <h3 className="font-semibold text-zinc-100">Historial de Chats</h3>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-zinc-400 hover:text-white">
          <X size={18} />
        </Button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="text-center p-4 text-sm text-zinc-500">Cargando...</div>
        ) : conversations.length === 0 ? (
          <div className="text-center p-4 text-sm text-zinc-500">No hay chats anteriores.</div>
        ) : (
          <div className="space-y-1">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className={`group flex items-center justify-between p-3 rounded-md cursor-pointer transition-colors ${
                  activeConversationId === conv.id
                    ? "bg-blue-600/20 text-blue-400 border border-blue-600/30"
                    : "hover:bg-zinc-800 text-zinc-300"
                }`}
              >
                <div className="flex flex-col overflow-hidden">
                  <span className="text-sm font-medium truncate">{conv.title}</span>
                  <span className="text-xs text-zinc-500">
                    {new Date(conv.created_at).toLocaleDateString()}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => handleDelete(e, conv.id)}
                  className="opacity-0 group-hover:opacity-100 h-6 w-6 text-zinc-500 hover:text-red-400 hover:bg-zinc-800"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
