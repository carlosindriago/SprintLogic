'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Scale,
  ShieldAlert,
  FileText,
  Save,
  Rocket,
  Send,
  Loader2,
  RefreshCw,
  Copy,
  Check,
  Code,
  Eye,
  Plus,
  FolderOpen,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { useProjectStore } from '@/store/projectStore';
import { useTabsStore } from '@/store/tabsStore';
import {
  auditLegalCompliance,
  saveLegalDoc,
  getLegalDocs,
  createLegalMitigationTasks,
  LegalDocItem,
} from '@/lib/api';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  modelUsed?: string;
}

const DEFAULT_DOC_PRESETS = [
  { id: 'privacy_policy.md', label: 'Privacy Policy (GDPR / CCPA / Latam)', icon: ShieldAlert },
  { id: 'terms_of_service.md', label: 'Términos de Servicio (ToS)', icon: FileText },
  { id: 'cookie_policy.md', label: 'Política de Cookies', icon: FileCode },
  { id: 'refund_policy.md', label: 'Política de Reembolsos (E-commerce)', icon: Scale },
  { id: 'dpa.md', label: 'DPA (Data Processing Agreement B2B)', icon: Scale },
  { id: 'acceptable_use_policy.md', label: 'Política de Uso Aceptable (AUP)', icon: ShieldAlert },
];

export default function LegalStudioTab() {
  const currentProjectId = useProjectStore((state) => state.projectId);
  const setActiveTab = useTabsStore((state) => state.setActiveTab);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isAuditing, setIsAuditing] = useState(false);
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [detectedDependencies, setDetectedDependencies] = useState<string[]>([]);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Workspace Docs-as-Code State
  const [activeDocName, setActiveDocName] = useState<string>('privacy_policy.md');
  const [docContent, setDocContent] = useState<string>('');
  const [isEditorMode, setIsEditorMode] = useState(false);
  const [isSavingDoc, setIsSavingDoc] = useState(false);
  const [savedDocs, setSavedDocs] = useState<LegalDocItem[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  // Mitigation Handoff Modal / State
  const [isCreatingMitigation, setIsCreatingMitigation] = useState(false);

  // Load existing legal docs from disk
  const loadSavedDocs = useCallback(async () => {
    if (!currentProjectId) return;
    setIsLoadingDocs(true);
    try {
      const res = await getLegalDocs(currentProjectId);
      setSavedDocs(res.documents);
      // If active doc exists on disk and content is empty, load it
      const match = res.documents.find((d) => d.name === activeDocName);
      if (match && !docContent) {
        setDocContent(match.content);
      }
    } catch (err) {
      console.debug('No legal docs found or error loading:', err);
    } finally {
      setIsLoadingDocs(false);
    }
  }, [currentProjectId, activeDocName, docContent]);

  useEffect(() => {
    loadSavedDocs();
  }, [loadSavedDocs]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAuditing]);

  // Execute compliance audit or follow-up question
  const handleSendAudit = async (customPrompt?: string, targetDocOverride?: string) => {
    if (!currentProjectId) {
      toast.error('No hay ningún proyecto activo seleccionado');
      return;
    }

    const query = customPrompt || inputPrompt;
    if (!query.trim()) return;

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputPrompt('');
    setIsAuditing(true);

    try {
      const historyPayload = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await auditLegalCompliance(currentProjectId, {
        user_query: query,
        conversation_history: historyPayload,
        target_doc: targetDocOverride || activeDocName,
      });

      const assistantMsg: ChatMessage = {
        id: String(Date.now() + 1),
        role: 'assistant',
        content: res.response,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelUsed: res.model_used,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setModelUsed(res.model_used);
      if (res.detected_dependencies?.length) {
        setDetectedDependencies(res.detected_dependencies);
      }

      // Auto-detect and extract generated markdown block into workspace if it matches a document
      const markdownCodeMatch = res.response.match(/```(?:markdown)?\s*([\s\S]*?)```/);
      if (markdownCodeMatch && markdownCodeMatch[1].trim().length > 100) {
        const extracted = markdownCodeMatch[1].trim();
        setDocContent(extracted);
        toast.info('📄 Documento legal extraído automáticamente al Workspace', {
          description: 'Puedes revisarlo, editarlo o guardarlo en docs/legal/',
        });
      }
    } catch (err) {
      console.error('Audit failed:', err);
      toast.error('Error al ejecutar la auditoría legal', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsAuditing(false);
    }
  };

  // Save current markdown doc to docs/legal/ on disk
  const handleSaveDocToDisk = async () => {
    if (!currentProjectId) return;
    if (!docContent.trim()) {
      toast.error('El documento está vacío. Genera o redacta contenido antes de guardar.');
      return;
    }

    setIsSavingDoc(true);
    try {
      const res = await saveLegalDoc(currentProjectId, {
        doc_name: activeDocName,
        content: docContent,
      });

      toast.success(`✅ Guardado físicamente en ${res.file_path}`, {
        description: `${res.saved_bytes} bytes escritos en disco (Docs-as-Code).`,
      });
      loadSavedDocs();
    } catch (err) {
      console.error('Error saving doc to disk:', err);
      toast.error('No se pudo guardar el documento en disco', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSavingDoc(false);
    }
  };

  // Create mitigation tasks in Kanban
  const handleCreateMitigationTasks = async () => {
    if (!currentProjectId) return;
    setIsCreatingMitigation(true);

    try {
      // Heuristic extraction or standard mitigation tasks from legal audit
      const tasksToCreate = [
        {
          title: `Implementar Banner de Consentimiento de Cookies (${activeDocName})`,
          description: `Garantizar conformidad con GDPR/ePrivacy bloqueando cookies de terceros antes del consentimiento expreso.`,
          priority: 'high',
          category: 'cookies',
        },
        {
          title: `Publicar y Vincular ${activeDocName} en Footer y Flujo de Registro`,
          description: `Vincular los términos y políticas actualizadas en los formularios de autenticación y pie de página de la aplicación.`,
          priority: 'medium',
          category: 'legal',
        },
        {
          title: `Implementar Flujo de Eliminación de Datos / Derecho al Olvido (GDPR Art. 17)`,
          description: `Crear endpoint y acción de usuario para solicitar la baja y supresión definitiva de datos personales.`,
          priority: 'high',
          category: 'gdpr',
        },
      ];

      const res = await createLegalMitigationTasks(currentProjectId, {
        tasks: tasksToCreate,
      });

      toast.success(`🚀 ${res.created_count} tareas de mitigación creadas en Sprint Center`, {
        description: 'Se agregaron al Backlog con la etiqueta "compliance".',
      });
    } catch (err) {
      console.error('Error creating mitigation tasks:', err);
      toast.error('Error al crear tareas de mitigación');
    } finally {
      setIsCreatingMitigation(false);
    }
  };

  const handleCopyMarkdown = () => {
    if (!docContent) return;
    navigator.clipboard.writeText(docContent);
    setCopiedText(true);
    toast.success('Contenido Markdown copiado al portapapeles');
    setTimeout(() => setCopiedText(false), 2000);
  };

  const handleSelectSavedDoc = (doc: LegalDocItem) => {
    setActiveDocName(doc.name);
    setDocContent(doc.content);
    toast.info(`Cargado ${doc.name} desde docs/legal/`);
  };

  if (!currentProjectId) {
    return (
      <div className="flex-1 flex flex-col h-full bg-[#0A0A0A] text-zinc-200 items-center justify-center">
        <Scale className="w-12 h-12 text-zinc-600 mb-3" />
        <p className="text-zinc-500 font-medium">No hay ningún proyecto activo seleccionado.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0A0A] text-zinc-200 overflow-hidden font-sans">
      {/* Top Legal Studio Header */}
      <header className="h-14 border-b border-zinc-800/80 px-4 flex items-center justify-between bg-[#0e0e0e]/90 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-zinc-100">Legal Studio</h2>
              <span className="px-2 py-0.5 text-[10px] font-medium bg-purple-500/10 text-purple-300 border border-purple-500/20 rounded-full">
                Docs-as-Code Compliance
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Auditoría de cumplimiento normativo (GDPR, CCPA, TOS) y redactor persistente
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {modelUsed && (
            <span className="text-[11px] px-2.5 py-1 rounded-md bg-zinc-800/80 text-zinc-300 border border-zinc-700/60 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-purple-400" />
              {modelUsed}
            </span>
          )}
          {detectedDependencies.length > 0 && (
            <span className="text-[11px] px-2.5 py-1 rounded-md bg-emerald-950/40 text-emerald-300 border border-emerald-800/50 flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3" />
              {detectedDependencies.length} Manifiestos detectados
            </span>
          )}
        </div>
      </header>

      {/* Mandatory Disclaimer Alert */}
      <div className="bg-amber-950/30 border-b border-amber-800/40 px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-xs text-amber-200/90">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>⚠️ Aviso Legal Importante:</strong> SprintLogic Legal Studio proporciona auditoría técnica y borradores preliminares. <strong>NO constituye asesoramiento legal formal.</strong>
          </span>
        </div>
        <button
          onClick={() => setActiveTab('kanban')}
          className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 underline underline-offset-2 transition-colors ml-4 shrink-0"
        >
          Ver Sprint Center <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Split View Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* ========================================================================= */}
        {/* LEFT PANEL: AUDITORÍA & CHAT INTERACTIVO                                 */}
        {/* ========================================================================= */}
        <section className="w-1/2 flex flex-col border-r border-zinc-800/80 bg-[#0d0d0d]">
          {/* Quick Actions Bar */}
          <div className="p-3 border-b border-zinc-800/60 bg-[#121212]/70 flex items-center gap-2 overflow-x-auto shrink-0">
            <button
              onClick={() => handleSendAudit('Realiza la auditoría integral de cumplimiento (Descubrimiento y Matriz de Riesgo) analizando las dependencias y arquitectura.')}
              disabled={isAuditing}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-medium rounded-md shadow-sm flex items-center gap-1.5 shrink-0 transition-colors"
            >
              {isAuditing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              ⚡ Auditoría
            </button>
            <button
              onClick={() => {
                setActiveDocName('privacy_policy.md');
                handleSendAudit('Mi empresa opera en varios países de Hispanoamérica. Analiza mi código y genera políticas que cumplan con la Ley 29733, Ley 21.719, Ley 1581 y Ley 25.326.', 'privacy_policy.md');
              }}
              disabled={isAuditing}
              className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-md border border-zinc-700/60 shrink-0 transition-colors flex items-center gap-1"
            >
              🌎 Latam (AR/CL/CO/PE/VE)
            </button>
            <button
              onClick={() => {
                setActiveDocName('privacy_policy.md');
                handleSendAudit('Mi empresa tiene usuarios en Brasil. Genera los documentos legales estrictamente bajo la LGPD (Ley 13.709).', 'privacy_policy.md');
              }}
              disabled={isAuditing}
              className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-md border border-zinc-700/60 shrink-0 transition-colors flex items-center gap-1"
            >
              🇧🇷 Brasil (LGPD)
            </button>
            <button
              onClick={() => {
                setActiveDocName('privacy_policy.md');
                handleSendAudit('Mi plataforma opera en la Unión Europea. Analiza el código y genera la Política de Privacidad (GDPR) y Política de Cookies requeridas.', 'privacy_policy.md');
              }}
              disabled={isAuditing}
              className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-md border border-zinc-700/60 shrink-0 transition-colors flex items-center gap-1"
            >
              🇪🇺 GDPR (Europa)
            </button>
            <button
              onClick={() => {
                setActiveDocName('dpa.md');
                handleSendAudit('Genera un borrador de DPA y Términos de Servicio B2B para mis clientes corporativos.', 'dpa.md');
              }}
              disabled={isAuditing}
              className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-md border border-zinc-700/60 shrink-0 transition-colors flex items-center gap-1"
            >
              🏢 SaaS B2B Enterprise
            </button>
            <button
              onClick={() => {
                setActiveDocName('refund_policy.md');
                handleSendAudit('Detecta los procesadores de pago en el código y genera la Política de Reembolsos y Términos de Compra.', 'refund_policy.md');
              }}
              disabled={isAuditing}
              className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-md border border-zinc-700/60 shrink-0 transition-colors flex items-center gap-1"
            >
              🛍️ E-commerce & Pagos
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12">
                <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-4">
                  <Scale className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-semibold text-zinc-200 mb-1">
                  Auditoría Legal Continental & Docs-as-Code
                </h3>
                <p className="text-xs text-zinc-400 max-w-md leading-relaxed mb-6">
                  Selecciona un diagnóstico guiado por jurisdicción o solicita a la IA la redacción y auditoría de los documentos legales de tu repositorio.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-lg text-left">
                  <div
                    onClick={() => {
                      setActiveDocName('privacy_policy.md');
                      handleSendAudit('Mi empresa opera en varios países de Hispanoamérica. Analiza mi código y genera políticas que cumplan con la Ley 29733, Ley 21.719, Ley 1581 y Ley 25.326.', 'privacy_policy.md');
                    }}
                    className="p-3 rounded-lg bg-zinc-900/80 border border-zinc-800/80 hover:border-purple-500/40 text-xs text-zinc-300 cursor-pointer transition-all hover:bg-purple-950/10"
                  >
                    🌎 <strong>Diagnóstico Latam:</strong> AR (25.326), CL (21.719), CO (1581), PE (29733), VE
                  </div>
                  <div
                    onClick={() => {
                      setActiveDocName('privacy_policy.md');
                      handleSendAudit('Mi empresa tiene usuarios en Brasil. Genera los documentos legales estrictamente bajo la LGPD (Ley 13.709).', 'privacy_policy.md');
                    }}
                    className="p-3 rounded-lg bg-zinc-900/80 border border-zinc-800/80 hover:border-purple-500/40 text-xs text-zinc-300 cursor-pointer transition-all hover:bg-purple-950/10"
                  >
                    🇧🇷 <strong>Diagnóstico Brasil:</strong> LGPD (Lei 13.709), Bases & DPO
                  </div>
                  <div
                    onClick={() => {
                      setActiveDocName('privacy_policy.md');
                      handleSendAudit('Mi plataforma opera en la Unión Europea. Analiza el código y genera la Política de Privacidad (GDPR) y Política de Cookies requeridas.', 'privacy_policy.md');
                    }}
                    className="p-3 rounded-lg bg-zinc-900/80 border border-zinc-800/80 hover:border-purple-500/40 text-xs text-zinc-300 cursor-pointer transition-all hover:bg-purple-950/10"
                  >
                    🇪🇺 <strong>Diagnóstico GDPR:</strong> RGPD, Cookies & Consentimiento
                  </div>
                  <div
                    onClick={() => {
                      setActiveDocName('dpa.md');
                      handleSendAudit('Genera un borrador de DPA y Términos de Servicio B2B para mis clientes corporativos.', 'dpa.md');
                    }}
                    className="p-3 rounded-lg bg-zinc-900/80 border border-zinc-800/80 hover:border-purple-500/40 text-xs text-zinc-300 cursor-pointer transition-all hover:bg-purple-950/10"
                  >
                    🏢 <strong>SaaS B2B Enterprise:</strong> DPA Art. 28 & SLAs
                  </div>
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    'flex flex-col rounded-xl p-3.5 text-xs leading-relaxed max-w-[92%]',
                    msg.role === 'user'
                      ? 'ml-auto bg-blue-600/20 border border-blue-500/30 text-blue-100'
                      : 'mr-auto bg-zinc-900/90 border border-zinc-800 text-zinc-200'
                  )}
                >
                  <div className="flex items-center justify-between gap-4 mb-1 text-[10px] text-zinc-400 font-medium">
                    <span className="flex items-center gap-1.5">
                      {msg.role === 'user' ? '👤 Tú' : '⚖️ Legal Counsel'}
                      {msg.modelUsed && <span className="text-purple-400">({msg.modelUsed})</span>}
                    </span>
                    <span>{msg.timestamp}</span>
                  </div>

                  <div className="prose prose-invert prose-xs max-w-none break-words">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>

                  {msg.role === 'assistant' && (
                    <div className="mt-2 pt-2 border-t border-zinc-800/60 flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          const match = msg.content.match(/```(?:markdown)?\s*([\s\S]*?)```/);
                          if (match) {
                            setDocContent(match[1].trim());
                            toast.success('Texto transferido al Workspace Legal');
                          } else {
                            setDocContent(msg.content);
                            toast.success('Respuesta transferida al Workspace Legal');
                          }
                        }}
                        className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors px-2 py-0.5 rounded bg-purple-950/30 border border-purple-800/30"
                      >
                        <FileText className="w-3 h-3" />
                        Transferir al Workspace
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
            {isAuditing && (
              <div className="flex items-center gap-2 p-3 bg-zinc-900/50 rounded-lg text-xs text-zinc-400 border border-zinc-800/50 animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                <span>Analizando dependencias y redactando dictamen legal...</span>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Chat Input Bar */}
          <div className="p-3 border-t border-zinc-800/80 bg-[#121212] shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendAudit();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                placeholder="Pregunta sobre normativas, pide redactar un documento o responde a las dudas de la IA..."
                disabled={isAuditing}
                className="flex-1 bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <button
                type="submit"
                disabled={isAuditing || !inputPrompt.trim()}
                className="p-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-lg transition-colors flex items-center justify-center"
              >
                {isAuditing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* RIGHT PANEL: WORKSPACE LEGAL (DOCS-AS-CODE PERSISTENCE)                   */}
        {/* ========================================================================= */}
        <section className="w-1/2 flex flex-col bg-[#111111]">
          {/* Workspace Header Controls */}
          <div className="p-3 border-b border-zinc-800/80 bg-[#141414] flex items-center justify-between gap-2 shrink-0">
            {/* Document Selector */}
            <div className="flex items-center gap-2">
              <select
                value={activeDocName}
                onChange={(e) => {
                  setActiveDocName(e.target.value);
                  const found = savedDocs.find((d) => d.name === e.target.value);
                  if (found) setDocContent(found.content);
                }}
                className="bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 rounded px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                {DEFAULT_DOC_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.id} — {preset.label}
                  </option>
                ))}
              </select>

              {/* View / Edit Toggle */}
              <div className="flex items-center bg-zinc-900 rounded border border-zinc-800 p-0.5">
                <button
                  onClick={() => setIsEditorMode(false)}
                  className={cn(
                    'px-2 py-0.5 text-[11px] rounded transition-colors flex items-center gap-1',
                    !isEditorMode ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'
                  )}
                >
                  <Eye className="w-3 h-3" /> Vista Previa
                </button>
                <button
                  onClick={() => setIsEditorMode(true)}
                  className={cn(
                    'px-2 py-0.5 text-[11px] rounded transition-colors flex items-center gap-1',
                    isEditorMode ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'
                  )}
                >
                  <Code className="w-3 h-3" /> Editor Raw
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyMarkdown}
                title="Copiar Markdown"
                className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
              >
                {copiedText ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>

              <button
                onClick={handleCreateMitigationTasks}
                disabled={isCreatingMitigation}
                className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-medium rounded shadow-sm flex items-center gap-1.5 transition-colors"
              >
                {isCreatingMitigation ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
                🚀 Crear Tareas de Mitigación
              </button>

              <button
                onClick={handleSaveDocToDisk}
                disabled={isSavingDoc || !docContent.trim()}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-medium rounded shadow-sm flex items-center gap-1.5 transition-colors"
              >
                {isSavingDoc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                💾 Guardar en docs/legal/
              </button>
            </div>
          </div>

          {/* Document Content Area */}
          <div className="flex-1 overflow-y-auto p-4 bg-[#0d0d0d]">
            {!docContent.trim() ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-zinc-500">
                <FileText className="w-10 h-10 mb-2 opacity-30 text-zinc-400" />
                <p className="text-xs font-medium text-zinc-400">Documento no inicializado</p>
                <p className="text-[11px] text-zinc-500 max-w-xs mt-1">
                  Usa el panel de la izquierda para solicitar a la IA la redacción de <strong>{activeDocName}</strong> o escribe directamente en el editor.
                </p>
                <button
                  onClick={() => handleSendAudit(`Genera el documento completo de '${activeDocName}' adaptado al proyecto.`, activeDocName)}
                  className="mt-4 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-md border border-zinc-700/60 transition-colors flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  Redactar {activeDocName} ahora
                </button>
              </div>
            ) : isEditorMode ? (
              <textarea
                value={docContent}
                onChange={(e) => setDocContent(e.target.value)}
                className="w-full h-full bg-transparent text-xs font-mono text-zinc-200 focus:outline-none resize-none leading-relaxed"
                placeholder="Escribe o pega aquí el contenido Markdown..."
              />
            ) : (
              <div className="prose prose-invert prose-xs max-w-none leading-relaxed break-words bg-zinc-900/40 p-5 rounded-xl border border-zinc-800/80">
                <ReactMarkdown>{docContent}</ReactMarkdown>
              </div>
            )}
          </div>

          {/* Bottom Bar: Existing docs on disk */}
          <div className="h-10 border-t border-zinc-800/80 px-3 bg-[#131313] flex items-center justify-between text-xs text-zinc-400 shrink-0">
            <div className="flex items-center gap-2 overflow-x-auto">
              <FolderOpen className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span className="text-[11px] font-medium text-zinc-300 shrink-0">docs/legal/:</span>
              {savedDocs.length === 0 ? (
                <span className="text-[11px] text-zinc-500 italic">No hay archivos guardados aún</span>
              ) : (
                savedDocs.map((doc) => (
                  <button
                    key={doc.name}
                    onClick={() => handleSelectSavedDoc(doc)}
                    className={cn(
                      'px-2 py-0.5 text-[10px] rounded border transition-colors shrink-0 flex items-center gap-1',
                      activeDocName === doc.name
                        ? 'bg-purple-950/60 border-purple-500/50 text-purple-200'
                        : 'bg-zinc-800/80 border-zinc-700/60 text-zinc-400 hover:text-zinc-200'
                    )}
                  >
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                    {doc.name} ({(doc.size_bytes / 1024).toFixed(1)} KB)
                  </button>
                ))
              )}
            </div>
            <button
              onClick={loadSavedDocs}
              title="Refrescar archivos de disco"
              className="text-zinc-500 hover:text-zinc-300 p-1 transition-colors"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isLoadingDocs && 'animate-spin')} />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
