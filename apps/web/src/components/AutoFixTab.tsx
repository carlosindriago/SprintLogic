 
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */
 
/* eslint-disable @typescript-eslint/no-unused-vars */

import { useState, useEffect } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { generateAutoFix, saveFileContent } from '@/lib/api';
import { RefreshCw, Check, X, Send } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { toast } from 'sonner';
import { useTabsStore } from '@/store/tabsStore';

interface AutoFixTabProps {
  projectId: string;
  ticketId: string;
  filePath: string;
  instruction: string;
}

export default function AutoFixTab({ projectId, ticketId, filePath, instruction }: AutoFixTabProps) {
  const [original, setOriginal] = useState("");
  const [modified, setModified] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refinement, setRefinement] = useState("");
  const [currentInstruction, setCurrentInstruction] = useState(instruction);
  
  const removeTab = useTabsStore(state => state.removeTab);
  const activeTabId = useTabsStore(state => state.activeTabId);

  const fetchFix = async (inst: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await generateAutoFix({
        ticket_id: ticketId,
        node_id: filePath,
        project_id: projectId,
        instruction: inst
      });
      setOriginal(res.original || "");
      let newMod = res.modified || "";
      newMod = newMod.replace(/^```[\w]*\n/, '').replace(/\n```$/, '');
      setModified(newMod);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate fix");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId && ticketId && filePath && currentInstruction) {
      fetchFix(currentInstruction);
    }
  }, [projectId, ticketId, filePath]);

  const handleRefine = () => {
    if (!refinement.trim()) return;
    const newInst = currentInstruction + "\nAdicionalmente: " + refinement;
    setCurrentInstruction(newInst);
    fetchFix(newInst);
    setRefinement("");
  };

  const handleApply = async () => {
    try {
      await saveFileContent(projectId, filePath, modified);
      toast.success("Parche aplicado con éxito.");
      if (activeTabId) removeTab(activeTabId);
    } catch (err) {
      toast.error("Error al aplicar parche.");
    }
  };

  const handleDiscard = () => {
    if (activeTabId) removeTab(activeTabId);
  };

  const getLanguage = (path: string) => {
    const ext = path.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts': case 'tsx': return 'typescript';
      case 'js': case 'jsx': return 'javascript';
      case 'json': return 'json';
      case 'css': return 'css';
      case 'html': return 'html';
      case 'md': return 'markdown';
      case 'py': return 'python';
      default: return 'plaintext';
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#1e1e1e] text-zinc-400">
        <RefreshCw className="w-6 h-6 animate-spin mr-2 mb-2" />
        Generando Parche Rápido con IA...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#1e1e1e] text-red-400 p-4">
        <p className="mb-4">Error: {error}</p>
        <Button onClick={() => fetchFix(currentInstruction)}>Reintentar</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800/50">
        <div className="flex flex-col overflow-hidden mr-4">
          <span className="text-sm font-semibold text-zinc-200">Parche Rápido: {filePath.split('/').pop()}</span>
          <span className="text-xs text-zinc-400 truncate w-[300px] sm:w-[500px]">{currentInstruction}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-900/20" onClick={handleDiscard}>
            <X className="w-4 h-4 mr-2" /> Descartar
          </Button>
          <Button className="bg-emerald-600 hover:bg-emerald-500 text-white" onClick={handleApply}>
            <Check className="w-4 h-4 mr-2" /> Aplicar Cambios
          </Button>
        </div>
      </div>
      
      <div className="flex-1">
        <DiffEditor
          original={original}
          modified={modified}
          language={getLanguage(filePath)}
          theme="vs-dark"
          options={{
            readOnly: false,
            renderSideBySide: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
          }}
        />
      </div>

      <div className="p-3 bg-zinc-900 border-t border-zinc-800 flex gap-2">
        <Input 
          value={refinement}
          onChange={e => setRefinement(e.target.value)}
          placeholder="Refinar el parche... (ej. Extrae esa lógica a un método aparte)"
          className="flex-1 bg-zinc-950 border-zinc-800 text-sm"
          onKeyDown={(e) => e.key === 'Enter' && handleRefine()}
        />
        <Button variant="secondary" onClick={handleRefine} disabled={!refinement.trim()}>
          <Send className="w-4 h-4 mr-2" /> Refinar
        </Button>
      </div>
    </div>
  );
}
