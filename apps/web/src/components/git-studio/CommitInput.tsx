import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GitCommit, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { API_BASE_URL } from '@/lib/api';
import { generateCommitMessage } from '@/lib/git-actions';
import { useLLMConfigStore } from '@/store/llmConfigStore';

interface CommitInputProps {
  projectId: string;
  stagedCount: number;
  onCommitSuccess: () => void;
  isMergeInProgress?: boolean;
}

export default function CommitInput({ projectId, stagedCount, onCommitSuccess, isMergeInProgress }: CommitInputProps) {
  const [commitMessage, setCommitMessage] = useState('');
  const [isGeneratingMessage, setIsGeneratingMessage] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const defaultModel = useLLMConfigStore((state) => state.defaultModel);

  const handleGenerateCommitMessage = async () => {
    setIsGeneratingMessage(true);
    const res = await generateCommitMessage(projectId, defaultModel);
    setIsGeneratingMessage(false);

    if (res.ok && 'data' in res && res.data) {
      const resData = res.data as { status: string; message: string };
      if (resData.message === 'No hay cambios para hacer commit.') {
        toast.info(resData.message);
      } else {
        setCommitMessage(resData.message);
        toast.success('Mensaje generado');
      }
    } else {
      const resData = 'data' in res ? (res.data as { message?: string }) : null;
      toast.error('Error al generar', {
        description: resData?.message || res.error || 'Fallo inesperado.',
      });
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;

    try {
      setActionLoading(true);
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/git/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'commit', message: commitMessage }),
      });
      if (res.ok) {
        setCommitMessage('');
        toast.success('Commit exitoso');
        onCommitSuccess();
      } else {
        const err = await res.json();
        toast.error(`Error en commit: ${err.detail}`);
      }
    } catch {
      toast.error('Error de red');
    } finally {
      setActionLoading(false);
    }
  };

  const isDisabled = actionLoading || !!isMergeInProgress || isGeneratingMessage;
  const canCommit = !isDisabled && commitMessage.trim().length > 0 && stagedCount > 0;

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0 max-w-lg">
      {/* AI Generate — standalone button, clearly separate from input */}
      <Button
        variant="outline"
        size="sm"
        className="h-8 shrink-0 gap-1.5 border-zinc-700/50 bg-zinc-800 text-zinc-400 hover:text-amber-400 hover:border-amber-500/40 hover:bg-amber-500/5 transition-colors"
        disabled={isDisabled || stagedCount === 0}
        onClick={handleGenerateCommitMessage}
        title="Generar mensaje con IA"
        aria-label="Generate commit message with AI"
      >
        <Sparkles
          className={`w-3.5 h-3.5 ${isGeneratingMessage ? 'animate-pulse text-amber-400' : ''}`}
          aria-hidden="true"
        />
        <span className="text-xs">{isGeneratingMessage ? 'Generando...' : 'IA'}</span>
      </Button>

      {/* Commit message input */}
      <Input
        value={commitMessage}
        onChange={(e) => setCommitMessage(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && canCommit && handleCommit()}
        placeholder={
          stagedCount === 0
            ? 'Sin archivos en stage...'
            : 'Mensaje de commit... (Enter para confirmar)'
        }
        className="h-8 flex-1 min-w-0 bg-zinc-800 border-zinc-700/50 text-sm placeholder:text-zinc-600"
        disabled={isDisabled || stagedCount === 0}
      />

      {/* Commit button */}
      <Button
        size="sm"
        onClick={handleCommit}
        disabled={!canCommit}
        className="h-8 shrink-0 gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 transition-colors"
      >
        <GitCommit className="w-3.5 h-3.5" aria-hidden="true" />
        <span>Commit</span>
      </Button>
    </div>
  );
}
