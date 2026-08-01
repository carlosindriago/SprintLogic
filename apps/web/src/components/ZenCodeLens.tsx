'use client';

import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { useProjectStore } from '@/store/projectStore';
import { useTabsStore } from '@/store/tabsStore';
import { useDocStudioStore } from '@/store/docStudioStore';
import { useSenseiStore } from '@/store/senseiStore';
import { useChatStore } from '@/store/chatStore';
import { Pencil, WrapText, Maximize, Rocket, Bookmark, ChevronDown, Plus, Bot } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });
import type { editor } from 'monaco-editor';

interface ASTFold {
  start_line: number;
  end_line: number;
  type: string;
}

interface Bookmark {
  file_path: string;
  start_line: number;
  note?: string;
}

interface ZenCodeLensProps {
  filePath: string;
  codeContent: string;
  language?: string;
}

export default function ZenCodeLens({ filePath, codeContent, language = 'javascript' }: ZenCodeLensProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<unknown>(null);
  const decorationsCollection = useRef<editor.IEditorDecorationsCollection | null>(null);

  const [folds, setFolds] = useState<ASTFold[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  
  const [wordWrap, setWordWrap] = useState<'on' | 'off'>('on');
  const [theme, setTheme] = useState<'vs-dark' | 'vs-light' | 'hc-black'>('vs-dark');
  const [fontSize, setFontSize] = useState<number>(14);
  
  const [popover, setPopover] = useState<{
    line: number;
    top: number;
    left: number;
    existing?: Bookmark;
  } | null>(null);
  const [newNote, setNewNote] = useState('');

  const projectId = useProjectStore((state) => state.projectId);

  const bookmarksRef = useRef<Bookmark[]>([]);
  useEffect(() => { bookmarksRef.current = bookmarks; }, [bookmarks]);

  useEffect(() => {
    if (!projectId) return;

    const fetchFolds = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/projects/${projectId}/files/ast-folds?file_path=${encodeURIComponent(filePath)}`);
        if (res.ok) {
          const data = await res.json();
          setFolds(data.folds || []);
        }
      } catch (err) {
        console.error('Failed to fetch AST folds', err);
      }
    };

    const fetchBookmarks = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/projects/${projectId}/docs/bookmarks`);
        if (res.ok) {
          const data = await res.json();
          const fileBookmarks = data.filter((b: Bookmark) => b.file_path === filePath && b.start_line);
          setBookmarks(fileBookmarks);
        }
      } catch (err) {
        console.error('Failed to fetch bookmarks', err);
      }
    };

    fetchFolds();
    fetchBookmarks();
  }, [projectId, filePath]);

  const applyFolds = (currentEditor: editor.IStandaloneCodeEditor, currentMonaco: unknown) => {
    if (!currentEditor || !currentMonaco) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const monacoAny = currentMonaco as any;
    const selections = folds.map(f => new monacoAny.Selection(f.start_line, 1, f.end_line, 1));
    if (selections.length > 0) {
      const originalSelection = currentEditor.getSelection();
      currentEditor.setSelections(selections);
      currentEditor.trigger('zen-lens', 'editor.fold', {});
      if (originalSelection) {
        currentEditor.setSelection(originalSelection);
      }
    }
  };

  useEffect(() => {
    if (editorRef.current && monacoRef.current && bookmarks.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const monacoAny = monacoRef.current as any;
      const decs = bookmarks.map(b => ({
        range: new monacoAny.Range(b.start_line, 1, b.start_line, 1),
        options: {
          isWholeLine: false,
          glyphMarginClassName: 'zen-bookmark-glyph',
          glyphMarginHoverMessage: { value: b.note || 'Nota en Línea' }
        }
      }));
      
      if (!decorationsCollection.current) {
        decorationsCollection.current = editorRef.current.createDecorationsCollection(decs);
      } else {
        decorationsCollection.current.set(decs);
      }
    }
  }, [bookmarks]);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateOptions({ wordWrap, fontSize });
    }
  }, [wordWrap, fontSize]);

  const handleEditorDidMount = (editor: editor.IStandaloneCodeEditor, monaco: unknown) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    if (folds.length > 0) {
      applyFolds(editor, monaco);
    }

    editor.addAction({
      id: 'guardar-marcador-zen',
      label: '📌 Guardar Marcador Zen',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.5,
      run: async (ed: editor.IStandaloneCodeEditor) => {
        if (!projectId) {
          toast.error('No hay proyecto activo.');
          return;
        }

        const selection = ed.getSelection();
        if (!selection || selection.isEmpty()) {
          toast.info('Selecciona un bloque de código para guardar el marcador.');
          return;
        }

        const model = ed.getModel();
        const selectedText = model?.getValueInRange(selection) || '';
        
        try {
          const res = await fetch(`${API_BASE_URL}/projects/${projectId}/docs/bookmarks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              file_path: filePath,
              selected_text: selectedText,
              note: `Marcador Zen (Líneas ${selection.startLineNumber}-${selection.endLineNumber})`,
              start_line: selection.startLineNumber,
              end_line: selection.endLineNumber
            }),
          });
          
          if (!res.ok) throw new Error('Error al guardar marcador');
          toast.success('Marcador Zen guardado exitosamente');
          
        } catch (err) {
          console.error(err);
          toast.error('Error al guardar el marcador de código.');
          }
        }
      });

      editor.addAction({
        id: 'ask-sprintlogic-ai',
        label: '🤖 Preguntar a SprintLogic AI',
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.6,
        run: () => {
          handleAskAI();
        }
      });

      editor.onMouseDown((e) => {
      const target = e.target;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const monacoAny = monaco as any;
      if (target.type === monacoAny.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        const line = target.position?.lineNumber;
        if (line && target.element) {
          const rect = target.element.getBoundingClientRect();
          const containerRect = containerRef.current?.getBoundingClientRect();
          if (containerRect) {
            const top = rect.top - containerRect.top;
            const left = rect.left - containerRect.left + rect.width;
            
            // Because bookmarks might not be accessible inside this closure (stale closure),
            // we use the model/decorations or simply setState using a functional update, but 
            // since we don't need it urgently inside the closure, wait, bookmarks is from state.
            // A better way is to rely on setState updater:
            setBookmarks(prevBookmarks => {
              const existing = prevBookmarks.find(b => b.start_line === line);
              setPopover({
                line,
                top: top,
                left: left + 10,
                existing
              });
              setNewNote('');
              return prevBookmarks;
            });
          }
        }
      } else {
        setPopover(null);
      }
    });

    editor.onDidScrollChange(() => {
      setPopover(null);
    });
    // No se necesita antes de mount para las acciones, pero definiremos los temas acá
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleBeforeMount = (monaco: any) => {
    monaco.editor.defineTheme('dracula', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'ff79c6' },
        { token: 'string', foreground: 'f1fa8c' },
        { token: 'type', foreground: '8be9fd' },
        { token: 'number', foreground: 'bd93f9' },
        { token: 'comment', foreground: '6272a4' },
      ],
      colors: { 'editor.background': '#282a36', 'editor.foreground': '#f8f8f2' }
    });

    monaco.editor.defineTheme('nord', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '81A1C1' },
        { token: 'string', foreground: 'A3BE8C' },
        { token: 'type', foreground: '8FBCBB' },
        { token: 'number', foreground: 'B48EAD' },
        { token: 'comment', foreground: '4C566A' },
      ],
      colors: { 'editor.background': '#2e3440', 'editor.foreground': '#D8DEE9' }
    });

    monaco.editor.defineTheme('one-dark-pro', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'c678dd' },
        { token: 'string', foreground: '98c379' },
        { token: 'type', foreground: 'e5c07b' },
        { token: 'number', foreground: 'd19a66' },
        { token: 'comment', foreground: '5c6370' },
      ],
      colors: { 'editor.background': '#282c34', 'editor.foreground': '#abb2bf' }
    });

    monaco.editor.defineTheme('solarized-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '859900' },
        { token: 'string', foreground: '2aa198' },
        { token: 'type', foreground: 'b58900' },
        { token: 'number', foreground: 'd33682' },
        { token: 'comment', foreground: '586e75' },
      ],
      colors: { 'editor.background': '#002b36', 'editor.foreground': '#839496' }
    });

    monaco.editor.defineTheme('monokai', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'f92672' },
        { token: 'string', foreground: 'e6db74' },
        { token: 'type', foreground: '66d9ef' },
        { token: 'number', foreground: 'ae81ff' },
        { token: 'comment', foreground: '75715e' },
      ],
      colors: { 'editor.background': '#272822', 'editor.foreground': '#f8f8f2' }
    });
  };

  const handleAskAI = () => {
    if (!editorRef.current) return;
    const ed = editorRef.current;
    const selection = ed.getSelection();
    let selectedText = '';
    let startLine = 1;
    let endLine = 1;
    
    if (selection && !selection.isEmpty()) {
      selectedText = ed.getModel()?.getValueInRange(selection) || '';
      startLine = selection.startLineNumber;
      endLine = selection.endLineNumber;
    } else {
      const visibleRanges = ed.getVisibleRanges();
      if (visibleRanges.length > 0) {
        startLine = visibleRanges[0].startLineNumber;
        endLine = visibleRanges[0].endLineNumber;
      }
    }

    const relevantBookmarks = bookmarksRef.current.filter(
      b => b.start_line >= startLine && b.start_line <= endLine
    );
    const notesStr = relevantBookmarks.map(b => `[Línea ${b.start_line}]: ${b.note}`).join('\n');
    
    let activeCode = selectedText;
    if (notesStr) {
      activeCode += `\n\n--- Notas (Bookmarks) ---\n${notesStr}`;
    }

    const projectPath = useProjectStore.getState().projectPath || '';
    let relativeFilePath = filePath;
    if (projectPath && filePath.startsWith(projectPath)) {
      relativeFilePath = filePath.slice(projectPath.length).replace(/^[\\/]/, '');
    }

    useSenseiStore.getState().updateEditorContext('zen', {
      filePath: relativeFilePath,
      cursorLine: startLine,
      endLine: endLine,
      activeCode: activeCode.substring(0, 3900)
    });
    useSenseiStore.getState().setActiveTabId('zen');
    useSenseiStore.getState().activateSensei();
    
    useChatStore.getState().openChat();
  };

  const handleBackToEditor = () => {
    useDocStudioStore.getState().setActiveZenFilePath(null);
    useTabsStore.getState().addTab({
      id: filePath,
      type: 'editor',
      title: filePath.split('/').pop() || filePath,
      data: { filePath }
    });
    useTabsStore.getState().setActiveTab(filePath);
  };

  const toggleFullscreen = () => {
    if (containerRef.current) {
      if (!document.fullscreenElement) {
        containerRef.current.requestFullscreen().catch(_err => {
          toast.error('Error al intentar abrir pantalla completa');
        });
      } else {
        document.exitFullscreen();
      }
    }
  };

  const handleSaveNote = async () => {
    if (!popover || !projectId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/docs/bookmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: filePath,
          selected_text: '',
          note: newNote,
          start_line: popover.line,
          end_line: popover.line
        })
      });
      if (!res.ok) throw new Error('Error al guardar');
      
      const res2 = await fetch(`${API_BASE_URL}/projects/${projectId}/docs/bookmarks`);
      const data2 = await res2.json();
      const fileBookmarks = data2.filter((b: Bookmark) => b.file_path === filePath && b.start_line);
      setBookmarks(fileBookmarks);
      
      setPopover(null);
      toast.success('Nota guardada');
    } catch (_err) {
      toast.error('Error al guardar nota');
    }
  };

  return (
    <div ref={containerRef} className="w-full h-full min-h-[500px] flex flex-col relative overflow-hidden bg-[#0A0A0A]">
      <style>{`
        .zen-bookmark-glyph {
          background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233b82f6' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z'/%3E%3C/svg%3E") no-repeat center center;
          background-size: 14px;
          cursor: pointer;
        }
      `}</style>

      <div className="flex items-center gap-3 px-4 py-2 bg-zinc-900 border-b border-zinc-800 shrink-0 flex-wrap">
        <span className="text-sm font-medium text-zinc-300 flex-1 truncate">{filePath}</span>
        
        <div className="flex items-center gap-2">
          {/* Typograhy controls */}
          <div className="flex items-center bg-zinc-800 rounded-md overflow-hidden">
            <button 
              aria-label="Disminuir tamaño de fuente"
              onClick={() => setFontSize(f => Math.max(10, f - 1))}
              className="px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700 font-semibold border-r border-zinc-700 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-blue-500"
            >A-</button>
            <button 
              aria-label="Aumentar tamaño de fuente"
              onClick={() => setFontSize(f => Math.min(30, f + 1))}
              className="px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700 font-semibold focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-blue-500"
            >A+</button>
          </div>

          {/* Theme Selector */}
          <div className="relative flex items-center">
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as "vs-dark" | "vs-light" | "hc-black")}
              className="appearance-none bg-zinc-800 text-zinc-300 text-xs px-3 py-1.5 rounded-md pr-8 outline-none border border-zinc-700 hover:bg-zinc-700 focus:border-blue-500 transition-colors"
            >
              <option value="vs-dark">VS Dark</option>
              <option value="vs-light">VS Light</option>
              <option value="dracula">Dracula</option>
              <option value="nord">Nord</option>
              <option value="one-dark-pro">One Dark Pro</option>
              <option value="solarized-dark">Solarized Dark</option>
              <option value="monokai">Monokai</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2 text-zinc-400 pointer-events-none" />
          </div>

          {/* Word Wrap Toggle */}
          <button
            onClick={() => setWordWrap(w => w === 'on' ? 'off' : 'on')}
            className={`p-1.5 rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-blue-500 ${wordWrap === 'on' ? 'bg-blue-600/20 text-blue-400' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300'}`}
            title="Ajuste de Línea"
            aria-label="Ajuste de Línea"
          >
            <WrapText className="w-4 h-4" aria-hidden="true" />
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 bg-zinc-800 text-zinc-400 rounded-md hover:bg-zinc-700 hover:text-zinc-300 transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-blue-500"
            title="Pantalla Completa"
            aria-label="Pantalla Completa"
          >
            <Maximize className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={handleAskAI}
            className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white px-3 py-1.5 rounded-md text-xs font-semibold shadow-lg shadow-purple-500/20 transition-all focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-purple-500"
          >
            <Bot className="w-3.5 h-3.5" aria-hidden="true" />
            Preguntar a AI
          </button>
        </div>

        <button
          onClick={handleBackToEditor}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-md text-xs font-semibold transition-all ml-2 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-blue-500"
        >
          <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
          Volver al Editor
        </button>
      </div>

      <div className="flex-1 relative min-h-0 w-full">
        <MonacoEditor
          height="100%"
          language={language}
          value={codeContent}
          theme={theme}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            folding: true,
            lineNumbersMinChars: 3,
            renderLineHighlight: 'none',
            wordWrap,
            fontSize,
            glyphMargin: true,
          }}
          beforeMount={handleBeforeMount}
          onMount={handleEditorDidMount}
        />
        
        {popover && (
          <div 
            className="absolute z-50 bg-zinc-900 border border-zinc-700 rounded-md shadow-xl p-3 w-64 text-sm"
            style={{ top: popover.top, left: popover.left }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Bookmark className="w-4 h-4 text-blue-400" />
              <span className="font-semibold text-zinc-200">Línea {popover.line}</span>
            </div>
            
            {popover.existing ? (
              <div className="flex flex-col gap-3">
                <p className="text-zinc-300 whitespace-pre-wrap">{popover.existing.note}</p>
                <button
                  onClick={() => {
                     // TODO: Lógica para enviar a Planning Studio
                     toast.info("Enviando a Planning Studio...");
                  }}
                  className="flex items-center justify-center gap-2 w-full py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md text-xs font-medium border border-zinc-700 transition-colors"
                >
                  <Rocket className="w-3.5 h-3.5" />
                  Llevar al Planning Studio
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <textarea
                  className="w-full bg-zinc-950 text-zinc-300 rounded-md p-2 text-xs border border-zinc-800 outline-none focus:border-blue-500 min-h-[60px] resize-none"
                  placeholder="Escribe una nota rápida..."
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  autoFocus
                />
                <button
                  onClick={handleSaveNote}
                  disabled={!newNote.trim()}
                  className="flex items-center justify-center gap-2 w-full py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white rounded-md text-xs font-medium transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Guardar Nota
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
