import { useCallback } from 'react';
import type { editor as monacoEditor } from 'monaco-editor';
import { useDocStudioStore } from '@/store/docStudioStore';
import { useTabsStore } from '@/store/tabsStore';

interface UseEditorKeyBindingsProps {
  nodePath?: string;
  forceSenseiAnalysis: () => void;
  handleSave: (saveAs?: string) => void;
}

export function useEditorKeyBindings({
  nodePath,
  forceSenseiAnalysis,
  handleSave
}: UseEditorKeyBindingsProps) {

  const handleZenMode = useCallback(() => {
    if (!nodePath) return;
    useDocStudioStore.getState().setActiveZenFilePath(nodePath);
    useTabsStore.getState().addTab({ id: 'document-studio', title: 'Document Studio', type: 'document-studio' });
    useTabsStore.getState().setActiveTab('document-studio');
  }, [nodePath]);

  const bindEditorKeys = useCallback((editor: monacoEditor.IStandaloneCodeEditor, monaco: typeof import('monaco-editor')) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyS, () => {
      forceSenseiAnalysis();
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
      handleSave();
    });
  }, [forceSenseiAnalysis, handleSave]);

  return {
    handleZenMode,
    bindEditorKeys
  };
}
