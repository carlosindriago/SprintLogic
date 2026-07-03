import { useState, useEffect, useRef, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor as monacoEditor, Uri } from 'monaco-editor';
import { getFileContent, saveFileContent, API_BASE_URL } from '@/lib/api';
import { useTabsStore } from '@/store/tabsStore';
import { useMarkersStore } from '@/store/markersStore';
import { useUnsavedStore } from '@/store/unsavedStore';
import type { GraphNode } from '@/types';
import { Code2, ChevronRight, Pencil } from 'lucide-react';

interface LintDiagnostic {
  line: number;
  column: number;
  message: string;
  severity: string;
}

const TOOLBAR_BUTTON =
  "h-7 w-7 flex items-center justify-center rounded text-zinc-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed";

let markersListenerRegistered = false;

function normalizeMonacoUri(uri: Uri): string {
  // Monaco creates URIs from onMount's path prop.
  // For absolute paths (e.g. /home/carlos/.../file.ts), uri.path IS
  // the exact file path — keep it as-is so it matches node.file_path.
  // For file:// scheme URIs, path also holds the correct absolute path.
  // For inmemory:// models, extract the path from the string form.
  if (uri.scheme === 'file' || !uri.scheme) {
    return uri.path;
  }
  const str = uri.toString();
  return str.replace(/^[a-z]+:\/\//, '');
}

export default function EditorTab({
  projectId,
  node,
  vimMode,
  onSaveUntitled,
}: {
  projectId: string;
  node: GraphNode;
  vimMode: boolean;
  onSaveUntitled?: (content: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [editable, setEditable] = useState(false);
  const originalContentRef = useRef('');
  const currentContentRef = useRef('');
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const vimInstanceRef = useRef<{ dispose(): void } | null>(null);
  const dirtyCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSaveRef = useRef<() => Promise<void>>(async () => {});

  const markDirty = useTabsStore((s) => s.markDirty);

  useEffect(() => {
    markDirty(node.id, isDirty);
  }, [isDirty, node.id, markDirty]);

  useEffect(() => {
    let isMounted = true;

    const loadContent = async () => {
      if (isMounted) setLoading(true);

      // Restore unsaved backup if it exists (survives crashes / restarts)
      const backupKey = node.file_path || node.id;
      const backup = useUnsavedStore.getState().getContent(backupKey);

      if (!node.file_path) {
        originalContentRef.current = backup;
        currentContentRef.current = backup;
        if (isMounted) setLoading(false);
        return;
      }

      try {
        const data = await getFileContent(projectId, node.file_path);
        if (isMounted) {
          // If there's a backup and it differs from disk, restore it
          const restored = backup && backup !== data ? backup : data;
          originalContentRef.current = restored;
          currentContentRef.current = restored;
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
      if (vimInstanceRef.current) {
        vimInstanceRef.current.dispose();
        vimInstanceRef.current = null;
      }
    };
  }, [projectId, node.file_path]);

  const checkDirty = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const current = editor.getValue();
    currentContentRef.current = current;
    const dirty = current !== originalContentRef.current;
    setIsDirty(dirty);
  }, []);

  const handleSave = useCallback(async () => {
    if (saving || !editorRef.current) return;
    if (!node.file_path) {
      onSaveUntitled?.(editorRef.current.getValue());
      return;
    }
    setSaving(true);
    try {
      const current = editorRef.current.getValue();
      await saveFileContent(projectId, node.file_path, current);
      originalContentRef.current = current;
      currentContentRef.current = current;
      setIsDirty(false);
      useUnsavedStore.getState().clearContent(node.file_path);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  }, [projectId, node.file_path, saving, onSaveUntitled, node.id]);

  handleSaveRef.current = handleSave;

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
  const fileName = node.file_path
    ? (filePath.split('/').pop() || 'untitled')
    : (node.name || 'Sin título');
  const fileMarkers = useMarkersStore((s) => s.files[filePath]);

  const handleEditorDidMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;

    // ── Monaco TypeScript compiler configuration ──
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
      noSemanticValidation: false,
      noSyntaxValidation: false,
      diagnosticCodesToIgnore: [2307, 2792, 7026, 2875, 2503],
    });

    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      diagnosticCodesToIgnore: [2307, 2792, 7026, 2875, 2503],
    });

    // ── Global markers telemetry ──
    if (!markersListenerRegistered) {
      markersListenerRegistered = true;

      const syncMarkersForUri = (monacoInstance: typeof monaco, uri: Uri) => {
        const { setMarkers } = useMarkersStore.getState();
        const allMarkers = monacoInstance.editor.getModelMarkers({ resource: uri });
        const errors = allMarkers.filter((m: monacoEditor.IMarker) => m.severity === monacoInstance.MarkerSeverity.Error).length;
        const warnings = allMarkers.filter((m: monacoEditor.IMarker) => m.severity === monacoInstance.MarkerSeverity.Warning).length;
        const path = normalizeMonacoUri(uri);
        if (errors > 0 || warnings > 0) {
          console.log('[markers]', path, { errors, warnings, totalMarkers: allMarkers.length });
        }
        setMarkers(path, { errors, warnings });
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

    if (vimMode) {
      import("monaco-vim").then(({ initVimMode }) => {
        const statusNode = document.createElement('div');
        statusNode.style.padding = '2px 8px';
        statusNode.style.fontSize = '12px';
        statusNode.style.backgroundColor = '#1e1e1e';
        statusNode.style.borderTop = '1px solid #333';
        statusNode.style.color = '#fff';
        editor.getContainerDomNode().parentElement?.appendChild(statusNode);

        const vim = initVimMode(editor, statusNode);
        vimInstanceRef.current = vim;
      }).catch((err) => {
        console.error("Vim initialization failed:", err);
      });
    }

    if (node.metadata) {
      try {
        const metadataStr = typeof node.metadata === "string" ? node.metadata : JSON.stringify(node.metadata);
        const meta = JSON.parse(metadataStr);
        if (meta.start_line) {
          editor.revealLineInCenter(meta.start_line);
          editor.setPosition({ lineNumber: meta.start_line, column: 1 });
        }
      } catch { /* ignore */ }
    }

    let lintTimer: ReturnType<typeof setTimeout> | null = null;
    let backupTimer: ReturnType<typeof setTimeout> | null = null;

    editor.onDidChangeModelContent(() => {
      if (dirtyCheckTimerRef.current) clearTimeout(dirtyCheckTimerRef.current);
      dirtyCheckTimerRef.current = setTimeout(checkDirty, 50);

      // Auto-backup unsaved changes to localStorage (all files)
      if (backupTimer) clearTimeout(backupTimer);
      backupTimer = setTimeout(() => {
        const backupKey = node.file_path || node.id;
        useUnsavedStore.getState().setContent(backupKey, editor.getValue());
      }, 1000);

      if (lintTimer) clearTimeout(lintTimer);
      lintTimer = setTimeout(async () => {
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
          const model = editor.getModel();
          if (!model) return;
          const markers = diagnostics.map((d) => ({
            severity: monaco.MarkerSeverity.Error,
            message: d.message,
            startLineNumber: d.line,
            startColumn: d.column,
            endLineNumber: d.line,
            endColumn: d.column + 1,
          }));
          monaco.editor.setModelMarkers(model, 'lint', markers);
        } catch {
          // network errors silently ignored
        }
      }, 500);
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSaveRef.current();
    });

    // ── Vim-style read-only navigation ──────────────────────────────
    // 'i' to enter edit mode (only when read-only)
    editor.addAction({
      id: 'sprintlogic-unlock-editor',
      label: 'Unlock editor for editing',
      keybindings: [monaco.KeyCode.KeyI],
      precondition: 'readOnly',
      run: () => setEditable(true),
    });

    // 'Escape' to return to read-only mode (only when editable)
    editor.addAction({
      id: 'sprintlogic-lock-editor',
      label: 'Return to read-only mode',
      keybindings: [monaco.KeyCode.Escape],
      precondition: '!readOnly',
      run: () => setEditable(false),
    });

    editor.addAction({
      id: 'sprintlogic-nav-left',
      label: 'Move cursor left',
      keybindings: [monaco.KeyCode.KeyH],
      precondition: 'readOnly',
      run: (ed) => ed.trigger('keyboard', 'cursorLeft', null),
    });
    editor.addAction({
      id: 'sprintlogic-nav-down',
      label: 'Move cursor down',
      keybindings: [monaco.KeyCode.KeyJ],
      precondition: 'readOnly',
      run: (ed) => ed.trigger('keyboard', 'cursorDown', null),
    });
    editor.addAction({
      id: 'sprintlogic-nav-up',
      label: 'Move cursor up',
      keybindings: [monaco.KeyCode.KeyK],
      precondition: 'readOnly',
      run: (ed) => ed.trigger('keyboard', 'cursorUp', null),
    });
    editor.addAction({
      id: 'sprintlogic-nav-right',
      label: 'Move cursor right',
      keybindings: [monaco.KeyCode.KeyL],
      precondition: 'readOnly',
      run: (ed) => ed.trigger('keyboard', 'cursorRight', null),
    });
    editor.addAction({
      id: 'sprintlogic-nav-word-right',
      label: 'Move cursor word right',
      keybindings: [monaco.KeyCode.KeyW],
      precondition: 'readOnly',
      run: (ed) => ed.trigger('keyboard', 'cursorWordRight', null),
    });
    editor.addAction({
      id: 'sprintlogic-nav-word-left',
      label: 'Move cursor word left',
      keybindings: [monaco.KeyCode.KeyB],
      precondition: 'readOnly',
      run: (ed) => ed.trigger('keyboard', 'cursorWordLeft', null),
    });

    // gg → top of file (double-tap g within 500ms)
    let lastGPress = 0;
    editor.addAction({
      id: 'sprintlogic-nav-top',
      label: 'Go to top of file (gg)',
      keybindings: [monaco.KeyCode.KeyG],
      precondition: 'readOnly',
      run: (ed) => {
        const now = Date.now();
        if (now - lastGPress < 500) {
          ed.setPosition({ lineNumber: 1, column: 1 });
          lastGPress = 0;
        } else {
          lastGPress = now;
        }
      },
    });

    // Shift+G → bottom of file
    editor.addAction({
      id: 'sprintlogic-nav-bottom',
      label: 'Go to bottom of file',
      keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.KeyG],
      precondition: 'readOnly',
      run: (ed) => ed.trigger('keyboard', 'cursorBottom', null),
    });

    // Ctrl+D → page down
    editor.addAction({
      id: 'sprintlogic-nav-page-down',
      label: 'Scroll page down',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD],
      precondition: 'readOnly',
      run: (ed) => ed.trigger('keyboard', 'cursorPageDown', null),
    });

    // Ctrl+U → page up
    editor.addAction({
      id: 'sprintlogic-nav-page-up',
      label: 'Scroll page up',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyU],
      precondition: 'readOnly',
      run: (ed) => ed.trigger('keyboard', 'cursorPageUp', null),
    });

    // / → find
    editor.addAction({
      id: 'sprintlogic-nav-find',
      label: 'Open find widget',
      keybindings: [monaco.KeyCode.Slash],
      precondition: 'readOnly',
      run: (ed) => ed.getAction('actions.find')?.run(),
    });

    checkDirty();
  }, [vimMode, node.metadata, checkDirty]);

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

        {!editable && (
          <button
            onClick={() => setEditable(true)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors shrink-0"
            title="Solo lectura — Click o presiona i para editar"
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}

        <div className="flex-1" />

        <div className="flex items-center gap-0.5">
          <button
            className={TOOLBAR_BUTTON}
            onClick={handleSave}
            disabled={!isDirty || saving}
            title="Guardar (Ctrl+S)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          </button>

          <button
            className={TOOLBAR_BUTTON}
            onClick={handleSaveAll}
            title="Guardar Todo"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/><line x1="9" y1="3" x2="18" y2="3"/><line x1="9" y1="8" x2="18" y2="8"/><path d="M4 21h16"/></svg>
          </button>
        </div>

        <div className="w-px h-5 bg-zinc-700/50 mx-1" />

        <div className="flex items-center gap-0.5">
          <button className={TOOLBAR_BUTTON} onClick={handleUndo} title="Deshacer (Ctrl+Z)">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
          </button>

          <button className={TOOLBAR_BUTTON} onClick={handleRedo} title="Rehacer (Ctrl+Y)">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>
          </button>
        </div>

        <div className="w-px h-5 bg-zinc-700/50 mx-1" />

        <div className="flex items-center gap-0.5">
          <button className={TOOLBAR_BUTTON} onClick={handleCut} title="Cortar (Ctrl+X)">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
          </button>

          <button className={TOOLBAR_BUTTON} onClick={handleCopy} title="Copiar (Ctrl+C)">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>

          <button className={TOOLBAR_BUTTON} onClick={handlePaste} title="Pegar (Ctrl+V)">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
          </button>
        </div>

        <div className="w-px h-5 bg-zinc-700/50 mx-1" />

        <button className={TOOLBAR_BUTTON} onClick={handleFind} title="Buscar (Ctrl+F)">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
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

      <div className="flex-1 relative overflow-hidden">
        <Editor
          height="100%"
          theme="vs-dark"
          path={node.file_path || node.id}
          defaultValue={currentContentRef.current}
          onMount={handleEditorDidMount}
          options={{
            readOnly: !editable,
            minimap: { enabled: false },
            fontSize: 13,
            wordWrap: "on",
            padding: { top: 16 },
          }}
        />
      </div>
    </div>
  );
}
