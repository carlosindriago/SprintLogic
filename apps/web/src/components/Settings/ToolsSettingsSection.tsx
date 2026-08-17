"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Wrench, Loader2 } from "lucide-react";
import {
  getCuratedModels,
  CuratedProvider,
  fetchToolModels,
  updateToolModel,
  deleteToolModel,
  ToolModelEntry,
  GlobalDefaultEntry,
  fetchModelHealthMetrics,
  ModelHealthMetric,
} from "@/lib/api";
import { ModelHealthBadge } from "@/components/ModelHealthBadge";
import { ModelSearchableSelect, ModelOption } from "@/components/ModelSearchableSelect";

export default function ToolsSettingsSection() {
  const [toolModels, setToolModels] = useState<ToolModelEntry[]>([]);
  const [providers, setProviders] = useState<CuratedProvider[]>([]);
  const [healthMetrics, setHealthMetrics] = useState<Record<string, ModelHealthMetric>>({});
  const [globalDefault, setGlobalDefault] = useState<GlobalDefaultEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const allModels = useMemo(
    () =>
      providers.flatMap((p) =>
        p.models.map((m) => ({
          id: m.id,
          name: m.name,
          provider: p.provider,
          provider_id: p.provider_id,
        }))
      ),
    [providers]
  );

  const getMetricForModel = (providerId?: string | null, modelId?: string | null) => {
    if (!modelId) return null;
    return (
      healthMetrics[modelId] ||
      healthMetrics[`${providerId}/${modelId}`] ||
      healthMetrics[modelId.replace(/^[^\/]+\//, "")] ||
      null
    );
  };

  useEffect(() => {
    let cancelled = false;
    const doLoad = async () => {
      setLoading(true);
      try {
        const [data, provs, health] = await Promise.all([
          fetchToolModels(),
          getCuratedModels(),
          fetchModelHealthMetrics().catch(() => [] as ModelHealthMetric[]),
        ]);
        if (cancelled) return;
        setToolModels(data.tools ?? []);
        setGlobalDefault(data.global_default ?? null);
        setProviders(provs);

        const hMap: Record<string, ModelHealthMetric> = {};
        for (const h of health) {
          hMap[h.model_id] = h;
          if (h.provider) {
            hMap[`${h.provider}/${h.model_id}`] = h;
          }
        }
        setHealthMetrics(hMap);
      } catch {
        toast.error("Failed to load tool models");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    doLoad();
    return () => { cancelled = true; };
  }, []);

  const handleOverride = async (toolName: string, providerId: string, modelId: string) => {
    setSaving(toolName);
    try {
      await updateToolModel(toolName, providerId, modelId, toolName === "__default__" ? globalDefault?.fallback_models || null : undefined);
      if (toolName === "__default__") {
        setGlobalDefault({
          provider: providerId,
          model: modelId,
          fallback_models: globalDefault?.fallback_models || null,
          is_overridden: true,
        });
        // Refresh all tools since their effective model might change
        const data = await fetchToolModels();
        setToolModels(data.tools);
      } else {
        setToolModels((prev) =>
          prev.map((t) =>
            t.tool_name === toolName
              ? {
                  ...t,
                  provider_id: providerId,
                  model_name: modelId,
                  is_overridden: true,
                  effective_provider: providerId,
                  effective_model: modelId,
                }
              : t
          )
        );
      }
      toast.success(`${toolName}: model updated`);
    } catch {
      toast.error(`Failed to update model for ${toolName}`);
    } finally {
      setSaving(null);
    }
  };

  const handleReset = async (toolName: string) => {
    setSaving(toolName);
    try {
      await deleteToolModel(toolName);
      if (toolName === "__default__") {
        setGlobalDefault((prev) =>
          prev
            ? {
                ...prev,
                is_overridden: false,
                provider: toolModels[0]?.default_provider || prev.provider,
                model: toolModels[0]?.default_model || prev.model,
              }
            : null
        );
        // Refresh all tools
        const data = await fetchToolModels();
        setToolModels(data.tools);
        if (data.global_default) setGlobalDefault(data.global_default);
      } else {
        setToolModels((prev) =>
          prev.map((t) =>
            t.tool_name === toolName
              ? {
                  ...t,
                  provider_id: null,
                  model_name: null,
                  is_overridden: false,
                  effective_provider: t.default_provider,
                  effective_model: t.default_model,
                }
              : t
          )
        );
      }
      toast.success(`${toolName}: reset to default`);
    } catch {
      toast.error(`Failed to reset model for ${toolName}`);
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-8 h-full">
        <div>
          <h2 className="text-2xl font-semibold text-white">Herramientas</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Configura las herramientas del sistema y sus modelos específicos (Overrides).
          </p>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-[72px] bg-zinc-900 animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!toolModels || toolModels.length === 0) {
    return (
      <div className="flex flex-col gap-8 h-full">
        <div>
          <h2 className="text-2xl font-semibold text-white">Herramientas</h2>
          <p className="text-sm text-zinc-400 mt-1">
            No se encontraron herramientas registradas. Verifica que el backend este corriendo.
          </p>
        </div>
      </div>
    );
  }

  const defaultLabel = globalDefault
    ? `${globalDefault.provider}/${globalDefault.model}`
    : "global";

  const isDefaultBusy = saving === "__default__";

  return (
    <div className="flex flex-col gap-8 h-full">
      <div>
        <h2 className="text-2xl font-semibold text-white">Herramientas</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Configura las herramientas del sistema y sus modelos específicos (Overrides).
          Por defecto todas usan{" "}
          <span className="font-mono text-blue-400">{defaultLabel}</span>.
        </p>
      </div>

      <div className="space-y-3 flex-1 overflow-y-auto pr-2 pb-8">
        {/* Global Default Card */}
        {globalDefault && (
          <div className="p-4 bg-zinc-900 border border-blue-500/20 rounded-lg flex justify-between items-start gap-6">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="p-2 bg-blue-500/10 rounded-md shrink-0 mt-0.5">
                <Wrench className="w-5 h-5 text-blue-400" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-white">
                    Modelo Global por Defecto
                  </h3>
                  <ModelHealthBadge metric={getMetricForModel(globalDefault.provider, globalDefault.model)} />
                  {globalDefault.is_overridden && (
                    <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400 bg-blue-500/10 shrink-0">
                      personalizado
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Este modelo se usa en todas las herramientas que no tienen un override especifico.
                  {!globalDefault.is_overridden && (
                    <span className="text-zinc-500 ml-1">
                      (proviene de la variable de entorno <code className="text-zinc-400 bg-zinc-800 px-1 rounded">DEFAULT_LLM_MODEL</code>)
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="w-80 md:w-96 shrink-0">
              <ModelSearchableSelect
                value={globalDefault.is_overridden ? `${globalDefault.provider}/${globalDefault.model}` : "__default__"}
                onChange={(val) => {
                  if (!val) return;
                  if (val === "__default__") {
                    handleReset("__default__");
                  } else {
                    const [providerId, ...modelParts] = val.split("/");
                    handleOverride("__default__", providerId, modelParts.join("/"));
                  }
                }}
                models={allModels}
                healthMetrics={healthMetrics}
                allowDefault={globalDefault.is_overridden}
                defaultLabel={`Usar DEFAULT_LLM_MODEL (${toolModels[0]?.default_model || "env"})`}
                disabled={isDefaultBusy}
                popoverWidthClass="w-[520px]"
              />
            </div>
          </div>
        )}

        {/* Tool Cards */}
        {toolModels.map((tool) => {
          const currentValue = tool.is_overridden
            ? `${tool.provider_id}/${tool.model_name}`
            : "__default__";
          const isBusy = saving === tool.tool_name;
          const currentMetric = getMetricForModel(tool.effective_provider, tool.effective_model);

          return (
            <div
              key={tool.tool_name}
              className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg flex justify-between items-start gap-6"
            >
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="p-2 bg-zinc-800 rounded-md shrink-0 mt-0.5">
                  <Wrench className="w-5 h-5 text-zinc-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-white">
                      {tool.display_name}
                    </h3>
                    <ModelHealthBadge metric={currentMetric} />
                    {tool.is_overridden && (
                      <Badge
                        variant="outline"
                        className="text-[10px] border-blue-500/30 text-blue-400 bg-blue-500/10 shrink-0"
                      >
                        personalizado
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">{tool.description}</p>
                </div>
              </div>

              <div className="w-80 md:w-96 shrink-0">
                <ModelSearchableSelect
                  value={currentValue}
                  onChange={(val) => {
                    if (!val) return;
                    if (val === "__default__") {
                      handleReset(tool.tool_name);
                    } else {
                      const [providerId, ...modelParts] = val.split("/");
                      handleOverride(tool.tool_name, providerId, modelParts.join("/"));
                    }
                  }}
                  models={allModels}
                  healthMetrics={healthMetrics}
                  allowDefault={true}
                  defaultLabel={`Default (${tool.default_provider}/${tool.default_model})`}
                  disabled={isBusy}
                  popoverWidthClass="w-[520px]"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
