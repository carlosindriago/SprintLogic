import { CodeCoachOverview, CodeCoachMarker } from "@/lib/api";
import { RefreshCw, ShieldAlert, FileCode2, Activity, Lightbulb, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CoachSidebarProps {
  techData?: any;
  onRescan?: () => void;
  isScanningTech: boolean;
  isTechError?: boolean;
  isAnalyzingCode: boolean;
  overview: CodeCoachOverview | null;
  cursorAdvice: CodeCoachMarker | null;
  fileMetadata?: { lineCount: number; gitStatus: string };
}

export function CoachSidebar({
  techData,
  onRescan,
  isScanningTech,
  isTechError,
  isAnalyzingCode,
  overview,
  cursorAdvice,
  fileMetadata,
}: CoachSidebarProps) {

  return (
    <div className="h-full w-full min-w-[250px] bg-[#0a0a0a] border-l border-zinc-800 flex flex-col overflow-y-auto custom-scrollbar p-3 space-y-4">
      {/* Celda 1: Ficha Técnica */}
      <div className="bg-[#121212] border border-zinc-800 rounded-lg p-4 flex flex-col shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <FileCode2 className="w-4 h-4 text-blue-400" />
            Stack Técnico
          </h3>
          <Button 
            variant="ghost" 
            size="icon" 
            className="w-6 h-6 text-zinc-400 hover:text-white" 
            onClick={onRescan}
            disabled={isScanningTech}
            title="Re-escanear tecnologías"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanningTech ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        
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
          <div className="flex flex-col gap-2">
            {techData.technologies.map((tech, idx) => (
              <div key={idx} className="flex flex-col text-xs bg-[#1a1a1a] p-2 rounded border border-zinc-800/50">
                <span className="font-medium text-zinc-200">{tech.name} <span className="text-zinc-500 text-[10px]">v{tech.version}</span></span>
                <a 
                  href={tech.doc_url} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-blue-400 hover:underline mt-1 break-all"
                >
                  {tech.doc_url !== '#' ? tech.doc_url : 'Sin doc'}
                </a>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">No se detectaron tecnologías específicas.</p>
        )}
      </div>

      {/* Celda 2: Overview */}
      <div className={`bg-[#121212] border ${overview?.is_degraded ? 'border-rose-500/50' : 'border-zinc-800'} rounded-lg p-4 flex flex-col shadow-sm mb-4`}>
        <h3 className={`text-sm font-semibold flex items-center gap-2 mb-3 ${overview?.is_degraded ? 'text-rose-400' : 'text-zinc-200'}`}>
          <Activity className={`w-4 h-4 ${overview?.is_degraded ? 'text-rose-500' : 'text-emerald-400'}`} />
          Health & Overview
          {isAnalyzingCode && overview && <Loader2 className="w-3 h-3 animate-spin text-zinc-500 ml-auto" />}
        </h3>
        {isAnalyzingCode && !overview ? (
           <div>
             <div className="animate-pulse bg-zinc-700/50 rounded h-4 w-3/4 mb-2"></div>
             <div className="animate-pulse bg-zinc-700/50 rounded h-4 w-5/6 mb-2"></div>
             <div className="animate-pulse bg-zinc-700/50 rounded h-4 w-2/3 mb-2"></div>
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
          </div>
        ) : (
          <p className="text-xs text-zinc-500">Esperando análisis dinámico del Coach...</p>
        )}
      </div>

      {/* Celda 3: Mentoría Contextual */}
      <div className="bg-[#121212] border border-zinc-800 rounded-lg p-4 flex flex-col shadow-sm flex-1">
        <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2 mb-3">
          <Lightbulb className="w-4 h-4 text-amber-400" />
          Mentoría Contextual
          {isAnalyzingCode && cursorAdvice && <Loader2 className="w-3 h-3 animate-spin text-zinc-500 ml-auto" />}
        </h3>
        
        {isAnalyzingCode && !cursorAdvice && !overview ? (
           <div>
             <div className="animate-pulse bg-zinc-700/50 rounded h-4 w-3/4 mb-2"></div>
             <div className="animate-pulse bg-zinc-700/50 rounded h-4 w-5/6 mb-2"></div>
           </div>
        ) : cursorAdvice ? (
          <div className={`flex flex-col gap-2 p-3 rounded border text-xs 
            ${cursorAdvice.severity === 'error' ? 'bg-rose-500/10 border-rose-500/30' : 
              cursorAdvice.severity === 'warning' ? 'bg-amber-500/10 border-amber-500/30' : 
              'bg-blue-500/10 border-blue-500/30'}
            ${isAnalyzingCode ? 'opacity-60 transition-opacity' : ''}`}
          >
            <span className={`font-bold ${cursorAdvice.severity === 'error' ? 'text-rose-400' : cursorAdvice.severity === 'warning' ? 'text-amber-400' : 'text-blue-400'}`}>
              Línea {cursorAdvice.line}: {cursorAdvice.message}
            </span>
            <span className="text-zinc-300 leading-relaxed">
              {cursorAdvice.explanation}
            </span>
            {cursorAdvice.suggested_code && cursorAdvice.suggested_code !== "null" && (
              <pre className="bg-zinc-950 p-2 rounded text-sm overflow-x-auto mt-1 border border-zinc-800">
                <code>{cursorAdvice.suggested_code}</code>
              </pre>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <Lightbulb className="w-8 h-8 text-zinc-700 mb-2" />
            <p className="text-xs text-zinc-500">Código limpio.<br/>Selecciona un bloque complejo o con subrayado para recibir mentoría.</p>
          </div>
        )}
      </div>
    </div>
  );
}
