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
  ExternalLink,
  Kanban,
  Check,
  AlertCircle,
  Eye,
  Code2,
  X,
  FileEdit,
  ArrowRight,
  ListPlus,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────
// Helpers: Timezone-aware Date Formatting
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// Helper: Smart Ticket Parser from Markdown Plan
// ─────────────────────────────────────────────────────────────

export function extractTicketsFromMarkdown(markdown: string): WBSImportTicket[] {
  const tickets: WBSImportTicket[] = [];
  const lines = markdown.split('\n');

  let currentEpic = 'General';
  let currentSprint = 'Sprint 1';
  let currentTicket: WBSImportTicket | null = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // Match Epics: # Epic ... or ## Épica ...
    const epicMatch = line.match(/^#{1,2}\s+(?:🎯\s*)?(?:[ÉEe]pica\s*\d*[:\-]?\s*|\bEpic\s*\d*[:\-]?\s*)(.+)/i);
    if (epicMatch) {
      currentEpic = epicMatch[1].trim();
      continue;
    }

    // Match Sprints: ### Sprint ...
    const sprintMatch = line.match(/^#{3}\s+(?:🏃\s*)?(?:Sprint\s*\d*[:\-]?\s*)(.+)/i);
    if (sprintMatch) {
      currentSprint = line.replace(/^#{3}\s+/, '').trim();
      continue;
    }

    // Match Task: - [ ] or - [x] or * [ ]
    const taskMatch = line.match(/^[-*]\s*\[([ xX])\]\s*(.+)/);
    if (taskMatch) {
      const isIndented = rawLine.startsWith('  ') || rawLine.startsWith('\t') || rawLine.startsWith('    ');
      const fullText = taskMatch[2].trim();

      if (isIndented && currentTicket) {
        if (!currentTicket.subtasks) {
          currentTicket.subtasks = [];
        }
        // Subtask of the current ticket
        const subtaskTitle = fullText.replace(/^\*\*|\*\*$/g, '').trim();
        const isChecked = taskMatch[1].toLowerCase() === 'x';
        currentTicket.subtasks.push({
          id: String(currentTicket.subtasks.length + 1),
          title: subtaskTitle,
          completed: isChecked,
        });
      } else {
        // Main Ticket
        let title = fullText;
        let priority: 'Low' | 'Medium' | 'High' = 'Medium';
        let type = 'Feature';
        let branchName: string | undefined = undefined;

        const priorityMatch = title.match(/\[Priority:\s*(High|Medium|Low)\]/i);
        if (priorityMatch) {
          priority = (priorityMatch[1].charAt(0).toUpperCase() + priorityMatch[1].slice(1).toLowerCase()) as 'Low' | 'Medium' | 'High';
          title = title.replace(priorityMatch[0], '').trim();
        }

        const typeMatch = title.match(/\[Type:\s*([a-zA-Z0-9_\s-]+)\]/i);
        if (typeMatch) {
          type = typeMatch[1].trim();
          title = title.replace(typeMatch[0], '').trim();
        }

        const branchMatch = title.match(/\[Branch:\s*([a-zA-Z0-9_\-./]+)\]/i);
        if (branchMatch) {
          branchName = branchMatch[1].trim();
          title = title.replace(branchMatch[0], '').trim();
        }

        const hoursMatch = title.match(/\[Hours:\s*([0-9.]+)\s*h?\]/i);
        if (hoursMatch) {
          title = title.replace(hoursMatch[0], '').trim();
        }

        const cleanTitle = title.replace(/^\*\*|\*\*$/g, '').replace(/^__|\__$/g, '').trim();

        currentTicket = {
          title: cleanTitle,
          type: type || 'Feature',
          priority: priority || 'Medium',
          description: `Generado automáticamente desde el Plan WBS (${currentEpic})`,
          epic: currentEpic,
          sprint: currentSprint,
          branch_name: branchName,
          subtasks: [],
        };
        tickets.push(currentTicket);
      }
    }
  }

  return tickets;
}

// ─────────────────────────────────────────────────────────────
// Main PlanningStudioTab Component
// ─────────────────────────────────────────────────────────────

export default function PlanningStudioTab() {
  const currentProjectId = useTabsStore((s) => s.currentProjectId);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const tab = useTabsStore((s) => s.tabs.find((t) => t.id === activeTabId));

  const initialContext = tab?.data?.markdown || '';
  const activeProjectId = tab?.data?.projectId || currentProjectId;

  const projectState = usePlanningStore((s) => (activeProjectId ? s.projectStates[activeProjectId] : null));
  const setProjectState = usePlanningStore((s) => s.setProjectState);

  // Document state
  const [docData, setDocData] = useState<PlanningDocument | null>(null);
  const [markdownContent, setMarkdownContent] = useState<string>('');
  const [savedMarkdown, setSavedMarkdown] = useState<string>('');
  const [isLoadingDoc, setIsLoadingDoc] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Time Travel History state
  const [historyVersions, setHistoryVersions] = useState<PlanningVersion[]>([]);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState<boolean>(false);
  const [selectedVersion, setSelectedVersion] = useState<PlanningVersion | null>(null);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);

  // External Plan Injection state
  const [showInjectModal, setShowInjectModal] = useState<boolean>(false);
  const [externalPlanText, setExternalPlanText] = useState<string>('');
  const [isCopyingPrompt, setIsCopyingPrompt] = useState<boolean>(false);

  // Kanban sync state
  const [kanbanTasks, setKanbanTasks] = useState<Task[]>([]);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // View mode: 'magic_mirror' | 'raw_editor'
  const [viewMode, setViewMode] = useState<'magic_mirror' | 'raw_editor'>('magic_mirror');

  // AI Chat state
  const initialMessages = projectState?.messages?.length
    ? projectState.messages
    : initialContext
    ? [{ role: 'user', content: initialContext }]
    : [];

  const [messages, setMessages] = useState<{ role: string; content: string }[]>(initialMessages);
  const [inputValue, setInputValue] = useState('');
  const [isAiStreaming, setIsAiStreaming] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollAreaRef = useRef<HTMLDivElement>(null);

  // Track unsaved modifications
  const hasUnsavedChanges = useMemo(() => {
    return markdownContent !== savedMarkdown;
  }, [markdownContent, savedMarkdown]);

  // Load Document, History, and Kanban Tasks on mount / project change
  useEffect(() => {
    if (!activeProjectId) return;

    let isMounted = true;

    async function loadData() {
      setIsLoadingDoc(true);
      try {
        // 1. Fetch live document from disk/DB
        const doc = await getPlanningDocument(activeProjectId!);
        if (isMounted && doc) {
          setDocData(doc);
          setMarkdownContent(doc.markdown_content || '');
          setSavedMarkdown(doc.markdown_content || '');
        }

        // 2. Fetch history versions
        const history = await getPlanningHistory(activeProjectId!);
        if (isMounted && history) {
          setHistoryVersions(history);
        }

        // 3. Fetch Kanban tasks for Magic Mirror matching
        const tasksRes = await getProjectTasks(activeProjectId!);
        if (isMounted && tasksRes?.tasks) {
          setKanbanTasks(tasksRes.tasks);
        }
      } catch (err) {
        console.error('Failed to load planning document or kanban tasks:', err);
      } finally {
        if (isMounted) setIsLoadingDoc(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [activeProjectId]);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAiStreaming]);

  // Sync state to global PlanningStore
  useEffect(() => {
    if (!activeProjectId) return;
    setProjectState(activeProjectId, {
      messages,
      wbsData: projectState?.wbsData ?? undefined,
    });
  }, [messages, activeProjectId]);

  // Normalized task lookup map for Magic Mirror
  const kanbanTaskMap = useMemo(() => {
    const map = new Map<string, { status: string; id: string; title: string }>();
    for (const t of kanbanTasks) {
      const taskTitle = t.content || (t as { title?: string }).title;
      if (taskTitle) {
        const norm = taskTitle.toLowerCase().replace(/\s+/g, ' ').trim();
        map.set(norm, { status: (t.status || 'todo').toLowerCase(), id: t.id, title: taskTitle });
      }
    }
    return map;
  }, [kanbanTasks]);

  // Parsed tickets & metrics from current markdown
  const parsedTickets = useMemo(() => {
    return extractTicketsFromMarkdown(markdownContent);
  }, [markdownContent]);

  const planStats = useMemo(() => {
    let total = parsedTickets.length;
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

  // ─────────────────────────────────────────────────────────────
  // Action Handlers
  // ─────────────────────────────────────────────────────────────

  const handleSaveDocument = async (customSummary?: string) => {
    if (!activeProjectId) return;
    setIsSaving(true);
    try {
      const updated = await savePlanningDocument(
        activeProjectId,
        markdownContent,
        customSummary || 'Guardado manual desde Planning Studio'
      );
      setDocData(updated);
      setSavedMarkdown(updated.markdown_content);
      toast.success('Plan guardado exitosamente en disco y base de datos');

      // Refresh history list
      const history = await getPlanningHistory(activeProjectId);
      setHistoryVersions(history);
    } catch (err) {
      toast.error('Error al guardar el documento: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyMegaPrompt = async () => {
    if (!activeProjectId) return;
    setIsCopyingPrompt(true);
    try {
      let topologicalMap = '';
      try {
        topologicalMap = await getProjectGraphMd(activeProjectId);
      } catch (e) {
        console.warn('Could not fetch topological map for mega-prompt:', e);
      }

      const megaPrompt = `# DIRECTIVA DE PLANIFICACIÓN ÁGIL (SPRINTLOGIC PLANNING STUDIO)

Eres un Agile Coach y Tech Lead Senior. Analiza la topología del proyecto y el plan WBS actual para generar o expandir un plan estructurado Docs-as-Code.

## 1. Topología del Proyecto (Blast Radius & AST)
\`\`\`markdown
${topologicalMap || 'No disponible'}
\`\`\`

## 2. Plan WBS Actual (${docData?.file_path || 'docs/planning/current_plan.md'})
\`\`\`markdown
${markdownContent}
\`\`\`

## 3. Instrucciones de Salida
1. Devuelve ÚNICAMENTE el bloque Markdown completo del plan actualizado.
2. Mantén las épicas y tareas previas y añade nuevas fases/tareas según sea necesario.
3. Utiliza la sintaxis estándar:
   - \`# <Título>\`
   - \`## 🎯 Épica <N>: <Nombre>\`
   - \`### 🏃 Sprint <N> (<Objetivo>)\`
   - \`- [ ] **<Título de Tarea>** [Priority: High|Medium|Low] [Type: Feature|Refactor|Technical Debt|Security] [Hours: <N>h] [Branch: feat/...]\`
   - \`  - [ ] <Subtarea técnica>\`
`;

      await navigator.clipboard.writeText(megaPrompt);
      toast.success('Mega-Prompt copiado al portapapeles con topología y plan actual');
    } catch (err) {
      toast.error('Error al copiar el prompt: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsCopyingPrompt(false);
    }
  };

  const handleInjectExternalPlan = async () => {
    if (!externalPlanText.trim()) {
      toast.error('Por favor pega el contenido Markdown del plan');
      return;
    }

    // Clean up code fences if present
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
        const updated = await savePlanningDocument(
          activeProjectId,
          cleanMd,
          'Inyección de plan desde LLM externo'
        );
        setDocData(updated);
        setSavedMarkdown(updated.markdown_content);
        toast.success('Plan externo inyectado y guardado en disco correctamente');

        const history = await getPlanningHistory(activeProjectId);
        setHistoryVersions(history);
      } catch (e) {
        toast.error('Error al guardar el plan inyectado: ' + (e instanceof Error ? e.message : String(e)));
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
      toast.success(`Plan restaurado a la versión v${version.version} exitosamente`);

      const history = await getPlanningHistory(activeProjectId);
      setHistoryVersions(history);
    } catch (err) {
      toast.error('Error al restaurar versión: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsRestoring(false);
    }
  };

  const handleSmartHandoffToKanban = async () => {
    if (!activeProjectId) return;

    if (parsedTickets.length === 0) {
      toast.error('No se encontraron tareas con formato válido (- [ ] **Tarea**) para exportar');
      return;
    }

    // Filter out already synchronized tickets
    const unsyncedTickets = parsedTickets.filter((t) => {
      const norm = t.title.toLowerCase().replace(/\s+/g, ' ').trim();
      return !kanbanTaskMap.has(norm);
    });

    if (unsyncedTickets.length === 0) {
      toast.info('Todas las tareas del plan ya están sincronizadas en el Sprint Center');
      return;
    }

    setIsExporting(true);
    try {
      const res = await importWBSTickets(activeProjectId, unsyncedTickets);
      toast.success(`¡${res.imported_count} tareas nuevas importadas exitosamente al Sprint Center!`);

      // Refresh local tasks to update Magic Mirror badges
      const tasksRes = await getProjectTasks(activeProjectId);
      if (tasksRes?.tasks) {
        setKanbanTasks(tasksRes.tasks);
      }
    } catch (err) {
      toast.error('Error al exportar al Kanban: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsExporting(false);
    }
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = customPrompt || inputValue;
    if (!textToSend.trim() || isAiStreaming || !activeProjectId) return;

    const newMessages = [...messages, { role: 'user', content: textToSend }];
    setMessages(newMessages);
    if (!customPrompt) setInputValue('');
    setIsAiStreaming(true);

    let assistantReply = '';

    try {
      await sendPlanningMessage(
        {
          messages: newMessages,
          project_id: activeProjectId,
          current_markdown: markdownContent,
        },
        (deltaText) => {
          assistantReply = deltaText;
          setMessages([...newMessages, { role: 'assistant', content: assistantReply }]);

          // If AI outputs markdown document code block, live-update the editor
          const mdCodeMatch = assistantReply.match(/```markdown\n([\s\S]+?)(?:```|$)/);
          if (mdCodeMatch && mdCodeMatch[1].trim().length > 50) {
            setMarkdownContent(mdCodeMatch[1].trim());
          }
        },
        () => {
          // Tool calls handler if any
        }
      );

      // Auto-save plan if markdown code block was produced
      const finalMdMatch = assistantReply.match(/```markdown\n([\s\S]+?)(?:```|$)/);
      if (finalMdMatch && finalMdMatch[1].trim().length > 50) {
        const generatedMd = finalMdMatch[1].trim();
        setMarkdownContent(generatedMd);
        savePlanningDocument(activeProjectId, generatedMd, 'Actualización incremental por IA interna')
          .then((doc) => {
            setDocData(doc);
            setSavedMarkdown(doc.markdown_content);
            getPlanningHistory(activeProjectId).then(setHistoryVersions);
          })
          .catch((e) => console.warn('Could not auto-save AI generated plan:', e));
      }
    } catch (err) {
      toast.error('Error del asistente: ' + (err instanceof Error ? err.message : String(err)));
      setMessages([...newMessages, { role: 'assistant', content: '❌ Ocurrió un error al contactar al asistente.' }]);
    } finally {
      setIsAiStreaming(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Custom Markdown Renderers with Magic Mirror Badges
  // ─────────────────────────────────────────────────────────────

  const customMarkdownComponents = useMemo(() => {
    return {
      h1: ({ children, ...props }: any) => (
        <h1 className="text-xl font-bold text-zinc-100 pb-2 mb-4 border-b border-zinc-800 flex items-center gap-2" {...props}>
          {children}
        </h1>
      ),
      h2: ({ children, ...props }: any) => (
        <h2 className="text-lg font-semibold text-sky-400 mt-6 mb-3 flex items-center gap-2 border-b border-sky-900/30 pb-1" {...props}>
          {children}
        </h2>
      ),
      h3: ({ children, ...props }: any) => (
        <h3 className="text-base font-medium text-amber-400 mt-4 mb-2 flex items-center gap-2" {...props}>
          {children}
        </h3>
      ),
      li: ({ children, ...props }: any) => {
        // Extract raw string content for task matching
        const childArray = React.Children.toArray(children);
        let taskTitle = '';
        let isTaskItem = false;

        // Traverse children to find strong / title text
        for (const c of childArray) {
          if (React.isValidElement(c)) {
            if (c.type === 'strong' || (typeof (c.props as any)?.children === 'string' && (c.props as any)?.children?.startsWith('**'))) {
              taskTitle = String((c.props as any).children || '');
              isTaskItem = true;
              break;
            }
          }
        }

        if (!taskTitle) {
          const stringContent = childArray.map((c) => (typeof c === 'string' ? c : '')).join('');
          const match = stringContent.match(/\*\*([^*]+)\*\*/);
          if (match) {
            taskTitle = match[1];
            isTaskItem = true;
          }
        }

        const normTitle = taskTitle.toLowerCase().replace(/\s+/g, ' ').trim();
        const kanbanMatch = normTitle ? kanbanTaskMap.get(normTitle) : null;

        let statusBadge = null;
        let isDone = false;

        if (isTaskItem) {
          if (kanbanMatch) {
            if (kanbanMatch.status.includes('prog') || kanbanMatch.status === 'in_progress' || kanbanMatch.status === 'doing') {
              statusBadge = (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30 ml-2 animate-pulse">
                  <Clock className="w-3 h-3" /> ⏳ En Progreso
                </span>
              );
            } else if (kanbanMatch.status.includes('done') || kanbanMatch.status === 'completed' || kanbanMatch.status === 'resolved') {
              isDone = true;
              statusBadge = (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 ml-2">
                  <CheckCircle2 className="w-3 h-3" /> ✅ Completada
                </span>
              );
            } else {
              statusBadge = (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-500/15 text-sky-300 border border-sky-500/30 ml-2">
                  <Kanban className="w-3 h-3" /> 📌 En Kanban
                </span>
              );
            }
          } else {
            statusBadge = (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700 ml-2">
                ➕ Nueva
              </span>
            );
          }
        }

        return (
          <li
            className={`my-1 text-sm text-zinc-300 leading-relaxed transition-opacity ${
              isDone ? 'line-through opacity-70 text-zinc-400' : ''
            }`}
            {...props}
          >
            {children}
            {statusBadge}
          </li>
        );
      },
    };
  }, [kanbanTaskMap]);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0c] text-zinc-100 overflow-hidden font-sans">
      {/* ─────────────────────────────────────────────────────────────
          TOP TOOLBAR
         ───────────────────────────────────────────────────────────── */}
      <div className="h-14 border-b border-zinc-800/80 bg-[#121215] px-4 flex items-center justify-between gap-4 shrink-0 shadow-sm">
        {/* Left: Document Info & File Path */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-sky-500/10 border border-sky-500/20 rounded-lg text-sky-400 shrink-0">
            <FileCode className="w-5 h-5" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-zinc-200 truncate">
                {docData?.file_path || 'docs/planning/current_plan.md'}
              </span>
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-zinc-800/80 text-zinc-300 border-zinc-700">
                v{docData?.version || 1}
              </Badge>
              {hasUnsavedChanges ? (
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-amber-500/15 text-amber-300 border-amber-500/30 flex items-center gap-1">
                  <AlertCircle className="w-2.5 h-2.5" /> Sin guardar
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-emerald-500/15 text-emerald-300 border-emerald-500/30 flex items-center gap-1">
                  <Check className="w-2.5 h-2.5" /> Guardado en disco
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-[11px] text-zinc-400">
              <span>
                {docData?.updated_at ? `Actualizado ${formatRelativeTime(docData.updated_at)}` : 'Documento Vivo'}
              </span>
              <span>•</span>
              <span className="text-zinc-300 font-medium">{planStats.total} tareas</span>
              <span className="text-amber-400">{planStats.inProgress} en curso</span>
              <span className="text-emerald-400">{planStats.completed} listas</span>
              {planStats.unsynced > 0 && <span className="text-sky-400 font-medium">({planStats.unsynced} por sincronizar)</span>}
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Mega Prompt Button */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopyMegaPrompt}
            disabled={isCopyingPrompt || isLoadingDoc}
            className="border-zinc-700 hover:bg-zinc-800 text-zinc-300 text-xs gap-1.5"
            title="Copia el plan actual y el mapa topológico para usar en Claude, ChatGPT o Cursor"
          >
            {isCopyingPrompt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5 text-sky-400" />}
            <span>Copiar Mega-Prompt</span>
          </Button>

          {/* Inject External Plan */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowInjectModal(true)}
            className="border-zinc-700 hover:bg-zinc-800 text-zinc-300 text-xs gap-1.5"
            title="Inyecta un plan Markdown generado por un LLM externo"
          >
            <Download className="w-3.5 h-3.5 text-purple-400" />
            <span>Inyectar Plan</span>
          </Button>

          {/* Time Travel History */}
          <Button
            size="sm"
            variant={showHistoryDrawer ? 'default' : 'outline'}
            onClick={() => setShowHistoryDrawer(!showHistoryDrawer)}
            className={`text-xs gap-1.5 ${showHistoryDrawer ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'border-zinc-700 hover:bg-zinc-800 text-zinc-300'}`}
          >
            <History className="w-3.5 h-3.5 text-amber-400" />
            <span>Historial ({historyVersions.length})</span>
          </Button>

          {/* Manual Save */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleSaveDocument()}
            disabled={isSaving || !hasUnsavedChanges}
            className={`text-xs gap-1.5 border-zinc-700 text-zinc-300 ${hasUnsavedChanges ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30' : 'hover:bg-zinc-800'}`}
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 text-emerald-400" />}
            <span>Guardar</span>
          </Button>

          {/* Smart Handoff Export to Kanban */}
          <Button
            size="sm"
            onClick={handleSmartHandoffToKanban}
            disabled={isExporting || parsedTickets.length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium gap-1.5 shadow-md shadow-blue-900/30"
          >
            {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Kanban className="w-3.5 h-3.5" />}
            <span>Exportar a Sprint Center</span>
            {planStats.unsynced > 0 && (
              <span className="bg-blue-400 text-black text-[10px] font-bold px-1.5 rounded-full">
                {planStats.unsynced}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          MAIN BODY: SPLIT VIEW (CHAT + LIVE DOCUMENT / TIME TRAVEL)
         ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* LEFT PANEL: Internal AI Agile Coach Chat (35% width) */}
        <div className="w-[38%] min-w-[360px] max-w-[500px] border-r border-zinc-800 bg-[#0e0e11] flex flex-col shrink-0">
          {/* Chat Header */}
          <div className="p-3 border-b border-zinc-800/80 bg-[#141418] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-xs font-semibold text-zinc-200">Agile Coach & Lead Architect</span>
            </div>
            <span className="text-[11px] text-zinc-500">Planificación Incremental</span>
          </div>

          {/* Messages Area */}
          <ScrollArea className="flex-1 p-4" ref={chatScrollAreaRef}>
            <div className="flex flex-col gap-4 pb-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center p-6 text-center text-zinc-500 my-auto">
                  <Sparkles className="w-10 h-10 text-sky-400/40 mb-3" />
                  <h4 className="text-sm font-semibold text-zinc-300 mb-1">Planning Studio Asistente</h4>
                  <p className="text-xs text-zinc-500 max-w-[280px]">
                    Escribe tus requerimientos o pide añadir nuevas fases. El plan se modificará de forma incremental sin borrar las fases previas.
                  </p>
                </div>
              )}

              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${
                    m.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`text-xs px-2 py-0.5 rounded mb-1 font-medium ${
                      m.role === 'user' ? 'text-blue-400' : 'text-emerald-400'
                    }`}
                  >
                    {m.role === 'user' ? 'Tú' : 'Agile Coach'}
                  </div>
                  <div
                    className={`max-w-[90%] rounded-xl p-3.5 text-xs leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-900/10'
                        : 'bg-[#18181d] border border-zinc-800 text-zinc-200'
                    }`}
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {m.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Quick Suggestions Chips */}
          <div className="px-3 py-2 border-t border-zinc-800/60 bg-[#121216] flex flex-wrap gap-1.5">
            <button
              onClick={() => handleSendMessage('Añade una fase de Testing Unitario, Integración y CI/CD con estimación de horas.')}
              className="text-[11px] bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 px-2.5 py-1 rounded-md border border-zinc-700/50 transition-colors flex items-center gap-1"
            >
              <ListPlus className="w-3 h-3 text-sky-400" /> + Testing & CI/CD
            </button>
            <button
              onClick={() => handleSendMessage('Revisa el plan actual y añade nombres de ramas git sugeridas (branch_name) y prioridades a cada tarea.')}
              className="text-[11px] bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 px-2.5 py-1 rounded-md border border-zinc-700/50 transition-colors flex items-center gap-1"
            >
              <FileEdit className="w-3 h-3 text-amber-400" /> + Ramas Git & Prioridades
            </button>
          </div>

          {/* Input Area */}
          <div className="p-3 border-t border-zinc-800 bg-[#141418]">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <Input
                placeholder="Pide una nueva fase, épica o refactor..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                disabled={isAiStreaming}
                className="bg-[#1b1b22] border-zinc-700 text-xs focus-visible:ring-sky-500"
              />
              <Button
                type="submit"
                size="sm"
                disabled={isAiStreaming || !inputValue.trim()}
                className="bg-sky-600 hover:bg-sky-700 text-white shrink-0"
              >
                {isAiStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </form>
          </div>
        </div>

        {/* RIGHT PANEL: Live Document Magic Mirror OR Time Travel Diff View (65% width) */}
        <div className="flex-1 flex flex-col bg-[#0d0d10] overflow-hidden">
          {selectedVersion ? (
            /* ─────────────────────────────────────────────────────────────
               TIME TRAVEL: DIFF VIEW (Historical vs Current)
               ───────────────────────────────────────────────────────────── */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Diff Header */}
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

              {/* Monaco Diff Editor */}
              <div className="flex-1 overflow-hidden">
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
                  }}
                />
              </div>
            </div>
          ) : (
            /* ─────────────────────────────────────────────────────────────
               LIVE DOCUMENT: MAGIC MIRROR OR RAW MARKDOWN EDITOR
               ───────────────────────────────────────────────────────────── */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Document Sub-Header / View Switcher */}
              <div className="h-10 border-b border-zinc-800/80 bg-[#121216] px-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-1 bg-[#1a1a20] p-0.5 rounded-lg border border-zinc-800">
                  <button
                    onClick={() => setViewMode('magic_mirror')}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-md font-medium transition-colors ${
                      viewMode === 'magic_mirror'
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" /> Espejo Mágico (En Vivo)
                  </button>
                  <button
                    onClick={() => setViewMode('raw_editor')}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-md font-medium transition-colors ${
                      viewMode === 'raw_editor'
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Code2 className="w-3.5 h-3.5" /> Editor Markdown
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span>Sincronizado con Sprint Center</span>
                  <button
                    onClick={async () => {
                      if (!activeProjectId) return;
                      const res = await getProjectTasks(activeProjectId);
                      if (res?.tasks) {
                        setKanbanTasks(res.tasks);
                        toast.success('Estado de tareas refrescado');
                      }
                    }}
                    className="hover:text-zinc-200 p-1 rounded hover:bg-zinc-800 transition-colors"
                    title="Refrescar estado de tareas desde Kanban"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* View Content */}
              {viewMode === 'magic_mirror' ? (
                <ScrollArea className="flex-1 p-8 bg-[#0b0b0e]">
                  {isLoadingDoc ? (
                    <div className="flex items-center justify-center p-12 text-zinc-500">
                      <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando documento vivo...
                    </div>
                  ) : (
                    <div className="max-w-4xl mx-auto prose prose-invert prose-zinc max-w-none">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={customMarkdownComponents}
                      >
                        {markdownContent || '# Plan no inicializado'}
                      </ReactMarkdown>
                    </div>
                  )}
                </ScrollArea>
              ) : (
                <div className="flex-1 overflow-hidden">
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
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─────────────────────────────────────────────────────────────
            TIME TRAVEL DRAWER (HISTORY SIDEBAR)
           ───────────────────────────────────────────────────────────── */}
        {showHistoryDrawer && (
          <div className="w-80 border-l border-zinc-800 bg-[#121216] flex flex-col shrink-0 shadow-2xl z-20">
            <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-[#17171d]">
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

            <ScrollArea className="flex-1 p-3">
              <div className="flex flex-col gap-2">
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
                        onClick={() => setSelectedVersion(v)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-amber-500/10 border-amber-500/40 shadow-sm'
                            : 'bg-[#18181f] border-zinc-800/80 hover:border-zinc-700 hover:bg-[#1f1f27]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-zinc-800 text-amber-400 border-zinc-700 font-mono">
                            v{v.version}
                          </Badge>
                          <span className="text-[10px] text-zinc-400">
                            {formatRelativeTime(v.created_at)}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-200 font-medium line-clamp-2 mb-1.5">
                          {v.change_summary || 'Plan actualizado'}
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-zinc-500">
                          <span>{formatAbsoluteLocalTime(v.created_at)}</span>
                          <span className="text-sky-400 hover:underline flex items-center gap-0.5">
                            Comparar <ArrowRight className="w-2.5 h-2.5" />
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
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
