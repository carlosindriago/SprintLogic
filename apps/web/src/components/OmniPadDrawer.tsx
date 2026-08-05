"use client";

import React, { useState, useEffect, useRef } from "react";
import { useOmniPadStore } from "@/store/omniPadStore";
import { usePlanningStore } from "@/store/planningStore";
import { useTabsStore } from "@/store/tabsStore";
import { useProjectStore } from "@/store/projectStore";
import { API_BASE_URL } from "@/lib/api";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

export const OmniPadDrawer: React.FC = () => {
  const { isOpen, close } = useOmniPadStore();
  const { projectId } = useProjectStore();
  const [noteContent, setNoteContent] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [scope, setScope] = useState<"local" | "global">("local");
  const [mode, setMode] = useState<"write" | "history">("write");
interface Note {
  id?: number;
  content: string;
  created_at?: string;
  project_id?: string | null;
}

  const [history, setHistory] = useState<Note[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  useEffect(() => {
    // Escucha para el atajo de teclado global (Ctrl+Shift+N o Cmd+Shift+N)
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        useOmniPadStore.getState().toggle();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (mode === "history") {
      const fetchHistory = async () => {
        setIsLoadingHistory(true);
        try {
          const url = scope === "local" && projectId 
            ? `${API_BASE_URL}/omni-pad/notes?project_id=${projectId}` 
            : `${API_BASE_URL}/omni-pad/notes`;
          const res = await fetch(url);
          if (!res.ok) throw new Error("Error al cargar historial");
          const data = await res.json();
          setHistory(data);
        } catch {
          toast.error("No se pudo cargar el historial");
        } finally {
          setIsLoadingHistory(false);
        }
      };
      fetchHistory();
    }
  }, [mode, scope, projectId]);

  const handleDictation = async () => {
    if (isListening) {
      mediaRecorderRef.current?.stop();
      setIsListening(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Detener las pistas para soltar el micrófono del OS
        stream.getTracks().forEach((track) => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setIsTranscribing(true);

        try {
          const formData = new FormData();
          formData.append("file", audioBlob, "dictation.webm");

          const res = await fetch(`${API_BASE_URL}/omni-pad/transcribe`, {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => null);
            throw new Error(errData?.detail || "Error al transcribir el audio");
          }

          const data = await res.json();
          if (data.text) {
             setNoteContent((prev) => (prev ? prev + " " + data.text : data.text));
          }
        } catch (error) {
          toast.error((error as Error).message || "Fallo en el motor de transcripción");
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsListening(true);
    } catch {
      toast.error("Permiso denegado o micrófono no encontrado.");
    }
  };

  const handleSave = async () => {
    if (!noteContent.trim()) return;
    try {
      const payload = {
        content: noteContent,
        project_id: scope === "local" && projectId ? projectId : null,
      };
      
      const res = await fetch(`${API_BASE_URL}/omni-pad/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("No se pudo guardar la nota");
      toast.success("Nota guardada en Omni-Pad");
      setNoteContent("");
    } catch {
      toast.error("Error al guardar la nota");
    }
  };

  const handleHandoff = () => {
    if (!noteContent.trim()) return;
    if (!projectId) {
      toast.error("Necesitas un proyecto activo para ir al Planning Studio.");
      return;
    }

    const { projectStates, setProjectState } = usePlanningStore.getState();
    const { addTab } = useTabsStore.getState();

    const currentMessages = projectStates[projectId]?.messages || [];
    setProjectState(projectId, {
      messages: [
        ...currentMessages,
        { role: "user", content: noteContent },
        {
          role: "assistant",
          content:
            "He recibido tu nota del Omni-Pad. ¿Quieres que la analice y construyamos un plan de tareas (WBS) basado en ella?",
        },
      ],
    });

    close();
    setNoteContent("");
    addTab({ id: "planning-studio", title: "Planning Studio", type: "planning-studio" });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-zinc-900 border-l border-zinc-800 shadow-2xl z-50 flex flex-col transform transition-transform">
      <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950">
        <h2 className="text-lg font-semibold text-zinc-100 font-mono">Omni-Pad</h2>
        <button
          onClick={close}
          className="text-zinc-400 hover:text-white focus-visible:ring-2 focus-visible:outline-none rounded"
          aria-label="Close"
          title="Close"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <div className="flex bg-zinc-950 px-2 py-1 gap-2 border-b border-zinc-800">
        <button
          onClick={() => setScope("local")}
          className={`flex-1 text-xs font-semibold py-1 rounded transition-colors focus-visible:ring-2 focus-visible:outline-none ${
            scope === "local" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-800/50"
          }`}
        >
          Proyecto
        </button>
        <button
          onClick={() => setScope("global")}
          className={`flex-1 text-xs font-semibold py-1 rounded transition-colors focus-visible:ring-2 focus-visible:outline-none ${
            scope === "global" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-800/50"
          }`}
        >
          Global
        </button>
      </div>

      <div className="flex bg-zinc-950 px-4 py-2 gap-4 border-b border-zinc-800/50 justify-center">
        <button
          onClick={() => setMode("write")}
          className={`text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none ${
            mode === "write" ? "text-blue-400 underline decoration-2 underline-offset-4" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          ✍️ Escribir
        </button>
        <button
          onClick={() => setMode("history")}
          className={`text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none ${
            mode === "history" ? "text-blue-400 underline decoration-2 underline-offset-4" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          📚 Historial
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {mode === "write" ? (
          <>
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              className="w-full flex-1 bg-zinc-950 border border-zinc-800 rounded p-2 text-sm text-zinc-200 outline-none resize-none focus:border-zinc-600 font-mono"
              placeholder="Escribe tu idea aquí (Soporta Markdown)..."
            />

            {noteContent && (
              <div className="border border-zinc-800 rounded p-2 bg-zinc-950/50 prose prose-invert max-w-none text-sm h-48 overflow-y-auto">
                <ReactMarkdown>{noteContent}</ReactMarkdown>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-3">
            {isLoadingHistory ? (
              <div className="text-zinc-500 text-sm text-center py-8">Cargando notas...</div>
            ) : history.length === 0 ? (
              <div className="text-zinc-500 text-sm text-center py-8">No hay notas en este ámbito.</div>
            ) : (
              history.map((note) => (
                <div
                  key={note.id}
                  onClick={() => {
                    setNoteContent(note.content);
                    setMode("write");
                  }}
                  className="bg-zinc-800/30 border border-zinc-800 rounded p-3 cursor-pointer hover:bg-zinc-800/60 transition-colors"
                >
                  <div className="text-xs text-zinc-500 mb-2">
                    {note.created_at ? new Date(note.created_at).toLocaleString() : 'Fecha desconocida'}
                  </div>
                  <div className="text-sm text-zinc-300 line-clamp-3">
                    {note.content}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {mode === "write" && (
        <div className="p-4 border-t border-zinc-800 flex flex-col gap-2 bg-zinc-950">
          <div className="flex gap-2">
            <button
              onClick={handleDictation}
              className={`flex-1 py-2 rounded text-sm font-semibold flex items-center justify-center gap-2 transition-colors focus-visible:ring-2 focus-visible:outline-none ${
                isListening ? "bg-red-600/20 text-red-500 hover:bg-red-600/30 border border-red-900" : "bg-zinc-800 text-white hover:bg-zinc-700"
              }`}
            >
              {isTranscribing ? "⏳ Transcribiendo..." : isListening ? "⏹️ Detener Dictado" : "🎙️ Dictar"}
            </button>

            <button
              onClick={handleSave}
              disabled={!noteContent.trim()}
              className="flex-1 bg-emerald-600/20 text-emerald-500 hover:bg-emerald-600/30 border border-emerald-900 rounded py-2 text-sm font-semibold disabled:opacity-50 transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              Guardar Nota
            </button>
          </div>

          {noteContent.trim() && (
            <button
              onClick={handleHandoff}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded py-2 text-sm font-bold shadow-lg mt-2 flex items-center justify-center gap-2 transition-all focus-visible:ring-2 focus-visible:outline-none"
            >
              🚀 Llevar al Planning Studio
            </button>
          )}
        </div>
      )}
    </div>
  );
};
