import { useState, useEffect } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { useChatStore } from '@/store/chatStore';
import { Button } from './ui/button';
import { Save, X } from 'lucide-react';
import { toast } from 'sonner';

export default function DraftReviewer({ onSubmitResponse }: { onSubmitResponse: (message: string) => void }) {
  const { draftPayload, clearDraftMode } = useChatStore();
  const [content, setContent] = useState('');

  useEffect(() => {
    if (draftPayload?.type === 'task') {
      const { task_id, title, domain, context, requirements } = draftPayload.content;
      let md = `---
id: ${task_id}
title: ${title}
domain: ${domain}
---

# ${title}

## Contexto
${context}

## Requerimientos
`;
      if (requirements && Array.isArray(requirements)) {
        requirements.forEach((req: any) => {
          md += `- **${req.id}**: ${req.description}\n`;
        });
      }
      setContent(md);
    } else if (draftPayload?.type === 'adr') {
      const { adr_id, title, context, decision, consequences } = draftPayload.content;
      setContent(`---
id: ${adr_id}
title: ${title}
---

# ${title}

## Contexto
${context}

## Decisión
${decision}

## Consecuencias
${consequences}
`);
    }
  }, [draftPayload]);

  const handleSignAndCommit = async () => {
    if (!draftPayload) return;
    try {
      const payload = {
        role: "tool",
        tool_call_id: draftPayload.tool_call_id,
        name: draftPayload.type === 'task' ? 'generate_task_spec' : 'generate_adr',
        content: `El Arquitecto ha revisado el borrador y lo ha guardado exitosamente en el disco bajo '${draftPayload.filepath}'. Tarea completada.`
      };
      onSubmitResponse(JSON.stringify(payload));
      clearDraftMode();
      toast.success('Borrador firmado y comprometido exitosamente.');
    } catch (e) {
      toast.error('Error al guardar el borrador');
    }
  };

  const handleCancel = () => {
    if (!draftPayload) return;
    const payload = {
      role: "tool",
      tool_call_id: draftPayload.tool_call_id,
      name: draftPayload.type === 'task' ? 'generate_task_spec' : 'generate_adr',
      content: `El usuario canceló el borrador.`
    };
    onSubmitResponse(JSON.stringify(payload));
    clearDraftMode();
    toast.info('Borrador cancelado.');
  };

  if (!draftPayload) return null;

  return (
    <div className="flex flex-col h-full w-full bg-[#1e1e1e] border-l border-zinc-800">
      <div className="flex items-center justify-between p-2 border-b border-zinc-800 bg-[#151515]">
        <h3 className="text-sm font-semibold text-zinc-300">
          Revisión Liminal: {draftPayload.filepath}
        </h3>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleCancel} className="h-8 text-xs text-red-400 border-red-900/50 hover:bg-red-900/20">
            <X className="w-4 h-4 mr-1" />
            Rechazar
          </Button>
          <Button size="sm" onClick={handleSignAndCommit} className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
            <Save className="w-4 h-4 mr-1" />
            Firmar y Comprometer
          </Button>
        </div>
      </div>
      <div className="flex-1">
        <MonacoEditor
          language="markdown"
          theme="vs-dark"
          value={content}
          onChange={(val) => setContent(val || '')}
          options={{
            minimap: { enabled: false },
            wordWrap: 'on',
            fontSize: 14,
            padding: { top: 16 }
          }}
        />
      </div>
    </div>
  );
}
