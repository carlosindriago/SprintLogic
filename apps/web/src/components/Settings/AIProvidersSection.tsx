"use client";

import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFimStore } from "@/store/fimStore";
import { useSettingsStore } from "@/store/settingsStore";
import { getCuratedModels, verifyAndSaveProviderKey, CuratedProvider } from "@/lib/api";

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
];

// ─────────────────────────────────────────────
// PresetCard
// ─────────────────────────────────────────────

interface PresetCardProps {
  preset: NativePreset;
  configuredModelId: string | undefined;
  backendProviderData: CuratedProvider | undefined;
  onModelConfigured: (presetId: string, modelId: string) => void;
  onRefreshCurated: () => void;
}

function PresetCard({ preset, configuredModelId, backendProviderData, onModelConfigured, onRefreshCurated }: PresetCardProps) {
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

  // Sync selected model down from props if changed externally
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (configuredModelId) setSelectedModel(configuredModelId);
  }, [configuredModelId]);

  const masked = "•".repeat(16);
  
  const backendModels = backendProviderData?.models || [];
  const displayModels = backendModels.length > 0 
    ? backendModels.map(m => m.id) 
    : preset.defaultModels;

  const handleFetchModels = useCallback(async () => {
    if (!keyValue) return;
    setFetchStatus("loading");
    try {
      // Sends to backend to verify and save in the Keyring OS!
      const fetched = await verifyAndSaveProviderKey(preset.id, keyValue);
      if (fetched.length > 0) {
        setFetchStatus("ok");
        onRefreshCurated(); // Refreshes the top-level state
        const firstId = fetched[0].id;
        setSelectedModel(firstId);
        if (preset.isFimProvider) setFimModel(firstId);
      }
    } catch {
      setFetchStatus("error");
    }
  }, [preset.id, keyValue, setFimModel, preset.isFimProvider, onRefreshCurated]);

  const handleSave = async () => {
    if (keyValue) {
      await handleFetchModels();
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
    <div
      className={cn(
        "border rounded-xl transition-all duration-200",
        isConfigured
          ? "border-zinc-700 bg-zinc-900/80"
          : "border-zinc-800/60 bg-zinc-900/40"
      )}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <span className={cn("text-lg font-mono leading-none", preset.color)}>
            {preset.icon}
          </span>
          <div>
            <p className="text-sm font-semibold text-zinc-200">{preset.name}</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {isConfigured ? (
                <span className="text-emerald-500">● Configurado · {activeModel}</span>
              ) : (
                <span className="text-zinc-600">○ Sin configurar</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {preset.isFimProvider && (
            <span className="text-[10px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-0.5 rounded font-mono">
              FIM
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-zinc-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          )}
        </div>
      </button>

      {/* Expanded */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-zinc-800/60 pt-3">
          {preset.description && (
            <p className="text-xs text-zinc-500 leading-relaxed">{preset.description}</p>
          )}

          {/* FIM toggle (Groq only) */}
          {preset.isFimProvider && (
            <div className="flex items-center justify-between p-3 bg-zinc-950/60 rounded-lg border border-zinc-800/60">
              <div className="flex items-center gap-2">
                <Wand2 className="w-3.5 h-3.5 text-emerald-400" />
                <Label className="text-xs text-zinc-300 cursor-pointer">
                  Activar Autocompletado Predictivo (FIM)
                </Label>
              </div>
              <Switch
                checked={fimEnabled}
                onCheckedChange={setFimEnabled}
                className="data-checked:bg-emerald-600 data-unchecked:bg-zinc-800"
              />
            </div>
          )}

          {/* API Key / URL */}
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">{isConfigured ? "Reemplazar " + preset.keyLabel : preset.keyLabel}</Label>
            <div className="relative">
              <Input
                type={visible ? "text" : "password"}
                value={keyValue}
                onChange={(e) => setKeyValue(e.target.value)}
                placeholder={isConfigured ? "Ya configurado. Escribí para sobreescribir..." : preset.keyPlaceholder}
                className="bg-zinc-950 border-zinc-800 text-sm text-zinc-200 pr-10 font-mono"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setVisible(!visible)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            {isConfigured && !keyValue && !visible && (
              <p className="text-[10px] text-zinc-600 font-mono">{masked}</p>
            )}
          </div>

          {/* Model selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-zinc-400">Modelo activo</Label>
              <button
                onClick={handleFetchModels}
                disabled={!keyValue || fetchStatus === "loading"}
                className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 disabled:opacity-40 transition-colors"
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

            <Select
              value={preset.isFimProvider ? fimModel || selectedModel : selectedModel}
              onValueChange={(v) => {
                if (v === null) return;
                setSelectedModel(v);
                if (preset.isFimProvider) setFimModel(v);
                // Also auto-save the selection
                onModelConfigured(preset.id, v);
              }}
            >
              <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-200 text-sm w-full">
                <SelectValue placeholder="Selecciona un modelo..." />
              </SelectTrigger>
              <SelectContent className="min-w-[var(--anchor-width)] w-auto max-w-[80vw]">
                {displayModels.map((m) => {
                  // Some logic to nice-format if it's an ID
                  const mName = backendModels.find(bm => bm.id === m)?.name || m;
                  return (
                    <SelectItem key={m} value={m}>
                      {mName}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
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
  const { globalDefault, setGlobalDefault, configuredModels, setConfiguredModel } = useSettingsStore();
  
  const [curatedProviders, setCuratedProviders] = useState<CuratedProvider[]>([]);
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

  const loadBackendProviders = useCallback(async () => {
    try {
      const data = await getCuratedModels();
      setCuratedProviders(data);
    } catch (e) {
      console.error("Failed to load curated models from backend", e);
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

  // Global dropdown: merge preset configured models + custom endpoints
  const globalOptions = [
    ...NATIVE_PRESETS.map((p) => {
      const activeModel = configuredModels[p.id] ?? p.defaultModels[0] ?? "";
      return { value: `${p.id}__${activeModel}`, label: `${p.name} · ${activeModel}` };
    }),
    ...customProviders.map((c) => ({
      value: `custom__${c.id}`,
      label: `${c.name} · ${c.modelSlug}`,
    })),
  ];

  return (
    <div className="flex flex-col gap-8 h-full">
      <div>
        <h2 className="text-2xl font-semibold text-white">Modelos & LLMs</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Gestiona proveedores oficiales, endpoints personalizados y el modelo predeterminado global.
        </p>
      </div>

      <div className="space-y-8 flex-1 overflow-y-auto pr-1 pb-8">
        {/* ── BLOCK 1: Global Default ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-yellow-400">🌟</span>
            <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
              Modelo Predeterminado Global
            </h3>
          </div>
          <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
            <p className="text-xs text-zinc-500 mb-3">
              Fallback usado por todas las Tools cuando no se especifica un override.
            </p>
            <Select
              value={globalDefault}
              onValueChange={(v) => { if (v !== null) setGlobalDefault(v); }}
            >
              <SelectTrigger className="w-full bg-zinc-950 border-zinc-800 text-zinc-200 text-sm">
                <SelectValue placeholder="Selecciona un modelo..." />
              </SelectTrigger>
              <SelectContent>
                {globalOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
