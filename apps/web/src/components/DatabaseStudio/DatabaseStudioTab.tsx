import React, { useEffect, useState, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useProjectStore } from '@/store/projectStore';
import { useSettingsStore } from '@/store/settingsStore';
import {
  fetchProjectSchema,
  rescanProjectSchema,
  exportProjectSchemaSQL,
  exportProjectSchemaMarkdown,
  auditProjectSchema,
  SchemaIR,
  DBAuditResponse,
  DBAuditAlert,
} from '@/lib/api';
import { TableNode } from './TableNode';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  Plug,
  FileCode2,
  ChevronDown,
  Download,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import { toast } from 'sonner';

const nodeTypes = {
  tableNode: TableNode,
};

export default function DatabaseStudioTab() {
  const { projectId } = useProjectStore();
  const { configuredModels } = useSettingsStore();
  
  // Extract a human-readable model name
  const aiModel = configuredModels['default'] || configuredModels['chat'] || Object.values(configuredModels)[0] || 'IA Avanzada';

  const [schema, setSchema] = useState<SchemaIR | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('Intentando conectar a base de datos viva (Nivel 1)...');
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const [auditLoading, setAuditLoading] = useState<boolean>(false);
  const [auditResult, setAuditResult] = useState<DBAuditResponse | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const [extractionMode, setExtractionMode] = useState<'auto' | 'live' | 'static'>('auto');
  const [customDbUrl, setCustomDbUrl] = useState<string>('');

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const handleExport = async (type: 'sql' | 'markdown') => {
    try {
      const url = type === 'sql' 
        ? exportProjectSchemaSQL(projectId!) 
        : exportProjectSchemaMarkdown(projectId!);
        
      const response = await fetch(url, {
        headers: {
          'Accept-Language': useSettingsStore.getState().language,
        }
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = downloadUrl;
      
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `schema.${type === 'sql' ? 'sql' : 'md'}`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch && filenameMatch.length === 2) {
          filename = filenameMatch[1];
        }
      }
      a.download = filename;
      
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
      toast.success(`Esquema exportado exitosamente como ${type.toUpperCase()}`);
    } catch (err) {
      console.error(err);
      toast.error(`Error al exportar el esquema como ${type.toUpperCase()}`);
    }
  };

  const loadSchema = useCallback(
    async (overrideMode?: 'auto' | 'live' | 'static', overrideUrl?: string) => {
      if (!projectId) return;
      setLoading(true);
      setHasError(false);
      setErrorMessage('');
      setLoadingStatus('Intentando conectar a base de datos viva (Nivel 1)...');

      const modeToUse = overrideMode || extractionMode;
      const urlToUse = overrideUrl !== undefined ? overrideUrl : customDbUrl;

      const timer1 = setTimeout(() => {
        setLoadingStatus('Base de datos viva no detectada. Delegando al Agente IA...');
      }, 1500);

      const timer2 = setTimeout(() => {
        setLoadingStatus(`🧠 El modelo ${aiModel} está leyendo y estructurando tus migraciones. Esto requiere procesamiento profundo y puede tomar hasta un minuto. Dale tiempo para pensar...`);
      }, 3500);

      try {
        const data = await fetchProjectSchema(projectId, modeToUse, urlToUse);
        clearTimeout(timer1);
        clearTimeout(timer2);
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
        if (data.tables.length > 0) {
          toast.success(`Esquema cargado: ${data.tables.length} tablas (${data.orm_type})`);
        }
      } catch (err: any) {
        clearTimeout(timer1);
        clearTimeout(timer2);
        console.error('Failed to load database schema:', err);
        setHasError(true);
        setErrorMessage(err?.message || 'Error de conexión o timeout al inspeccionar el esquema.');
        toast.error(err?.message || 'Error al cargar el esquema de la base de datos');
      } finally {
        setLoading(false);
      }
    },
    [projectId, extractionMode, customDbUrl, setNodes, setEdges, configuredModels.default_model]
  );

  const handleRescan = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setHasError(false);
    
    const aiModel = configuredModels.default_model || 'IA';
    setLoadingStatus('Iniciando re-escaneo forzado...');
    
    const timer1 = setTimeout(() => {
      setLoadingStatus('Buscando base de datos viva (PostgreSQL, MySQL, SQLite, etc)...');
    }, 1000);
    const timer2 = setTimeout(() => {
      setLoadingStatus(`🧠 El modelo ${aiModel} está leyendo y estructurando tus migraciones. Esto requiere procesamiento profundo y puede tomar hasta un minuto. Dale tiempo para pensar...`);
    }, 3500);

    try {
      const data = await rescanProjectSchema(projectId, extractionMode, customDbUrl);
      clearTimeout(timer1);
      clearTimeout(timer2);
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
      if (data.tables.length > 0) {
        toast.success(`Esquema actualizado: ${data.tables.length} tablas (${data.orm_type})`);
      }
    } catch (err: any) {
      clearTimeout(timer1);
      clearTimeout(timer2);
      console.error('Failed to rescan database schema:', err);
      setHasError(true);
      setErrorMessage(err?.message || 'Error de conexión o timeout al re-escanear el esquema.');
      toast.error(err?.message || 'Error al re-escanear el esquema de la base de datos');
    } finally {
      setLoading(false);
    }
  }, [projectId, extractionMode, customDbUrl, setNodes, setEdges, configuredModels.default_model]);

  useEffect(() => {
    loadSchema();
  }, [loadSchema]);

  const handleRunAudit = async () => {
    if (!projectId) return;
    setAuditLoading(true);
    try {
      const res = await auditProjectSchema(projectId, schema || undefined, extractionMode, customDbUrl);
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

            {schema?.detected_framework && (
              <Badge
                variant="outline"
                className={`text-[10px] font-semibold uppercase tracking-wider ${
                  schema.detected_framework === 'laravel'
                    ? 'border-red-500/40 bg-red-500/10 text-red-400'
                    : schema.detected_framework === 'django'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                    : schema.detected_framework === 'prisma'
                    ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-400'
                    : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400'
                }`}
              >
                {schema.detected_framework}
              </Badge>
            )}

            {schema?.extraction_level && (
              <Badge
                variant="outline"
                className={`text-[10px] ${
                  schema.extraction_level === 'live'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                    : schema.extraction_level === 'orm'
                    ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                }`}
              >
                {schema.extraction_level === 'live'
                  ? 'Live DB'
                  : schema.extraction_level === 'orm'
                  ? 'Esquema inferido de código fuente (IA)'
                  : 'Static SQL'}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Extraction Mode Selector */}
            <div className="relative inline-flex items-center">
              <select
                value={extractionMode}
                onChange={(e) => {
                  const mode = e.target.value as 'auto' | 'live' | 'static';
                  setExtractionMode(mode);
                  loadSchema(mode);
                }}
                className="h-8 appearance-none rounded-md border border-zinc-700 bg-[#18181b] pl-3 pr-8 text-xs font-medium text-zinc-200 hover:bg-zinc-800 hover:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-500 cursor-pointer shadow-sm transition-colors"
              >
                <option value="auto" className="bg-[#18181b] text-zinc-200 py-1.5">
                  ⚡ Automático (Live + .env)
                </option>
                <option value="live" className="bg-[#18181b] text-zinc-200 py-1.5">
                  🔌 Conexión Directa (Live DB)
                </option>
                <option value="static" className="bg-[#18181b] text-zinc-200 py-1.5">
                  📄 Escaneo Estático (.sql)
                </option>
              </select>
              <ChevronDown className="absolute right-2.5 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={!schema?.tables.length}
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 h-8 gap-1.5 border border-zinc-700 bg-zinc-900 px-3 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                <Download className="h-3.5 w-3.5" />
                Exportar
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-zinc-900 border-zinc-800 text-zinc-200">
                <DropdownMenuItem
                  onClick={() => handleExport('sql')}
                  className="text-xs cursor-pointer focus:bg-zinc-800 focus:text-zinc-100"
                >
                  <Database className="mr-2 h-4 w-4 text-cyan-400" />
                  Exportar DDL (.sql)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleExport('markdown')}
                  className="text-xs cursor-pointer focus:bg-zinc-800 focus:text-zinc-100"
                >
                  <FileText className="mr-2 h-4 w-4 text-emerald-400" />
                  Exportar Doc (.md)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              size="sm"
              onClick={() => loadSchema()}
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
            <div className="flex h-full flex-col items-center justify-center p-6 text-center">
              <RefreshCw className="mb-3 h-8 w-8 animate-spin text-cyan-400" />
              <span className="font-medium text-sm text-zinc-200 animate-pulse">{loadingStatus}</span>
              <span className="mt-1.5 text-xs text-zinc-500">
                Evaluando la cadena de extracción (Nivel 1 ➔ Nivel 2 ➔ Nivel 3)
              </span>
            </div>
          ) : hasError ? (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center">
              <div className="rounded-full bg-red-500/10 p-4 border border-red-500/20 mb-4">
                <AlertTriangle className="h-10 w-10 text-red-400" />
              </div>
              <h3 className="text-base font-semibold text-zinc-200">Error al inspeccionar el esquema</h3>
              <p className="mt-1 max-w-md text-xs text-zinc-400 leading-relaxed">
                {errorMessage}
              </p>

              <div className="mt-5 flex items-center gap-3">
                <Button
                  size="sm"
                  onClick={() => loadSchema()}
                  className="h-8 gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 border border-zinc-700"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Reintentar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setExtractionMode('static');
                    loadSchema('static');
                  }}
                  className="h-8 gap-1.5 border-zinc-700 bg-zinc-900 text-xs text-cyan-400 hover:bg-zinc-800"
                >
                  <FileCode2 className="h-3.5 w-3.5" />
                  Escaneo Estático (.sql)
                </Button>
              </div>
            </div>
          ) : !schema?.tables.length ? (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center">
              <div className="rounded-full bg-zinc-900/80 p-4 border border-zinc-800 mb-4">
                <Plug className="h-10 w-10 text-cyan-400" />
              </div>
              <h3 className="text-base font-semibold text-zinc-200">No se detectó una conexión activa</h3>
              <p className="mt-1 max-w-md text-xs text-zinc-400 leading-relaxed">
                No se encontraron tablas mediante conexión automática (<code className="text-cyan-400">.env</code>) ni archivos <code className="text-cyan-400">.sql</code>. Ingresá tu <strong>Database URL</strong> para inspeccionar en vivo o seleccioná escaneo estático.
              </p>

              <div className="mt-5 w-full max-w-md space-y-3 bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 text-left shadow-xl">
                <div>
                  <label className="text-[11px] font-medium text-zinc-300 block mb-1">
                    Database Connection String (URL)
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      placeholder="postgresql://user:pass@localhost:5432/dbname"
                      value={customDbUrl}
                      onChange={(e) => setCustomDbUrl(e.target.value)}
                      className="h-9 bg-zinc-950 border-zinc-700 text-xs text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-cyan-500"
                    />
                    <Button
                      size="sm"
                      onClick={() => loadSchema('live', customDbUrl)}
                      disabled={loading || !customDbUrl.trim()}
                      className="h-9 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium shrink-0 px-3"
                    >
                      {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : 'Conectar'}
                    </Button>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                  <span className="text-[11px] text-zinc-500">¿Tenés archivos .sql?</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setExtractionMode('static');
                      loadSchema('static');
                    }}
                    className="h-7 text-xs text-cyan-400 hover:text-cyan-300 hover:bg-zinc-800/60 p-0 px-2"
                  >
                    <FileCode2 className="h-3.5 w-3.5 mr-1" />
                    Escaneo Estático (.sql)
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {!loading && !hasError && schema?.is_outdated && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-2 text-sm text-amber-200 shadow-xl backdrop-blur-md">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                  <span>El esquema del proyecto ha cambiado. El diagrama actual puede estar desactualizado.</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRescan}
                    className="h-7 gap-1.5 border-amber-500/30 bg-amber-500/10 text-xs text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 ml-2"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Actualizar ahora
                  </Button>
                </div>
              )}
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
            </>
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
          <div className="flex items-center gap-2">
            {auditResult && (
              <>
                <Badge variant="outline" className={getScoreBadgeColor(auditResult.score)}>
                  Score {auditResult.score}/100
                </Badge>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 text-zinc-400 hover:text-cyan-400"
                  onClick={() => handleExport('markdown')}
                  title="Descargar Reporte (.md)"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
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
