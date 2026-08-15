/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { useTabsStore } from '../store/tabsStore';
import { usePlanningStore } from '../store/planningStore';
import {
  getPlanningDocument,
  savePlanningDocument,
  getPlanningHistory,
  restorePlanningVersion,
  getProjectGraphMd,
  sendPlanningMessage,
  importWBSTickets,
  getProjectTasks,
  PlanningDocument,
  PlanningVersion,
  WBSImportTicket,
} from '../lib/api';
import { smartMergeWbsPlan, extractPlanSnippetFromReply } from '../lib/wbsPlanMerger';
import { Task } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Send,
  Loader2,
  Copy,
  Download,
  History,
  RotateCcw,
  Sparkles,
  FileCode,
  Save,
  CheckCircle2,
  Clock,
  Kanban,
  Check,
  AlertCircle,
  Eye,
  Code2,
  X,
  FileEdit,
  ListPlus,
  RefreshCw,
  Layers,
  GitBranch,
  Target,
  ChevronRight,
  FolderKanban,
  MessageSquare,
  Highlighter,
} from 'lucide-react';
import { toast } from 'sonner';

function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 45) return 'Hace un momento';
    if (diffMin < 60) return `Hace ${diffMin} min`;
    if (diffHours < 24) {
      const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      return isToday ? `Hoy a las ${timeStr}` : `Hace ${diffHours}h`;
    }
    if (diffDays === 1) {
      const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      return `Ayer a las ${timeStr}`;
    }
    if (diffDays < 7) return `Hace ${diffDays} días`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

function formatAbsoluteLocalTime(dateStr: string): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export function extractTicketsFromMarkdown(markdown: string): WBSImportTicket[] {
  const tickets: WBSImportTicket[] = [];
  const lines = markdown.split('\n');

  let currentEpic = 'General';
  let currentSprint = 'Sprint 1';
  let currentTicket: WBSImportTicket | null = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    const epicMatch = line.match(/^#{1,2}\s+(?:🎯\s*)?(?:[ÉEe]pica\s*\d*[:\-]?\s*|\bEpic\s*\d*[:\-]?\s*)(.+)/i);
    if (epicMatch) {
      currentEpic = epicMatch[1].trim();
      continue;
    }

    const sprintMatch = line.match(/^#{3}\s+(?:🏃\s*)?(?:Sprint\s*\d*[:\-]?\s*)(.+)/i);
    if (sprintMatch) {
      currentSprint = sprintMatch[1].trim();
      continue;
    }

    const taskMatch = line.match(/^[-*]\s*\[([ xX])\]\s*(.+)/);
    if (taskMatch) {
      const isIndented = rawLine.startsWith('  ') || rawLine.startsWith('\t') || rawLine.startsWith('    ');
      const fullText = taskMatch[2].trim();

      if (isIndented && currentTicket) {
        if (!currentTicket.subtasks) {
          currentTicket.subtasks = [];
        }
        currentTicket.subtasks.push({
          id: String(currentTicket.subtasks.length + 1),
          title: fullText.replace(/\*\*/g, '').trim(),
          completed: taskMatch[1].toLowerCase() === 'x',
        });
      } else {
        let title = fullText;
        let priority = 'Medium';
        let type = 'Feature';
        let branchName: string | undefined;

        const boldMatch = title.match(/^\*\*([^*]+)\*\*/);
        if (boldMatch) {
          title = boldMatch[1].trim();
        }

        const prioMatch = fullText.match(/\[(?:Priority|Prioridad):\s*([a-zA-Z]+)\]/i);
        if (prioMatch) priority = prioMatch[1];

        const typeMatch = fullText.match(/\[(?:Type|Tipo):\s*([a-zA-Z\s]+)\]/i);
        if (typeMatch) type = typeMatch[1].trim();

        const branchMatch = fullText.match(/\[(?:Branch|Rama):\s*([a-zA-Z0-9_\-\/]+)\]/i);
        if (branchMatch) branchName = branchMatch[1].trim();

        title = title
          .replace(/\[(?:Priority|Prioridad):[^\]]+\]/gi, '')
          .replace(/\[(?:Type|Tipo):[^\]]+\]/gi, '')
          .replace(/\[(?:Branch|Rama):[^\]]+\]/gi, '')
          .replace(/\[(?:Hours|Horas):[^\]]+\]/gi, '')
          .trim();

        currentTicket = {
          title,
          type,
          priority,
          description: `Definido en el plan vivo WBS (${currentEpic} - ${currentSprint})`,
          branch_name: branchName,
          epic: currentEpic,
          sprint: currentSprint,
          subtasks: [],
        };
        tickets.push(currentTicket);
      }
    }
  }

  return tickets;
}

  const PlanningMessageItem = React.memo(function PlanningMessageItem({
    message,
    onApplySnippet,
  }: {
    message: { role: string; content: string };
    onApplySnippet?: (content: string) => void;
  }) {
    const extracted = useMemo(() => {
      if (message.role !== 'assistant') return null;
      const snippet = extractPlanSnippetFromReply(message.content);
      return snippet && snippet.length > 5 ? snippet : null;
    }, [message.role, message.content]);

    return (
      <div className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'} max-w-full min-w-0`}>
        <div
          className={`text-[11px] px-2 py-0.5 rounded mb-1 font-medium ${
            message.role === 'user' ? 'text-blue-400' : 'text-emerald-400'
          }`}
        >
          {message.role === 'user' ? 'Tú' : 'Agile Coach'}
        </div>
        <div
          className={`max-w-[95%] rounded-xl p-3 text-xs leading-relaxed break-words [overflow-wrap:anywhere] overflow-hidden ${
            message.role === 'user'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-[#18181d] border border-zinc-800 text-zinc-200'
          }`}
        >
          <div className="w-full break-words [overflow-wrap:anywhere] overflow-hidden">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                pre: ({ children, ...props }) => (
                  <pre
                    className="overflow-x-auto max-w-full bg-[#0d0d10] border border-zinc-800/80 rounded-lg p-2.5 my-2 text-[11px] font-mono leading-relaxed text-zinc-300 whitespace-pre-wrap break-all"
                    {...props}
                  >
                    {children}
                  </pre>
                ),
                code: ({ node, inline, className, children, ...props }: any) => {
                  if (inline) {
                    return (
                      <code
                        className="bg-zinc-850 text-sky-300 px-1 py-0.5 rounded text-[11px] font-mono break-all"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  }
                  return (
                    <code className="text-[11px] font-mono break-all whitespace-pre-wrap" {...props}>
                      {children}
                    </code>
                  );
                },
                p: ({ children, ...props }) => (
                  <p className="my-1 leading-relaxed break-words [overflow-wrap:anywhere]" {...props}>
                    {children}
                  </p>
                ),
                ul: ({ children, ...props }) => (
                  <ul className="list-disc pl-4 my-1 space-y-0.5 break-words [overflow-wrap:anywhere]" {...props}>
                    {children}
                  </ul>
                ),
                ol: ({ children, ...props }) => (
                  <ol className="list-decimal pl-4 my-1 space-y-0.5 break-words [overflow-wrap:anywhere]" {...props}>
                    {children}
                  </ol>
                ),
                li: ({ children, ...props }) => (
                  <li className="break-words [overflow-wrap:anywhere]" {...props}>
                    {children}
                  </li>
                ),
                blockquote: ({ children, ...props }) => (
                  <blockquote className="border-l-2 border-sky-500/50 pl-2.5 my-1.5 text-zinc-400 italic break-words [overflow-wrap:anywhere]" {...props}>
                    {children}
                  </blockquote>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
          {extracted && onApplySnippet && (
            <div className="mt-2.5 pt-2 border-t border-zinc-800/80 flex items-center justify-end">
              <button
                type="button"
                onClick={() => onApplySnippet(extracted)}
                className="text-[10px] px-2.5 py-1 bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 rounded-md flex items-center gap-1 font-medium shadow-sm transition-colors"
              >
                <Sparkles className="w-3 h-3 text-emerald-400" /> Aplicar al Espejo Mágico
              </button>
            </div>
          )}
        </div>
      </div>
    );
  });

  interface PlanningChatInputProps {
    onSendMessage: (text: string) => void;
    isAiStreaming: boolean;
    selectedContextSnippet: string | null;
    onClearContext: () => void;
  }

  const PlanningChatInput = React.memo(function PlanningChatInput({
    onSendMessage,
    isAiStreaming,
    selectedContextSnippet,
    onClearContext,
  }: PlanningChatInputProps) {
    const [localInput, setLocalInput] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!localInput.trim() || isAiStreaming) return;
      onSendMessage(localInput);
      setLocalInput('');
    };

    return (
      <div className="p-3 border-t border-zinc-800 bg-[#141418] shrink-0">
        {selectedContextSnippet && (
          <div className="mb-2 p-2 bg-gradient-to-r from-sky-950/60 to-purple-950/60 border border-sky-500/40 rounded-lg flex items-start justify-between gap-2 shadow-md animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="flex items-start gap-2 min-w-0">
              <Sparkles className="w-3.5 h-3.5 text-sky-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-sky-300 uppercase tracking-wider">Contexto Seleccionado</span>
                  <span className="text-[10px] text-zinc-500 font-mono">({selectedContextSnippet.length} caracteres)</span>
                </div>
                <p className="text-[11px] text-zinc-200 line-clamp-2 font-mono mt-0.5 bg-black/40 px-1.5 py-0.5 rounded border border-white/5">
                  "{selectedContextSnippet}"
                </p>
              </div>
            </div>
            <button
              onClick={onClearContext}
              className="text-zinc-400 hover:text-zinc-200 p-1 rounded hover:bg-zinc-800 shrink-0"
              title="Quitar contexto"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <Input
            id="agile-coach-input"
            placeholder={selectedContextSnippet ? "Qué hacemos con la selección..." : "Pide una nueva fase, épica o refactor..."}
            value={localInput}
            onChange={(e) => setLocalInput(e.target.value)}
            disabled={isAiStreaming}
            className="bg-[#1b1b22] border-zinc-700 text-xs focus-visible:border-sky-500"
          />
          <Button
            type="submit"
            size="sm"
            disabled={isAiStreaming || !localInput.trim()}
            className="bg-sky-600 hover:bg-sky-500 text-white shadow-sm"
          >
            {isAiStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </form>
      </div>
    );
  });

export default function PlanningStudioTab() {
  const currentProjectId = useTabsStore((s) => s.currentProjectId);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const tab = useTabsStore((s) => s.tabs.find((t) => t.id === activeTabId));

  const initialContext = tab?.data?.markdown || '';
  const activeProjectId = tab?.data?.projectId || currentProjectId;

  const projectState = usePlanningStore((s) => (activeProjectId ? s.projectStates[activeProjectId] : null));
  const setProjectState = usePlanningStore((s) => s.setProjectState);

  const [docData, setDocData] = useState<PlanningDocument | null>(null);
  const [markdownContent, setMarkdownContent] = useState<string>('');
  const [savedMarkdown, setSavedMarkdown] = useState<string>('');
  const [isLoadingDoc, setIsLoadingDoc] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const [historyVersions, setHistoryVersions] = useState<PlanningVersion[]>([]);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState<boolean>(false);
  const [selectedVersion, setSelectedVersion] = useState<PlanningVersion | null>(null);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);

  const [showInjectModal, setShowInjectModal] = useState<boolean>(false);
  const [externalPlanText, setExternalPlanText] = useState<string>('');
  const [isCopyingPrompt, setIsCopyingPrompt] = useState<boolean>(false);

  const [kanbanTasks, setKanbanTasks] = useState<Task[]>([]);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const [viewMode, setViewMode] = useState<'magic_mirror' | 'wbs_tree' | 'raw_editor'>('magic_mirror');

  const initialMessages = projectState?.messages?.length
    ? projectState.messages
    : initialContext
    ? [{ role: 'user', content: initialContext }]
    : [];

  const [messages, setMessages] = useState<{ role: string; content: string }[]>(initialMessages);
  const [isAiStreaming, setIsAiStreaming] = useState(false);
  const [selectedContextSnippet, setSelectedContextSnippet] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollAreaRef = useRef<HTMLDivElement>(null);

  const hasUnsavedChanges = useMemo(() => {
    return markdownContent !== savedMarkdown;
  }, [markdownContent, savedMarkdown]);

  useEffect(() => {
    if (!activeProjectId) return;
    let isMounted = true;
    async function loadData() {
      setIsLoadingDoc(true);
      try {
        const doc = await getPlanningDocument(activeProjectId!);
        if (isMounted && doc) {
          setDocData(doc);
          setMarkdownContent(doc.markdown_content || '');
          setSavedMarkdown(doc.markdown_content || '');
        }
        const history = await getPlanningHistory(activeProjectId!);
        if (isMounted && history) {
          setHistoryVersions(history);
        }
        const tasksRes = await getProjectTasks(activeProjectId!);
        if (isMounted && tasksRes?.tasks) {
          setKanbanTasks(tasksRes.tasks);
        }
      } catch (err) {
        console.error('Load Error:', err);
      } finally {
        if (isMounted) setIsLoadingDoc(false);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [activeProjectId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAiStreaming]);

  useEffect(() => {
    if (!activeProjectId) return;
    setProjectState(activeProjectId, { messages, wbsData: projectState?.wbsData ?? undefined });
  }, [messages, activeProjectId]);

  const kanbanTaskMap = useMemo(() => {
    const map = new Map<string, { status: string; id: string; title: string }>();
    for (const t of kanbanTasks) {
      const taskTitle = (t as any).content || (t as any).title;
      if (taskTitle) {
        const norm = taskTitle.toLowerCase().replace(/\s+/g, ' ').trim();
        map.set(norm, { status: (t.status || 'todo').toLowerCase(), id: t.id, title: taskTitle });
      }
    }
    return map;
  }, [kanbanTasks]);

  const parsedTickets = useMemo(() => {
    return extractTicketsFromMarkdown(markdownContent);
  }, [markdownContent]);

  const hierarchicalPlan = useMemo(() => {
    const epicsMap = new Map<string, Map<string, WBSImportTicket[]>>();
    for (const t of parsedTickets) {
      const epicName = t.epic || 'General';
      const sprintName = t.sprint || 'Sprint 1';
      if (!epicsMap.has(epicName)) {
        epicsMap.set(epicName, new Map<string, WBSImportTicket[]>());
      }
      const sprintMap = epicsMap.get(epicName)!;
      if (!sprintMap.has(sprintName)) {
        sprintMap.set(sprintName, []);
      }
      sprintMap.get(sprintName)!.push(t);
    }
    return Array.from(epicsMap.entries()).map(([epicTitle, sprintsMap]) => ({
      epicTitle,
      sprints: Array.from(sprintsMap.entries()).map(([sprintTitle, tasks]) => ({
        sprintTitle,
        tasks,
      })),
    }));
  }, [parsedTickets]);

  const planStats = useMemo(() => {
    const total = parsedTickets.length;
    let inProgress = 0;
    let completed = 0;
    let inKanban = 0;
    let unsynced = 0;

    for (const t of parsedTickets) {
      const norm = t.title.toLowerCase().replace(/\s+/g, ' ').trim();
      const match = kanbanTaskMap.get(norm);
      if (match) {
        inKanban++;
        if (match.status.includes('prog') || match.status === 'in_progress' || match.status === 'doing') {
          inProgress++;
        } else if (match.status.includes('done') || match.status === 'completed' || match.status === 'resolved') {
          completed++;
        }
      } else {
        unsynced++;
      }
    }
    return { total, inProgress, completed, inKanban, unsynced };
  }, [parsedTickets, kanbanTaskMap]);

  const handleSaveDocument = async (customSummary?: string) => {
    if (!activeProjectId) return;
    setIsSaving(true);
    try {
      const updated = await savePlanningDocument(activeProjectId, markdownContent, customSummary || 'Guardado manual');
      setDocData(updated);
      setSavedMarkdown(updated.markdown_content);
      toast.success('Plan guardado exitosamente');
      const history = await getPlanningHistory(activeProjectId);
      setHistoryVersions(history);
    } catch (err) {
      toast.error('Error al guardar: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyMegaPrompt = async () => {
    if (!activeProjectId) return;
    setIsCopyingPrompt(true);
    try {
      let topologicalMap = await getProjectGraphMd(activeProjectId).catch(() => '');
      const megaPrompt = `# DIRECTIVA DE PLANIFICACIÓN ÁGIL (SPRINTLOGIC PLANNING STUDIO)

Eres un Agile Coach y Tech Lead Senior. Analiza la topología del proyecto y el 'Documento Vivo' de planificación para estructurar o expandir un plan estructurado Docs-as-Code.

## 1. Topología del Proyecto (Blast Radius & AST)
\`\`\`markdown
${topologicalMap || '// Mapa de dependencias no disponible'}
\`\`\`

## 2. Documento Vivo Actual (Project Charter + WBS + Icebox)
\`\`\`markdown
${markdownContent || '// Plan vacío'}
\`\`\`

## 3. Instrucciones y Directivas Obligatorias
1. ESTRUCTURA OBLIGATORIA DEL DOCUMENTO:
   - \`# 🎯 Project Charter y Planificación WBS\`
   - \`## 1. Fundamentos del Proyecto\` (Objetivo Principal, Problema a Resolver, Alcance y Naturaleza, Stack Tecnológico Principal)
   - \`## 2. Plan de Ejecución (WBS)\`
   - \`## 🎯 Épica <N>: <Nombre de Épica>\`
   - \`### 🏃 Sprint <N> (<Objetivo del Sprint>)\`
   - \`- [ ] **<Título de Tarea>** [Priority: High|Medium|Low] [Type: Feature|Refactor|Technical Debt|Security] [Hours: <N>h] [Branch: feat/...]\`
   - \`  - [ ] <Subtarea técnica>\`
   - \`## 💡 3. Icebox (Backlog y Propuestas Futuras)\`
   - \`- Idea: <ideas o propuestas que quedan fuera del alcance actual>\`

2. GUARDIÁN DEL ALCANCE (SCOPE GUARDIAN):
   - Revisa '1. Fundamentos del Proyecto' y úsalo como tu 'Estrella Polar'.
   - Cualquier idea o funcionalidad que exceda el 'Alcance y Naturaleza' definido debe ser catalogada como Corrupción de Alcance (Scope Creep) y colocada obligatoriamente en la sección '3. Icebox' como viñeta simple (\`- Idea: ...\`) SIN checkboxes (\`- [ ]\`), evitando que el Smart Parser la envíe al Sprint Center prematuramente.

3. PRESERVACIÓN INCREMENTAL (ZERO-DATA-LOSS):
   - Conserva el Project Charter, épicas, sprints y tareas existentes.
   - Devuelve ÚNICAMENTE el bloque Markdown completo del plan actualizado.
`;
      let copied = false;
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(megaPrompt);
          copied = true;
        }
      } catch {
        // Fallback for restricted clipboard contexts
      }

      if (!copied) {
        try {
          const ta = document.createElement('textarea');
          ta.value = megaPrompt;
          ta.style.position = 'fixed';
          ta.style.top = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          copied = document.execCommand('copy');
          document.body.removeChild(ta);
        } catch {
          // Ignore
        }
      }

      if (copied) {
        toast.success('Mega-Prompt copiado al portapapeles');
      } else {
        toast.error('No se pudo acceder al portapapeles');
      }
    } catch (err) {
      toast.error('Error al copiar: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsCopyingPrompt(false);
    }
  };

  const handleInjectExternalPlan = async () => {
    if (!externalPlanText.trim()) {
      toast.error('Por favor pega el contenido Markdown del plan');
      return;
    }
    let cleanMd = externalPlanText.trim();
    if (cleanMd.startsWith('```markdown')) {
      cleanMd = cleanMd.replace(/^```markdown\n/, '').replace(/\n```$/, '');
    } else if (cleanMd.startsWith('```')) {
      cleanMd = cleanMd.replace(/^```\n?/, '').replace(/\n```$/, '');
    }

    setMarkdownContent(cleanMd);
    setShowInjectModal(false);
    setExternalPlanText('');

    if (activeProjectId) {
      setIsSaving(true);
      try {
        const updated = await savePlanningDocument(activeProjectId, cleanMd, 'Inyección desde LLM externo');
        setDocData(updated);
        setSavedMarkdown(updated.markdown_content);
        toast.success('Plan externo inyectado y guardado correctamente');
        const history = await getPlanningHistory(activeProjectId);
        setHistoryVersions(history);
      } catch (e) {
        toast.error('Error al guardar: ' + (e instanceof Error ? e.message : String(e)));
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleRestoreVersion = async (version: PlanningVersion) => {
    if (!activeProjectId) return;
    setIsRestoring(true);
    try {
      const restored = await restorePlanningVersion(activeProjectId, version.id);
      setDocData(restored);
      setMarkdownContent(restored.markdown_content);
      setSavedMarkdown(restored.markdown_content);
      setSelectedVersion(null);
      setShowHistoryDrawer(false);
      toast.success(`Plan restaurado v${version.version}`);
      const history = await getPlanningHistory(activeProjectId);
      setHistoryVersions(history);
    } catch (err) {
      toast.error('Error al restaurar: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsRestoring(false);
    }
  };

  const handleSmartHandoffToKanban = async () => {
    if (!activeProjectId) return;
    if (parsedTickets.length === 0) {
      toast.error('No se encontraron tareas con formato válido para exportar');
      return;
    }
    const unsyncedTickets = parsedTickets.filter((t) => {
      const norm = t.title.toLowerCase().replace(/\s+/g, ' ').trim();
      return !kanbanTaskMap.has(norm);
    });
    if (unsyncedTickets.length === 0) {
      toast.info('Todas las tareas ya están sincronizadas en el Sprint Center');
      return;
    }
    setIsExporting(true);
    try {
      await importWBSTickets(activeProjectId, unsyncedTickets);
      toast.success('Importación Exitosa', {
        description: `Se sincronizaron ${unsyncedTickets.length} tareas nuevas en el Sprint Center.`,
      });
      const tasksRes = await getProjectTasks(activeProjectId);
      if (tasksRes?.tasks) {
        setKanbanTasks(tasksRes.tasks);
      }
      useTabsStore.getState().addTab({
        id: 'kanban',
        title: 'Sprint Center',
        type: 'kanban',
        data: { projectId: activeProjectId },
      });
    } catch (err) {
      toast.error('Error al exportar: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsExporting(false);
    }
  };

  const handleMagicMirrorSelection = () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (text && text.length > 5) {
      setSelectedContextSnippet(text);
    }
  };

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isAiStreaming || !activeProjectId) return;

    const activeSelection = selectedContextSnippet;
    const promptToSend = activeSelection
      ? `[MODIFICACIÓN LOCALIZADA - EDITA ÚNICAMENTE ESTE FRAGMENTO SELECCIONADO]:\n\`\`\`markdown\n${activeSelection}\n\`\`\`\n\n[INSTRUCCIÓN DEL USUARIO]:\n${textToSend}\n\nIMPORTANTE: No devuelvas todo el plan. Devuelve ÚNICAMENTE el bloque Markdown con la versión modificada/reemplazo de este fragmento seleccionado para que se inserte en su lugar exacto.`
      : textToSend;

    const displayContent = activeSelection
      ? `📌 **Sobre la selección:**\n> *"${activeSelection.length > 80 ? activeSelection.slice(0, 80) + '...' : activeSelection}"*\n\n${textToSend}`
      : textToSend;

    const newMessages = [...messages, { role: 'user', content: displayContent }];
    setMessages(newMessages);
    setSelectedContextSnippet(null);
    setIsAiStreaming(true);
    let assistantReply = '';
    try {
      await sendPlanningMessage(
        {
          messages: [
            ...messages,
            { role: 'user', content: promptToSend },
          ],
          project_id: activeProjectId,
          current_markdown: markdownContent,
        },
        (deltaText) => {
          assistantReply = deltaText;
          setMessages([...newMessages, { role: 'assistant', content: assistantReply }]);
        },
        () => {}
      );
      const cleanReply = assistantReply.trim();
      const extractedPlan = extractPlanSnippetFromReply(cleanReply, activeSelection);
      if (extractedPlan && extractedPlan.length > 3) {
        const mergedPlan = smartMergeWbsPlan(markdownContent, extractedPlan, activeSelection);
        setMarkdownContent(mergedPlan);
        savePlanningDocument(activeProjectId, mergedPlan, activeSelection ? 'Actualización sobre selección' : 'Actualización por IA interna')
          .then((doc) => {
            setDocData(doc);
            setSavedMarkdown(doc.markdown_content);
            getPlanningHistory(activeProjectId).then(setHistoryVersions);
            toast.success('✨ Plan actualizado con éxito en el Espejo Mágico');
          })
          .catch((e) => console.warn('Could not auto-save AI plan:', e));
      }
    } catch (err) {
      toast.error('Error del asistente: ' + (err instanceof Error ? err.message : String(err)));
      setMessages([...newMessages, { role: 'assistant', content: '❌ Ocurrió un error al contactar al asistente.' }]);
    } finally {
      setIsAiStreaming(false);
    }
  };

  const handleApplySnippet = (snippet: string) => {
    if (!snippet || !activeProjectId) return;
    const mergedPlan = smartMergeWbsPlan(markdownContent, snippet, selectedContextSnippet);
    setMarkdownContent(mergedPlan);
    savePlanningDocument(activeProjectId, mergedPlan, selectedContextSnippet ? 'Actualización sobre selección' : 'Actualización por IA interna')
      .then((doc) => {
        setDocData(doc);
        setSavedMarkdown(doc.markdown_content);
        getPlanningHistory(activeProjectId).then(setHistoryVersions);
        toast.success('✨ Cambio aplicado en el Espejo Mágico');
      })
      .catch((e) => {
        console.warn('Could not save plan:', e);
        toast.error('Error al guardar el plan');
      });
  };

  const customMarkdownComponents = useMemo(() => {
    return {
      h1: ({ children, ...props }: any) => (
        <h1 className="text-xl font-bold text-zinc-100 pb-2 mb-4 border-b border-zinc-800 flex items-center gap-2" {...props}>
          {children}
        </h1>
      ),
      h2: ({ children, ...props }: any) => {
        const text = String(React.Children.toArray(children).join(''));
        if (/fundamentos/i.test(text)) {
          return (
            <div className="mt-6 mb-3 p-3.5 bg-sky-950/20 border border-sky-500/30 rounded-xl shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40 uppercase tracking-wider">
                  Contrato Rector
                </span>
                <h2 className="text-base font-bold text-sky-200" {...props}>{children}</h2>
              </div>
            </div>
          );
        }
        if (/icebox/i.test(text)) {
          return (
            <div className="mt-8 mb-3 p-3.5 bg-gradient-to-r from-purple-950/25 to-indigo-950/20 border border-purple-500/30 rounded-xl shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold border border-purple-500/40 uppercase tracking-wider">
                  🧊 Backlog de Ideas
                </span>
                <h2 className="text-base font-bold text-purple-200" {...props}>{children}</h2>
              </div>
            </div>
          );
        }
        return (
          <h2 className="text-lg font-semibold text-sky-400 mt-6 mb-3 flex items-center gap-2 border-b border-sky-900/30 pb-1" {...props}>
            {children}
          </h2>
        );
      },
      h3: ({ children, ...props }: any) => <h3 className="text-base font-medium text-amber-400 mt-4 mb-2 flex items-center gap-2" {...props}>{children}</h3>,
      blockquote: ({ children, ...props }: any) => (
        <blockquote className="border-l-4 border-sky-500 bg-sky-950/20 p-3 my-3 rounded-r-lg text-zinc-300 italic text-xs leading-relaxed" {...props}>
          {children}
        </blockquote>
      ),
      li: ({ children, ...props }: any) => {
        const childArray = React.Children.toArray(children);
        let taskTitle = '';
        let isTaskItem = false;
        for (const c of childArray) {
          if (React.isValidElement(c)) {
            const propsObj = (c.props as any) || {};
            if (c.type === 'strong' || (typeof propsObj.children === 'string' && propsObj.children.startsWith('**'))) {
              taskTitle = String(propsObj.children || '');
              isTaskItem = true;
              break;
            }
          }
        }

        const rawText = String(childArray.map(c => (typeof c === 'string' ? c : (c as any)?.props?.children || '')).join(''));
        if (/^idea:/i.test(rawText.trim())) {
          return (
            <li className="my-1.5 text-sm text-purple-200/90 leading-relaxed flex items-start gap-2 bg-purple-950/15 border border-purple-500/20 px-3 py-1.5 rounded-lg list-none" {...props}>
              <span className="text-purple-400 text-xs shrink-0 mt-0.5">💡</span>
              <div className="flex-1">{children}</div>
            </li>
          );
        }

        const normTitle = taskTitle.toLowerCase().replace(/\s+/g, ' ').trim();
        const kanbanMatch = normTitle ? kanbanTaskMap.get(normTitle) : null;
        let isDone = kanbanMatch?.status?.includes('done') || kanbanMatch?.status === 'completed';
        return (
          <li className={`my-1 text-sm text-zinc-300 leading-relaxed ${isDone ? 'line-through opacity-70' : ''}`} {...props}>
            {children}
            {isTaskItem && (
              <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full border ${kanbanMatch ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                {kanbanMatch ? '✅ Kanban' : '➕ Nueva'}
              </span>
            )}
          </li>
        );
      },
    };
  }, [kanbanTaskMap]);

  return (
    <div className="flex flex-col h-full min-h-0 w-full bg-[#0a0a0c] text-zinc-100 overflow-hidden font-sans">
      <div className="h-14 border-b border-zinc-800/80 bg-[#121215] px-4 flex items-center justify-between gap-4 shrink-0 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-sky-500/10 border border-sky-500/20 rounded-lg text-sky-400 shrink-0">
            <FileCode className="w-5 h-5" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-zinc-200 truncate">{docData?.file_path || 'docs/planning/current_plan.md'}</span>
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-zinc-800/80 text-zinc-300 border-zinc-700 font-mono">v{docData?.version || 1}</Badge>
              {hasUnsavedChanges ? (
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-amber-500/15 text-amber-300 border-amber-500/30 flex items-center gap-1"><AlertCircle className="w-2.5 h-2.5" /> Sin guardar</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-emerald-500/15 text-emerald-300 border-emerald-500/30 flex items-center gap-1"><Check className="w-2.5 h-2.5" /> Guardado</Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleCopyMegaPrompt} disabled={isCopyingPrompt || isLoadingDoc} className="border-zinc-700 hover:bg-zinc-800 text-zinc-300 text-xs gap-1.5">
            {isCopyingPrompt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5 text-sky-400" />} Copiar Mega-Prompt
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowInjectModal(true)} className="border-zinc-700 hover:bg-zinc-800 text-zinc-300 text-xs gap-1.5"><Download className="w-3.5 h-3.5 text-purple-400" /> Inyectar</Button>
          <Button size="sm" variant={showHistoryDrawer ? 'default' : 'outline'} onClick={() => setShowHistoryDrawer(!showHistoryDrawer)} className="text-xs gap-1.5"><History className="w-3.5 h-3.5 text-amber-400" /> Historial</Button>
          <Button size="sm" variant="outline" onClick={() => handleSaveDocument()} disabled={isSaving || !hasUnsavedChanges} className="border-zinc-700 hover:bg-zinc-800 text-zinc-300 text-xs gap-1.5"><Save className="w-3.5 h-3.5 text-emerald-400" /> Guardar</Button>
          <Button size="sm" onClick={handleSmartHandoffToKanban} disabled={isExporting || parsedTickets.length === 0} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium gap-1.5"><Kanban className="w-3.5 h-3.5" /> Exportar Kanban</Button>
        </div>
      </div>

      <div className="flex flex-row flex-1 min-h-0 overflow-hidden relative">
        <div className="w-[400px] min-w-[340px] max-w-[480px] border-r border-zinc-800 bg-[#0e0e11] flex flex-col shrink-0">
          <div className="p-3 border-b border-zinc-800/80 bg-[#141418] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-xs font-semibold text-zinc-200">Agile Coach & Lead Architect</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={chatScrollAreaRef}>
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center p-4 text-center text-zinc-500 my-auto space-y-3">
                <div className="p-3 bg-sky-500/10 border border-sky-500/20 rounded-2xl text-sky-400 shadow-sm">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-zinc-200">Agile Coach & Lead Architect</h4>
                <p className="text-xs text-zinc-400 max-w-xs leading-relaxed">
                  Pide nuevas épicas, sprints o mejoras arquitectónicas para tu plan vivo.
                </p>
                <div className="p-3 bg-gradient-to-br from-sky-950/40 to-purple-950/30 border border-sky-500/30 rounded-xl text-left text-xs text-zinc-300 space-y-1 shadow-sm">
                  <div className="flex items-center gap-1.5 font-semibold text-sky-300 text-[11px]">
                    <Highlighter className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span>Edición Quirúrgica por Selección</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Seleccioná cualquier tarea o texto en el <span className="text-zinc-200 font-medium">Espejo Mágico</span> para que el Coach actúe exclusivamente sobre ese fragmento.
                  </p>
                </div>
              </div>
            )}
            {messages.map((m, idx) => (
              <PlanningMessageItem key={idx} message={m} onApplySnippet={handleApplySnippet} />
            ))}
            <div ref={messagesEndRef} />
          </div>
          <PlanningChatInput
            onSendMessage={handleSendMessage}
            isAiStreaming={isAiStreaming}
            selectedContextSnippet={selectedContextSnippet}
            onClearContext={() => setSelectedContextSnippet(null)}
          />
        </div>

        <div className="flex-1 min-w-0 flex flex-col bg-[#0d0d10] overflow-hidden">
          {selectedVersion ? (
            <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
              <div className="h-12 border-b border-zinc-800 bg-[#16161b] px-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-amber-500/15 border border-amber-500/30 rounded text-amber-400">
                    <History className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-amber-300">
                      Comparando Versión v{selectedVersion.version}
                    </span>
                    <span className="text-[11px] text-zinc-400 ml-2">
                      ({formatRelativeTime(selectedVersion.created_at)} • {formatAbsoluteLocalTime(selectedVersion.created_at)})
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedVersion(null)}
                    className="text-xs border-zinc-700 hover:bg-zinc-800 text-zinc-300 gap-1"
                  >
                    <X className="w-3.5 h-3.5" /> Cerrar Diff
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleRestoreVersion(selectedVersion)}
                    disabled={isRestoring}
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold gap-1.5 shadow-md shadow-amber-900/20"
                  >
                    {isRestoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                    Restaurar esta Versión
                  </Button>
                </div>
              </div>
              <DiffEditor
                height="100%"
                language="markdown"
                theme="vs-dark"
                original={selectedVersion.markdown_content}
                modified={markdownContent}
                options={{
                  readOnly: true,
                  renderSideBySide: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 13,
                  wordWrap: 'on',
                  emptySelectionClipboard: false,
                }}
              />
            </div>
          ) : (
            <div className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
              <div className="h-10 border-b border-zinc-800/80 bg-[#121216] px-4 flex items-center justify-between gap-2 shrink-0 overflow-hidden">
                <div className="flex items-center gap-1 bg-[#1a1a20] p-0.5 rounded-lg border border-zinc-800 shrink-0">
                  <button onClick={() => setViewMode('magic_mirror')} className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${viewMode === 'magic_mirror' ? 'bg-sky-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}>Espejo Mágico</button>
                  <button onClick={() => setViewMode('wbs_tree')} className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${viewMode === 'wbs_tree' ? 'bg-sky-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}>Árbol WBS</button>
                  <button onClick={() => setViewMode('raw_editor')} className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${viewMode === 'raw_editor' ? 'bg-sky-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}`}>Editor Markdown</button>
                </div>
                {viewMode === 'magic_mirror' && !showHistoryDrawer && (
                  <div className="hidden 2xl:flex items-center gap-1.5 text-[11px] text-sky-300 bg-sky-950/40 border border-sky-500/30 px-3 py-0.5 rounded-full shadow-sm whitespace-nowrap overflow-hidden text-ellipsis max-w-md">
                    <Sparkles className="w-3 h-3 text-sky-400 shrink-0" />
                    <span className="truncate">Tip: Seleccioná cualquier texto del plan para enfocar la edición del Agile Coach</span>
                  </div>
                )}
                <div className="flex items-center gap-3 text-xs text-zinc-400 shrink-0">
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" /> <span className="hidden md:inline">Sincronizado con Sprint Center</span>
                  </span>
                  <button
                    onClick={async () => {
                      if (!activeProjectId) return;
                      const res = await getProjectTasks(activeProjectId);
                      if (res?.tasks) {
                        setKanbanTasks(res.tasks);
                        toast.success('Estado de tareas refrescado desde Kanban');
                      }
                    }}
                    className="hover:text-zinc-200 p-1 rounded hover:bg-zinc-800 transition-colors"
                    title="Refrescar estado de tareas desde Kanban"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {viewMode === 'magic_mirror' ? (
                <div
                  className="flex-1 overflow-y-auto p-8 bg-[#0b0b0e] relative select-text"
                  onMouseUp={handleMagicMirrorSelection}
                  onTouchEnd={handleMagicMirrorSelection}
                >
                  {isLoadingDoc ? (
                    <div className="flex items-center justify-center p-12 text-zinc-500">
                      <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando documento vivo...
                    </div>
                  ) : (
                    <div className="max-w-4xl mx-auto prose prose-invert prose-zinc max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={customMarkdownComponents}>
                        {markdownContent || '# Plan no inicializado'}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              ) : viewMode === 'wbs_tree' ? (
                <div className="flex-1 overflow-y-auto p-6 bg-[#0b0b0e] space-y-6">
                  {hierarchicalPlan.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 text-center text-zinc-500">
                      <FolderKanban className="w-12 h-12 text-zinc-700 mb-3" />
                      <h4 className="text-sm font-semibold text-zinc-300 mb-1">No hay épicas ni tareas estructuradas</h4>
                      <p className="text-xs text-zinc-500 max-w-sm">
                        Genera un plan con el Agile Coach o usa el Editor Markdown para estructurar épicas (# Épica) y tareas (- [ ] **Tarea**).
                      </p>
                    </div>
                  ) : (
                    hierarchicalPlan.map((epic, eIdx) => (
                      <div key={eIdx} className="border border-zinc-800/80 rounded-xl bg-[#111116] overflow-hidden shadow-lg">
                        <div className="px-5 py-3.5 bg-[#171720] border-b border-zinc-800/80 flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <Target className="w-4 h-4 text-sky-400" />
                            <span className="font-semibold text-sm text-zinc-100">{epic.epicTitle}</span>
                          </div>
                          <Badge variant="outline" className="text-[10px] bg-zinc-800 text-zinc-300 border-zinc-700">
                            {epic.sprints.reduce((acc, s) => acc + s.tasks.length, 0)} tareas
                          </Badge>
                        </div>
                        <div className="p-4 space-y-4">
                          {epic.sprints.map((sprint, sIdx) => (
                            <div key={sIdx} className="space-y-2.5">
                              <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                                <ChevronRight className="w-3.5 h-3.5" />
                                <span>{sprint.sprintTitle}</span>
                              </div>
                              <div className="grid grid-cols-1 gap-2 pl-4">
                                {sprint.tasks.map((task, tIdx) => {
                                  const norm = task.title.toLowerCase().replace(/\s+/g, ' ').trim();
                                  const kanbanMatch = kanbanTaskMap.get(norm);
                                  const isDone = kanbanMatch?.status?.includes('done') || kanbanMatch?.status === 'completed';
                                  return (
                                    <div
                                      key={tIdx}
                                      className={`p-3 rounded-lg border transition-colors ${
                                        isDone
                                          ? 'bg-zinc-950/40 border-zinc-800/50 opacity-70'
                                          : 'bg-[#181822] border-zinc-800 hover:border-zinc-700'
                                      }`}
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-start gap-2.5">
                                          <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                                            isDone ? 'bg-emerald-600 border-emerald-500 text-white' : 'border-zinc-700 text-transparent'
                                          }`}>
                                            ✓
                                          </div>
                                          <div>
                                            <span className={`text-xs font-medium ${isDone ? 'line-through text-zinc-400' : 'text-zinc-200'}`}>
                                              {task.title}
                                            </span>
                                            {task.subtasks && task.subtasks.length > 0 && (
                                              <div className="mt-1.5 space-y-1 pl-2 border-l border-zinc-800">
                                                {task.subtasks.map((st, subIdx) => (
                                                  <div key={subIdx} className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                                                    <span className="w-1 h-1 rounded-full bg-zinc-600" />
                                                    <span>{st.title}</span>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                                          {task.priority && (
                                            <Badge variant="outline" className={`text-[10px] py-0 px-1.5 ${
                                              task.priority.toLowerCase() === 'high' ? 'bg-rose-500/10 text-rose-300 border-rose-500/30' : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                                            }`}>
                                              {task.priority}
                                            </Badge>
                                          )}
                                          {task.type && (
                                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-blue-500/10 text-blue-300 border-blue-500/30">
                                              {task.type}
                                            </Badge>
                                          )}
                                          {task.branch_name && (
                                            <span className="text-[10px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded flex items-center gap-1">
                                              <GitBranch className="w-2.5 h-2.5" /> {task.branch_name}
                                            </span>
                                          )}
                                          {kanbanMatch ? (
                                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-emerald-500/10 text-emerald-300 border-emerald-500/20 flex items-center gap-1">
                                              <CheckCircle2 className="w-2.5 h-2.5" /> En Kanban
                                            </Badge>
                                          ) : (
                                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-sky-500/10 text-sky-300 border-sky-500/20">
                                              ➕ Pendiente
                                            </Badge>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="flex-1 min-w-0 overflow-hidden">
                  <Editor
                    height="100%"
                    language="markdown"
                    theme="vs-dark"
                    value={markdownContent}
                    onChange={(val) => setMarkdownContent(val || '')}
                    options={{
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      fontSize: 13,
                      wordWrap: 'on',
                      tabSize: 2,
                      emptySelectionClipboard: false,
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {showHistoryDrawer && (
          <div className="w-80 border-l border-zinc-800 bg-[#121216] flex flex-col shrink-0 shadow-2xl z-20">
            <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-[#17171d] shrink-0">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-zinc-200">Máquina del Tiempo (Historial)</span>
              </div>
              <button
                onClick={() => setShowHistoryDrawer(false)}
                className="text-zinc-400 hover:text-zinc-200 p-1 rounded hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {historyVersions.length === 0 ? (
                <div className="text-center text-xs text-zinc-500 p-4">
                  No hay versiones previas registradas
                </div>
              ) : (
                historyVersions.map((v) => {
                  const isSelected = selectedVersion?.id === v.id;
                  return (
                    <div
                      key={v.id}
                      className={`p-3 rounded-lg border transition-all ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500/40 shadow-sm'
                          : 'bg-[#18181f] border-zinc-800/80 hover:border-zinc-700 hover:bg-[#1f1f27]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-zinc-800 text-amber-400 border-zinc-700 font-mono">
                          v{v.version}
                        </Badge>
                        <span className="text-[10px] text-zinc-400">
                          {formatRelativeTime(v.created_at)}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-200 font-medium line-clamp-2 mb-1">
                        {v.change_summary || 'Actualización del plan'}
                      </div>
                      <div className="text-[10px] text-zinc-500 mb-2.5">
                        {formatAbsoluteLocalTime(v.created_at)}
                      </div>
                      <div className="flex items-center gap-2 pt-1.5 border-t border-zinc-800/60">
                        <button
                          onClick={() => setSelectedVersion(v)}
                          className="text-[11px] flex-1 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors flex items-center justify-center gap-1"
                        >
                          <Eye className="w-3 h-3 text-sky-400" /> Comparar
                        </button>
                        <button
                          onClick={() => handleRestoreVersion(v)}
                          disabled={isRestoring}
                          className="text-[11px] flex-1 py-1 rounded bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 font-medium transition-colors flex items-center justify-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" /> Restaurar
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          EXTERNAL PLAN INJECTION MODAL
         ───────────────────────────────────────────────────────────── */}
      <Dialog open={showInjectModal} onOpenChange={setShowInjectModal}>
        <DialogContent className="bg-[#121216] border-zinc-800 text-zinc-100 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-purple-400">
              <Download className="w-5 h-5" /> Inyectar Plan desde LLM Externo
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400">
              Pega aquí el plan en formato Markdown generado por Claude, ChatGPT, Cursor o cualquier otro modelo. Se guardará directamente en <code>docs/planning/current_plan.md</code> y se sincronizará con el Sprint Center.
            </DialogDescription>
          </DialogHeader>

          <div className="my-2">
            <textarea
              value={externalPlanText}
              onChange={(e) => setExternalPlanText(e.target.value)}
              placeholder="# 📋 Plan de Proyecto (WBS)&#10;&#10;## 🎯 Épica 1: Autenticación&#10;### 🏃 Sprint 1&#10;- [ ] **Crear endpoints de Auth** [Priority: High] [Type: Feature] [Hours: 4h] [Branch: feat/auth]&#10;  - [ ] Implementar JWT token generator&#10;  - [ ] Añadir middleware de validación"
              rows={12}
              className="w-full bg-[#181820] border border-zinc-700/80 rounded-lg p-3 text-xs font-mono text-zinc-200 focus:outline-none focus:border-purple-500 resize-none"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowInjectModal(false)}
              className="border-zinc-700 text-zinc-300"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleInjectExternalPlan}
              disabled={!externalPlanText.trim()}
              className="bg-purple-600 hover:bg-purple-700 text-white font-medium gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" /> Inyectar y Guardar Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
