import { useState } from 'react';
import { Check, X, FileCode } from 'lucide-react';
import { toast } from 'sonner';
import { API_BASE_URL } from '@/lib/api';

interface ProposalCardProps {
  id: string;
  projectId: string;
  filePath: string;
  description: string;
  diff: string;
}

export default function ProposalCard({
  id,
  projectId,
  filePath,
  description,
  diff,
}: ProposalCardProps) {
  const [status, setStatus] = useState<'pending' | 'applying' | 'applied' | 'rejected'>('pending');

  const handleApply = async () => {
    setStatus('applying');
    try {
      const res = await fetch(
        `${API_BASE_URL}/projects/${projectId}/proposals/${id}/apply`,
        { method: 'POST' },
      );
      if (!res.ok) throw new Error('Apply failed');
      setStatus('applied');
      toast.success(`Cambio aplicado: ${description}`);
    } catch {
      setStatus('pending');
      toast.error('Error al aplicar el cambio');
    }
  };

  const handleReject = async () => {
    try {
      await fetch(
        `${API_BASE_URL}/projects/${projectId}/proposals/${id}/reject`,
        { method: 'POST' },
      );
      setStatus('rejected');
    } catch {
      toast.error('Error al rechazar');
    }
  };

  return (
    <div className="my-3 rounded-lg border border-zinc-700/50 bg-zinc-900/80 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/50 border-b border-zinc-700/30">
        <FileCode className="w-4 h-4 text-blue-400" />
        <span className="text-xs font-medium text-zinc-300 truncate flex-1">
          {filePath}
        </span>
        <span className="text-xs text-zinc-500">{description}</span>
      </div>

      <pre className="p-3 text-xs font-mono text-zinc-300 overflow-x-auto max-h-64 leading-relaxed">
        {diff.split('\n').map((line, i) => {
          let className = 'text-zinc-400';
          if (line.startsWith('+')) className = 'text-emerald-400';
          else if (line.startsWith('-')) className = 'text-red-400';
          else if (line.startsWith('@@')) className = 'text-cyan-400';
          return (
            <div key={i} className={className}>
              {line}
            </div>
          );
        })}
      </pre>

      {status === 'pending' && (
        <div className="flex gap-2 px-3 py-2 bg-zinc-800/30 border-t border-zinc-700/30">
          <button
            onClick={handleApply}
            className="flex items-center gap-1 px-3 py-1 text-xs font-medium bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded transition-colors"
          >
            <Check className="w-3 h-3" />
            Aplicar
          </button>
          <button
            onClick={handleReject}
            className="flex items-center gap-1 px-3 py-1 text-xs font-medium bg-zinc-700/50 text-zinc-400 hover:bg-zinc-600/50 rounded transition-colors"
          >
            <X className="w-3 h-3" />
            Rechazar
          </button>
        </div>
      )}

      {status === 'applying' && (
        <div className="px-3 py-2 text-xs text-zinc-500 bg-zinc-800/30 border-t border-zinc-700/30">
          Aplicando...
        </div>
      )}

      {status === 'applied' && (
        <div className="px-3 py-2 text-xs text-emerald-400 bg-zinc-800/30 border-t border-zinc-700/30">
          Cambio aplicado.
        </div>
      )}

      {status === 'rejected' && (
        <div className="px-3 py-2 text-xs text-zinc-500 bg-zinc-800/30 border-t border-zinc-700/30">
          Rechazado.
        </div>
      )}
    </div>
  );
}
