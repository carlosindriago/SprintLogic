import React, { useEffect, useState, useRef } from 'react';
import { BookOpen, FileCode, CheckCircle, XCircle, Play, Send, Loader2, MessageSquare, Code, Edit3, Eye, Type, Sun, Moon, Coffee, Bookmark, AlignLeft, X } from 'lucide-react';
import { useProjectStore } from '@/store/projectStore';
import { useTabsStore } from '@/store/tabsStore';
import { usePlanningStore } from '@/store/planningStore';
import { fetchDocDiscovery, chatWithDocs, generateDocblock, saveDocFile, getDocBookmarks, createDocBookmark, DocDiscoveryResult, DocBookmark, auditDoc } from '@/lib/api';
import { getFileContent } from '@/lib/api';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { useDocStudioStore } from '@/store/docStudioStore';

export default function DocumentStudioTab() {
  const currentProjectId = useProjectStore((state) => state.projectId);
  const setActiveTab = useTabsStore((state) => state.setActiveTab);
  const setProjectState = usePlanningStore((state) => state.setProjectState);
  const projectStates = usePlanningStore((state) => state.projectStates);

  const [mode, setMode] = useState<'chat' | 'autodoc' | 'reader'>('chat');
  const [discovery, setDiscovery] = useState<DocDiscoveryResult | null>(null);
  const [loadingDiscovery, setLoadingDiscovery] = useState(false);
  
  // Auto-Doc State
  const [selectedFile, setSelectedFile] = useState<{ file_path: string; is_documented: boolean } | null>(null);
  const [generatedDoc, setGeneratedDoc] = useState<string | null>(null);
  const [isGeneratingDoc, setIsGeneratingDoc] = useState(false);

  // Chat State
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Reader / Editor State
  const [selectedMdFile, setSelectedMdFile] = useState<{ file_path: string } | null>(null);
  const [mdContent, setMdContent] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Bookmarks State
  const [bookmarks, setBookmarks] = useState<DocBookmark[]>([]);
  const [isBookmarksOpen, setIsBookmarksOpen] = useState(false);
  const [selection, setSelection] = useState<{ text: string; top: number; left: number } | null>(null);

  // Audit State
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditReport, setAuditReport] = useState<string | null>(null);

  const { fontSize, theme, lineHeight, setFontSize, setTheme, setLineHeight } = useDocStudioStore();

  const loadDiscovery = useCallback(async () => {
    if (!currentProjectId) return;
    setLoadingDiscovery(true);
    try {
      const result = await fetchDocDiscovery(currentProjectId);
      setDiscovery(result);
      if (result.undocumented_code.length > 0) {
        setSelectedFile(result.undocumented_code[0]);
      }
    } catch (err) {
      console.error('Failed to load doc discovery:', err);
    } finally {
      setLoadingDiscovery(false);
    }
  }, [currentProjectId]);

  const loadBookmarks = useCallback(async () => {
    if (!currentProjectId) return;
    try {
      const b = await getDocBookmarks(currentProjectId);
      setBookmarks(b);
    } catch (err) {
      console.error('Failed to load bookmarks', err);
    }
  }, [currentProjectId]);

  useEffect(() => {
    if (currentProjectId) {
      loadDiscovery();
      loadBookmarks();
    }
  }, [currentProjectId, loadDiscovery, loadBookmarks]);

  const openReader = async (file: { file_path: string }) => {
    if (!currentProjectId) return;
    setSelectedMdFile(file);
    setMode('reader');
    setIsEditMode(false);
    setAuditReport(null);
    try {
      const res = await getFileContent(currentProjectId, file.file_path);
      setMdContent(res.content);
      setEditContent(res.content);
    } catch (err) {
      console.error(err);
      setMdContent('Error loading file content.');
    }
  };

  const handleSaveFile = async () => {
    if (!currentProjectId || !selectedMdFile) return;
    setIsSaving(true);
    try {
      await saveDocFile(currentProjectId, selectedMdFile.file_path, editContent);
      setMdContent(editContent);
      setIsEditMode(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelection = useCallback(() => {
    if (isEditMode || mode !== 'reader') return;
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSelection({
        text: sel.toString().trim(),
        top: rect.top - 50,
        left: rect.left + rect.width / 2,
      });
    } else {
      setSelection(null);
    }
  }, [isEditMode, mode]);

  useEffect(() => {
    document.addEventListener('mouseup', handleSelection);
    return () => document.removeEventListener('mouseup', handleSelection);
  }, [handleSelection]);

  const handleSaveBookmark = async () => {
    if (!currentProjectId || !selectedMdFile || !selection) return;
    try {
      const b = await createDocBookmark(currentProjectId, selectedMdFile.file_path, selection.text);
      setBookmarks(prev => [b, ...prev]);
      setSelection(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleGenerateDoc = async () => {
    if (!currentProjectId || !selectedFile) return;
    setIsGeneratingDoc(true);
    setGeneratedDoc(null);
    try {
      const res = await generateDocblock(currentProjectId, selectedFile.file_path);
      setGeneratedDoc(res.documented_code);
    } catch (err) {
      console.error('Failed to generate docblock:', err);
    } finally {
      setIsGeneratingDoc(false);
    }
  };

  const handleAuditDoc = async () => {
    if (!currentProjectId || !selectedMdFile) return;
    setIsAuditing(true);
    setAuditReport(null);
    const loadingToast = toast.loading('Auditando coherencia del documento...');
    try {
      const res = await auditDoc(currentProjectId, selectedMdFile.file_path);
      setAuditReport(res.report);
      toast.success('Auditoría completada', { id: loadingToast });
    } catch (err) {
      console.error('Failed to audit doc:', err);
      toast.error(err.message || 'Error al auditar el documento', { id: loadingToast });
    } finally {
      setIsAuditing(false);
    }
  };

  const handleChat = async () => {
    if (!currentProjectId || !chatInput.trim() || isChatting) return;
    
    const query = chatInput.trim();
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', content: query }]);
    setIsChatting(true);

    try {
      const res = await chatWithDocs(currentProjectId, query);
      setChatHistory(prev => [...prev, { role: 'assistant', content: res.reply }]);
    } catch (err) {
      console.error('Failed to chat with docs:', err);
      setChatHistory(prev => [...prev, { role: 'assistant', content: 'Error: No se pudo conectar con el Cerebro Documental.' }]);
    } finally {
      setIsChatting(false);
    }
  };

  const handleHandoff = () => {
    if (!currentProjectId || !generatedDoc) return;
    setProjectState(currentProjectId, {
      messages: [{ role: 'user', content: `## Documentación Generada para ${selectedFile?.file_path}\n\nRevisa y aplica los siguientes comentarios de documentación y sugerencias de mejora:\n\n${generatedDoc}` }],
    });
    setActiveTab('planning');
  };

  const handleChatHandoff = (content: string) => {
    if (!currentProjectId) return;
    setProjectState(currentProjectId, {
      messages: [{ role: 'user', content: `## Sugerencia Arquitectónica\n\n${content}\n\nAyúdame a planificar e implementar esta sugerencia de documentación.` }],
    });
    setActiveTab('planning');
  };

  if (!currentProjectId) {
    return (
      <div className="flex-1 flex flex-col h-full bg-[#0A0A0A] text-zinc-200 items-center justify-center">
        <p className="text-zinc-500">No hay proyecto seleccionado.</p>
      </div>
    );
  }

  const mdfiles = discovery?.markdown_files || [];
  const codeFiles = discovery?.undocumented_code || [];

  const themeClasses = {
    light: 'bg-[#fafafa] text-zinc-900',
    dark: 'bg-[#0A0A0A] text-zinc-200',
    sepia: 'bg-[#f4ecd8] text-[#5b4636]',
  };
  const proseThemeClasses = {
    light: 'prose-zinc',
    dark: 'prose-invert prose-pre:bg-[#111] prose-pre:border-zinc-800',
    sepia: 'prose-stone prose-pre:bg-[#ebd5b3] prose-pre:border-[#d9c09c] prose-headings:text-[#4a382c]',
  };
  const fontClasses = {
    sm: 'prose-sm',
    base: 'prose-base',
    lg: 'prose-lg',
  };
  const lineClasses = {
    relaxed: 'leading-relaxed',
    loose: 'leading-loose',
  };

  return (
    <div className="flex-1 flex h-full bg-[#0A0A0A] text-zinc-200 overflow-hidden relative">
      {/* Floating Selection Button */}
      {selection && (
        <button
          onClick={handleSaveBookmark}
          style={{ top: selection.top, left: selection.left, transform: 'translateX(-50%)' }}
          className="fixed z-50 flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg shadow-xl shadow-black/50 text-xs font-medium animate-in fade-in zoom-in duration-200"
        >
          <Bookmark className="h-3 w-3" />
          Guardar Marcador
        </button>
      )}

      {/* Left Panel: Sidebar */}
      <div className="w-64 shrink-0 flex flex-col border-r border-zinc-800/50 bg-[#0F0F0F]">
        <div className="p-4 border-b border-zinc-800/50 flex flex-col gap-4">
          <h2 className="text-xl font-bold flex items-center gap-2 text-zinc-100">
            <BookOpen className="h-5 w-5 text-blue-400" />
            Doc Studio
          </h2>
          
          <div className="flex flex-col gap-1 bg-zinc-900 rounded-lg p-1">
            <button
              onClick={() => setMode('chat')}
              className={`py-1.5 text-xs font-medium rounded-md flex items-center justify-center gap-2 transition-colors ${mode === 'chat' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              RAG Chat
            </button>
            <button
              onClick={() => setMode('autodoc')}
              className={`py-1.5 text-xs font-medium rounded-md flex items-center justify-center gap-2 transition-colors ${mode === 'autodoc' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <Code className="h-3.5 w-3.5" />
              Auto-Doc
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
          {loadingDiscovery ? (
            <div className="flex items-center justify-center p-8 text-zinc-500 gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Escaneando...</span>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <div className="px-3 py-2 text-[10px] font-bold tracking-widest text-zinc-600 uppercase">
                  Contexto Documental ({mdfiles.length})
                </div>
                {mdfiles.map((f, i) => (
                  <button 
                    key={i} 
                    onClick={() => openReader(f)}
                    className={`flex items-center gap-2 px-3 py-2 text-sm text-left rounded transition-colors ${mode === 'reader' && selectedMdFile?.file_path === f.file_path ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border border-transparent'}`}
                  >
                    <BookOpen className={`h-4 w-4 shrink-0 ${mode === 'reader' && selectedMdFile?.file_path === f.file_path ? 'text-blue-500' : 'text-zinc-600'}`} />
                    <span className="truncate flex-1">{f.file_path.split('/').pop()}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-1">
                <div className="px-3 py-2 text-[10px] font-bold tracking-widest text-zinc-600 uppercase">
                  Falta Documentar ({codeFiles.filter(f => !f.is_documented).length})
                </div>
                {codeFiles.map((f, i) => (
                  <button
                    key={i}
                    onClick={() => { setSelectedFile(f); setGeneratedDoc(null); setMode('autodoc'); }}
                    className={`flex items-center gap-2 w-full text-left px-3 py-2 rounded transition-all duration-200 border ${
                      mode === 'autodoc' && selectedFile?.file_path === f.file_path
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-100'
                        : 'border-transparent text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                    }`}
                  >
                    {f.is_documented ? (
                      <CheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                    )}
                    <span className="truncate text-sm flex-1">{f.file_path.split('/').pop()}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel: Content Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden bg-[#0A0A0A] min-w-0">
        {mode === 'chat' ? (
          <div className="flex flex-col h-full relative">
            {/* Chat History */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              {chatHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-4">
                  <MessageSquare className="h-12 w-12 text-zinc-800" />
                  <p>Pregúntale al Cerebro Documental sobre la arquitectura o reglas del proyecto.</p>
                </div>
              ) : (
                chatHistory.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-xl p-4 ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-zinc-900 border border-zinc-800'}`}>
                      {msg.role === 'user' ? (
                        <span className="whitespace-pre-wrap text-sm">{msg.content}</span>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <div className="prose prose-invert prose-sm w-full max-w-none break-words prose-pre:bg-[#111] prose-pre:border-zinc-800 prose-pre:overflow-x-auto">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                          <button
                            onClick={() => handleChatHandoff(msg.content)}
                            className="self-start flex items-center gap-2 mt-2 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 text-xs font-medium rounded-md transition-colors"
                          >
                            <Send className="h-3 w-3" />
                            Llevar al Planning Studio
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              {isChatting && (
                <div className="flex justify-start">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex gap-2 items-center text-zinc-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Pensando...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            
            {/* Chat Input */}
            <div className="p-4 bg-[#0A0A0A] border-t border-zinc-800/50">
              <form 
                onSubmit={(e) => { e.preventDefault(); handleChat(); }}
                className="flex gap-2 relative max-w-4xl mx-auto"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Pregunta sobre la arquitectura, base de datos, o reglas..."
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 text-zinc-100 placeholder:text-zinc-600 transition-all"
                  disabled={isChatting}
                />
                <button
                  type="submit"
                  disabled={isChatting || !chatInput.trim()}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 text-white rounded-lg px-4 flex items-center justify-center transition-colors"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
        ) : mode === 'autodoc' ? (
          <div className="flex flex-col h-full">
            {/* Auto-Doc Toolbar */}
            <div className="h-14 border-b border-zinc-800/50 flex items-center justify-between px-6 bg-[#0F0F0F]">
              <div className="flex items-center gap-3">
                <FileCode className="h-4 w-4 text-zinc-400" />
                <span className="text-sm font-medium text-zinc-300">
                  {selectedFile ? selectedFile.file_path : 'Selecciona un archivo'}
                </span>
              </div>
              {selectedFile && (
                <button
                  onClick={handleGenerateDoc}
                  disabled={isGeneratingDoc}
                  className="flex items-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 px-3 py-1.5 rounded-md text-xs font-semibold transition-all border border-blue-500/20 disabled:opacity-50"
                >
                  {isGeneratingDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  {isGeneratingDoc ? 'Generando...' : 'Generar Documentación IA'}
                </button>
              )}
            </div>

            {/* Auto-Doc Viewer */}
            <div className="flex-1 overflow-y-auto p-6 bg-[#0A0A0A]">
              {!selectedFile ? (
                <div className="h-full flex items-center justify-center text-zinc-500">
                  Selecciona un archivo de la lista para auto-documentarlo.
                </div>
              ) : isGeneratingDoc ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-400 gap-4">
                  <div className="relative">
                    <div className="h-16 w-16 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin"></div>
                    <FileCode className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-blue-500" />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <p className="font-medium text-zinc-300">Redactando DocBlocks</p>
                    <p className="text-xs text-zinc-500">Analizando funciones y parámetros...</p>
                  </div>
                </div>
              ) : generatedDoc ? (
                <div className="flex flex-col h-full gap-4 max-w-4xl mx-auto">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-zinc-300">Documentación Generada</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={handleHandoff}
                        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 px-4 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-colors"
                      >
                        🚀 Llevar al Planning Studio
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 bg-[#151515] border border-zinc-800 rounded-lg p-6 overflow-x-hidden overflow-y-auto min-w-0 prose prose-invert w-full max-w-none break-words prose-pre:bg-[#111111] prose-pre:border prose-pre:border-zinc-800 prose-headings:text-blue-300 prose-pre:overflow-x-auto">
                    <ReactMarkdown>{generatedDoc}</ReactMarkdown>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-zinc-500 gap-4">
                  <div className="p-4 rounded-full bg-blue-500/5">
                    <FileCode className="h-8 w-8 text-blue-400/50" />
                  </div>
                  <p className="text-sm max-w-sm text-center leading-relaxed">
                    Este archivo no contiene firmas de documentación estándar. Haz clic en &quot;Generar Documentación IA&quot; para crear los comentarios.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Zen Toolbar */}
            <div className="h-14 border-b border-zinc-800/50 flex items-center justify-between px-6 bg-[#0F0F0F] shrink-0">
              <div className="flex items-center gap-4">
                <div className="flex items-center bg-zinc-900 rounded-lg p-1">
                  <button onClick={() => setIsEditMode(false)} className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-colors ${!isEditMode ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}>
                    <Eye className="h-3.5 w-3.5" /> Lectura
                  </button>
                  <button onClick={() => setIsEditMode(true)} className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-colors ${isEditMode ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`}>
                    <Edit3 className="h-3.5 w-3.5" /> Edición
                  </button>
                </div>

                <div className="h-4 w-px bg-zinc-800"></div>

                <div className="flex items-center gap-1">
                  <button onClick={() => setFontSize('sm')} className={`p-1.5 rounded-md ${fontSize === 'sm' ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`} title="Fuente Pequeña"><Type className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setFontSize('base')} className={`p-1.5 rounded-md ${fontSize === 'base' ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`} title="Fuente Mediana"><Type className="h-4 w-4" /></button>
                  <button onClick={() => setFontSize('lg')} className={`p-1.5 rounded-md ${fontSize === 'lg' ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`} title="Fuente Grande"><Type className="h-5 w-5" /></button>
                </div>

                <div className="flex items-center gap-1">
                  <button onClick={() => setTheme('light')} className={`p-1.5 rounded-md ${theme === 'light' ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`} title="Modo Claro"><Sun className="h-4 w-4" /></button>
                  <button onClick={() => setTheme('dark')} className={`p-1.5 rounded-md ${theme === 'dark' ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`} title="Modo Oscuro"><Moon className="h-4 w-4" /></button>
                  <button onClick={() => setTheme('sepia')} className={`p-1.5 rounded-md ${theme === 'sepia' ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`} title="Modo Sepia"><Coffee className="h-4 w-4" /></button>
                </div>

                <div className="flex items-center gap-1">
                  <button onClick={() => setLineHeight('relaxed')} className={`p-1.5 rounded-md ${lineHeight === 'relaxed' ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`} title="Interlineado Normal"><AlignLeft className="h-4 w-4" /></button>
                  <button onClick={() => setLineHeight('loose')} className={`p-1.5 rounded-md ${lineHeight === 'loose' ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'}`} title="Interlineado Amplio"><AlignLeft className="h-5 w-5" /></button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {isEditMode && (
                  <button
                    onClick={handleSaveFile}
                    disabled={isSaving}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-md text-xs font-semibold transition-all disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                    Guardar Cambios
                  </button>
                )}
                <button
                  onClick={handleAuditDoc}
                  disabled={isAuditing}
                  className="flex items-center gap-2 bg-purple-600/10 hover:bg-purple-600/20 text-purple-400 border border-purple-500/20 px-3 py-1.5 rounded-md text-xs font-semibold transition-all disabled:opacity-50"
                >
                  {isAuditing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Code className="h-3.5 w-3.5" />}
                  Auditar Coherencia
                </button>
                <button
                  onClick={() => setIsBookmarksOpen(!isBookmarksOpen)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${isBookmarksOpen ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700'}`}
                >
                  <Bookmark className="h-3.5 w-3.5" />
                  Mis Marcadores
                </button>
              </div>
            </div>

            {/* Editor / Reader Area */}
            <div className={`flex-1 flex overflow-hidden transition-colors duration-300 ${isEditMode ? 'bg-[#0A0A0A]' : themeClasses[theme]}`}>
              <div className="flex-1 overflow-y-auto px-8 py-12 flex justify-center">
                <div className={`w-full relative ${auditReport ? 'max-w-2xl' : 'max-w-4xl'}`}>
                  {isEditMode ? (
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full h-full min-h-[70vh] font-mono text-sm leading-relaxed resize-none outline-none bg-transparent text-zinc-300 placeholder:text-zinc-600 p-4 border border-zinc-800/50 rounded-lg focus:border-zinc-700"
                      spellCheck={false}
                    />
                  ) : (
                    <div className={`prose ${fontClasses[fontSize]} ${lineClasses[lineHeight]} ${proseThemeClasses[theme]} max-w-none w-full break-words prose-pre:overflow-x-auto transition-all duration-300 pb-32`}>
                      <ReactMarkdown>{mdContent}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>

              {/* Audit Split Pane */}
              {auditReport && !isBookmarksOpen && (
                <div className="flex-1 min-w-[400px] border-l border-black/10 dark:border-zinc-800/50 bg-[#0F0F0F] flex flex-col h-full animate-in slide-in-from-right-8 duration-300 relative z-10 shadow-2xl">
                  <div className="h-14 border-b border-black/10 dark:border-zinc-800/50 flex items-center justify-between px-6 shrink-0 bg-[#111]">
                    <div className="flex items-center gap-3">
                      <Code className="h-5 w-5 text-purple-400" />
                      <span className="text-sm font-semibold text-zinc-100">Reporte de Auditoría</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          if (currentProjectId && auditReport) {
                            const currentMessages = projectStates[currentProjectId]?.messages || [];
                            setProjectState(currentProjectId, {
                              messages: [
                                ...currentMessages,
                                { role: 'user', content: `He corrido una auditoría de coherencia en la documentación y necesito que generemos tareas o refinemos el WBS en base a esto:\\n\\n${auditReport}` }
                              ]
                            });
                          }
                          setActiveTab('planning');
                        }}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-semibold transition-all"
                      >
                        🚀 Llevar al Planning Studio
                      </button>
                      <button onClick={() => setAuditReport(null)} className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto px-8 py-8 flex justify-center">
                    <div className="prose prose-invert prose-purple max-w-none w-full break-words prose-pre:overflow-x-auto">
                      <ReactMarkdown>{auditReport}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              )}

              {/* Right Panel: Bookmarks (Push Layout) */}
              {isBookmarksOpen && (
                <div className="w-80 shrink-0 border-l border-black/10 dark:border-zinc-800/50 bg-black/5 dark:bg-[#0F0F0F] flex flex-col h-full animate-in slide-in-from-right-8 duration-200">
                  <div className="h-14 border-b border-black/10 dark:border-zinc-800/50 flex items-center justify-between px-4 shrink-0">
                    <span className="text-sm font-semibold text-current opacity-80">Marcadores ({bookmarks.length})</span>
                    <button onClick={() => setIsBookmarksOpen(false)} className="p-1 hover:bg-black/5 dark:hover:bg-zinc-800 rounded">
                      <X className="h-4 w-4 opacity-70" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                    {bookmarks.filter(b => b.file_path === selectedMdFile?.file_path).length === 0 ? (
                      <p className="text-xs text-current opacity-50 text-center mt-8">No tienes marcadores en este archivo. Selecciona texto y haz clic en &quot;Guardar Marcador&quot;.</p>
                    ) : (
                      bookmarks.filter(b => b.file_path === selectedMdFile?.file_path).map((b, i) => (
                        <div key={i} className="bg-black/5 dark:bg-zinc-900 border border-black/10 dark:border-zinc-800 rounded-lg p-3 cursor-pointer hover:bg-black/10 dark:hover:bg-zinc-800 transition-colors" onClick={() => {
                           // Try to scroll to text (rough estimation)
                           (window as unknown as { find: (text: string) => void }).find(b.selected_text.substring(0, 50));
                        }}>
                          <div className="flex items-start gap-2">
                            <Bookmark className="h-3.5 w-3.5 shrink-0 opacity-50 mt-0.5" />
                            <p className="text-xs leading-relaxed italic opacity-80 line-clamp-4">&quot;{b.selected_text}&quot;</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
