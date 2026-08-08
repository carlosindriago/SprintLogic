import { useEffect, useCallback, MutableRefObject } from 'react';
import type { editor as monacoEditor } from 'monaco-editor';
import { useSenseiStore } from '@/store/senseiStore';

interface UseSenseiContextProps {
  nodeId: string;
  nodePath?: string;
  monacoRef: MutableRefObject<typeof import('monaco-editor') | null>;
}

export function useSenseiContext({
  nodeId,
  nodePath,
  monacoRef
}: UseSenseiContextProps) {
  const updateEditorContext = useSenseiStore((s) => s.updateEditorContext);
  const setActiveTabId = useSenseiStore((s) => s.setActiveTabId);
  const clearEditorContext = useSenseiStore((s) => s.clearEditorContext);
  const connectSocket = useSenseiStore((s) => s.connectSocket);
  const disconnectSocket = useSenseiStore((s) => s.disconnectSocket);

  useEffect(() => {
    connectSocket(1);
    return () => disconnectSocket();
  }, [connectSocket, disconnectSocket]);

  useEffect(() => {
    setActiveTabId(nodeId);
    return () => clearEditorContext(nodeId);
  }, [nodeId, setActiveTabId, clearEditorContext]);

  const buildSenseiContext = useCallback((editor: monacoEditor.IStandaloneCodeEditor) => {
    const model = editor.getModel();
    if (!model || model.isDisposed()) return;

    const position = editor.getPosition();
    const cursorLine = position?.lineNumber ?? 1;
    const filePath = nodePath ?? '';

    let activeCode = '';
    const selection = editor.getSelection();
    if (selection && !selection.isEmpty()) {
      activeCode = model.getValueInRange(selection);
    } else {
      const totalLines = model.getLineCount();
      const startLine = Math.max(1, cursorLine - 40);
      const endLine = Math.min(totalLines, cursorLine + 40);
      const lines: string[] = [];
      for (let i = startLine; i <= endLine; i++) {
        lines.push(model.getLineContent(i));
      }
      activeCode = lines.join('\n');
    }

    updateEditorContext(nodeId, {
      filePath,
      cursorLine,
      activeCode: activeCode.slice(0, 4000),
    });
  }, [nodeId, nodePath, updateEditorContext]);

  const handleEditorDidMount = useCallback((editor: monacoEditor.IStandaloneCodeEditor) => {
    // We export a listener that the container can call inside its own handleEditorDidMount
    buildSenseiContext(editor);
    
    const socket = useSenseiStore.getState().socket;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'full_sync',
        file_path: nodePath,
        content: editor.getValue(),
        versionId: editor.getModel()?.getVersionId() || 0
      }));
    }

    const removeSocketListener = useSenseiStore.getState().addSocketListener((data) => {
      if (data.type === 'sync_out_of_order') {
        const s = useSenseiStore.getState().socket;
        if (s && s.readyState === WebSocket.OPEN) {
          s.send(JSON.stringify({
            type: 'full_sync',
            file_path: nodePath,
            content: editor.getValue(),
            versionId: editor.getModel()?.getVersionId() || 0
          }));
        }
      } else if (data.type === 'marker_update') {
        const markers = data.markers || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const monacoMarkers = markers.map((m: any) => ({
          severity: m.severity || 8,
          message: m.message,
          startLineNumber: m.line,
          startColumn: m.column || 1,
          endLineNumber: m.line,
          endColumn: 100,
          source: 'Sensei AST Linter'
        }));
        const model = editor.getModel();
        const monaco = monacoRef.current;
        if (model && monaco) {
          monaco.editor.setModelMarkers(model, 'sensei-linter', monacoMarkers);
        }
      }
    });

    editor.onDidDispose(() => {
      removeSocketListener();
    });

  }, [nodePath, buildSenseiContext, monacoRef]);

  return {
    buildSenseiContext,
    handleEditorDidMount
  };
}
