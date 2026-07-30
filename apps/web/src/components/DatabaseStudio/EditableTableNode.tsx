import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { ColumnIR } from '@/lib/api';
import { Database, Key, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface EditableTableNodeData {
  label: string;
  columns: ColumnIR[];
  indexes?: string[];
  onTableUpdate?: (nodeId: string, label: string, columns: ColumnIR[]) => void;
  [key: string]: unknown;
}

export const EditableTableNode = memo(({ id, data }: NodeProps) => {
  const nodeData = data as unknown as EditableTableNodeData;
  const { label, columns = [], onTableUpdate } = nodeData;

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onTableUpdate) {
      onTableUpdate(id, e.target.value, columns);
    }
  };

  const handleColumnChange = (idx: number, field: keyof ColumnIR, value: string | boolean) => {
    if (!onTableUpdate) return;
    const newCols = [...columns];
    newCols[idx] = { ...newCols[idx], [field]: value };
    onTableUpdate(id, label, newCols);
  };

  const handleAddColumn = () => {
    if (!onTableUpdate) return;
    const newCols = [...columns, { 
      name: `col_${columns.length + 1}`, 
      type: 'string', 
      is_pk: false, 
      is_fk: false, 
      is_nullable: true 
    }];
    onTableUpdate(id, label, newCols);
  };

  return (
    <div className="min-w-[260px] max-w-[340px] rounded-xl border border-zinc-700/60 bg-zinc-900/95 p-3 text-zinc-100 shadow-2xl backdrop-blur-md transition-all hover:border-cyan-500/50">
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-cyan-400 !bg-zinc-900" />
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-cyan-400 !bg-zinc-900" />

      {/* Header */}
      <div className="mb-2 flex items-center justify-between border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-2 flex-grow">
          <div className="rounded-md bg-cyan-500/10 p-1.5 text-cyan-400">
            <Database className="h-4 w-4" />
          </div>
          <input 
            type="text" 
            value={label} 
            onChange={handleNameChange}
            className="font-semibold text-sm tracking-wide text-zinc-100 bg-transparent border-none outline-none flex-grow min-w-0 placeholder-zinc-500 focus:ring-1 focus:ring-cyan-500/50 rounded px-1"
            placeholder="table_name"
          />
        </div>
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400 shrink-0">
          {columns.length} cols
        </span>
      </div>

      {/* Columns List */}
      <div className="space-y-1 mb-3">
        {columns.map((col, idx) => (
          <div key={`${col.name}-${idx}`} className="flex items-center justify-between rounded px-1 py-1 hover:bg-zinc-800/60 text-xs group">
            <div className="flex items-center gap-1.5 flex-grow min-w-0">
              {col.is_pk ? (
                <span title="Primary Key" className="inline-flex shrink-0 cursor-pointer" onClick={() => handleColumnChange(idx, 'is_pk', (!col.is_pk))}>
                  <Key className="h-3.5 w-3.5 text-amber-400" />
                </span>
              ) : (
                <span title="Make Primary Key" className="inline-flex shrink-0 opacity-0 group-hover:opacity-50 cursor-pointer hover:!opacity-100" onClick={() => handleColumnChange(idx, 'is_pk', true)}>
                  <Key className="h-3.5 w-3.5 text-zinc-400" />
                </span>
              )}
              
              <input 
                type="text"
                value={col.name}
                onChange={(e) => handleColumnChange(idx, 'name', e.target.value)}
                className={`truncate font-mono bg-transparent border-none outline-none flex-grow min-w-0 px-1 rounded focus:bg-zinc-800/80 ${col.is_pk ? 'font-semibold text-amber-300' : 'text-zinc-200'}`}
              />
            </div>
            <input 
              type="text"
              value={col.type}
              onChange={(e) => handleColumnChange(idx, 'type', e.target.value)}
              className="ml-2 font-mono text-[10px] text-zinc-400 uppercase shrink-0 bg-transparent border-none outline-none w-16 text-right px-1 rounded focus:bg-zinc-800/80 focus:text-zinc-200"
            />
          </div>
        ))}
      </div>

      <Button 
        variant="ghost" 
        size="sm" 
        className="w-full h-7 text-xs text-zinc-400 hover:text-cyan-400 hover:bg-cyan-500/10 border border-dashed border-zinc-700/50 rounded-md"
        onClick={handleAddColumn}
      >
        <Plus className="h-3 w-3 mr-1" /> Añadir Columna
      </Button>
    </div>
  );
});

EditableTableNode.displayName = 'EditableTableNode';
