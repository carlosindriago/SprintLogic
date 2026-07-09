import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor as monacoEditor, Uri } from 'monaco-editor';
import { getFileContent, saveFileContent, API_BASE_URL, fetchCodeCoachAnalysis, fetchTechScan, getGitStatus } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { cn, hashString } from '@/lib/utils';
import { useTabsStore } from '@/store/tabsStore';
import { useMarkersStore } from '@/store/markersStore';
import { useUnsavedStore } from '@/store/unsavedStore';
import { useFocusStore } from '@/store/focusStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useLLMConfigStore } from '@/store/llmConfigStore';
import { useFimStore } from '@/store/fimStore';
import type { GraphNode } from '@/types';
import { Code2, ChevronRight, Pencil, Eye, MousePointer2, GraduationCap, Save, SaveAll, Sparkles, Loader2 } from 'lucide-react';
import FimHintBar from './FimHintBar';
import ContextHUD, { type VimTutorMode } from './ContextHUD';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { CoachSidebar } from "./CoachSidebar";
import { CodeCoachOverview, CodeCoachMarker } from "@/lib/api";

interface LintDiagnostic {
  line: number;
  column: number;
  message: string;
  severity: string;
}

const TOOLBAR_BUTTON = "p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50 disabled:pointer-events-none";

let markersListenerRegistered = false;

function normalizeMonacoUri(uri: Uri): string {
  if (uri.scheme === 'file' || !uri.scheme) {
    return uri.path;
  }
  const str = uri.toString();
  return str.replace(/^[a-z]+:\/\//, '');
}

function CoachToggleButton({ isCoachEnabled, onToggle }: { isCoachEnabled: boolean; onToggle: () => void }) {
  const isLoading = useFimStore((s) => s.isLoading);
  
  return (
    <button
      className={cn(TOOLBAR_BUTTON, isCoachEnabled ? 'text-emerald-400' : 'text-zinc-500')}
      onClick={onToggle}
      title={
        !isCoachEnabled ? 'Code Coach desactivado' :
        isLoading ? 'Code Coach analizando...' : 'Code Coach activado — análisis pedagógico en segundo plano'
      }
      aria-label="Alternar AI Code Coach"
    >
      {isLoading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Sparkles className={cn("w-3.5 h-3.5", isCoachEnabled && "animate-pulse")} style={{ animationDuration: '3s' }} />
      )}
    </button>
  );
}

const globalCoachCache = new Map<string, any>();

export default function EditorTab({
  projectId,
  node,
  vimMode,
  onSaveUntitled,
  onMentor,
}: {
  projectId: string;
  node: GraphNode;
  vimMode?: boolean;
  onSaveUntitled?: (content: string) => void;
  onMentor?: (filePath: string, content: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [editorMode, setEditorMode] = useState<'locked' | 'visual' | 'editable'>('locked');
  const [coachExplanation, setCoachExplanation] = useState<string | null>(null);
  
  const [coachOverview, setCoachOverview] = useState<CodeCoachOverview | null>(null);
  const [currentCursorAdvice, setCurrentCursorAdvice] = useState<CodeCoachMarker | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [availableAdviceLines, setAvailableAdviceLines] = useState<number[]>([]);
  const [initialValue, setInitialValue] = useState('');
  
  const isCoachEnabled = useSettingsStore((s) => s.isFimEnabled);
  const setIsCoachEnabled = useSettingsStore((s) => s.setFimEnabled);

  const editorRef = useRef<typeof import('monaco-editor').editor.IStandaloneCodeEditor | null>(null);

  const { data: techData, isFetching: isScanningTech, refetch: handleRescan, isError: isTechError } = useQuery({
    queryKey: ['tech-scan', node.file_path],
    queryFn: () => {
      const content = editorRef.current?.getValue() || initialValue;
      const lang = node.metadata?.language || node.file_path?.split('.').pop() || 'typescript';
      console.log('[Tech Scan] Firing with args:', { model: fimDefaultModel, fallback: fimFallbackModel, lang, contentLen: content?.length });
      return fetchTechScan(content, lang, fimDefaultModel, fimFallbackModel);
    },
    staleTime: Infinity,
    retry: 2,
    retryDelay: 2000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    enabled: !!node.file_path && isCoachEnabled && !!(editorRef.current?.getValue() || initialValue) && (editorRef.current?.getValue() || initialValue).length > 5,
  });
  const fimDefaultModel = useLLMConfigStore((s) => s.fimDefaultModel);
  const fimFallbackModel = useLLMConfigStore((s) => s.fimFallbackModel);
  const setIsLoading = useFimStore((s) => s.setIsLoading);
  
  const isCoachEnabledRef = useRef(true);
  const fimDefaultModelRef = useRef(fimDefaultModel);
  const fimFallbackModelRef = useRef(fimFallbackModel);
  const setIsLoadingRef = useRef(setIsLoading);
  
  const { data: gitStatusData } = useQuery({
    queryKey: ['git-status', projectId],
    queryFn: () => getGitStatus(projectId),
    refetchInterval: 5000,
    enabled: !!projectId
  });
  
  const fileContent = editorRef.current?.getValue() || initialValue;
  const lineCount = fileContent ? fileContent.split('\n').length : 0;
  
  let gitStatusLabel = 'clean';
  if (gitStatusData?.raw_output && node.file_path) {
    const lines = gitStatusData.raw_output.split('\n');
    const fileLine = lines.find((line: string) => line.endsWith(node.file_path!));
    if (fileLine) {
      const code = fileLine.substring(0, 2);
      if (code === '??') gitStatusLabel = 'untracked';
      else if (code[0] !== ' ' && code[0] !== '?') gitStatusLabel = 'staged';
      else gitStatusLabel = 'modified';
    }
  }
  
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);

  useEffect(() => {
    isCoachEnabledRef.current = isCoachEnabled;
  }, [isCoachEnabled]);

  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      // Monaco frequently throws unhandled "Canceled" rejections when disposing models 
      // during active tokenization/language-service processing. We silence it to prevent Next.js overlay.
      if (event.reason && (event.reason.name === 'Canceled' || event.reason.message === 'Canceled' || event.reason === 'Canceled')) {
        event.preventDefault();
      }
    };
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  }, []);

  useEffect(() => {
    fimDefaultModelRef.current = fimDefaultModel;
    fimFallbackModelRef.current = fimFallbackModel;
  }, [fimDefaultModel, fimFallbackModel]);

  useEffect(() => {
    setIsLoadingRef.current = setIsLoading;
  }, [setIsLoading]);

  const focusTarget = useFocusStore((s) => s.target);
  const focusVersion = useFocusStore((s) => s.version);

  useEffect(() => {
    if (focusTarget === 'editor') {
      editorRef.current?.focus();
    }
  }, [focusTarget, focusVersion]);
  const editorModeRef = useRef(editorMode);

  const runCoachAnalysis = useCallback(async (model: monacoEditor.ITextModel, editor: monacoEditor.IStandaloneCodeEditor) => {
    if (model.isDisposed()) return;
    
    const content = model.getValue();
    const currentHash = hashString(content);
    
    if (globalCoachCache.has(currentHash)) {
      const response = globalCoachCache.get(currentHash);
      setCoachOverview(response.overview);
      
      const monacoMarkers = response.contextual_advice.map((m: any) => ({
        severity: m.severity === 'error' ? monacoRef.current!.MarkerSeverity.Error : 
                  m.severity === 'warning' ? monacoRef.current!.MarkerSeverity.Warning : 
                  monacoRef.current!.MarkerSeverity.Hint,
        message: m.message,
        startLineNumber: m.line,
        startColumn: 1,
        endLineNumber: m.line,
        endColumn: model.getLineMaxColumn(m.line),
        explanation: m.explanation
      }));
      
      monacoRef.current!.editor.setModelMarkers(model, 'ai-coach', monacoMarkers as any);
      return;
    }
    
    setIsLoadingRef.current(true);
    setIsAnalyzing(true);
    try {
      const language = node.file_path?.split('.').pop() || '';
      const position = editor.getPosition();
      
      const response = await fetchCodeCoachAnalysis(
        content,
        language,
        position?.lineNumber || 1,
        fimDefaultModelRef.current,
        fimFallbackModelRef.current
      );
      
      if (model.isDisposed()) return;
      
      globalCoachCache.set(currentHash, response);
      
      setCoachOverview(prev => {
        if (response.overview.is_degraded && prev && prev.clean_code_score > 0) {
          return prev;
        }
        return response.overview;
      });
      
      const monacoMarkers = response.contextual_advice.map((m: any) => ({
        severity: m.severity === 'error' ? monacoRef.current!.MarkerSeverity.Error : 
                  m.severity === 'warning' ? monacoRef.current!.MarkerSeverity.Warning : 
                  monacoRef.current!.MarkerSeverity.Hint,
        message: m.message,
        startLineNumber: m.line,
        startColumn: 1,
        endLineNumber: m.line,
        endColumn: model.getLineMaxColumn(m.line),
        explanation: m.explanation
      }));
      
      monacoRef.current!.editor.setModelMarkers(model, 'ai-coach', monacoMarkers as any);
      
      const lines = response.contextual_advice.map((m: any) => m.line);
      setAvailableAdviceLines(lines);
    } catch (error) {
      console.error('[Code Coach] Error:', error);
      setCoachOverview({
        structure: "Error de red o conexión fallida al analizar el código.",
        clean_code_score: 0,
        is_degraded: true,
      });
      setAvailableAdviceLines([]);
    } finally {
      setIsLoadingRef.current(false);
      setIsAnalyzing(false);
    }
  }, [fimDefaultModelRef, fimFallbackModelRef, node.file_path]);

  const forceSenseiAnalysis = useCallback(() => {
    isDirtyRef.current = true;
    setIsDirty(true);
    if (coachTimerRef.current) clearTimeout(coachTimerRef.current);
    const model = editorRef.current?.getModel();
    if (model && !model.isDisposed()) {
      runCoachAnalysis(model, editorRef.current as monacoEditor.IStandaloneCodeEditor);
    }
  }, [runCoachAnalysis]);

  useEffect(() => {
    const handler = () => forceSenseiAnalysis();
    window.addEventListener("trigger-sensei", handler);
    return () => window.removeEventListener("trigger-sensei", handler as any);
  }, [forceSenseiAnalysis]);

  useEffect(() => {
    if (isEditorReady && isCoachEnabled && editorRef.current) {
      const model = editorRef.current.getModel();
      if (model && !model.isDisposed() && model.getValue().length > 5) {
        const timeout = setTimeout(() => {
          runCoachAnalysis(model, editorRef.current!);
        }, 500);
        return () => clearTimeout(timeout);
      }
    }
  }, [isEditorReady, isCoachEnabled, runCoachAnalysis]);

  const vimStatusRef = useRef<HTMLDivElement | null>(null);
  const originalContentRef = useRef('');
  const currentContentRef = useRef('');
  // initialValue moved to top of component
  // editorRef moved to top of component
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vimInstanceRef = useRef<any>(null);
  const vimObserverRef = useRef<MutationObserver | null>(null);
  const vimPendingRef = useRef(false);
  const dirtyCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSaveRef = useRef<(saveAs?: string) => Promise<void>>(async () => {});
  const isSavingRef = useRef(false);
  const coachTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markDirty = useTabsStore((s) => s.markDirty);

  useEffect(() => {
    markDirty(node.id, isDirty);
  }, [isDirty, node.id, markDirty]);

  useEffect(() => {
    let isMounted = true;

    const loadContent = async () => {
      if (isMounted) setLoading(true);

      const backupKey = node.file_path || node.id;
      const backup = useUnsavedStore.getState().getContent(backupKey);

      if (!node.file_path) {
        originalContentRef.current = backup;
        currentContentRef.current = backup;
        setInitialValue(backup);
        if (isMounted) setLoading(false);
        return;
      }

      try {
        const data = await getFileContent(projectId, node.file_path);
        if (isMounted) {
          const restored = backup && backup !== data ? backup : data;
          originalContentRef.current = data;
          currentContentRef.current = restored;
          setInitialValue(restored);
          if (restored !== data) setIsDirty(true);
          setLoading(false);
        }
      } catch {
        if (isMounted) {
          originalContentRef.current = '// Error loading file';
          currentContentRef.current = '// Error loading file';
          setLoading(false);
        }
      }
    };

    loadContent();

    return () => {
      isMounted = false;
      if (lintTimerRef.current) clearTimeout(lintTimerRef.current);
      if (backupTimerRef.current) {
        clearTimeout(backupTimerRef.current);
        if (editorRef.current) {
          const backupKey = node.file_path || node.id;
          useUnsavedStore.getState().setContent(backupKey, editorRef.current.getValue());
        }
      }
      if (dirtyCheckTimerRef.current) clearTimeout(dirtyCheckTimerRef.current);
      if (coachTimerRef.current) clearTimeout(coachTimerRef.current);
      if (vimObserverRef.current) {
        vimObserverRef.current.disconnect();
        vimObserverRef.current = null;
      }
      if (vimInstanceRef.current) {
        vimInstanceRef.current.dispose();
        vimInstanceRef.current = null;
      }
      vimPendingRef.current = false;
    };
  }, [projectId, node.file_path, node.id]);

  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (event.reason && event.reason.name === 'Canceled') {
        event.preventDefault(); // Suppress benign Monaco Editor Canceled errors
      }
    };
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  }, []);

  // El Code Coach se inicia en handleEditorDidMount

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !vimMode || vimInstanceRef.current || vimPendingRef.current) {
      if (!editor) console.warn('[MONACO BOOT] Vim init reactivo omitido: editorRef vacío');
      else if (!vimMode) console.log('[MONACO BOOT] Vim init reactivo omitido: vimMode=false');
      else if (vimInstanceRef.current) console.log('[MONACO BOOT] Vim init reactivo omitido: instancia previa existe');
      return;
    }

    vimPendingRef.current = true;
    console.log('[MONACO BOOT] Intentando iniciar Vim (reactivo)...');
    import("monaco-vim").then(({ initVimMode, VimMode }) => {
      if (!vimPendingRef.current) {
        console.warn('[MONACO BOOT] Vim init cancelado: vimPendingRef desactivo');
        return;
      }

      try {
        if (!editor || !editor.getModel() || editor.getModel()?.isDisposed()) {
          console.warn('[MONACO BOOT] Vim init cancelado: editor descartado');
          return;
        }

        const statusNode = document.createElement('div');
        statusNode.id = 'vim-statusbar';
        statusNode.style.position = 'absolute';
        statusNode.style.bottom = '0';
        statusNode.style.left = '0';
        statusNode.style.right = '0';
        statusNode.style.width = '100%';
        statusNode.style.padding = '2px 8px';
        statusNode.style.fontSize = '12px';
        statusNode.style.backgroundColor = '#1e1e1e';
        statusNode.style.borderTop = '1px solid #333';
        statusNode.style.color = '#fff';
        statusNode.style.zIndex = '10';

        const container = editor.getContainerDomNode();
        if (!container) {
          throw new Error('No se obtuvo el container DOM del editor');
        }
        container.style.position = 'relative';
        container.style.overflow = 'hidden';
        container.appendChild(statusNode);
        vimStatusRef.current = statusNode;
        console.log('[MONACO BOOT] Statusbar DOM creado y anexado al editor');

        const vim = initVimMode(editor, statusNode);
        vimInstanceRef.current = vim;
        console.log('[MONACO BOOT] Vim iniciado con éxito. Adaptador:', vim);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (VimMode as any).Vim.defineEx('write', 'w', (args: { args: string }) => {
          const filename = args.args.trim();
          if (filename) {
            const dir = node.file_path ? node.file_path.substring(0, node.file_path.lastIndexOf('/')) : '';
            const newPath = dir ? `${dir}/${filename}` : filename;
            handleSaveRef.current(newPath);
          } else {
            handleSaveRef.current();
          }
        });
        console.log('[MONACO BOOT] Comando ex :w registrado');

        const modeLabels: Record<string, typeof editorModeRef.current> = {
          'NORMAL': 'locked',
          'VISUAL': 'visual',
          'VISUAL LINE': 'visual',
          'VISUAL BLOCK': 'visual',
          'INSERT': 'editable',
          'REPLACE': 'editable',
        };
        const observer = new MutationObserver(() => {
          const raw = statusNode.textContent?.trim() || '';
          const text = raw.replace(/^-+|-+$/g, '').toUpperCase();
          for (const [label, mode] of Object.entries(modeLabels)) {
            if (text.startsWith(label)) {
              editorModeRef.current = mode;
              setEditorMode(mode);
              break;
            }
          }
        });
        observer.observe(statusNode, { characterData: true, subtree: true, childList: true });
        vimObserverRef.current = observer;
        console.log('[MONACO BOOT] Observer de modo Vim instalado');
      } catch (error) {
        console.error('[MONACO BOOT FATAL ERROR] Vim init (reactivo) lanzó excepción:', error);
      }
    }).catch((error) => {
      console.error('[MONACO BOOT FATAL ERROR] Falló la importación de monaco-vim (reactivo):', error);
      vimPendingRef.current = false;
    });
  }, [vimMode, node.file_path, isEditorReady]);

  useEffect(() => {
    if (!vimMode) {
      if (vimObserverRef.current) {
        vimObserverRef.current.disconnect();
        vimObserverRef.current = null;
      }
      if (vimInstanceRef.current) {
        vimInstanceRef.current.dispose();
        vimInstanceRef.current = null;
      }
      vimPendingRef.current = false;
    }
  }, [vimMode]);

  const checkDirty = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const current = editor.getValue();
    currentContentRef.current = current;
    const dirty = current !== originalContentRef.current;
    setIsDirty(dirty);
  }, []);

  const handleSave = useCallback(async (saveAs?: string) => {
    if (isSavingRef.current || !editorRef.current) return;

    if (!node.file_path) {
      onSaveUntitled?.(editorRef.current.getValue());
      return;
    }

    const targetPath = saveAs || node.file_path;

    if (!targetPath) return;

    isSavingRef.current = true;
    setSaving(true);
    try {
      const current = editorRef.current.getValue();
      await saveFileContent(projectId, targetPath, current);
      originalContentRef.current = current;
      currentContentRef.current = current;
      setIsDirty(false);
      useUnsavedStore.getState().clearContent(targetPath);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
      isSavingRef.current = false;
    }
  }, [projectId, node.file_path, onSaveUntitled]);

  useEffect(() => {
    handleSaveRef.current = handleSave;
  }, [handleSave]);

  const handleSaveAll = useCallback(async () => {
    await handleSave();
  }, [handleSave]);

  const handleUndo = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'undo', null);
  }, []);

  const handleRedo = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'redo', null);
  }, []);

  const handleCut = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    if (selection && !selection.isEmpty()) {
      await navigator.clipboard.writeText(editor.getModel()?.getValueInRange(selection) ?? '');
      editor.executeEdits('cut', [{
        range: selection,
        text: '',
        forceMoveMarkers: true,
      }]);
    }
  }, []);

  const handleCopy = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    if (selection && !selection.isEmpty()) {
      await navigator.clipboard.writeText(editor.getModel()?.getValueInRange(selection) ?? '');
    }
  }, []);

  const handlePaste = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const selection = editor.getSelection();
        editor.executeEdits('paste', [{
          range: selection ?? editor.getModel()!.getFullModelRange(),
          text,
        }]);
      }
    } catch {
      // clipboard read may be denied
    }
  }, []);

  const handleFind = useCallback(() => {
    editorRef.current?.getAction('actions.find')?.run();
  }, []);

  const filePath = node?.file_path ?? '';
  const isUntitled = !node.file_path;
  const fileName = node.file_path
    ? (filePath.split('/').pop() || 'untitled')
    : (node.name || 'Sin título');
  const fileMarkers = useMarkersStore((s) => s.files[filePath]);

  const editorPath = node.file_path || node.id;

  const editorOptions = useMemo(() => ({
    minimap: { enabled: false },
    fontSize: 13,
    wordWrap: "on" as const,
    padding: { top: 16 },
    inlineSuggest: { enabled: true },
  }), []);

  const handleEditorDidMount: OnMount = useCallback((editor, monaco) => {
    console.log('[MONACO BOOT] handleEditorDidMount disparado. vimMode=', vimMode, 'path=', node.file_path);
    // eslint-disable-next-line react-hooks/immutability
    editorRef.current = editor;
    monacoRef.current = monaco;
    setIsEditorReady(true);

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      allowNonTsExtensions: true,
      target: monaco.languages.typescript.ScriptTarget.ESNext,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      allowJs: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      isolatedModules: true,
    });

    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
      diagnosticCodesToIgnore: [2307, 2792, 7026, 2875, 2503],
    });

    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
      diagnosticCodesToIgnore: [2307, 2792, 7026, 2875, 2503],
    });

    if (!markersListenerRegistered) {
      markersListenerRegistered = true;

      const syncMarkersForUri = (monacoInstance: typeof monaco, uri: Uri) => {
        const { setMarkers } = useMarkersStore.getState();
        const allMarkers = monacoInstance.editor.getModelMarkers({ resource: uri });
        const markers = allMarkers.map((m: monacoEditor.IMarker) => ({
          line: m.startLineNumber,
          column: m.startColumn,
          message: m.message,
          severity: m.severity,
        }));
        const path = normalizeMonacoUri(uri);
        if (markers.length > 0) {
          console.log('[markers]', path, { total: markers.length });
        }
        setMarkers(path, markers);
      };

      monaco.editor.onDidChangeMarkers((uris: readonly Uri[]) => {
        for (const uri of uris) {
          syncMarkersForUri(monaco, uri);
        }
      });

      for (const model of monaco.editor.getModels()) {
        syncMarkersForUri(monaco, model.uri);
      }
    }

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyS, () => {
      forceSenseiAnalysis();
    });

    if (node.metadata) {
      try {
        const metadataStr = typeof node.metadata === "string" ? node.metadata : JSON.stringify(node.metadata);
        const meta = JSON.parse(metadataStr);
        if (meta.position) {
          editor.revealLineInCenter(meta.position.line);
          editor.setPosition({ lineNumber: meta.position.line, column: meta.position.column || 1 });
          editor.focus();
        } else if (meta.start_line) {
          editor.revealLineInCenter(meta.start_line);
          editor.setPosition({ lineNumber: meta.start_line, column: 1 });
        }
      } catch { /* ignore */ }
    }

    editor.onDidChangeCursorPosition((e) => {
      const model = editor.getModel();
      if (!model) return;
      const markers = monaco.editor.getModelMarkers({ owner: 'ai-coach', resource: model.uri });
      const currentMarker = markers.find((m: monacoEditor.IMarker) => m.startLineNumber === e.position.lineNumber);
      if (currentMarker && (currentMarker as any).explanation) {
        setCoachExplanation((currentMarker as any).explanation);
        setCurrentCursorAdvice({
          line: currentMarker.startLineNumber,
          severity: currentMarker.severity === monaco.MarkerSeverity.Error ? 'error' : 
                    currentMarker.severity === monaco.MarkerSeverity.Warning ? 'warning' : 'hint',
          message: currentMarker.message,
          explanation: (currentMarker as any).explanation
        });
      } else {
        setCoachExplanation(null);
        setCurrentCursorAdvice(null);
      }
    });

    editor.onDidChangeModelContent(() => {
      const model = editor.getModel();
      
      // We do NOT clear markers or states here to maintain the Stale-While-Revalidate pattern.
      // The old markers will remain until the new ones arrive.
      
      if (!isDirtyRef.current) {
        isDirtyRef.current = true;
        setIsDirty(true);
      }

      if (coachTimerRef.current) clearTimeout(coachTimerRef.current);
      if (isCoachEnabledRef.current && model && !model.isDisposed()) {
        // Strict 3.5s debounce to prevent API spam and protect LLM rate limits
        coachTimerRef.current = setTimeout(() => {
          if (isDirtyRef.current) {
            runCoachAnalysis(model, editor);
          }
        }, 3500);
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
        const backupKey = node.file_path || node.id;
        useUnsavedStore.getState().setContent(backupKey, editor.getValue());
      }, 1000);

      if (lintTimerRef.current) clearTimeout(lintTimerRef.current);
      lintTimerRef.current = setTimeout(async () => {
        const model = editor.getModel();
        if (!model || model.isDisposed()) return;
        try {
          const res = await fetch(`${API_BASE_URL}/editor/lint`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: editor.getValue(),
              language: 'python',
            }),
          });
          if (!res.ok) return;
          const diagnostics: LintDiagnostic[] = await res.json();
          const model2 = editor.getModel();
          if (!model2 || model2.isDisposed()) return;
          const markers = diagnostics.map((d) => ({
            severity: monaco.MarkerSeverity.Error,
            message: d.message,
            startLineNumber: d.line,
            startColumn: d.column,
            endLineNumber: d.line,
            endColumn: d.column + 1,
          }));
          monaco.editor.setModelMarkers(model2, 'lint', markers);
        } catch {
          // network errors silently ignored
        }
      }, 500);
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, () => {
      editor.getAction('editor.action.addSelectionToNextFindMatch')?.run();
    }, '!vimMode');
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyD, () => {
      editor.getAction('editor.action.copyLinesDownAction')?.run();
    });
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.UpArrow, () => {
      editor.getAction('editor.action.moveLinesUpAction')?.run();
    });
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.DownArrow, () => {
      editor.getAction('editor.action.moveLinesDownAction')?.run();
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL, () => {
      editor.getAction('editor.action.expandLineSelection')?.run();
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyK, () => {
      editor.getAction('editor.action.deleteLines')?.run();
    });
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyA, () => {
      editor.getAction('editor.action.insertCursorAbove')?.run();
    });
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyB, () => {
      editor.getAction('editor.action.insertCursorBelow')?.run();
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSaveRef.current();
    });

    checkDirty();
  }, [node.metadata, checkDirty, node.file_path, node.id, vimMode]);

  if (loading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
        Cargando código...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-3 py-1.5 bg-[#1e1e1e] border-b border-zinc-800/50 shrink-0">
        <Code2 className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <span className="text-xs text-zinc-300 truncate max-w-[200px]">
          {fileName}
          {isDirty && <span className="text-yellow-400 ml-0.5">&bull;</span>}
        </span>

        {vimMode && (
          <span className="flex items-center gap-0.5 shrink-0">
            <span className={cn(
              "px-1.5 py-0.5 rounded text-[10px] transition-colors flex items-center gap-0.5 border",
              editorMode === 'locked'
                ? "bg-white/20 text-white border-white/30"
                : "text-zinc-500 border-transparent"
            )}>
              <Eye className="w-3 h-3" />
              Normal
            </span>
            <span className={cn(
              "px-1.5 py-0.5 rounded text-[10px] transition-colors flex items-center gap-0.5 border",
              editorMode === 'visual'
                ? "bg-purple-500/30 text-purple-200 border-purple-400/40"
                : "text-zinc-500 border-transparent"
            )}>
              <MousePointer2 className="w-3 h-3" />
              Visual
            </span>
            <button
              onClick={() => editorRef.current?.trigger('keyboard', 'type', { text: 'i' })}
              className={cn(
                "px-1.5 py-0.5 rounded text-[10px] transition-colors flex items-center gap-0.5 border",
                editorMode === 'editable'
                  ? "bg-green-500/30 text-green-200 border-green-400/40"
                  : "text-zinc-500 border-transparent hover:bg-green-500/10 hover:text-green-400 hover:border-green-500/20"
              )}
              title="Modo Edición (i)"
            >
              <Pencil className="w-3 h-3" />
              Editar
            </button>
            {editorMode === 'editable' && (
              <button
                onClick={() => editorRef.current?.trigger('keyboard', 'type', { text: '\x1b' })}
                className="px-1.5 py-0.5 rounded text-[10px] transition-colors flex items-center gap-0.5 border text-zinc-500 border-transparent hover:bg-blue-500/10 hover:text-blue-400 hover:border-blue-500/20"
                title="Volver a Modo Normal (ESC)"
              >
                <Eye className="w-3 h-3" />
                ESC
              </button>
            )}
          </span>
        )}

        <div className="flex-1" />

        <div className="flex items-center gap-0.5">
          <button
            className={TOOLBAR_BUTTON}
            onClick={() => handleSave()}
            disabled={(!isDirty && !isUntitled) || saving}
            title={isUntitled ? "Guardar como nuevo archivo" : "Guardar archivo actual (Ctrl+S)"}
            aria-label="Guardar archivo actual"
          >
            <Save className="w-3.5 h-3.5" />
          </button>

          <button
            className={TOOLBAR_BUTTON}
            onClick={handleSaveAll}
            title="Guardar todos los archivos modificados"
            aria-label="Guardar todos los archivos"
          >
            <SaveAll className="w-3.5 h-3.5" />
          </button>
        </div>

        {onMentor && (
          <>
        <div className="w-px h-5 bg-zinc-700/50 mx-1" />

        <CoachToggleButton isCoachEnabled={isCoachEnabled} onToggle={() => setIsCoachEnabled(!isCoachEnabled)} />
            <button
              className={TOOLBAR_BUTTON}
              onClick={() => onMentor(node.file_path || fileName, editorRef.current?.getValue() || '')}
              title="Abrir chat con el Sensei (mentor IA)"
              aria-label="Abrir chat con el Sensei"
            >
              <GraduationCap className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        <div className="w-px h-5 bg-zinc-700/50 mx-1" />

        <div className="flex items-center gap-0.5">
          <button className={TOOLBAR_BUTTON} onClick={handleUndo} title="Deshacer (Ctrl+Z)" aria-label="Deshacer">
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
          </button>

          <button className={TOOLBAR_BUTTON} onClick={handleRedo} title="Rehacer (Ctrl+Y)" aria-label="Rehacer">
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>
          </button>
        </div>

        <div className="w-px h-5 bg-zinc-700/50 mx-1" />

        <div className="flex items-center gap-0.5">
          <button className={TOOLBAR_BUTTON} onClick={handleCut} title="Cortar (Ctrl+X)" aria-label="Cortar">
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
          </button>

          <button className={TOOLBAR_BUTTON} onClick={handleCopy} title="Copiar (Ctrl+C)" aria-label="Copiar">
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>

          <button className={TOOLBAR_BUTTON} onClick={handlePaste} title="Pegar (Ctrl+V)" aria-label="Pegar">
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
          </button>
        </div>

        <div className="w-px h-5 bg-zinc-700/50 mx-1" />

        <button className={TOOLBAR_BUTTON} onClick={handleFind} title="Buscar (Ctrl+F)" aria-label="Buscar">
          <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
      </div>

      {filePath && (
        <div className="flex items-center justify-between text-xs text-zinc-400 bg-zinc-900 px-3 py-1 border-b border-zinc-800/50 shrink-0">
          <div className="flex items-center gap-0.5 truncate min-w-0">
            {filePath.split('/').filter(Boolean).map((seg, i, arr) => (
              i < arr.length - 1 ? (
                <span key={i} className="flex items-center gap-0.5 min-w-0">
                  <span className="truncate text-zinc-500">{seg}</span>
                  <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />
                </span>
              ) : (
                <span key={i} className="text-zinc-300 font-medium truncate">{seg}</span>
              )
            ))}
          </div>
          <div className="shrink-0 ml-2 flex items-center gap-2">
            {fileMarkers && (
              <>
                {fileMarkers.errors > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-red-400 font-medium">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                    {fileMarkers.errors}
                  </span>
                )}
                {fileMarkers.warnings > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-yellow-400 font-medium">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500" />
                    {fileMarkers.warnings}
                  </span>
                )}
                {fileMarkers.errors === 0 && fileMarkers.warnings === 0 && (
                  <span className="text-[11px] text-zinc-600">Sin errores</span>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 relative overflow-hidden min-h-0 min-w-0">
        {isCoachEnabled ? (
          <div className="absolute inset-0 flex flex-row w-full h-full">
            <div className="flex-1 relative h-full overflow-hidden">
              <Editor
                key={editorPath}
                height="100%"
                theme="vs-dark"
                path={editorPath}
                defaultValue={initialValue}
                onMount={handleEditorDidMount}
                options={editorOptions}
                loading={null}
              />
            </div>
            <div className="w-1.5 shrink-0 bg-[#1a1a1a] border-l border-r border-zinc-800 z-10" />
            <div className="w-[350px] shrink-0 h-full relative overflow-hidden">
              <CoachSidebar 
                techData={techData}
                onRescan={() => handleRescan()}
                isScanningTech={isScanningTech}
                isTechError={isTechError}
                overview={coachOverview}
                cursorAdvice={currentCursorAdvice}
                isAnalyzingCode={isAnalyzing}
                fileMetadata={{ lineCount, gitStatus: gitStatusLabel }}
                availableAdviceLines={availableAdviceLines}
                isEditorDirty={isDirty}
              />
            </div>
          </div>
        ) : (
          <div className="absolute inset-0">
            <Editor
              key={editorPath}
              height="100%"
              theme="vs-dark"
              path={editorPath}
              defaultValue={initialValue}
              onMount={handleEditorDidMount}
              options={editorOptions}
              loading={null}
            />
          </div>
        )}
      </div>
      <ContextHUD
        editorRef={editorRef}
        mode={editorMode as VimTutorMode}
        vimEnabled={!!vimMode}
        coachExplanation={coachExplanation}
      />
      <FimHintBar />
    </div>
  );
}
