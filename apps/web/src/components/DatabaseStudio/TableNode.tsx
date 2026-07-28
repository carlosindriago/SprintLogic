import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { ColumnIR } from '@/lib/api';
import { Database, Key, Link2 } from 'lucide-react';

export interface TableNodeData {
  label: string;
  columns: ColumnIR[];
  indexes?: string[];
  [key: string]: unknown;
}

export const TableNode = memo(({ data }: NodeProps) => {
  const nodeData = data as unknown as TableNodeData;
  const { label, columns = [] } = nodeData;

  return (
    <div className="min-w-[240px] max-w-[320px] rounded-xl border border-zinc-700/60 bg-zinc-900/95 p-3 text-zinc-100 shadow-2xl backdrop-blur-md transition-all hover:border-cyan-500/50">
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-cyan-400 !bg-zinc-900"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-cyan-400 !bg-zinc-900"
      />

      {/* Header */}
      <div className="mb-2 flex items-center justify-between border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-cyan-500/10 p-1.5 text-cyan-400">
            <Database className="h-4 w-4" />
          </div>
          <span className="font-semibold text-sm tracking-wide text-zinc-100">{label}</span>
        </div>
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
          {columns.length} cols
        </span>
      </div>

      {/* Columns List */}
      <div className="space-y-1">
        {columns.map((col, idx) => (
          <div
            key={`${col.name}-${idx}`}
            className="flex items-center justify-between rounded px-2 py-1 hover:bg-zinc-800/60 text-xs"
          >
            <div className="flex items-center gap-1.5 truncate">
              {col.is_pk && (
                <span title="Primary Key" className="inline-flex shrink-0">
                  <Key className="h-3.5 w-3.5 text-amber-400" />
                </span>
              )}
              {col.is_fk && (
                <span title={`Foreign Key -> ${col.target_table}`} className="inline-flex shrink-0">
                  <Link2 className="h-3.5 w-3.5 text-cyan-400" />
                </span>
              )}
              <span className={`truncate font-mono ${col.is_pk ? 'font-semibold text-amber-300' : 'text-zinc-200'}`}>
                {col.name}
              </span>
            </div>
            <span className="ml-2 font-mono text-[10px] text-zinc-400 uppercase shrink-0">
              {col.type}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});

TableNode.displayName = 'TableNode';
