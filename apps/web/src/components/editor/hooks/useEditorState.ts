import { useState, useEffect, useRef, useCallback, MutableRefObject } from 'react';
import type { editor as monacoEditor } from 'monaco-editor';
import { getFileContent, saveFileContent, ApiError } from '@/lib/api';
import { draftStore } from '@/lib/draftStore';
import { useUnsavedStore } from '@/store/unsavedStore';
import { useTabsStore } from '@/store/tabsStore';
import { toast } from 'sonner';

interface UseEditorStateProps {
  projectId: string;
  nodeId: string;
  nodePath?: string;
  onSaveUntitled?: (content: string) => void;
  editorRef: MutableRefObject<monacoEditor.IStandaloneCodeEditor | null>;
  isCoachEnabled: boolean;
  runHealthAnalysis: (model: monacoEditor.ITextModel) => void;
}

export function useEditorState({
  projectId,
  nodeId,
  nodePath,
  onSaveUntitled,
  editorRef,
  isCoachEnabled,
  runHealthAnalysis
}: UseEditorStateProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [initialValue, setInitialValue] = useState('');
  const [draftModifiedLines, setDraftModifiedLines] = useState<number[]>([]);
  const [isConflictMode, setIsConflictMode] = useState(false);
  
  const originalContentRef = useRef('');
  const currentContentRef = useRef('');
  const originalHashRef = useRef<string | undefined>(undefined);
  const isSavingRef = useRef(false);
  const isDirtyRef = useRef(false);
  
  const backupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markDirty = useTabsStore((s) => s.markDirty);

  useEffect(() => {
    markDirty(nodeId, isDirty);
    isDirtyRef.current = isDirty;
  }, [isDirty, nodeId, markDirty]);

  useEffect(() => {
    let isMounted = true;

    const loadContent = async () => {
      if (isMounted) setLoading(true);

      const backupKey = nodePath || nodeId;
      const backup = useUnsavedStore.getState().getContent(backupKey);

      if (!nodePath) {
        originalContentRef.current = backup;
        currentContentRef.current = backup;
        setInitialValue(backup);
        if (isMounted) setLoading(false);
        return;
      }

      try {
        const { content: data, original_hash: fetchedHash } = await getFileContent(projectId, nodePath);
        if (isMounted) {
          originalHashRef.current = fetchedHash;
          const draft = draftStore.load(projectId, nodePath);
          const restored = (draft && draft !== data)
            ? draft
            : (backup && backup !== data ? backup : data);
            
          originalContentRef.current = data;
          currentContentRef.current = restored;
          setInitialValue(restored);
          
          if (restored !== data) {
            setIsDirty(true);
            const originalLines = data.split('\n');
            const draftLines = restored.split('\n');
            const modified: number[] = [];
            const maxLen = Math.max(originalLines.length, draftLines.length);
            for (let i = 0; i < maxLen; i++) {
              if (originalLines[i] !== draftLines[i]) modified.push(i + 1);
            }
            if (isMounted) setDraftModifiedLines(modified);
          }
          setLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          // If it's a 404 Not Found, treat it as a new/empty file
          if (err instanceof ApiError && err.status === 404) {
            originalContentRef.current = '';
            currentContentRef.current = '';
            setInitialValue('');
            setLoading(false);
            setIsDirty(true); // Mark dirty so it can be saved
          } else {
            originalContentRef.current = '// Error loading file: ' + (err as Error).message;
            currentContentRef.current = '// Error loading file: ' + (err as Error).message;
            setInitialValue(originalContentRef.current);
            setLoading(false);
          }
        }
      }
    };

    loadContent();

    return () => {
      isMounted = false;
      const backupTimer = backupTimerRef.current;
      const currentEditor = editorRef.current;
      if (backupTimer) {
        clearTimeout(backupTimer);
        if (currentEditor) {
          const backupKey = nodePath || nodeId;
          useUnsavedStore.getState().setContent(backupKey, currentEditor.getValue());
        }
      }
      if (dirtyCheckTimerRef.current) clearTimeout(dirtyCheckTimerRef.current);
    };
  }, [projectId, nodePath, nodeId, editorRef]);

  const checkDirty = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const current = editor.getValue();
    currentContentRef.current = current;
    const dirty = current !== originalContentRef.current;
    setIsDirty(dirty);
  }, [editorRef]);

  const handleSave = useCallback(async (saveAs?: string) => {
    if (isSavingRef.current || !editorRef.current) return;

    if (!nodePath) {
      onSaveUntitled?.(editorRef.current.getValue());
      return;
    }

    const targetPath = saveAs || nodePath;
    if (!targetPath) return;

    isSavingRef.current = true;
    setSaving(true);
    try {
      const current = editorRef.current.getValue();
      let response;
      try {
        response = await saveFileContent(projectId, targetPath, current, originalHashRef.current);
      } catch (err: any) {
        if (err instanceof ApiError && err.status === 404) {
          // File does not exist yet, create it instead
          const { createFile } = await import('@/lib/api');
          response = await createFile(projectId, targetPath, current);
        } else {
          throw err;
        }
      }
      if (response && (response as any).new_hash) {
        originalHashRef.current = (response as any).new_hash;
      }
      originalContentRef.current = current;
      currentContentRef.current = current;
      setIsDirty(false);
      useUnsavedStore.getState().clearContent(targetPath);
      
      if (nodePath) {
        draftStore.clear(projectId, nodePath);
        setDraftModifiedLines([]);
      }
      
      if (isCoachEnabled && editorRef.current) {
        const model = editorRef.current.getModel();
        if (model) {
          runHealthAnalysis(model);
        }
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setIsConflictMode(true);
        toast.error("Conflicto de Edición", { 
          description: "El archivo fue modificado externamente (ej. por git pull). Tus cambios locales no se guardaron para evitar sobrescribir. Copia tus cambios, refresca y vuelve a aplicarlos.",
          duration: 10000 
        });
      } else {
        toast.error("Error al guardar", { description: error instanceof Error ? error.message : "Ocurrió un error inesperado." });
      }
    } finally {
      setSaving(false);
      isSavingRef.current = false;
    }
  }, [projectId, nodePath, onSaveUntitled, isCoachEnabled, runHealthAnalysis, editorRef]);

  const handleEditorChange = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    if (!isDirtyRef.current) {
      isDirtyRef.current = true;
      setIsDirty(true);
    }

    if (dirtyCheckTimerRef.current) clearTimeout(dirtyCheckTimerRef.current);
    dirtyCheckTimerRef.current = setTimeout(() => {
      if (editor.getModel() && !editor.getModel()?.isDisposed()) {
        checkDirty();
      }
    }, 50);

    if (backupTimerRef.current) clearTimeout(backupTimerRef.current);
    backupTimerRef.current = setTimeout(() => {
      const model = editor.getModel();
      if (!model || model.isDisposed()) return;
      const content = editor.getValue();
      const backupKey = nodePath || nodeId;
      useUnsavedStore.getState().setContent(backupKey, content);
      
      if (nodePath) {
        draftStore.save(projectId, nodePath, content);
      }
    }, 1000);
  }, [nodePath, nodeId, projectId, checkDirty, editorRef]);
  
  const clearDraftDecorations = useCallback(() => {
    setDraftModifiedLines([]);
  }, []);

  return {
    loading,
    saving,
    isDirty,
    setIsDirty,
    isDirtyRef,
    initialValue,
    draftModifiedLines,
    isConflictMode,
    handleSave,
    handleEditorChange,
    clearDraftDecorations
  };
}
