import { useState } from 'react';
import { useGitStore } from '@/store/gitStore';
import { getFileIcon } from './utils';
import { Button } from '@/components/ui/button';
import { Plus, Minus, Layers, FileText, Activity, UploadCloud, DownloadCloud, EyeOff, Archive } from 'lucide-react';
import { stageFile, unstageFile } from '@/lib/api';
import { toast } from 'sonner';

export default function StagingArea({ projectId }: { projectId: string }) {
  const { stagedFiles, modifiedFiles, untrackedFiles, ahead, behind, ignored, fetchDashboard, selectedFile, setSelectedFile } = useGitStore();
  const [loadingFile, setLoadingFile] = useState<string | null>(null);

  const handleStage = async (file: string) => {
    setLoadingFile(file);
    try {
      await stageFile(projectId, file);
      await fetchDashboard(projectId);
    } catch (e: unknown) {
      toast.error('Error staging file: ' + (e as Error).message);
    } finally {
      setLoadingFile(null);
    }
  };

  const handleUnstage = async (file: string) => {
    setLoadingFile(file);
    try {
      await unstageFile(projectId, file);
      await fetchDashboard(projectId);
    } catch (e: unknown) {
      toast.error('Error unstaging file: ' + (e as Error).message);
    } finally {
      setLoadingFile(null);
    }
  };

  const renderFile = (file: string, status: string, isStaged: boolean) => (
    <li 
      key={file} 
      className={`flex items-center justify-between p-1.5 px-3 rounded-md hover:bg-zinc-800/50 cursor-pointer group transition-colors border-b border-zinc-800/30 last:border-b-0 ${selectedFile === file ? 'bg-zinc-800 ring-1 ring-zinc-700/50' : ''}`}
      onClick={() => setSelectedFile(file)}
    >
      <div className="flex items-center gap-2 text-xs overflow-hidden flex-1">
        <span className="shrink-0">{getFileIcon(status)}</span>
        <span className={`truncate font-mono ${selectedFile === file ? 'text-zinc-200' : 'text-zinc-400 group-hover:text-zinc-300'}`}>{file}</span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900/50 border border-zinc-700/50 hover:bg-zinc-700 shrink-0 ml-2"
        disabled={loadingFile === file}
        onClick={(e) => {
          e.stopPropagation();
          if (isStaged) {
            handleUnstage(file);
          } else {
            handleStage(file);
          }
        }}
      >
        {isStaged ? <Minus className="w-3.5 h-3.5 text-red-400" /> : <Plus className="w-3.5 h-3.5 text-green-400" />}
      </Button>
    </li>
  );

  const totalFiles = stagedFiles.length + modifiedFiles.length + untrackedFiles.length;

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a] border-b border-zinc-800 text-zinc-200 overflow-hidden">
      
      {/* KPI Header */}
      <div className="flex gap-2 p-2 bg-zinc-900/50 border-b border-zinc-800 shrink-0 overflow-x-auto">
        <KPICard icon={<Layers className="w-3.5 h-3.5 text-blue-400" />} label="Total Cambios" value={totalFiles} />
        <KPICard icon={<Activity className="w-3.5 h-3.5 text-yellow-400" />} label="Modificados" value={modifiedFiles.length} accent="text-yellow-400" />
        <KPICard icon={<FileText className="w-3.5 h-3.5 text-zinc-400" />} label="Nuevos" value={untrackedFiles.length} accent="text-zinc-300" />
        <KPICard icon={<Plus className="w-3.5 h-3.5 text-green-400" />} label="En Preparación" value={stagedFiles.length} accent="text-green-400" />
        
        {/* Repo Scope KPIs */}
        <div className="w-px bg-zinc-800 mx-2 shrink-0"></div>
        <KPICard icon={<Archive className="w-3.5 h-3.5 text-teal-400" />} label="Trackeables (Sin Add)" value={modifiedFiles.length + untrackedFiles.length} accent="text-teal-400" />
        <KPICard icon={<EyeOff className="w-3.5 h-3.5 text-zinc-500" />} label="Ignorados" value={ignored} accent="text-zinc-400" />

        {/* Remote Sync KPIs */}
        <div className="w-px bg-zinc-800 mx-2 shrink-0"></div>
        <KPICard icon={<UploadCloud className={`w-3.5 h-3.5 ${ahead > 0 ? 'text-purple-400' : 'text-zinc-600'}`} />} label="Por Subir (Push)" value={ahead} accent={ahead > 0 ? "text-purple-400" : "text-zinc-500"} />
        <KPICard icon={<DownloadCloud className={`w-3.5 h-3.5 ${behind > 0 ? 'text-orange-400' : 'text-zinc-600'}`} />} label="Por Bajar (Pull)" value={behind} accent={behind > 0 ? "text-orange-400" : "text-zinc-500"} />
      </div>

      {/* Staging Columns */}
      <div className="flex-1 flex gap-2 p-2 overflow-hidden min-h-0">
        
        {/* Unstaged Column */}
        <div className="flex-1 flex flex-col bg-zinc-900/30 border border-zinc-800/50 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-800/50 shrink-0">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
              <FileText className="w-3.5 h-3.5 text-zinc-400" />
              Cambios Locales (Unstaged)
            </div>
            <span className="text-[11px] text-zinc-500 font-mono bg-zinc-800 px-1.5 py-0.5 rounded">
              {modifiedFiles.length + untrackedFiles.length}
            </span>
          </div>
          <ul className="flex-1 overflow-y-auto p-1">
            {modifiedFiles.map((file) => renderFile(file, 'M', false))}
            {untrackedFiles.map((file) => renderFile(file, 'U', false))}
            {(modifiedFiles.length === 0 && untrackedFiles.length === 0) && (
              <li className="flex flex-col items-center justify-center py-8 text-zinc-600 gap-1">
                <FileText className="w-5 h-5 opacity-30" />
                <span className="text-[11px] italic">No hay archivos modificados.</span>
              </li>
            )}
          </ul>
        </div>

        {/* Staged Column */}
        <div className="flex-1 flex flex-col bg-zinc-900/30 border border-zinc-800/50 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-800/50 shrink-0">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
              <Plus className="w-3.5 h-3.5 text-green-400" />
              En Preparación (Staged)
            </div>
            <span className="text-[11px] text-zinc-500 font-mono bg-zinc-800 px-1.5 py-0.5 rounded">
              {stagedFiles.length}
            </span>
          </div>
          <ul className="flex-1 overflow-y-auto p-1">
            {stagedFiles.length > 0 ? (
              stagedFiles.map((file) => renderFile(file, 'M', true))
            ) : (
              <li className="flex flex-col items-center justify-center py-8 text-zinc-600 gap-1">
                <FileText className="w-5 h-5 opacity-30" />
                <span className="text-[11px] italic">No hay archivos preparados.</span>
              </li>
            )}
          </ul>
        </div>

      </div>
    </div>
  );
}

function KPICard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string | number; accent?: string }) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-zinc-900/80 border border-zinc-800/80 rounded min-w-[120px]">
      <div className="p-1.5 bg-zinc-800/50 rounded">
        {icon}
      </div>
      <div className="flex flex-col justify-center">
        <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-semibold leading-tight">{label}</span>
        <span className={`text-sm font-mono font-bold leading-tight ${accent ?? 'text-zinc-100'}`}>
          {value}
        </span>
      </div>
    </div>
  );
}
