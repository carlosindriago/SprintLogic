"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Wrench, Loader2 } from "lucide-react";
import {
  getCuratedModels,
  CuratedProvider,
  fetchToolModels,
  updateToolModel,
  deleteToolModel,
  ToolModelEntry,
} from "@/lib/api";

export default function ToolsSettingsSection() {
  const [toolModels, setToolModels] = useState<ToolModelEntry[]>([]);
  const [providers, setProviders] = useState<CuratedProvider[]>([]);
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tools, provs] = await Promise.all([
        fetchToolModels(),
        getCuratedModels(),
      ]);
      setToolModels(tools);
      setProviders(provs);
    } catch {
      toast.error("Failed to load tool models");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleOverride = async (toolName: string, providerId: string, modelId: string) => {
    setSaving(toolName);
    try {
      await updateToolModel(toolName, providerId, modelId);
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

  if (toolModels.length === 0) {
    return (
      <div className="flex flex-col gap-8 h-full">
        <div>
          <h2 className="text-2xl font-semibold text-white">Herramientas</h2>
          <p className="text-sm text-zinc-400 mt-1">
            No se encontraron herramientas registradas.
          </p>
        </div>
      </div>
    );
  }

  const defaultLabel = toolModels[0]
    ? `${toolModels[0].default_provider}/${toolModels[0].default_model}`
    : "global";

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
        {toolModels.map((tool) => {
          const currentValue = tool.is_overridden
            ? `${tool.provider_id}/${tool.model_name}`
            : "__default__";
          const isBusy = saving === tool.tool_name;

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

              <div className="w-72 shrink-0">
                <Select
                  value={currentValue}
                  onValueChange={(val) => {
                    if (!val) return;
                    if (val === "__default__") {
                      handleReset(tool.tool_name);
                    } else {
                      const [providerId, ...modelParts] = val.split("/");
                      handleOverride(tool.tool_name, providerId, modelParts.join("/"));
                    }
                  }}
                  disabled={isBusy}
                >
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-200 h-9 text-sm">
                    {isBusy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
                    ) : tool.is_overridden ? (
                      <span className="truncate">
                        <span className="text-blue-400">{tool.effective_provider}</span>
                        <span className="text-zinc-500 mx-1">/</span>
                        <span className="text-zinc-300">{tool.effective_model}</span>
                      </span>
                    ) : (
                      <span className="text-zinc-400 truncate">
                        Predeterminado ({tool.default_provider}/{tool.default_model})
                      </span>
                    )}
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200 max-h-[280px]">
                    <SelectItem
                      value="__default__"
                      className="cursor-pointer py-2 text-zinc-400"
                    >
                      Predeterminado ({tool.default_provider}/{tool.default_model})
                    </SelectItem>
                    {allModels.map((m) => {
                      const val = `${m.provider_id}/${m.id}`;
                      return (
                        <SelectItem
                          key={val}
                          value={val}
                          className="cursor-pointer py-2"
                        >
                          {m.name}{" "}
                          <span className="text-zinc-500 text-xs ml-1">
                            ({m.provider})
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
