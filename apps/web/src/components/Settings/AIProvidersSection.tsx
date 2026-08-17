"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Plus,
  FlaskConical,
  Loader2,
  CheckCircle2,
  XCircle,
  Wand2,
  Activity,
  Zap,
  Square,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFimStore } from "@/store/fimStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useLLMConfigStore } from "@/store/llmConfigStore";
import {
  getCuratedModels,
  verifyAndSaveProviderKey,
  fetchToolModels,
  updateToolModel,
  deleteToolModel,
  fetchModelHealthMetrics,
  diagnoseModelsStream,
  type CuratedProvider,
  type GlobalDefaultEntry,
  type ModelHealthMetric,
} from "@/lib/api";
import { ModelSearchableSelect, type ModelOption } from "@/components/ModelSearchableSelect";
import { ModelHealthBadge } from "@/components/ModelHealthBadge";
import { toast } from "sonner";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface NativePreset {
  id: string;
  name: string;
  icon: string;
  color: string;
  keyLabel: string;
  keyPlaceholder: string;
  defaultModels: string[];
  isFimProvider?: boolean;
  description?: string;
}

interface CustomProvider {
  id: number;
  name: string;
  protocol: string;
  baseUrl: string;
  modelSlug: string;
}

// ─────────────────────────────────────────────
// Preset definitions
// ─────────────────────────────────────────────

const NATIVE_PRESETS: NativePreset[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    icon: "✦",
    color: "text-blue-400",
    keyLabel: "GEMINI_API_KEY",
    keyPlaceholder: "AIza...",
    defaultModels: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.5-pro"],
  },
  {
    id: "openai",
    name: "OpenAI",
    icon: "⬡",
    color: "text-emerald-400",
    keyLabel: "OPENAI_API_KEY",
    keyPlaceholder: "sk-...",
    defaultModels: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1-mini"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    icon: "◆",
    color: "text-orange-400",
    keyLabel: "ANTHROPIC_API_KEY",
    keyPlaceholder: "sk-ant-...",
    defaultModels: [
      "claude-3-5-sonnet-20241022",
      "claude-3-haiku-20240307",
      "claude-3-opus-20240229",
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    icon: "⇄",
    color: "text-purple-400",
    keyLabel: "OPENROUTER_API_KEY",
    keyPlaceholder: "sk-or-...",
    defaultModels: [
      "openai/gpt-4o",
      "anthropic/claude-3-5-sonnet",
      "google/gemini-pro",
    ],
  },
  {
    id: "github",
    name: "GitHub Copilot / Models",
    icon: "🐙",
    color: "text-purple-300",
    keyLabel: "GitHub Personal Access Token (PAT)",
    keyPlaceholder: "ghp_... o github_pat_...",
    defaultModels: [
      "github/gpt-4o",
      "github/gpt-4o-mini",
      "github/o1-preview",
      "github/o1-mini",
      "github/o3-mini",
      "github/Meta-Llama-3.1-70B-Instruct",
      "github/Mistral-Large-2407",
      "github/Phi-3.5-MoE-instruct",
    ],
    description:
      "Catálogo oficial de GitHub Models para desarrolladores (Copilot Engine). Accede a GPT-4o, o1, Llama 3.1 y Mistral con tu GitHub Personal Access Token (PAT).",
  },
  {
    id: "opencode-zen",
    name: "OpenCode Zen",
    icon: "⌥",
    color: "text-cyan-400",
    keyLabel: "OPENCODE_ZEN_API_KEY",
    keyPlaceholder: "oc-zen-...",
    defaultModels: ["gpt-4o", "claude-3-5-sonnet"],
  },
  {
    id: "opencode-go",
    name: "OpenCode Go",
    icon: "⌥",
    color: "text-cyan-500",
    keyLabel: "OPENCODE_GO_API_KEY",
    keyPlaceholder: "sk-...",
    defaultModels: ["deepseek-v4-flash", "llama-3-1-8b"],
  },
  {
    id: "ollama",
    name: "Ollama Local",
    icon: "⬤",
    color: "text-zinc-300",
    keyLabel: "Base URL",
    keyPlaceholder: "http://localhost:11434",
    defaultModels: [
      "llama3.2:1b",
      "llama3:8b",
      "mistral",
      "phi3",
      "qwen2.5-coder:7b",
      "deepseek-coder",
    ],
    description: "Para Ollama local ingresá la Base URL en lugar de una API Key.",
  },
  {
    id: "ollama_cloud",
    name: "Ollama Cloud",
    icon: "☁",
    color: "text-sky-300",
    keyLabel: "OLLAMA_API_KEY",
    keyPlaceholder: "ollama-...",
    defaultModels: ["gpt-oss:120b-cloud"],
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    icon: "🟩",
    color: "text-green-500",
    keyLabel: "NVIDIA_API_KEY",
    keyPlaceholder: "nvapi-...",
    defaultModels: ["meta/llama3-70b-instruct", "meta/llama3-8b-instruct"],
  },
  {
    id: "groq",
    name: "Groq (FIM / Autocompletado)",
    icon: "⚡",
    color: "text-yellow-400",
    keyLabel: "GROQ_API_KEY",
    keyPlaceholder: "gsk_...",
    defaultModels: ["llama-3.1-8b-instant", "gemma2-9b-it", "qwen-2.5-coder-32b"],
    isFimProvider: true,
    description:
      "Potencia el Autocompletado Predictivo (FIM). Groq ofrece inferencia de ultra-baja latencia, ideal para sugerencias en tiempo real.",
  },
  {
    id: "zai",
    name: "Z.AI (GLM)",
    icon: "🧠",
    color: "text-rose-400",
    keyLabel: "ZAI_API_KEY",
    keyPlaceholder: "Bearer token o API Key...",
    defaultModels: ["glm-5.2", "glm-4-plus", "glm-4-air", "glm-4-flash"],
    description:
      "Modelos GLM oficiales de Z.AI / Zhipu AI para chat y razonamiento avanzado.",
  },
  {
    id: "cerebras",
    name: "Cerebras AI",
    icon: "⚡",
    color: "text-amber-400",
    keyLabel: "CEREBRAS_API_KEY",
    keyPlaceholder: "csk-...",
    defaultModels: [
      "llama-3.3-70b",
      "llama-3.1-70b",
      "llama-3.1-8b",
      "deepseek-r1-distill-llama-70b",
    ],
    description:
      "Inferencia de velocidad extrema basada en Wafer-Scale Engine para Llama y DeepSeek R1.",
  },
];

// ─────────────────────────────────────────────
// PresetCard
// ─────────────────────────────────────────────

interface PresetCardProps {
  preset: NativePreset;
  configuredModelId: string | undefined;
  backendProviderData: CuratedProvider | undefined;
  healthMetrics?: Record<string, ModelHealthMetric>;
  onModelConfigured: (presetId: string, modelId: string) => void;
  onRefreshCurated: () => void;
}

function PresetCard({
  preset,
  configuredModelId,
  backendProviderData,
  healthMetrics = {},
  onModelConfigured,
  onRefreshCurated,
}: PresetCardProps) {
  const isConfigured = backendProviderData?.is_configured ?? false;
  
  const [keyValue, setKeyValue] = useState("");
  const [visible, setVisible] = useState(false);
  const [selectedModel, setSelectedModel] = useState(configuredModelId || preset.defaultModels[0]);
  const [expanded, setExpanded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fetchStatus, setFetchStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");

  // FIM store (only used when isFimProvider)
  const fimEnabled = useFimStore((s) => s.fimEnabled);
  const setFimEnabled = useFimStore((s) => s.setFimEnabled);
  const fimModel = useFimStore((s) => s.fimModel);
  const setFimModel = useFimStore((s) => s.setFimModel);
  const setGroqApiKey = useFimStore((s) => s.setGroqApiKey);

  const setStoreApiKey = useLLMConfigStore((s) => s.setApiKey);

  // Sync selected model down from props if changed externally
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (configuredModelId) setSelectedModel(configuredModelId);
  }, [configuredModelId]);

  const masked = "•".repeat(16);
  
  const backendModels = backendProviderData?.models || [];
  const presetModelOptions: ModelOption[] = useMemo(() => {
    if (backendModels.length > 0) {
      return backendModels.map((m) => ({
        id: m.id,
        name: m.name || m.id,
        provider: preset.name,
        provider_id: preset.id,
      }));
    }
    return preset.defaultModels.map((mId) => ({
      id: mId,
      name: mId,
      provider: preset.name,
      provider_id: preset.id,
    }));
  }, [backendModels, preset.defaultModels, preset.name, preset.id]);

  const handleFetchModels = useCallback(async () => {
    if (!keyValue) return;
    setFetchStatus("loading");
    try {
      // Sends to backend to verify and save in the Keyring OS!
      const fetched = await verifyAndSaveProviderKey(preset.id, keyValue);
      if (fetched.length > 0) {
        setFetchStatus("ok");
        setStoreApiKey(preset.id, keyValue);
        onRefreshCurated(); // Refreshes the top-level state
        const firstId = fetched[0].id;
        setSelectedModel(firstId);
        if (preset.isFimProvider) setFimModel(firstId);
      }
    } catch {
      setFetchStatus("error");
    }
  }, [preset.id, keyValue, setFimModel, preset.isFimProvider, onRefreshCurated, setStoreApiKey]);

  const handleSave = async () => {
    if (keyValue) {
      await handleFetchModels();
      setStoreApiKey(preset.id, keyValue);
    }
    if (preset.isFimProvider && keyValue) {
      setGroqApiKey(keyValue);
      setFimModel(selectedModel);
    }
    onModelConfigured(preset.id, selectedModel);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const activeModel = preset.isFimProvider ? fimModel || selectedModel : selectedModel;

  return (
    <div className="border border-zinc-800 rounded-xl bg-zinc-900 overflow-hidden transition-colors">
      {/* Header row */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-800/40 select-none"
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{preset.icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-zinc-100">{preset.name}</span>
              {isConfigured ? (
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-2.5 h-2.5" /> Configurado
                </span>
              ) : (
                <span className="text-[10px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded-full font-medium">
                  Sin configurar
                </span>
              )}
            </div>
            {preset.description && (
              <p className="text-xs text-zinc-500 mt-0.5">{preset.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Active model pill when collapsed */}
          {!expanded && (
            <span className="text-xs font-mono text-zinc-400 bg-zinc-950 px-2 py-1 rounded border border-zinc-800 hidden sm:inline">
              {activeModel}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-zinc-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-400" />
          )}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-zinc-800/60 space-y-4">
          {/* FIM toggle if applicable */}
          {preset.isFimProvider && (
            <div className="flex items-center justify-between py-2 border-b border-zinc-800/40">
              <div>
                <Label className="text-xs font-medium text-zinc-200">
                  Autocompletado de Código (FIM)
                </Label>
                <p className="text-[11px] text-zinc-500">
                  Usa este proveedor para sugerencias ultra-rápidas en el editor (Ghost Text).
                </p>
              </div>
              <Switch
                checked={fimEnabled}
                onCheckedChange={setFimEnabled}
              />
            </div>
          )}

          {/* Key input */}
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">{preset.keyLabel}</Label>
            <div className="relative flex items-center">
              <Input
                type={visible ? "text" : "password"}
                placeholder={isConfigured ? masked : preset.keyPlaceholder}
                value={keyValue}
                onChange={(e) => setKeyValue(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-200 text-xs pr-20 font-mono"
              />
              <div className="absolute right-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setVisible((p) => !p)}
                  className="text-zinc-500 hover:text-zinc-300 p-1"
                >
                  {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Model selection with Searchable Wide Select */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-zinc-400">Modelo Activo</Label>
              <button
                type="button"
                onClick={handleFetchModels}
                disabled={fetchStatus === "loading" || !keyValue}
                className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {fetchStatus === "loading" ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : fetchStatus === "ok" ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                ) : fetchStatus === "error" ? (
                  <XCircle className="w-3 h-3 text-red-400" />
                ) : null}
                {fetchStatus === "loading"
                  ? "Verificando..."
                  : fetchStatus === "ok"
                  ? `${backendModels.length} modelos`
                  : "Verificar Key"}
              </button>
            </div>

            <ModelSearchableSelect
              value={activeModel}
              onChange={(v) => {
                if (!v) return;
                const mId = v.includes("/") ? v.split("/").slice(1).join("/") : v;
                setSelectedModel(mId);
                if (preset.isFimProvider) setFimModel(mId);
                onModelConfigured(preset.id, mId);
              }}
              models={presetModelOptions}
              healthMetrics={healthMetrics}
              placeholder="Selecciona un modelo..."
              popoverWidthClass="w-[480px]"
            />
          </div>

          {/* Save */}
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              onClick={handleSave}
              className="bg-blue-600 hover:bg-blue-700 text-white border-transparent text-xs"
            >
              {saved ? "✓ Guardado" : "Guardar Cambios"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

export default function AIProvidersSection() {
  const { configuredModels, setConfiguredModel } = useSettingsStore();

  const [curatedProviders, setCuratedProviders] = useState<CuratedProvider[]>([]);
  const [globalDefault, setGlobalDefault] = useState<GlobalDefaultEntry | null>(null);
  const [globalDefaultSaving, setGlobalDefaultSaving] = useState(false);
  const [healthMetrics, setHealthMetrics] = useState<Record<string, ModelHealthMetric>>({});
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customProviders, setCustomProviders] = useState<CustomProvider[]>([]);
  const [customTestStatus, setCustomTestStatus] = useState<
    "idle" | "testing" | "success" | "error"
  >("idle");
  const [form, setForm] = useState({
    name: "",
    protocol: "openai",
    baseUrl: "",
    apiKey: "",
    modelSlug: "",
  });

  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosticScope, setDiagnosticScope] = useState<string>("active");
  const [diagnosticProgress, setDiagnosticProgress] = useState<{
    tested: number;
    total: number;
    healthy: number;
    degraded: number;
    failing: number;
  } | null>(null);
  const [isRefreshingCatalog, setIsRefreshingCatalog] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleRefreshModelCatalog = async () => {
    setIsRefreshingCatalog(true);
    try {
      const [provs, data] = await Promise.all([
        getCuratedModels(true),
        fetchToolModels(),
      ]);
      setCuratedProviders(provs);
      setGlobalDefault(data.global_default ?? null);
      const totalModels = provs.reduce((acc, p) => acc + (p.models?.length || 0), 0);
      toast.success(`Catálogo sincronizado (${totalModels} modelos disponibles)`);
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast.error(`Error al sincronizar modelos: ${err?.message || String(e)}`);
    } finally {
      setIsRefreshingCatalog(false);
    }
  };

  const allModels: ModelOption[] = useMemo(
    () =>
      curatedProviders.flatMap((p) =>
        p.models.map((m) => ({
          id: m.id,
          name: m.name,
          provider: p.provider,
          provider_id: p.provider_id,
        }))
      ),
    [curatedProviders]
  );

  const configuredProviders = useMemo(
    () => curatedProviders.filter((p) => p.is_configured),
    [curatedProviders]
  );

  const configuredModelOptions: ModelOption[] = useMemo(
    () =>
      configuredProviders.flatMap((p) =>
        p.models.map((m) => ({
          id: m.id,
          name: m.name,
          provider: p.provider,
          provider_id: p.provider_id,
        }))
      ),
    [configuredProviders]
  );

  const loadBackendProviders = useCallback(async () => {
    try {
      const [data, provs, health] = await Promise.all([
        fetchToolModels(),
        getCuratedModels(),
        fetchModelHealthMetrics().catch(() => [] as ModelHealthMetric[]),
      ]);
      setGlobalDefault(data.global_default ?? null);
      setCuratedProviders(provs);

      const hMap: Record<string, ModelHealthMetric> = {};
      for (const h of health) {
        hMap[h.model_id] = h;
        if (h.provider) hMap[`${h.provider}/${h.model_id}`] = h;
      }
      setHealthMetrics(hMap);
    } catch (e) {
      console.error("Failed to load providers or global default", e);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBackendProviders();
  }, [loadBackendProviders]);

  const handleTestCustom = async () => {
    setCustomTestStatus("testing");
    try {
      await new Promise((res) => setTimeout(res, 1200));
      setCustomTestStatus("success");
    } catch {
      setCustomTestStatus("error");
    }
  };

  const handleSaveCustom = () => {
    if (!form.name || !form.baseUrl || !form.modelSlug) return;
    setCustomProviders((prev) => [...prev, { id: Date.now(), ...form }]);
    setForm({ name: "", protocol: "openai", baseUrl: "", apiKey: "", modelSlug: "" });
    setCustomTestStatus("idle");
    setShowCustomForm(false);
  };

  const handleGlobalDefaultChange = async (val: string) => {
    if (!val) return;
    setGlobalDefaultSaving(true);
    try {
      if (val === "__default__") {
        await deleteToolModel("__default__");
        const data = await fetchToolModels();
        setGlobalDefault(data.global_default ?? null);
        toast.success("Restablecido al DEFAULT_LLM_MODEL del entorno");
      } else {
        const [providerId, ...modelParts] = val.split("/");
        const modelName = modelParts.join("/");
        await updateToolModel("__default__", providerId, modelName, globalDefault?.fallback_models || null);
        setGlobalDefault({ provider: providerId, model: modelName, fallback_models: globalDefault?.fallback_models || null, is_overridden: true });
        toast.success("Modelo global por defecto actualizado");
      }
    } catch {
      toast.error("Error al actualizar el modelo global por defecto");
    } finally {
      setGlobalDefaultSaving(false);
    }
  };

  const handleFallbackChange = async (index: number, val: string) => {
    if (!globalDefault) return;
    setGlobalDefaultSaving(true);
    try {
      const currentFallbacks = [...(globalDefault.fallback_models || [])];
      
      if (val === "__none__") {
        currentFallbacks.splice(index, 1);
      } else {
        currentFallbacks[index] = val;
      }
      
      const newFallbacks = currentFallbacks.length > 0 ? currentFallbacks : null;
      
      if (globalDefault.is_overridden) {
        await updateToolModel("__default__", globalDefault.provider, globalDefault.model, newFallbacks);
      } else {
        const [defaultProvider, ...defaultModelParts] = defaultLabel.split("/");
        const defaultModel = defaultModelParts.join("/");
        await updateToolModel("__default__", defaultProvider, defaultModel, newFallbacks);
      }
      
      setGlobalDefault({ 
        provider: globalDefault.is_overridden ? globalDefault.provider : defaultLabel.split("/")[0], 
        model: globalDefault.is_overridden ? globalDefault.model : defaultLabel.split("/").slice(1).join("/"), 
        fallback_models: newFallbacks, 
        is_overridden: true 
      });
      toast.success("Fallbacks actualizados");
    } catch {
      toast.error("Error al actualizar fallbacks");
    } finally {
      setGlobalDefaultSaving(false);
    }
  };

  const defaultLabel = globalDefault
    ? `${globalDefault.provider}/${globalDefault.model}`
    : "DEFAULT_LLM_MODEL";

  const handleRunDiagnostic = async () => {
    let targets: ModelOption[] = [];

    if (diagnosticScope === "active") {
      if (globalDefault) {
        if (globalDefault.model) {
          const mName = globalDefault.model;
          const pName = globalDefault.provider || mName.split("/")[0] || "";
          const found = allModels.find(
            (m) =>
              m.id === mName ||
              m.id === mName.split("/").slice(1).join("/") ||
              `${m.provider_id}/${m.id}` === mName
          );
          if (found) {
            targets.push(found);
          } else {
            targets.push({
              id: mName.includes("/") ? mName.split("/").slice(1).join("/") : mName,
              name: mName,
              provider: pName,
              provider_id: pName,
            });
          }
        }
        if (globalDefault.fallback_models) {
          globalDefault.fallback_models.forEach((f) => {
            if (!f || f === "__none__") return;
            const pName = f.includes("/") ? f.split("/")[0] : "";
            const mId = f.includes("/") ? f.split("/").slice(1).join("/") : f;
            const found = allModels.find(
              (m) => m.id === f || m.id === mId || `${m.provider_id}/${m.id}` === f
            );
            if (found) {
              if (!targets.some((t) => t.id === found.id && t.provider_id === found.provider_id)) {
                targets.push(found);
              }
            } else {
              targets.push({
                id: mId,
                name: f,
                provider: pName,
                provider_id: pName,
              });
            }
          });
        }
      }
      if (targets.length === 0 && allModels.length > 0) {
        targets = allModels.slice(0, 5);
      }
    } else if (diagnosticScope.startsWith("provider:")) {
      const provId = diagnosticScope.replace("provider:", "");
      targets = configuredModelOptions.filter((m) => m.provider_id === provId || m.provider === provId);
    } else {
      targets = configuredModelOptions;
    }

    if (targets.length === 0) {
      toast.error("No hay modelos disponibles para el alcance seleccionado");
      return;
    }

    setIsDiagnosing(true);
    setDiagnosticProgress({
      tested: 0,
      total: targets.length,
      healthy: 0,
      degraded: 0,
      failing: 0,
    });

    const ac = new AbortController();
    abortControllerRef.current = ac;

    try {
      await diagnoseModelsStream(
        targets,
        (evt) => {
          setDiagnosticProgress({
            tested: evt.tested,
            total: evt.total,
            healthy: evt.healthy,
            degraded: evt.degraded,
            failing: evt.failing,
          });

          if (evt.result) {
            const res = evt.result;
            setHealthMetrics((prev) => {
              const updated = { ...prev };
              const metricItem: ModelHealthMetric = {
                model_id: res.model_id,
                provider: res.provider,
                total_calls: 1,
                success_calls: res.success ? 1 : 0,
                failed_calls: res.success ? 0 : 1,
                timeout_calls: res.error && res.error.toLowerCase().includes("timeout") ? 1 : 0,
                success_rate: res.success ? 100.0 : 0.0,
                avg_latency_ms: res.latency_ms,
                last_latency_ms: res.latency_ms,
                last_error: res.error,
                status: res.status,
                last_called_at: new Date().toISOString(),
              };
              updated[res.model_id] = metricItem;
              updated[`${res.provider}/${res.model_id}`] = metricItem;
              return updated;
            });
          }
        },
        ac.signal,
        3,
        6
      );
      toast.success("Diagnóstico de modelos completado");
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      if (err?.name !== "AbortError") {
        toast.error(`Error durante el diagnóstico: ${err?.message || String(e)}`);
      }
    } finally {
      setIsDiagnosing(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelDiagnostic = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsDiagnosing(false);
      toast.info("Diagnóstico cancelado por el usuario");
    }
  };

  return (
    <div className="flex flex-col gap-8 h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-white">Modelos & LLMs</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Gestiona proveedores oficiales, endpoints personalizados y el modelo predeterminado global con telemetría en tiempo real.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRefreshModelCatalog}
          disabled={isRefreshingCatalog || isDiagnosing}
          className="border-zinc-800 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 text-xs flex items-center gap-2 h-9 px-3.5 shrink-0 shadow-sm"
        >
          <RotateCcw
            className={cn("w-3.5 h-3.5", isRefreshingCatalog && "animate-spin text-blue-400")}
          />
          <span>{isRefreshingCatalog ? "Sincronizando..." : "Sincronizar Modelos"}</span>
        </Button>
      </div>

      <div className="space-y-8 flex-1 overflow-y-auto pr-1 pb-8">
        {/* ── DIAGNOSTIC SUITE BANNER ── */}
        <section className="p-4 bg-gradient-to-r from-zinc-900 via-zinc-900/95 to-blue-950/30 border border-zinc-800 rounded-xl space-y-3 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 shrink-0">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  Diagnóstico de Salud & Latencia en Vivo
                </h3>
                <p className="text-xs text-zinc-400">
                  Ejecuta pings ultra-ligeros (1 token) en lotes controlados para medir latencia y salud sin saturar APIs.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Scope Selector: only configured providers */}
              <select
                value={diagnosticScope}
                onChange={(e) => setDiagnosticScope(e.target.value)}
                disabled={isDiagnosing || configuredProviders.length === 0}
                className="bg-zinc-950 text-zinc-200 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500 [color-scheme:dark] cursor-pointer"
              >
                <option value="active">⚡ Solo Modelos Activos</option>
                {configuredModelOptions.length > 0 && (
                  <option value="all">🌐 Todos los configurados ({configuredModelOptions.length})</option>
                )}
                {configuredProviders.map((p) => (
                  <option key={p.provider_id} value={`provider:${p.provider_id}`}>
                    🏢 Proveedor: {p.provider} ({p.models.length})
                  </option>
                ))}
              </select>

              {isDiagnosing ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleCancelDiagnostic}
                  className="text-xs flex items-center gap-1.5 h-8"
                >
                  <Square className="w-3.5 h-3.5 fill-current" /> Cancelar
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleRunDiagnostic}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs flex items-center gap-1.5 h-8 shadow-sm"
                >
                  <Zap className="w-3.5 h-3.5" /> Iniciar Test
                </Button>
              )}
            </div>
          </div>

          {/* Progress / Status feedback */}
          {diagnosticProgress && (
            <div className="pt-2.5 border-t border-zinc-800/80 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 font-mono text-zinc-300">
                  {isDiagnosing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  <span>
                    {isDiagnosing ? "Diagnosticando:" : "Diagnóstico completado:"}{" "}
                    <strong className="text-white">
                      {diagnosticProgress.tested ?? diagnosticProgress.total}
                    </strong>{" "}
                    / {diagnosticProgress.total} modelos
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px] flex-wrap">
                  <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    🟢 {diagnosticProgress.healthy} saludables
                  </span>
                  <span className="text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    🟡 {diagnosticProgress.degraded} degradados
                  </span>
                  <span className="text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                    🔴 {diagnosticProgress.failing} caídos
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-zinc-950 rounded-full h-2 overflow-hidden border border-zinc-800">
                <div
                  className={cn(
                    "h-full transition-all duration-300 rounded-full",
                    !isDiagnosing
                      ? "bg-emerald-500 shadow-sm shadow-emerald-500/50"
                      : "bg-blue-500"
                  )}
                  style={{
                    width: `${
                      diagnosticProgress.total > 0
                        ? Math.min(
                            100,
                            ((diagnosticProgress.tested ?? diagnosticProgress.total) /
                              diagnosticProgress.total) *
                              100
                          )
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          )}
        </section>

        {/* ── BLOCK 1: Global Default ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-yellow-400">🌟</span>
            <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
              Modelo Predeterminado Global
            </h3>
          </div>
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
            <div>
              <p className="text-xs text-zinc-500 mb-3">
                Fallback usado por todas las Tools cuando no se especifica un override.
                {!globalDefault?.is_overridden && (
                  <span className="text-zinc-500 ml-1">
                    (proviene de <code className="text-zinc-400 bg-zinc-800 px-1 rounded">DEFAULT_LLM_MODEL</code>)
                  </span>
                )}
              </p>
              {!globalDefault && allModels.length === 0 ? (
                <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
              ) : (
                <ModelSearchableSelect
                  value={
                    globalDefault?.is_overridden
                      ? `${globalDefault.provider}/${globalDefault.model}`
                      : "__default__"
                  }
                  onChange={handleGlobalDefaultChange}
                  models={allModels}
                  healthMetrics={healthMetrics}
                  allowDefault={globalDefault?.is_overridden}
                  defaultLabel={`Restablecer a ${defaultLabel}`}
                  disabled={globalDefaultSaving}
                  popoverWidthClass="w-[500px]"
                />
              )}
            </div>

            <div className="pt-4 border-t border-zinc-800/60">
              <h4 className="text-sm font-semibold text-zinc-300 mb-2">Cadena de Resiliencia (Fallbacks)</h4>
              <p className="text-xs text-zinc-500 mb-4">
                Si el modelo principal falla (timeout, rate limit), se intentará automáticamente con estos modelos de respaldo en orden.
              </p>
              
              <div className="space-y-3">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="flex items-center gap-3">
                    <span className="text-xs font-mono text-zinc-500 w-20 shrink-0">Fallback {index + 1}</span>
                    <ModelSearchableSelect
                      value={globalDefault?.fallback_models?.[index] || "__none__"}
                      onChange={(v) => handleFallbackChange(index, v)}
                      models={allModels}
                      healthMetrics={healthMetrics}
                      allowNone={true}
                      noneLabel="Ninguno (Sin fallback)"
                      disabled={
                        globalDefaultSaving ||
                        (!globalDefault && allModels.length === 0) ||
                        (index > 0 && !globalDefault?.fallback_models?.[index - 1])
                      }
                      popoverWidthClass="w-[500px]"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── BLOCK 2: Official Presets ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-blue-400">⚡</span>
            <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
              Proveedores Oficiales
            </h3>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {NATIVE_PRESETS.map((preset) => {
              const backendData = curatedProviders.find(p => p.provider_id === preset.id);
              return (
                <PresetCard
                  key={preset.id}
                  preset={preset}
                  configuredModelId={configuredModels[preset.id]}
                  backendProviderData={backendData}
                  healthMetrics={healthMetrics}
                  onModelConfigured={setConfiguredModel}
                  onRefreshCurated={loadBackendProviders}
                />
              );
            })}
          </div>
        </section>

        {/* ── BLOCK 3: Custom Endpoints ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-zinc-400">🛠️</span>
              <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
                Endpoints Personalizados
              </h3>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCustomForm(!showCustomForm)}
              className="bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white text-xs h-7 gap-1.5"
            >
              <Plus className="w-3 h-3" />
              Añadir Endpoint
            </Button>
          </div>

          {customProviders.length > 0 && (
            <div className="space-y-2 mb-3">
              {customProviders.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl"
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{c.name}</p>
                    <p className="text-xs text-zinc-500 font-mono mt-0.5">
                      {c.baseUrl} · {c.modelSlug}
                    </p>
                  </div>
                  <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-1 rounded font-mono uppercase">
                    {c.protocol}
                  </span>
                </div>
              ))}
            </div>
          )}

          {customProviders.length === 0 && !showCustomForm && (
            <p className="text-sm text-zinc-600 py-2">
              No hay endpoints personalizados. Añadí uno para usar LM Studio, vLLM o proxies privados.
            </p>
          )}

          {showCustomForm && (
            <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
              <h4 className="text-sm font-medium text-zinc-300">Nuevo endpoint personalizado</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-400">Nombre / Alias</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ej. DeepSeek Local"
                    className="bg-zinc-950 border-zinc-800 text-sm text-zinc-200"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-400">Protocolo</Label>
                  <Select
                    value={form.protocol}
                    onValueChange={(v) => { if (v !== null) setForm({ ...form, protocol: v }); }}
                  >
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-200 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI Compatible</SelectItem>
                      <SelectItem value="anthropic">Anthropic Compatible</SelectItem>
                      <SelectItem value="google">Google Gemini Native</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-400">Base URL / Endpoint</Label>
                <Input
                  value={form.baseUrl}
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                  placeholder="http://localhost:11434/v1"
                  className="bg-zinc-950 border-zinc-800 text-sm text-zinc-200 font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-400">API Key (opcional)</Label>
                  <Input
                    type="password"
                    value={form.apiKey}
                    onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                    placeholder="sk-..."
                    className="bg-zinc-950 border-zinc-800 text-sm text-zinc-200"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-400">Model Slug</Label>
                  <Input
                    value={form.modelSlug}
                    onChange={(e) => setForm({ ...form, modelSlug: e.target.value })}
                    placeholder="qwen2.5-coder:32b"
                    className="bg-zinc-950 border-zinc-800 text-sm text-zinc-200 font-mono"
                  />
                </div>
              </div>
              <div className="flex gap-2 items-center pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleTestCustom}
                  disabled={customTestStatus === "testing" || !form.baseUrl || !form.modelSlug}
                  className="bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white text-xs gap-1.5"
                >
                  <FlaskConical className="w-3 h-3" />
                  {customTestStatus === "testing" ? "Probando..." : "Probar Conexión"}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveCustom}
                  disabled={!form.name || !form.baseUrl || !form.modelSlug}
                  className="bg-blue-600 hover:bg-blue-700 text-white border-transparent text-xs"
                >
                  Guardar Endpoint
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setShowCustomForm(false); setCustomTestStatus("idle"); }}
                  className="text-zinc-500 hover:text-zinc-300 text-xs"
                >
                  Cancelar
                </Button>
                {customTestStatus === "success" && (
                  <span className="text-xs text-emerald-400 ml-1">✅ Conexión exitosa</span>
                )}
                {customTestStatus === "error" && (
                  <span className="text-xs text-red-400 ml-1">❌ Error al conectar</span>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
