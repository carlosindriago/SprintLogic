/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { CodeCoachOverview, CodeCoachMarker } from "@/lib/api";
import { RefreshCw, ShieldAlert, FileCode2, Activity, Lightbulb, Loader2, FileText, Keyboard, Copy, Check, ChevronDown, XCircle, AlertTriangle, Info } from "lucide-react";
import { SiTypescript, SiReact, SiPython, SiNextdotjs, SiFastapi, SiTailwindcss, SiNodedotjs, SiDocker, SiPostgresql, SiHtml5, SiCss, SiGnubash } from 'react-icons/si';
import { VscCode } from 'react-icons/vsc';
import { Button } from "@/components/ui/button";
import { useState, useMemo, useEffect, useRef } from "react";

const IconMap: Record<string, any> = { SiTypescript, SiReact, SiPython, SiNextdotjs, SiFastapi, SiTailwindcss, SiNodedotjs, SiDocker, SiPostgresql, SiHtml5, SiCss, SiGnubash };

const SENSEI_QUOTES = [
  "El código se lee mucho más a menudo de lo que se escribe. Escribe para humanos.",
  "La simplicidad es prerrequisito de la fiabilidad.",
  "Siempre codifica como si el que mantendrá tu código fuera un psicópata violento que sabe dónde vives.",
  "Hay dos cosas difíciles en programación: la invalidación de caché y nombrar las cosas.",
  "Medir el progreso por líneas de código es como medir la construcción de aviones por el peso.",
  "No te preocupes si no funciona bien. Si todo estuviera bien, no tendrías trabajo.",
  "Cualquier tonto puede escribir código que un ordenador entienda. Los buenos programadores escriben código que los humanos pueden entender."
];

interface CoachSidebarProps {
  techData?: any;
  onRescan?: () => void;
  onRefreshHealth?: () => void;
  isScanningTech: boolean;
  isTechError?: boolean;
  isAnalyzingCode: boolean;
  overview: CodeCoachOverview | null;
  allMentorshipAdvice?: CodeCoachMarker[];
  activeLineNumber?: number | null;
  fileMetadata?: { lineCount: number; gitStatus: string };
  availableAdviceLines?: number[];
  isEditorDirty?: boolean;
  isConflictMode?: boolean;
}

export function CoachSidebar({
  techData,
  onRescan,
  onRefreshHealth,
  isScanningTech,
  isTechError,
  isAnalyzingCode,
  overview,
  allMentorshipAdvice,
  activeLineNumber,
  fileMetadata,
  availableAdviceLines,
  isEditorDirty,
  isConflictMode,
}: CoachSidebarProps) {
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [isCopied, setIsCopied] = useState(false);
  const mentorshipRef = useRef<HTMLDivElement>(null);
  
  const [isTechStackOpen, setIsTechStackOpen] = useState(false);
  const [isHealthOpen, setIsHealthOpen] = useState(true);

  useEffect(() => {
    if (overview) {
      let hasSecurityWarning = false;
      if (overview.is_degraded) {
        hasSecurityWarning = true;
      } else if (overview.critical_security && overview.critical_security !== "None" && overview.critical_security !== "N/A" && overview.critical_security !== "") {
        hasSecurityWarning = true;
      } else if (overview.technical_debt_and_tips) {
        hasSecurityWarning = overview.technical_debt_and_tips.some(tip => 
          tip.toLowerCase().includes('seguridad') || tip.toLowerCase().includes('vulnerabilidad')
        );
      }
      
      if (hasSecurityWarning && !isHealthOpen) {
        setIsHealthOpen(true);
      }
    }
  }, [overview, isHealthOpen]);

  useEffect(() => {
    if (allMentorshipAdvice && allMentorshipAdvice.length > 0 && !isAnalyzingCode) {
      mentorshipRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [allMentorshipAdvice, isAnalyzingCode]);
  
  const cursorAdvice = useMemo(() => {
    if (!allMentorshipAdvice || activeLineNumber === undefined || activeLineNumber === null) return null;
    return allMentorshipAdvice.find(m => m.line === activeLineNumber) || null;
  }, [allMentorshipAdvice, activeLineNumber]);

  const handleCopyOverview = async () => {
    if (!overview) return;
    
    let textToCopy = `Clean Code Score: ${overview.clean_code_score}/100\n\n`;
    textToCopy += `Análisis:\n${overview.structure}\n\n`;
    
    if (overview.critical_security && overview.critical_security !== "None" && overview.critical_security !== "N/A" && overview.critical_security !== "") {
      textToCopy += `Seguridad Crítica:\n${overview.critical_security}\n\n`;
    }
    
    if (overview.technical_debt_and_tips && overview.technical_debt_and_tips.length > 0) {
      textToCopy += `Deuda Técnica y Consejos:\n`;
      overview.technical_debt_and_tips.forEach(tip => {
        textToCopy += `- ${tip}\n`;
      });
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Error al copiar al portapapeles:", err);
    }
  };

  useEffect(() => {
    if (!isAnalyzingCode) return;
    
    const interval = setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % SENSEI_QUOTES.length);
    }, 6000);
    
    return () => clearInterval(interval);
  }, [isAnalyzingCode]);

  return (
    <div className="h-full w-full min-w-[250px] bg-[#0a0a0a] border-l border-zinc-800 flex flex-col overflow-y-auto custom-scrollbar p-3 space-y-4">
      {/* Celda 1: Ficha Técnica */}
      <div className="bg-[#121212] border border-zinc-800 rounded-lg p-4 flex flex-col shadow-sm">
        <div 
          className="flex items-center justify-between cursor-pointer" 
          onClick={() => setIsTechStackOpen(!isTechStackOpen)}
        >
          <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2 select-none">
            <FileCode2 className="w-4 h-4 text-blue-400" />
            Stack Técnico
            <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${isTechStackOpen ? 'rotate-180' : ''}`} />
          </h3>
          <Button 
            variant="ghost" 
            size="icon" 
            className="w-6 h-6 text-zinc-400 hover:text-white" 
            onClick={(e) => {
              e.stopPropagation();
              if (onRescan) onRescan();
            }}
            disabled={isScanningTech}
            title="Re-escanear tecnologías"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanningTech ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        
        {isTechStackOpen && (
          <div className="animate-in fade-in slide-in-from-top-2 mt-3">
            {fileMetadata && (
          <div className="text-xs text-zinc-400 flex items-center gap-3 mb-4">
            <span className="flex items-center gap-1.5" title="Líneas de código">
              <FileText className="w-3.5 h-3.5" />
              {fileMetadata.lineCount} líneas
            </span>
            <span className="flex items-center gap-1.5" title="Estado en Git">
              <span className={`w-2 h-2 rounded-full ${
                fileMetadata.gitStatus === 'untracked' ? 'bg-zinc-500' :
                fileMetadata.gitStatus === 'staged' ? 'bg-emerald-500' :
                fileMetadata.gitStatus === 'modified' ? 'bg-amber-500' :
                'bg-zinc-700'
              }`} />
              {fileMetadata.gitStatus === 'untracked' ? 'Sin rastrear' :
               fileMetadata.gitStatus === 'staged' ? 'Staged' :
               fileMetadata.gitStatus === 'modified' ? 'Modificado' :
               'Sincronizado'}
            </span>
          </div>
        )}

        {isScanningTech ? (
          <div>
            <div className="animate-pulse bg-zinc-700/50 rounded h-4 w-3/4 mb-2"></div>
            <div className="animate-pulse bg-zinc-700/50 rounded h-4 w-1/2 mb-2"></div>
            <div className="animate-pulse bg-zinc-700/50 rounded h-4 w-5/6 mb-2"></div>
          </div>
        ) : isTechError ? (
          <p className="text-xs text-rose-400 p-2 bg-rose-500/10 border border-rose-500/20 rounded">
            El escaneo técnico falló o caducó.
          </p>
        ) : techData?.technologies && techData.technologies.length > 0 ? (
          <div className="flex flex-wrap gap-4 mt-2">
            {techData.technologies.map((tech: any) => {
              const Icon = IconMap[tech.icon] || VscCode;
              return (
                <a 
                  key={tech.name}
                  href={`https://devdocs.io/#q=${encodeURIComponent(tech.name.toLowerCase())}`} 
                  title={tech.name}
                  className="text-3xl text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const url = e.currentTarget.href;
                    try {
                      const { open } = await import('@tauri-apps/plugin-shell');
                      await open(url);
                    } catch (err) {
                      window.open(url, '_blank');
                    }
                  }}
                >
                  <Icon />
                </a>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">No se detectaron tecnologías específicas.</p>
        )}
          </div>
        )}
      </div>

      {isConflictMode ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-[#121212] border border-rose-500/30 rounded-lg shadow-sm mb-4">
          <ShieldAlert className="w-12 h-12 text-rose-500 mb-4 opacity-80" />
          <h3 className="text-sm font-semibold text-rose-400 mb-2">Análisis Suspendido</h3>
          <p className="text-xs text-zinc-400">
            Resuelve el conflicto en el editor para reanudar la mentoría.
          </p>
        </div>
      ) : (
        <>
          {/* Celda 2: Overview */}
      <div className={`bg-[#121212] border ${overview?.is_degraded ? 'border-rose-500/50' : 'border-zinc-800'} rounded-lg p-4 flex flex-col shadow-sm mb-4`}>
        <div 
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setIsHealthOpen(!isHealthOpen)}
        >
          <h3 className={`text-sm font-semibold flex items-center gap-2 select-none ${overview?.is_degraded ? 'text-rose-400' : 'text-zinc-200'}`}>
            <Activity className={`w-4 h-4 ${overview?.is_degraded ? 'text-rose-500' : 'text-emerald-400'}`} />
            Health & Overview
            <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${isHealthOpen ? 'rotate-180' : ''}`} />
            {isAnalyzingCode && overview && <Loader2 className="w-3 h-3 animate-spin text-zinc-500 ml-auto" />}
          </h3>
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {onRefreshHealth && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onRefreshHealth}
                disabled={isAnalyzingCode}
                className="w-6 h-6 text-zinc-500 hover:text-white"
                title="Recargar análisis (Health & Overview)"
              >
                <RefreshCw className={`w-4 h-4 ${isAnalyzingCode ? 'animate-spin' : ''}`} />
              </Button>
            )}
            {overview && !overview.is_degraded && !isAnalyzingCode && (
              <Button
              variant="ghost"
              size="icon"
              className="w-6 h-6 text-zinc-400 hover:text-white"
              onClick={handleCopyOverview}
              title="Copiar análisis al portapapeles"
            >
              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
            )}
          </div>
        </div>
        {isHealthOpen && (
          <div className="animate-in fade-in slide-in-from-top-2 mt-3 flex flex-col flex-1">
            {isAnalyzingCode && !overview ? (
           <div className="flex flex-col items-center justify-center p-4 text-center border border-dashed border-zinc-800 rounded-lg bg-zinc-900/50">
             <Loader2 className="w-6 h-6 animate-spin text-amber-500 mb-2" />
             <p className="text-xs font-medium text-zinc-300">El Sensei está leyendo tu código. Ten paciencia...</p>
             <p key={quoteIndex} className="text-zinc-400 italic text-xs mt-3 animate-in fade-in duration-1000">"{SENSEI_QUOTES[quoteIndex]}"</p>
           </div>
        ) : overview ? (
          <div className={`flex flex-col gap-3 text-xs ${isAnalyzingCode ? 'opacity-60 transition-opacity' : ''}`}>
            {!overview.is_degraded && (
              <div className="flex items-center justify-between bg-[#1a1a1a] p-2 rounded border border-zinc-800/50">
                <span className="text-zinc-400">Clean Code Score</span>
                <span className={`font-bold ${overview.clean_code_score >= 80 ? 'text-emerald-400' : overview.clean_code_score >= 60 ? 'text-amber-400' : 'text-rose-400'}`}>
                  {overview.clean_code_score}/100
                </span>
              </div>
            )}
            {overview.critical_security && overview.critical_security !== "None" && overview.critical_security !== "N/A" && overview.critical_security !== "" && (
              <div className="flex flex-col gap-1 bg-rose-500/10 border border-rose-500/20 p-2 rounded">
                <span className="text-rose-400 font-semibold flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5" /> Seguridad
                </span>
                <span className="text-rose-200/80">{overview.critical_security}</span>
              </div>
            )}
            <div className={`leading-relaxed bg-[#1a1a1a] p-2 rounded border ${overview.is_degraded ? 'text-rose-300 border-rose-500/30' : 'text-zinc-300 border-zinc-800/50'}`}>
              {overview.structure}
            </div>
            {overview.technical_debt_and_tips && overview.technical_debt_and_tips.length > 0 && (
              <div className="bg-zinc-800/30 p-2.5 rounded border border-zinc-700/50 mt-1">
                <ul className="space-y-2 text-sm text-zinc-300">
                  {overview.technical_debt_and_tips.map((tip, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span className="leading-snug">{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {overview.is_degraded && (overview as any).error_detail && (
              <div className="mt-2 text-[10px] font-mono bg-black/50 p-2 rounded border border-rose-900/50 text-rose-400 break-all">
                RAW ERROR:<br/>
                {(overview as any).error_detail}
              </div>
            )}
          </div>
        ) : allMentorshipAdvice && allMentorshipAdvice.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-4 text-center border border-dashed border-zinc-800/50 rounded-lg bg-zinc-900/10">
            <Check className="w-6 h-6 text-emerald-500/50 mb-2" />
            <p className="text-sm font-medium text-zinc-400">¡Código Limpio!</p>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed max-w-[250px]">
              El Sensei no encontró antipatrones ni deudas en este archivo.
            </p>
          </div>
        ) : allMentorshipAdvice && allMentorshipAdvice.length > 0 ? (
          <div className="flex flex-col items-center justify-center p-4 text-center border border-dashed border-zinc-800/50 rounded-lg bg-zinc-900/10">
            <Lightbulb className="w-6 h-6 text-amber-500/50 mb-2" />
            <p className="text-sm font-medium text-zinc-400">Busca las líneas subrayadas</p>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed max-w-[250px]">
              Hay {allMentorshipAdvice.length} observación(es) en este archivo. Mueve el cursor hacia una línea con marcador en el editor para leer la mentoría.
            </p>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">Esperando análisis dinámico del Coach...</p>
        )}
          </div>
        )}
      </div>

      {/* Celda 3: Mentoría Contextual */}
      <div ref={mentorshipRef} className="bg-[#121212] border border-zinc-800 rounded-lg p-4 flex flex-col shadow-sm flex-1">
        <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2 mb-3">
          <Lightbulb className="w-4 h-4 text-amber-400" />
          Mentoría Contextual
          {isAnalyzingCode && cursorAdvice && <Loader2 className="w-3 h-3 animate-spin text-zinc-500 ml-auto" />}
        </h3>
        
        {allMentorshipAdvice && allMentorshipAdvice.some(m => m.is_degraded || String(m.message || '').toLowerCase().includes('fallo del proveedor ia') || String(m.message || '').toLowerCase().includes('all model attempts failed')) ? (
          <div className="flex flex-col items-center justify-center p-4 text-center border border-dashed border-rose-900/50 rounded-lg bg-rose-500/10">
            <ShieldAlert className="w-6 h-6 text-rose-500/50 mb-2" />
            <p className="text-sm font-medium text-rose-400">Error del Sensei</p>
            <p className="text-xs text-rose-300/80 mt-1 leading-relaxed max-w-[250px] break-all">
              {allMentorshipAdvice.find(m => m.is_degraded || String(m.message || '').toLowerCase().includes('fallo del proveedor ia') || String(m.message || '').toLowerCase().includes('all model attempts failed'))?.explanation || 'El Sensei no pudo analizar este bloque por un fallo de red o del proveedor de IA.'}
            </p>
          </div>
        ) : isEditorDirty ? (
          <div className="flex flex-col items-center justify-center p-4 text-center border border-dashed border-zinc-800/80 rounded-lg bg-zinc-900/30">
            <Keyboard className="w-6 h-6 text-zinc-600/50 mb-2" />
            <p className="text-sm font-medium text-zinc-400">Modo Lectura Activo.</p>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed max-w-[250px]">
              El Sensei está en reposo. El contenido ha cambiado y las líneas pueden estar desfasadas.
            </p>
          </div>
        ) : isAnalyzingCode && (!allMentorshipAdvice || allMentorshipAdvice.length === 0) ? (
           <div className="flex flex-col items-center justify-center p-4 text-center border border-dashed border-zinc-800 rounded-lg bg-zinc-900/50">
             <Loader2 className="w-6 h-6 animate-spin text-amber-500 mb-2" />
             <p className="text-xs font-medium text-zinc-300">El Sensei está leyendo tu código. Ten paciencia...</p>
             <p key={quoteIndex} className="text-zinc-400 italic text-xs mt-3 animate-in fade-in duration-1000">"{SENSEI_QUOTES[quoteIndex]}"</p>
           </div>
        ) : cursorAdvice ? (
          <div className={`flex flex-col gap-2 p-3 rounded border text-xs 
            ${cursorAdvice.severity === 'error' ? 'bg-rose-500/10 border-rose-500/30' : 
              cursorAdvice.severity === 'warning' ? 'bg-amber-500/10 border-amber-500/30' : 
              'bg-blue-500/10 border-blue-500/30'}
            ${isAnalyzingCode ? 'opacity-60 transition-opacity' : ''}`}
          >
            <span className={`font-bold flex items-center gap-1.5 ${cursorAdvice.severity === 'error' ? 'text-rose-400' : cursorAdvice.severity === 'warning' ? 'text-amber-400' : 'text-blue-400'}`}>
              {cursorAdvice.severity === 'error' ? <XCircle className="w-4 h-4" /> : cursorAdvice.severity === 'warning' ? <AlertTriangle className="w-4 h-4" /> : <Info className="w-4 h-4" />}
              Línea {cursorAdvice.line}: {cursorAdvice.title || cursorAdvice.message}
            </span>
            <span className="text-zinc-300 leading-relaxed">
              {cursorAdvice.explanation}
            </span>
            
            {cursorAdvice.snippet_before && cursorAdvice.snippet_before !== "null" && (
              <div className="mt-2">
                <span className="text-[10px] uppercase font-bold text-rose-400/80 mb-1 block">Tu Código</span>
                <pre className="bg-rose-950/20 p-2 rounded text-xs overflow-x-auto border border-rose-900/30 text-rose-200/90 whitespace-pre-wrap">
                  <code>{cursorAdvice.snippet_before}</code>
                </pre>
              </div>
            )}

            {(cursorAdvice.snippet_after && cursorAdvice.snippet_after !== "null") ? (
              <div className="mt-1">
                <span className="text-[10px] uppercase font-bold text-emerald-400/80 mb-1 block">Sugerencia Senior</span>
                <pre className="bg-emerald-950/20 p-2 rounded text-xs overflow-x-auto border border-emerald-900/30 text-emerald-200/90 whitespace-pre-wrap">
                  <code>{cursorAdvice.snippet_after}</code>
                </pre>
              </div>
            ) : cursorAdvice.suggested_code && cursorAdvice.suggested_code !== "null" && (
              <div className="mt-1">
                <span className="text-[10px] uppercase font-bold text-emerald-400/80 mb-1 block">Sugerencia Senior</span>
                <pre className="bg-emerald-950/20 p-2 rounded text-xs overflow-x-auto border border-emerald-900/30 text-emerald-200/90 whitespace-pre-wrap">
                  <code>{cursorAdvice.suggested_code}</code>
                </pre>
              </div>
            )}
          </div>
        ) : allMentorshipAdvice && allMentorshipAdvice.length > 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <Lightbulb className="w-8 h-8 text-zinc-700 mb-2 opacity-50" />
            <p className="text-xs text-zinc-500">
              No hay observaciones para la línea {activeLineNumber ?? '-'}.<br/><br/>
              Hay {allMentorshipAdvice.length} observaciones en el resto del archivo.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <Lightbulb className="w-8 h-8 text-zinc-700 mb-2" />
            <p className="text-xs text-zinc-500">Código limpio.<br/>Selecciona un bloque complejo o con subrayado para recibir mentoría.</p>
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}
