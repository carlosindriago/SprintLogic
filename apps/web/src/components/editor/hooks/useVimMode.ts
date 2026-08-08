import { useEffect, useRef, MutableRefObject } from 'react';
import type { editor as monacoEditor } from 'monaco-editor';

interface UseVimModeProps {
  vimMode: boolean;
  isEditorReady: boolean;
  editorRef: MutableRefObject<monacoEditor.IStandaloneCodeEditor | null>;
  nodePath?: string;
  setEditorMode: (mode: 'locked' | 'visual' | 'editable') => void;
  onSave: (saveAs?: string) => void;
}

export function useVimMode({
  vimMode,
  isEditorReady,
  editorRef,
  nodePath,
  setEditorMode,
  onSave
}: UseVimModeProps) {
  const vimInstanceRef = useRef<{ dispose: () => void } | null>(null);
  const vimObserverRef = useRef<MutationObserver | null>(null);
  const vimPendingRef = useRef(false);
  const vimStatusRef = useRef<HTMLDivElement | null>(null);

  // Maintain references for callbacks
  const saveCallbackRef = useRef(onSave);
  useEffect(() => {
    saveCallbackRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !vimMode || vimInstanceRef.current || vimPendingRef.current) {
      if (!editor && vimMode) console.warn('[MONACO BOOT] Vim init reactivo omitido: editorRef vacío');
      return;
    }

    vimPendingRef.current = true;
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

        const vim = initVimMode(editor, statusNode);
        vimInstanceRef.current = vim;
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (VimMode as any).Vim.defineEx('write', 'w', (args: { args?: string }) => {
          const filename = args?.args?.trim() || '';
          if (filename) {
            const dir = nodePath ? nodePath.substring(0, nodePath.lastIndexOf('/')) : '';
            const newPath = dir ? `${dir}/${filename}` : filename;
            saveCallbackRef.current(newPath);
          } else {
            saveCallbackRef.current();
          }
        });
        
        const modeLabels: Record<string, 'locked' | 'visual' | 'editable'> = {
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
              setEditorMode(mode);
              break;
            }
          }
        });
        observer.observe(statusNode, { characterData: true, subtree: true, childList: true });
        vimObserverRef.current = observer;
      } catch (error) {
        console.error('[MONACO BOOT FATAL ERROR] Vim init (reactivo) lanzó excepción:', error);
      }
    }).catch((error) => {
      console.error('[MONACO BOOT FATAL ERROR] Falló la importación de monaco-vim (reactivo):', error);
      vimPendingRef.current = false;
    });
  }, [vimMode, nodePath, isEditorReady, editorRef, setEditorMode]);

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
      if (vimStatusRef.current && vimStatusRef.current.parentNode) {
        vimStatusRef.current.parentNode.removeChild(vimStatusRef.current);
        vimStatusRef.current = null;
      }
      vimPendingRef.current = false;
    }
  }, [vimMode]);

  useEffect(() => {
    return () => {
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
  }, []);
}
