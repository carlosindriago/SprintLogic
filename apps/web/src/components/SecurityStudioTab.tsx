'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  Play,
  Loader2,
  RefreshCw,
  Copy,
  Check,
  Send,
  Scale,
  Sparkles,
  FileCode,
  Lock,
  Search,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useProjectStore } from '@/store/projectStore';
import { useTabsStore } from '@/store/tabsStore';
import { usePlanningStore } from '@/store/planningStore';
import {
  scanSecurity,
  evaluateSecurityFinding,
  getFileContent,
} from '@/lib/api';
import {
  SecurityFinding,
  SecuritySeverity,
  FindingEvaluationResponse,
} from '@/types';
import { cn } from '@/lib/utils';

// Monaco DiffEditor dynamically loaded to prevent SSR/canvas issues
const DiffEditor = dynamic(
  () => import('@monaco-editor/react').then((m) => m.DiffEditor),
  { ssr: false }
);

export default function SecurityStudioTab() {
  const currentProjectId = useProjectStore((state) => state.projectId);
  const setActiveTab = useTabsStore((state) => state.setActiveTab);
  const setProjectState = usePlanningStore((state) => state.setProjectState);

  const [scanning, setScanning] = useState(false);
  const [findings, setFindings] = useState<SecurityFinding[]>([]);
  const [selectedFinding, setSelectedFinding] = useState<SecurityFinding | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // AI Judge evaluations cache: finding_id -> FindingEvaluationResponse
  const [evaluations, setEvaluations] = useState<Record<string, FindingEvaluationResponse>>({});
  const [evaluating, setEvaluating] = useState(false);
  const [copied, setCopied] = useState(false);

  // File content for Monaco Diff
  const [originalCode, setOriginalCode] = useState<string>('');
  const [loadingCode, setLoadingCode] = useState(false);

  const handleScan = useCallback(async () => {
    if (!currentProjectId) return;
    setScanning(true);
    try {
      const res = await scanSecurity(currentProjectId);
      setFindings(res.findings);
      if (res.findings.length > 0) {
        setSelectedFinding(res.findings[0]);
      } else {
        setSelectedFinding(null);
      }
      toast.success(`Escaneo completado: ${res.findings.length} hallazgos detectados`);
    } catch (err) {
      console.error('Error scanning project security:', err);
      toast.error((err as Error)?.message || 'Error al ejecutar escaneo SAST');
    } finally {
      setScanning(false);
    }
  }, [currentProjectId]);

  // Initial scan if empty
  useEffect(() => {
    if (currentProjectId && findings.length === 0 && !scanning) {
      handleScan();
    }
  }, [currentProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load file content whenever selected finding changes
  useEffect(() => {
    if (!currentProjectId || !selectedFinding) {
      setOriginalCode('');
      return;
    }
    let isMounted = true;
    const fetchCode = async () => {
      setLoadingCode(true);
      try {
        const data = await getFileContent(currentProjectId, selectedFinding.file_path);
        if (isMounted) {
          setOriginalCode(data.content || selectedFinding.snippet);
        }
      } catch {
        if (isMounted) {
          setOriginalCode(selectedFinding.snippet);
        }
      } finally {
        if (isMounted) setLoadingCode(false);
      }
    };
    fetchCode();
    return () => {
      isMounted = false;
    };
  }, [currentProjectId, selectedFinding]);

  // Trigger AI Judge Evaluation
  const handleEvaluateFinding = async (finding: SecurityFinding) => {
    if (!currentProjectId) return;
    setEvaluating(true);
    try {
      const evalRes = await evaluateSecurityFinding(currentProjectId, {
        finding_id: finding.id,
        tool: finding.tool,
        rule_id: finding.rule_id,
        file_path: finding.file_path,
        line_number: finding.line_number,
        severity: finding.severity,
        cwe: finding.cwe,
        finding_description: finding.description,
        source_code: originalCode || finding.snippet,
      });

      setEvaluations((prev) => ({ ...prev, [finding.id]: evalRes }));
      toast.success(
        evalRes.is_real_threat
          ? '🚨 Tribunal IA: Confirmada como amenaza real'
          : '🛡️ Tribunal IA: Descartado como falso positivo'
      );
    } catch (err) {
      console.error('Error evaluating finding:', err);
      toast.error((err as Error)?.message || 'Error al evaluar hallazgo con Juez IA');
    } finally {
      setEvaluating(false);
    }
  };

  const handleCopyPatch = () => {
    if (!selectedFinding) return;
    const evaluation = evaluations[selectedFinding.id];
    const patch = evaluation?.mitigation_diff || selectedFinding.mitigation_hint || '';
    if (!patch) return;
    navigator.clipboard.writeText(patch);
    setCopied(true);
    toast.success('Parche de mitigación copiado al portapapeles');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleHandoffToPlanning = () => {
    if (!currentProjectId || !selectedFinding) return;
    const evaluation = evaluations[selectedFinding.id];
    const message = `## Tarea de Seguridad: Mitigar ${selectedFinding.title} (${selectedFinding.severity.toUpperCase()})\n\n` +
      `- **Archivo**: \`${selectedFinding.file_path}:${selectedFinding.line_number}\`\n` +
      `- **Regla SAST**: \`${selectedFinding.rule_id}\` (${selectedFinding.cwe || 'N/A'})\n` +
      `- **Veredicto Juez IA**: ${evaluation ? (evaluation.is_real_threat ? '🚨 Amenaza Real' : '🛡️ Falso Positivo') : 'Pendiente'}\n` +
      (evaluation ? `- **Explicación**: ${evaluation.explanation}\n\n### Parche Propuesto:\n\`\`\`diff\n${evaluation.mitigation_diff}\n\`\`\`\n` : '');

    setProjectState(currentProjectId, {
      messages: [{ role: 'user', content: message }],
    });
    setActiveTab('planning');
    toast.success('Hallazgo transferido al Planning Studio');
  };

  const counts = {
    critical: findings.filter((f) => f.severity === 'critical').length,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
    low: findings.filter((f) => f.severity === 'low').length,
    total: findings.length,
  };

  const filteredFindings = findings.filter((f) => {
    const matchesSeverity = severityFilter === 'all' || f.severity === severityFilter;
    const matchesSearch =
      searchQuery === '' ||
      f.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.file_path.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.rule_id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSeverity && matchesSearch;
  });

  const currentEval = selectedFinding ? evaluations[selectedFinding.id] : null;

  if (!currentProjectId) {
    return (
      <div className="flex-1 flex flex-col h-full bg-[#0A0A0A] text-zinc-200 items-center justify-center">
        <ShieldAlert className="w-12 h-12 text-zinc-600 mb-3" />
        <p className="text-zinc-500 font-medium">No hay ningún proyecto seleccionado.</p>
      </div>
    );
  }

  const getSeverityBadge = (severity: SecuritySeverity) => {
    switch (severity) {
      case 'critical':
        return <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-red-950/80 border border-red-800/80 text-red-300">Crítico</span>;
      case 'high':
        return <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-orange-950/80 border border-orange-800/80 text-orange-300">Alto</span>;
      case 'medium':
        return <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-amber-950/80 border border-amber-800/80 text-amber-300">Medio</span>;
      case 'low':
        return <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-blue-950/80 border border-blue-800/80 text-blue-300">Bajo</span>;
    }
  };

  const getLanguage = (filePath: string) => {
    const ext = filePath.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts': case 'tsx': return 'typescript';
      case 'js': case 'jsx': return 'javascript';
      case 'py': return 'python';
      case 'php': return 'php';
      case 'go': return 'go';
      case 'java': return 'java';
      case 'json': return 'json';
      default: return 'plaintext';
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0A0A] text-zinc-200 overflow-hidden font-sans">
      {/* Top Studio Header */}
      <header className="h-14 border-b border-zinc-800/80 px-4 flex items-center justify-between bg-[#0e0e0e]/90 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center">
            <ShieldAlert className="w-4 h-4 text-red-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-zinc-100 tracking-tight">Security Studio</h1>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/50">
                SAST + Tribunal IA
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Prevención de pérdida de datos, detección de secretos y evaluación probabilística de vulnerabilidades.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-red-600/90 hover:bg-red-600 text-white font-medium text-xs shadow-lg shadow-red-950/40 transition-all disabled:opacity-50"
          >
            {scanning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Analizando SAST...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Ejecutar Escaneo SAST</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Split View Content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Panel: Triage & SAST List */}
        <div className="w-[420px] border-r border-zinc-800/80 flex flex-col bg-[#0d0d0d] shrink-0">
          {/* Counters Banner */}
          <div className="p-3 border-b border-zinc-800/80 bg-[#121212] grid grid-cols-4 gap-2">
            <button
              onClick={() => setSeverityFilter('critical')}
              className={cn(
                "flex flex-col items-center justify-center p-2 rounded-md border transition-colors",
                severityFilter === 'critical'
                  ? "bg-red-950/40 border-red-700/80"
                  : "bg-zinc-900/50 border-zinc-800/80 hover:border-zinc-700"
              )}
            >
              <span className="text-xs font-bold text-red-400">{counts.critical}</span>
              <span className="text-[10px] text-zinc-400">Crítico</span>
            </button>
            <button
              onClick={() => setSeverityFilter('high')}
              className={cn(
                "flex flex-col items-center justify-center p-2 rounded-md border transition-colors",
                severityFilter === 'high'
                  ? "bg-orange-950/40 border-orange-700/80"
                  : "bg-zinc-900/50 border-zinc-800/80 hover:border-zinc-700"
              )}
            >
              <span className="text-xs font-bold text-orange-400">{counts.high}</span>
              <span className="text-[10px] text-zinc-400">Alto</span>
            </button>
            <button
              onClick={() => setSeverityFilter('medium')}
              className={cn(
                "flex flex-col items-center justify-center p-2 rounded-md border transition-colors",
                severityFilter === 'medium'
                  ? "bg-amber-950/40 border-amber-700/80"
                  : "bg-zinc-900/50 border-zinc-800/80 hover:border-zinc-700"
              )}
            >
              <span className="text-xs font-bold text-amber-400">{counts.medium}</span>
              <span className="text-[10px] text-zinc-400">Medio</span>
            </button>
            <button
              onClick={() => setSeverityFilter('all')}
              className={cn(
                "flex flex-col items-center justify-center p-2 rounded-md border transition-colors",
                severityFilter === 'all'
                  ? "bg-blue-950/40 border-blue-700/80"
                  : "bg-zinc-900/50 border-zinc-800/80 hover:border-zinc-700"
              )}
            >
              <span className="text-xs font-bold text-blue-400">{counts.total}</span>
              <span className="text-[10px] text-zinc-400">Todos</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="p-2.5 border-b border-zinc-800/80">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Filtrar por regla, archivo o título..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-md bg-zinc-900/80 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-red-500/50"
              />
            </div>
          </div>

          {/* Findings List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {filteredFindings.length === 0 ? (
              <div className="py-12 text-center text-zinc-500 text-xs">
                {scanning ? 'Escaneando archivos...' : 'No se encontraron vulnerabilidades para el filtro seleccionado.'}
              </div>
            ) : (
              filteredFindings.map((finding) => {
                const isSelected = selectedFinding?.id === finding.id;
                const evalItem = evaluations[finding.id];
                return (
                  <button
                    key={finding.id}
                    onClick={() => setSelectedFinding(finding)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg border transition-all relative overflow-hidden group",
                      isSelected
                        ? "bg-zinc-800/90 border-red-500/60 shadow-md shadow-black/40 ring-1 ring-red-500/30"
                        : "bg-zinc-900/40 border-zinc-800/70 hover:bg-zinc-800/50 hover:border-zinc-700"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5">
                        {getSeverityBadge(finding.severity)}
                        <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                          {finding.tool}
                        </span>
                      </div>
                      {evalItem && (
                        <span
                          className={cn(
                            "px-1.5 py-0.5 text-[9px] font-semibold rounded flex items-center gap-1",
                            evalItem.is_real_threat
                              ? "bg-red-500/20 text-red-300 border border-red-500/30"
                              : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          )}
                        >
                          {evalItem.is_real_threat ? <AlertTriangle className="w-2.5 h-2.5" /> : <ShieldCheck className="w-2.5 h-2.5" />}
                          {evalItem.is_real_threat ? 'Amenaza Real' : 'Falso Positivo'}
                        </span>
                      )}
                    </div>

                    <h3 className="text-xs font-medium text-zinc-100 line-clamp-1 mb-1 group-hover:text-red-300 transition-colors">
                      {finding.title}
                    </h3>

                    <p className="text-[11px] text-zinc-400 font-mono line-clamp-1">
                      {finding.file_path}:{finding.line_number}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel: El Tribunal IA & Diff Viewer */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0A0A0A] overflow-y-auto">
          {selectedFinding ? (
            <div className="flex-1 flex flex-col p-5 space-y-4">
              {/* Finding Header */}
              <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {getSeverityBadge(selectedFinding.severity)}
                    <span className="text-xs font-mono text-zinc-400">
                      {selectedFinding.rule_id} {selectedFinding.cwe ? `• ${selectedFinding.cwe}` : ''}
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-zinc-100">{selectedFinding.title}</h2>
                  <p className="text-xs text-zinc-400">{selectedFinding.description}</p>
                  <p className="text-xs font-mono text-zinc-400 pt-1">
                    Ubicación: <span className="text-zinc-200">{selectedFinding.file_path}:{selectedFinding.line_number}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleEvaluateFinding(selectedFinding)}
                    disabled={evaluating}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-colors shadow-lg shadow-indigo-950/30 disabled:opacity-50"
                  >
                    {evaluating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Evaluando con Juez...</span>
                      </>
                    ) : (
                      <>
                        <Scale className="w-3.5 h-3.5" />
                        <span>{currentEval ? 'Re-evaluar Tribunal IA' : 'Evaluar con Tribunal IA'}</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleHandoffToPlanning}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-xs border border-zinc-700 transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Planning / Kanban</span>
                  </button>
                </div>
              </div>

              {/* El Tribunal IA - Probabilistic Judge Verdict */}
              {currentEval ? (
                <div
                  className={cn(
                    "p-4 rounded-xl border transition-all",
                    currentEval.is_real_threat
                      ? "bg-red-950/20 border-red-800/60"
                      : "bg-emerald-950/20 border-emerald-800/60"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "w-7 h-7 rounded-lg flex items-center justify-center",
                          currentEval.is_real_threat ? "bg-red-500/20 text-red-400" : "bg-emerald-500/20 text-emerald-400"
                        )}
                      >
                        <Scale className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                          Veredicto del Juez Probabilístico (IA)
                        </h3>
                        <p className="text-[11px] text-zinc-400">Modelo: {currentEval.model_used}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-[10px] uppercase tracking-wider text-zinc-400 block">Confianza</span>
                        <span className="text-sm font-bold text-zinc-100">{currentEval.confidence_score}%</span>
                      </div>
                      <div className="w-16 h-2 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            currentEval.is_real_threat ? "bg-red-500" : "bg-emerald-500"
                          )}
                          style={{ width: `${currentEval.confidence_score}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 p-3 rounded-lg bg-black/40 border border-zinc-800/60">
                    <div className="flex items-center gap-2 mb-1.5">
                      {currentEval.is_real_threat ? (
                        <div className="flex items-center gap-1 text-red-400 text-xs font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>AMENAZA CONFIRMADA (Requiere Parche)</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-emerald-400 text-xs font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>FALSO POSITIVO DESCARTADO (Regla SAST Inadecuada)</span>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed">{currentEval.explanation}</p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-zinc-900/30 border border-dashed border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-zinc-400 text-xs">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    <span>Este hallazgo aún no ha sido evaluado por el Tribunal IA.</span>
                  </div>
                  <button
                    onClick={() => handleEvaluateFinding(selectedFinding)}
                    disabled={evaluating}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-medium underline"
                  >
                    Evaluar ahora
                  </button>
                </div>
              )}

              {/* Parche de Mitigación / Diff Viewer */}
              <div className="flex-1 flex flex-col min-h-[350px] rounded-xl bg-zinc-900/60 border border-zinc-800/80 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-zinc-800/80 bg-[#121212] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-zinc-400" />
                    <span className="text-xs font-semibold text-zinc-200">
                      Parche de Mitigación Propuesto (Diff)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyPatch}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs transition-colors"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copied ? 'Copiado' : 'Copiar Parche'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex-1 relative min-h-[280px]">
                  {loadingCode ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#1e1e1e]/60 z-10">
                      <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                    </div>
                  ) : null}

                  <DiffEditor
                    height="100%"
                    language={getLanguage(selectedFinding.file_path)}
                    original={originalCode || selectedFinding.snippet}
                    modified={
                      currentEval?.mitigation_diff
                        ? currentEval.mitigation_diff
                        : selectedFinding.mitigation_hint
                        ? `# Mitigación sugerida:\n# ${selectedFinding.mitigation_hint}\n\n${originalCode || selectedFinding.snippet}`
                        : originalCode || selectedFinding.snippet
                    }
                    theme="vs-dark"
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      renderSideBySide: true,
                      scrollBeyondLastLine: false,
                      fontSize: 13,
                      lineNumbers: 'on',
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 p-8">
              <ShieldCheck className="w-12 h-12 text-zinc-700 mb-3" />
              <p className="text-sm font-medium">Selecciona una vulnerabilidad del panel izquierdo para examinarla.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
