"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor as monacoEditor } from 'monaco-editor';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createFile } from '@/lib/api';
import { toast } from 'sonner';

interface NewFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  defaultDirectory?: string;
  initialContent?: string;
  onCreated: (filePath: string) => void;
}

export default function NewFileDialog({
  open,
  onOpenChange,
  projectId,
  defaultDirectory = '',
  initialContent = '',
  onCreated,
}: NewFileDialogProps) {
  const [fileName, setFileName] = useState('');
  const [content, setContent] = useState(initialContent);
  const [creating, setCreating] = useState(false);
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFileName('');
      setContent(initialContent);
    }
  }, [open, initialContent]);

  const filePath = defaultDirectory
    ? `${defaultDirectory.replace(/\/$/, '')}/${fileName}`
    : fileName;

  const handleCreate = useCallback(async () => {
    if (!fileName.trim() || !projectId) return;
    setCreating(true);
    try {
      const result = await createFile(projectId, filePath, content);
      toast.success(`Archivo "${result.path}" creado`);
      onCreated(result.path);
      setFileName('');
      setContent('');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear archivo');
    } finally {
      setCreating(false);
    }
  }, [fileName, filePath, content, projectId, onCreated, onOpenChange]);

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;
    editor.onDidChangeModelContent(() => {
      setContent(editor.getValue());
    });
    editor.focus();
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] h-[500px] flex flex-col bg-zinc-900 text-zinc-200 border-zinc-800/50">
        <DialogHeader>
          <DialogTitle>Nuevo Archivo</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Crea un nuevo archivo en el proyecto.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 flex-1 min-h-0">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newFileName" className="text-xs text-zinc-400">
              Nombre del archivo
            </Label>
            <Input
              id="newFileName"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="ej: components/Button.tsx"
              className="bg-zinc-800 border-zinc-700/50 text-zinc-200 focus-visible:ring-blue-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && fileName.trim()) {
                  e.preventDefault();
                  handleCreate();
                }
              }}
              autoFocus
            />
            {fileName.trim() && (
              <p className="text-[11px] text-zinc-500 truncate">
                Se creará como: {filePath}
              </p>
            )}
          </div>

          <div className="flex-1 min-h-0 rounded-md overflow-hidden border border-zinc-700/50">
            <Editor
              height="100%"
              theme="vs-dark"
              defaultLanguage="plaintext"
              value={content}
              onMount={handleEditorMount}
              options={{
                readOnly: false,
                minimap: { enabled: false },
                fontSize: 13,
                wordWrap: 'on',
                padding: { top: 16 },
                lineNumbers: 'on',
                renderLineHighlight: 'line',
              }}
            />
          </div>
        </div>

        <DialogFooter showCloseButton={false}>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="bg-zinc-800 border-zinc-700/50 text-zinc-200 hover:bg-zinc-700">
            Cancelar
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!fileName.trim() || creating}
            className="bg-blue-600 hover:bg-blue-500 text-white"
          >
            {creating ? 'Creando...' : 'Crear Archivo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
