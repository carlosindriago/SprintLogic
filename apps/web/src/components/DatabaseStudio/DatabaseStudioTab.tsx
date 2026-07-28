import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useProjectStore } from '@/store/projectStore';
import {
  fetchProjectSchema,
  auditProjectSchema,
  SchemaIR,
  DBAuditResponse,
  DBAuditAlert,
} from '@/lib/api';
import { TableNode } from './TableNode';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Database,
  Brain,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Info,
  Sparkles,
  Copy,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';

const nodeTypes = {
  tableNode: TableNode,
};

export default function DatabaseStudioTab() {
  const { projectId } = useProjectStore();
  const [schema, setSchema] = useState<SchemaIR | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [auditLoading, setAuditLoading] = useState<boolean>(false);
  const [auditResult, setAuditResult] = useState<DBAuditResponse | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const loadSchema = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await fetchProjectSchema(projectId);
      setSchema(data);

      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];
      const tableNames = new Set(data.tables.map((t) => t.name));

      data.tables.forEach((table, idx) => {
        const cols = 3;
        const x = (idx % cols) * 360;
        const y = Math.floor(idx / cols) * 340;

        newNodes.push({
          id: table.name,
          type: 'tableNode',
          position: { x, y },
          data: {
            label: table.name,
            columns: table.columns,
            indexes: table.indexes,
          },
        });

        table.columns.forEach((col) => {
          if (col.is_fk && col.target_table && tableNames.has(col.target_table)) {
            const edgeId = `e-${table.name}-${col.name}-${col.target_table}`;
            if (!newEdges.some((e) => e.id === edgeId)) {
              newEdges.push({
                id: edgeId,
                source: table.name,
                target: col.target_table,
                animated: true,
                style: { stroke: '#06b6d4', strokeWidth: 2 },
              });
            }
          }
        });
      });

      setNodes(newNodes);
      setEdges(newEdges);
    } catch (err) {
      console.error('Failed to load database schema:', err);
      toast.error('Error al cargar el esquema de la base de datos');
    } finally {
      setLoading(false);
    }
  }, [projectId, setNodes, setEdges]);

  useEffect(() => {
    loadSchema();
  }, [loadSchema]);

  const handleRunAudit = async () => {
    if (!projectId) return;
    setAuditLoading(true);
    try {
      const res = await auditProjectSchema(projectId, schema || undefined);
      setAuditResult(res);
      toast.success('Auditoría de Arquitectura de DB completada');
    } catch (err) {
      console.error('Audit failed:', err);
      toast.error('Error al ejecutar la auditoría con IA');
    } finally {
      setAuditLoading(false);
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    toast.success('Sugerencia copiada al portapapeles');
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const getScoreBadgeColor = (score: number) => {
    if (score >= 80) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (score >= 60) return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    return 'bg-red-500/10 text-red-400 border-red-500/20';
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />;
      default:
        return <Info className="h-4 w-4 text-cyan-400 shrink-0" />;
    }
  };

  return (
    <div className="flex h-full w-full bg-[#0d0d0d] text-zinc-100 overflow-hidden">
      {/* LEFT: ReactFlow ERD Canvas (70%) */}
      <div className="relative flex-1 flex flex-col border-r border-zinc-800/80">
        {/* Header toolbar */}
        <div className="flex h-12 items-center justify-between border-b border-zinc-800 bg-[#0a0a0a] px-4">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-cyan-400" />
            <h1 className="font-semibold text-sm text-zinc-100">Database Studio</h1>
            <Badge variant="outline" className="ml-2 border-zinc-700 bg-zinc-800 text-zinc-300 text-[11px]">
              {schema?.tables.length || 0} Tablas
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadSchema}
              disabled={loading}
              className="h-8 gap-1.5 border-zinc-700 bg-zinc-900 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refrescar
            </Button>
            <Button
              size="sm"
              onClick={handleRunAudit}
              disabled={auditLoading || !schema?.tables.length}
              className="h-8 gap-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 text-xs text-white hover:from-cyan-500 hover:to-blue-500 shadow-md shadow-cyan-500/20 border-none"
            >
              <Brain className={`h-3.5 w-3.5 ${auditLoading ? 'animate-bounce' : ''}`} />
              {auditLoading ? 'Analizando...' : 'Auditar Arquitectura'}
            </Button>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 bg-[#121214] relative">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-zinc-400">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin text-cyan-400" />
              Escaneando esquemas SQL del proyecto...
            </div>
          ) : !schema?.tables.length ? (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center">
              <Database className="mb-3 h-12 w-12 text-zinc-600" />
              <h3 className="text-base font-medium text-zinc-300">No se encontraron esquemas SQL</h3>
              <p className="mt-1 max-w-sm text-xs text-zinc-500">
                Añade archivos <code className="text-cyan-400">.sql</code> o de migraciones al proyecto para visualizar el diagrama ERD.
              </p>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              fitView
              attributionPosition="bottom-left"
            >
              <Background color="#27272a" gap={20} size={1} />
              <Controls className="!border-zinc-700 !bg-zinc-900 !text-zinc-300" />
              <MiniMap
                nodeColor="#06b6d4"
                maskColor="rgba(0, 0, 0, 0.75)"
                className="!border-zinc-700 !bg-zinc-950"
              />
            </ReactFlow>
          )}
        </div>
      </div>

      {/* RIGHT: AI Audit Panel (30%) */}
      <div className="w-[380px] flex flex-col border-l border-zinc-800 bg-[#0a0a0a]">
        <div className="flex h-12 items-center justify-between border-b border-zinc-800 px-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-400" />
            <h2 className="font-semibold text-sm text-zinc-100">AI DB Architect Audit</h2>
          </div>
          {auditResult && (
            <Badge variant="outline" className={getScoreBadgeColor(auditResult.score)}>
              Score {auditResult.score}/100
            </Badge>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar text-xs">
          {!auditResult ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-zinc-500 p-4">
              <Brain className="mb-2 h-10 w-10 text-zinc-700" />
              <p className="text-xs">
                Presiona <strong className="text-zinc-300">Auditar Arquitectura</strong> para recibir un informe de riesgos, llaves sin índices y sugerencias DDL.
              </p>
            </div>
          ) : (
            <>
              {/* Summary */}
              <Card className="bg-zinc-900/80 border-zinc-800 text-zinc-200">
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-xs font-semibold text-cyan-400">Resumen Ejecutivo</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-1 text-xs text-zinc-300 leading-relaxed">
                  {auditResult.summary}
                </CardContent>
              </Card>

              {/* Alerts List */}
              {auditResult.alerts && auditResult.alerts.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-xs text-zinc-400 uppercase tracking-wider">
                    Alertas y Riesgos ({auditResult.alerts.length})
                  </h3>
                  {auditResult.alerts.map((alert: DBAuditAlert, idx: number) => (
                    <Card key={idx} className="bg-zinc-900/90 border-zinc-800 text-zinc-200">
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          {getSeverityIcon(alert.severity)}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-semibold text-zinc-100 text-xs truncate">
                                {alert.title}
                              </span>
                              <Badge variant="outline" className="border-zinc-700 bg-zinc-800 text-[10px] text-zinc-300 shrink-0">
                                {alert.table}
                              </Badge>
                            </div>
                            <p className="mt-1 text-zinc-400 text-[11px] leading-normal">
                              {alert.description}
                            </p>
                          </div>
                        </div>

                        {alert.migration_suggestion && (
                          <div className="mt-2 rounded bg-zinc-950 border border-zinc-800 p-2 font-mono text-[10px] text-cyan-300 relative group">
                            <div className="pr-6 overflow-x-auto whitespace-pre-wrap">
                              {alert.migration_suggestion}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => copyToClipboard(alert.migration_suggestion!, idx)}
                              className="absolute top-1 right-1 h-5 w-5 text-zinc-400 hover:text-white"
                            >
                              {copiedIndex === idx ? (
                                <Check className="h-3 w-3 text-emerald-400" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Recommendations */}
              {auditResult.recommendations && auditResult.recommendations.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-xs text-zinc-400 uppercase tracking-wider">
                    Recomendaciones
                  </h3>
                  <Card className="bg-zinc-900/80 border-zinc-800 text-zinc-300">
                    <CardContent className="p-3 space-y-1.5">
                      {auditResult.recommendations.map((rec: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-[11px]">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{rec}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
