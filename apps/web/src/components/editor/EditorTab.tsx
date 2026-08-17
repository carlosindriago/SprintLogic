import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Editor, { type OnMount, useMonaco } from '@monaco-editor/react';
import type { editor as monacoEditor, languages, Uri } from 'monaco-editor';
import { useQuery } from '@tanstack/react-query';
import { getGitStatus } from '@/lib/api';
import { UndocumentedExport } from '@/lib/api';
import { useFocusStore } from '@/store/focusStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTddStore } from '@/store/tddStore';
import { useMarkersStore } from '@/store/markersStore';
import { useFimStore } from '@/store/fimStore';
import type { GraphNode } from '@/types';
import { GroqFimAdapter } from '@/lib/services/GroqFimAdapter';

import { EditorToolbar } from './components/EditorToolbar';
import { CoachSidebar } from '../CoachSidebar';
import { useEditorState } from './hooks/useEditorState';
import { useCodeCoach } from './hooks/useCodeCoach';
import { useSenseiContext } from './hooks/useSenseiContext';
import { useEditorKeyBindings } from './hooks/useEditorKeyBindings';
import { useVimMode } from './hooks/useVimMode';

// Global error handler to suppress Monaco's internal "Canceled" unhandled rejections
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof window !== 'undefined' && !(window as any).__monacoErrorHandlerRegistered) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__monacoErrorHandlerRegistered = true;
  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason && (event.reason.name === 'Canceled' || event.reason.message === 'Canceled' || event.reason === 'Canceled')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, { capture: true });
}

function normalizeMonacoUri(uri: Uri): string {
  if (uri.scheme === 'file' || !uri.scheme) {
    return uri.path;
  }
  const str = uri.toString();
  return str.replace(/^[a-z]+:\/\//, '');
}

export function EditorTab({
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
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [editorMode, setEditorMode] = useState<'locked' | 'visual' | 'editable'>('locked');
  const [activeLineNumber, setActiveLineNumber] = useState<number | null>(null);

  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const draftDecorationsRef = useRef<string[]>([]);
  const markersListenerRegistered = useRef(false);

  const isTddLocked = useTddStore((state) => state.locks[node.file_path] === 'locked');
  const isCoachEnabled = useSettingsStore((s) => s.isFimEnabled);
  const setIsCoachEnabled = useSettingsStore((s) => s.setFimEnabled);
  const isLoadingCoachGlobal = useFimStore((s) => s.isLoading);

  const {
    loading,
    saving,
    isDirty,
    setIsDirty,
    isDirtyRef,
    initialValue,
    draftModifiedLines,
    isConflictMode,
    handleSave,
    handleEditorChange
  } = useEditorState({
    projectId,
    nodeId: node.id,
    nodePath: node.file_path,
    onSaveUntitled,
    editorRef,
    isCoachEnabled,
    runHealthAnalysis: (model) => runHealthAnalysis(model)
  });

  const {
    techData,
    isScanningTech,
    handleRescan,
    isTechError,
    coachOverview,
    allMentorshipAdvice,
    availableAdviceLines,
    undocumentedExports,
    isAnalyzing,
    runHealthAnalysis,
    runCoachAnalysis,
    runAstAudit,
    forceSenseiAnalysis,
    handleGenerateDoc,
  } = useCodeCoach({
    nodePath: node.file_path,
    initialValue,
    editorRef,
    monacoRef,
    isDirtyRef,
    setIsDirty,
    isConflictMode,
    isEditorReady
  });

  const { handleEditorDidMount: handleSenseiMount } = useSenseiContext({
    nodeId: node.id,
    nodePath: node.file_path,
    monacoRef
  });

  const { handleZenMode, bindEditorKeys } = useEditorKeyBindings({
    nodePath: node.file_path,
    forceSenseiAnalysis,
    handleSave
  });

  useVimMode({
    vimMode: !!vimMode,
    isEditorReady,
    editorRef,
    nodePath: node.file_path,
    setEditorMode,
    onSave: handleSave
  });

  const monaco = useMonaco();

  // GroqFimAdapter for inline completions
  useEffect(() => {
    if (!monaco) return;
    const provider = monaco.languages.registerInlineCompletionsProvider('*', {
      provideInlineCompletions: async (model, position, _context, token) => {
        try {
          if (!useFimStore.getState().fimEnabled) return { items: [] };
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 300);
            token.onCancellationRequested(() => {
              clearTimeout(timer);
              resolve();
            });
          });
          if (token.isCancellationRequested) return { items: [] };
          const prefixLines = [];
          for (let i = Math.max(1, position.lineNumber - 50); i <= position.lineNumber; i++) {
            if (i === position.lineNumber) {
              prefixLines.push(model.getLineContent(i).substring(0, position.column - 1));
            } else {
              prefixLines.push(model.getLineContent(i));
            }
          }
          const suffixLines = [];
          for (let i = position.lineNumber; i <= Math.min(model.getLineCount(), position.lineNumber + 50); i++) {
            if (i === position.lineNumber) {
              suffixLines.push(model.getLineContent(i).substring(position.column - 1));
            } else {
              suffixLines.push(model.getLineContent(i));
            }
          }
          const adapter = new GroqFimAdapter();
          const controller = new AbortController();
          token.onCancellationRequested(() => controller.abort());
          const result = await adapter.getCompletion(prefixLines.join('\n'), suffixLines.join('\n'), model.uri.toString(), controller.signal, { monaco, model, position });
          if (token.isCancellationRequested || !result) return { items: [] };
          return { items: [{ insertText: result }] };
        } catch {
          return { items: [] };
        }
      },
      disposeInlineCompletions: () => {}
    });
    return () => provider.dispose();
  }, [monaco]);

  // Mentorship Code Actions
  useEffect(() => {
    if (!monaco || !allMentorshipAdvice || allMentorshipAdvice.length === 0) return;
    const provider = monaco.languages.registerCodeActionProvider('*', {
      provideCodeActions: (model, range) => {
        const actions: languages.CodeAction[] = [];
        const currentLine = range.startLineNumber;
        allMentorshipAdvice.forEach(advice => {
          if (!advice.snippet_after || advice.snippet_after === "null") return;
          if (Math.abs(advice.line - currentLine) <= 5) {
            const searchRange = advice.snippet_before && advice.snippet_before !== "null"
              ? model.findMatches(advice.snippet_before, false, false, false, null, true)
              : null;
            const editRange = searchRange && searchRange.length > 0 
              ? searchRange[0].range 
              : new monaco.Range(advice.line, 1, advice.line, model.getLineMaxColumn(advice.line));
            actions.push({
              title: `✨ Aplicar sugerencia del Sensei: ${advice.title || advice.message}`,
              kind: 'quickfix',
              isPreferred: true,
              edit: {
                edits: [{
                  resource: model.uri,
                  textEdit: { range: editRange, text: advice.snippet_after },
                  versionId: undefined
                }]
              }
            });
          }
        });
        return { actions, dispose: () => {} };
      }
    });
    return () => provider.dispose();
  }, [monaco, allMentorshipAdvice, node.name]);

  // JSDoc Code Actions
  useEffect(() => {
    if (!monaco || !undocumentedExports || undocumentedExports.length === 0) return;
    const provider = monaco.languages.registerCodeActionProvider('*', {
      provideCodeActions: (model, range) => {
        const actions: languages.CodeAction[] = [];
        const currentLine = range.startLineNumber;
        undocumentedExports.forEach(exp => {
          if (currentLine >= exp.start_line && currentLine <= exp.end_line) {
            actions.push({
              title: `💡 Generar JSDoc con SprintLogic IA para '${exp.name}'`,
              kind: 'quickfix',
              isPreferred: true,
              edit: { edits: [] },
              command: {
                id: 'sprintlogic.generateDocs',
                title: 'Generar Docs',
                arguments: [exp]
              }
            });
          }
        });
        return { actions, dispose: () => {} };
      }
    });
    const commandDisposable = monaco.editor.registerCommand('sprintlogic.generateDocs', (accessor, exp: UndocumentedExport) => {
      handleGenerateDoc(exp);
    });
    return () => {
      provider.dispose();
      commandDisposable.dispose();
    };
  }, [monaco, undocumentedExports, handleGenerateDoc]);

  const { data: gitStatusData } = useQuery({
    queryKey: ['git-status', projectId],
    queryFn: () => getGitStatus(projectId),
    refetchInterval: 30_000,
    enabled: !!projectId
  });

  const fileContent = initialValue;
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

  const focusTarget = useFocusStore((s) => s.target);
  const focusVersion = useFocusStore((s) => s.version);
  useEffect(() => {
    if (focusTarget === 'editor') editorRef.current?.focus();
  }, [focusTarget, focusVersion]);

  // Hot Exit: allow TabBar modal to programmatically save this tab
  useEffect(() => {
    const eventName = `save-request-${node.id}`;
    const handler = async () => {
      try {
        await handleSave();
      } finally {
        window.dispatchEvent(new CustomEvent(`save-done-${node.id}`));
      }
    };
    window.addEventListener(eventName, handler);
    return () => window.removeEventListener(eventName, handler);
  }, [node.id, handleSave]);

  // Hot Exit: apply amber gutter decorations on draft-modified lines
  useEffect(() => {
    const editor = editorRef.current;
    const monacoInstance = monacoRef.current;
    if (!editor || !monacoInstance || !isEditorReady) return;
    const model = editor.getModel();
    if (!model || model.isDisposed()) return;
    
    if (draftModifiedLines.length === 0) {
      draftDecorationsRef.current = editor.deltaDecorations(draftDecorationsRef.current, []);
      return;
    }

    const decorations = draftModifiedLines.map((lineNumber) => ({
      range: new monacoInstance.Range(lineNumber, 1, lineNumber, 1),
      options: {
        isWholeLine: true,
        linesDecorationsClassName: 'draft-modified-gutter',
        className: 'draft-modified-line',
        overviewRuler: { color: '#f59e0b', position: monacoInstance.editor.OverviewRulerLane.Left },
        minimap: { color: '#f59e0b', position: monacoInstance.editor.MinimapPosition.Gutter },
      },
    }));
    draftDecorationsRef.current = editor.deltaDecorations(draftDecorationsRef.current, decorations);
  }, [isEditorReady, draftModifiedLines]);

  const filePath = node?.file_path ?? '';
  const isUntitled = !node.file_path;
  const fileName = node.file_path ? (filePath.split('/').pop() || 'untitled') : (node.name || 'Sin título');
  const fileMarkers = useMarkersStore((s) => s.files[filePath]);

  const handleEditorDidMount: OnMount = useCallback((editor, monacoInstance) => {
    editorRef.current = editor;
    monacoRef.current = monacoInstance;
    setIsEditorReady(true);

    monacoInstance.languages.typescript.typescriptDefaults.setCompilerOptions({
      jsx: monacoInstance.languages.typescript.JsxEmit.ReactJSX,
      moduleResolution: monacoInstance.languages.typescript.ModuleResolutionKind.NodeJs,
      allowNonTsExtensions: true,
      target: monacoInstance.languages.typescript.ScriptTarget.ESNext,
      module: monacoInstance.languages.typescript.ModuleKind.ESNext,
      allowJs: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      isolatedModules: true,
    });
    monacoInstance.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
      diagnosticCodesToIgnore: [2307, 2792, 7026, 2875, 2503],
    });

    if (!markersListenerRegistered.current) {
      markersListenerRegistered.current = true;
      const syncMarkersForUri = (instance: typeof monacoInstance, uri: Uri) => {
        const { setMarkers } = useMarkersStore.getState();
        const allMarkers = instance.editor.getModelMarkers({ resource: uri });
        const markers = allMarkers.map((m: monacoEditor.IMarker) => ({
          line: m.startLineNumber,
          column: m.startColumn,
          message: m.message,
          severity: m.severity,
        }));
        setMarkers(normalizeMonacoUri(uri), markers);
      };
      monacoInstance.editor.onDidChangeMarkers((uris: Uri[]) => {
        for (const uri of uris) syncMarkersForUri(monacoInstance, uri);
      });
      for (const model of monacoInstance.editor.getModels()) {
        syncMarkersForUri(monacoInstance, model.uri);
      }
    }

    bindEditorKeys(editor, monacoInstance);

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

    let cursorTimeout: ReturnType<typeof setTimeout>;
    editor.onDidChangeCursorPosition((e) => {
      if (cursorTimeout) clearTimeout(cursorTimeout);
      cursorTimeout = setTimeout(() => setActiveLineNumber(e.position.lineNumber), 100);
    });

    handleSenseiMount(editor);

    editor.onDidChangeModelContent(() => {
      handleEditorChange();
      const model = editor.getModel();
      if (isCoachEnabled && model && !model.isDisposed()) {
        setTimeout(() => {
          if (isDirtyRef.current) runCoachAnalysis(model, editor);
        }, 3500);
      }
      if (model && !model.isDisposed()) {
        setTimeout(() => runAstAudit(model), 1000);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.metadata, handleSenseiMount, bindEditorKeys, handleEditorChange, isCoachEnabled, runCoachAnalysis, runAstAudit, isDirtyRef]);

  const editorOptions = useMemo(() => ({
    minimap: { enabled: false },
    fontSize: 13,
    wordWrap: "on" as const,
    padding: { top: 16 },
    inlineSuggest: { enabled: true },
    readOnly: isTddLocked,
    domReadOnly: isTddLocked,
  }), [isTddLocked]);

  if (loading) {
    return <div className="absolute inset-0 flex items-center justify-center text-zinc-500">Cargando código...</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <EditorToolbar
        fileName={fileName}
        filePath={filePath}
        isDirty={isDirty}
        isUntitled={isUntitled}
        saving={saving}
        vimMode={!!vimMode}
        editorMode={editorMode}
        isCoachEnabled={isCoachEnabled}
        isLoadingCoach={isLoadingCoachGlobal}
        fileMarkers={fileMarkers}
        onSave={() => handleSave()}
        onSaveAll={() => handleSave()}
        onZenMode={handleZenMode}
        onToggleCoach={() => setIsCoachEnabled(!isCoachEnabled)}
        onMentor={onMentor ? () => onMentor(node.file_path || fileName, editorRef.current?.getValue() || '') : undefined}
        onUndo={() => editorRef.current?.trigger('keyboard', 'undo', null)}
        onRedo={() => editorRef.current?.trigger('keyboard', 'redo', null)}
        onCut={async () => {
          const selection = editorRef.current?.getSelection();
          if (selection && !selection.isEmpty()) {
            try {
              await navigator.clipboard.writeText(editorRef.current?.getModel()?.getValueInRange(selection) ?? '');
            } catch {}
            editorRef.current?.executeEdits('cut', [{ range: selection, text: '', forceMoveMarkers: true }]);
          }
        }}
        onCopy={async () => {
          const selection = editorRef.current?.getSelection();
          if (selection && !selection.isEmpty()) {
            try {
              await navigator.clipboard.writeText(editorRef.current?.getModel()?.getValueInRange(selection) ?? '');
            } catch {}
          }
        }}
        onPaste={async () => {
          try {
            const text = await navigator.clipboard.readText();
            if (text) {
              const selection = editorRef.current?.getSelection();
              editorRef.current?.executeEdits('paste', [{ range: selection ?? editorRef.current!.getModel()!.getFullModelRange(), text }]);
            }
          } catch {}
        }}
        onFind={() => editorRef.current?.getAction('actions.find')?.run()}
        onTriggerType={(text: string) => editorRef.current?.trigger('keyboard', 'type', { text })}
      />

      <div className="flex-1 flex flex-col relative overflow-hidden min-h-0 min-w-0">
        {isTddLocked && (
          <div className="w-full bg-red-900/90 text-red-100 text-[11px] uppercase tracking-wider font-bold py-1.5 px-3 flex items-center justify-center border-b border-red-700/50 shadow-md z-20 shrink-0">
            🔒 TDD Guard Activo: Escribe el test primero para desbloquear este archivo.
          </div>
        )}
        <div className="flex-1 relative min-h-0 w-full">
          {isCoachEnabled ? (
            <div className="absolute inset-0 flex flex-row w-full h-full">
              <div className="flex-1 relative h-full overflow-hidden">
                <Editor
                  key={node.file_path || node.id}
                  height="100%"
                  theme="vs-dark"
                  path={node.file_path || node.id}
                  defaultValue={initialValue}
                  onMount={handleEditorDidMount}
                  options={editorOptions}
                  loading={null}
                />
              </div>
              <div className="w-1.5 shrink-0 bg-[#1a1a1a] border-l border-r border-zinc-800 z-10" />
              <div className="w-[350px] shrink-0 h-full relative overflow-hidden">
                <CoachSidebar
                  onRefreshHealth={() => {
                    const model = editorRef.current?.getModel();
                    if (model) runHealthAnalysis(model, true);
                  }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  techData={techData as any}
                  onRescan={() => handleRescan()}
                  isScanningTech={isScanningTech}
                  isTechError={isTechError}
                  isAnalyzingCode={isAnalyzing}
                  overview={coachOverview}
                  allMentorshipAdvice={allMentorshipAdvice}
                  activeLineNumber={activeLineNumber}
                  fileMetadata={gitStatusData && gitStatusLabel ? { lineCount, gitStatus: gitStatusLabel } : undefined}
                  availableAdviceLines={availableAdviceLines}
                  isEditorDirty={isDirty}
                  isConflictMode={isConflictMode}
                />
              </div>
            </div>
          ) : (
            <div className="absolute inset-0">
              <Editor
                key={node.file_path || node.id}
                height="100%"
                theme="vs-dark"
                path={node.file_path || node.id}
                defaultValue={initialValue}
                onMount={handleEditorDidMount}
                options={editorOptions}
                loading={null}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
