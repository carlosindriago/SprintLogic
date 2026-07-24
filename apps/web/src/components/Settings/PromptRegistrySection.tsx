"use client";

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import Editor from "@monaco-editor/react";
import { getPrompts, updatePrompt, restorePrompt, PromptRegistryItem } from "@/lib/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, Save, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function PromptRegistrySection() {
  const [prompts, setPrompts] = useState<PromptRegistryItem[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [currentContent, setCurrentContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [isSaveAlertOpen, setIsSaveAlertOpen] = useState(false);
  const [isRestoreAlertOpen, setIsRestoreAlertOpen] = useState(false);

  useEffect(() => {
    fetchPrompts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPrompts = async () => {
    setLoading(true);
    try {
      const data = await getPrompts();
      setPrompts(data);
      if (data.length > 0) {
        handleSelectPrompt(data[0]);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Network error";
      toast.error("Error fetching prompts", { description: message });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPrompt = (prompt: PromptRegistryItem) => {
    setSelectedPromptId(prompt.id);
    setCurrentContent(prompt.content);
  };

  const selectedPrompt = prompts.find((p) => p.id === selectedPromptId);

  const handleSave = async () => {
    if (!selectedPromptId) return;
    try {
      const data = await updatePrompt(selectedPromptId, currentContent);
      toast.success("Prompt guardado correctamente");
      setPrompts((prev) => prev.map((p) => (p.id === selectedPromptId ? data : p)));
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Error al guardar el prompt";
      toast.error(message);
    } finally {
      setIsSaveAlertOpen(false);
    }
  };

  const handleRestore = async () => {
    if (!selectedPromptId) return;
    try {
      const data = await restorePrompt(selectedPromptId);
      toast.success("Prompt restaurado al estado original");
      setPrompts((prev) => prev.map((p) => (p.id === selectedPromptId ? data : p)));
      setCurrentContent(data.content);
    } catch {
      toast.error("Error al restaurar el prompt");
    } finally {
      setIsRestoreAlertOpen(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold text-white">Prompt Registry</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Edita las instrucciones del sistema. Las variables resaltadas son obligatorias.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Cargando prompts...
        </div>
      ) : (
        <div className="flex gap-4 min-h-0" style={{ height: "calc(100vh - 280px)" }}>
          {/* Prompt list sidebar */}
          <div className="w-56 shrink-0 flex flex-col gap-1 overflow-y-auto border border-zinc-800/50 rounded-lg bg-zinc-900/30 p-2">
            {prompts.map((prompt) => (
              <button
                key={prompt.id}
                onClick={() => handleSelectPrompt(prompt)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors",
                  selectedPromptId === prompt.id
                    ? "bg-blue-600/20 text-blue-300 border border-blue-500/40"
                    : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200 border border-transparent"
                )}
              >
                <div className="font-medium truncate">{prompt.id}</div>
                {prompt.description && (
                  <div className="text-[11px] opacity-60 truncate mt-0.5">
                    {prompt.description}
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Editor area */}
          <div className="flex-1 flex flex-col min-h-0 gap-3">
            {selectedPrompt ? (
              <>
                {/* Prompt header */}
                <div className="flex items-start justify-between gap-4 shrink-0">
                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-base font-semibold text-white">{selectedPrompt.id}</h3>
                    {selectedPrompt.required_variables &&
                      selectedPrompt.required_variables.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          <span className="text-[11px] text-zinc-500 mr-1 self-center">
                            Variables requeridas:
                          </span>
                          {selectedPrompt.required_variables.map((v) => (
                            <Badge
                              key={v}
                              variant="outline"
                              className="text-[10px] font-mono border-amber-500/40 text-amber-400 bg-amber-500/10 px-1.5 py-0.5"
                            >
                              {`{${v}}`}
                            </Badge>
                          ))}
                        </div>
                      )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsRestoreAlertOpen(true)}
                      className="border-zinc-700 text-zinc-300 hover:border-zinc-600 hover:text-white h-8"
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                      Restaurar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setIsSaveAlertOpen(true)}
                      className="bg-blue-600 hover:bg-blue-700 text-white h-8"
                    >
                      <Save className="w-3.5 h-3.5 mr-1.5" />
                      Guardar
                    </Button>
                  </div>
                </div>

                {/* Monaco Editor */}
                <div className="flex-1 min-h-0 border border-zinc-800/50 rounded-lg overflow-hidden">
                  <Editor
                    height="100%"
                    language="markdown"
                    theme="vs-dark"
                    value={currentContent}
                    onChange={(value) => setCurrentContent(value ?? "")}
                    options={{
                      minimap: { enabled: false },
                      wordWrap: "on",
                      fontSize: 13,
                      lineHeight: 1.7,
                      padding: { top: 16, bottom: 16 },
                      scrollBeyondLastLine: false,
                    }}
                  />
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
                Seleccioná un prompt de la lista para editarlo
              </div>
            )}
          </div>
        </div>
      )}

      {/* Save confirmation */}
      <AlertDialog open={isSaveAlertOpen} onOpenChange={setIsSaveAlertOpen}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Guardar cambios?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Los cambios se aplicarán en tiempo real. Si falta alguna variable
              requerida, el servidor rechazará la solicitud con un error de validación.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 text-zinc-300 hover:border-zinc-600">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleSave} className="bg-blue-600 hover:bg-blue-700">
              Guardar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore confirmation */}
      <AlertDialog open={isRestoreAlertOpen} onOpenChange={setIsRestoreAlertOpen}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Restaurar al estado original?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Esta acción sobreescribirá tus cambios con el prompt original de fábrica.
              No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 text-zinc-300 hover:border-zinc-600">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestore}
              className="bg-red-600 hover:bg-red-700"
            >
              Restaurar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
