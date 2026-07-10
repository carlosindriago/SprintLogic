"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  verifyAndSaveProviderKey,
  checkApiKeyStatus,
  deleteProviderKey,
  ModelResult,
  getCuratedModels,
  CuratedProvider,
  fetchHealthOverview,
} from "@/lib/api";
import { useLLMConfigStore } from "@/store/llmConfigStore";
import { useFimStore } from "@/store/fimStore";
import { Switch } from "@/components/ui/switch";
import { Key, Loader2, CheckCircle2, XCircle, Trash2, Brain, Sparkles, Play, Wand2 } from "lucide-react";

const KEY_MIN_LENGTH = 8;

function maskKey(key: string | null): string {
  if (!key || key.length < KEY_MIN_LENGTH) {
    return "••••••••••••••••••••••••••••";
  }
  const head = key.slice(0, 4);
  const tail = key.slice(-4);
  return `${head}${"•".repeat(Math.max(8, key.length - 8))}${tail}`;
}

function SkeletonModelList() {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label="Loading models">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-9 w-full rounded-md bg-zinc-950 border border-zinc-800/50 animate-pulse"
        />
      ))}
    </div>
  );
}

function ProviderConfig({
  provider,
  defaultModel,
  onSelectModel,
  curatedModels,
  onProviderConfigured,
}: {
  provider: CuratedProvider;
  defaultModel: string;
  onSelectModel: (provider: string, modelId: string) => void;
  curatedModels: ModelResult[];
  onProviderConfigured?: (providerId: string, models: ModelResult[]) => void;
}) {
  const [keyInput, setKeyInput] = useState("");
  const [isConfigured, setIsConfigured] = useState(false);
  const [storedKeyPreview, setStoredKeyPreview] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [modelSearch, setModelSearch] = useState("");

  const setApiKey = useLLMConfigStore((s) => s.setApiKey);
  const removeApiKey = useLLMConfigStore((s) => s.removeApiKey);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    checkApiKeyStatus(provider.provider_id).then((status) => {
      if (cancelled) return;
      setIsConfigured(status.is_configured);
      if (status.is_configured) {
        setStoredKeyPreview(maskKey("x".repeat(32)));
      } else {
        setIsEditing(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [provider.provider_id]);

  const handleBlurValidation = useCallback(async () => {
    const trimmed = keyInput.trim();
    if (!trimmed || trimmed.length < KEY_MIN_LENGTH || isValidating) return;

    setIsValidating(true);
    setValidationError(null);
    try {
      const models = await verifyAndSaveProviderKey(provider.provider_id, trimmed);
      setIsConfigured(true);
      setKeyInput("");
      setIsEditing(false);
      setStoredKeyPreview(maskKey(trimmed));
      setApiKey(provider.provider_id, trimmed);
      
      if (onProviderConfigured) {
        onProviderConfigured(provider.provider_id, models);
      }

      toast.success("Llave validada y guardada", {
        description: `API Key para ${provider.provider} configurada correctamente.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setValidationError(message);
    } finally {
      setIsValidating(false);
    }
  }, [keyInput, provider.provider_id, provider.provider, isValidating, setApiKey, onProviderConfigured]);

  const handleModelSelect = useCallback(
    (modelId: string | null) => {
      if (!modelId) return;
      onSelectModel(provider.provider_id, modelId);
      toast.success("Modelo predeterminado actualizado", {
        description: `${provider.provider_id}/${modelId}`,
      });
    },
    [provider.provider_id, onSelectModel],
  );

  const handleReplaceKey = useCallback(() => {
    setIsEditing(true);
    setKeyInput("");
    setValidationError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleDeleteKey = useCallback(async () => {
    try {
      await deleteProviderKey(provider.provider_id);
      setIsConfigured(false);
      setStoredKeyPreview(null);
      setIsEditing(true);
      setValidationError(null);
      removeApiKey(provider.provider_id);
      toast.success("Llave eliminada", {
        description: `La credencial de ${provider.provider} fue removida.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error("No se pudo eliminar la llave", { description: message });
    }
  }, [provider.provider_id, provider.provider, removeApiKey]);

  const isCurrentProviderDefault = defaultModel.startsWith(`${provider.provider_id}/`);
  const activeModelId = isCurrentProviderDefault
    ? defaultModel.split("/").slice(1).join("/")
    : "";

  const filteredModels = curatedModels.filter(m => 
    m.name.toLowerCase().includes(modelSearch.toLowerCase()) || 
    m.id.toLowerCase().includes(modelSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-8 p-6 max-w-2xl">
      <div className="flex flex-col gap-2 p-4 bg-zinc-900/50 border border-zinc-800/80 rounded-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/50"></div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            Credenciales API ({provider.provider})
            {isConfigured && (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] px-1.5 py-0 h-4">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                CONFIGURADA
              </Badge>
            )}
          </Label>
        </div>
        
        {isConfigured && !isEditing ? (
          <div className="flex w-full items-center gap-2">
            <div className="flex-1 bg-zinc-950 border border-zinc-800/80 rounded flex items-center px-3 h-9 text-zinc-400 font-mono text-sm opacity-80 cursor-not-allowed">
              <Key className="w-3.5 h-3.5 mr-2 text-zinc-500" />
              {storedKeyPreview}
            </div>
            <Button
              variant="secondary"
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 h-9 px-4 text-xs font-medium"
              onClick={handleReplaceKey}
            >
              Reemplazar
            </Button>
            <Button
              variant="destructive"
              size="icon"
              className="bg-zinc-800/50 border-zinc-700/50 hover:bg-red-950/40 hover:text-red-400 hover:border-red-900/60 h-9 px-3"
              onClick={handleDeleteKey}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="relative w-full">
            <Input
              ref={inputRef}
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="Pega tu API Key aquí…"
              className="bg-zinc-950 border-zinc-800 focus-visible:border-blue-500/50 focus-visible:ring-blue-500/20 text-zinc-200 pr-10 font-mono h-10"
              value={keyInput}
              onChange={(e) => {
                setKeyInput(e.target.value);
                if (validationError) setValidationError(null);
              }}
              onBlur={handleBlurValidation}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  inputRef.current?.blur();
                } else if (e.key === "Escape") {
                  setKeyInput("");
                  inputRef.current?.blur();
                }
              }}
              disabled={isValidating}
            />
            {isValidating && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
              </div>
            )}
          </div>
        )}

        {validationError && (
          <p role="alert" className="text-xs text-red-400 flex items-start gap-1.5 mt-1 bg-red-400/10 p-2 rounded border border-red-400/20">
            <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{validationError}</span>
          </p>
        )}
        
        <p className="text-xs text-zinc-500 mt-2">
          La llave se almacena cifrada localmente y se valida al salir del campo.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Label className="text-sm font-semibold text-zinc-200">
          Modelo de Chat Predeterminado
        </Label>
        <Select value={activeModelId} onValueChange={handleModelSelect}>
          <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-200 w-full h-10">
            <SelectValue placeholder="Selecciona un modelo…" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200 max-h-[300px]">
            <div className="p-2 sticky top-0 bg-zinc-900 border-b border-zinc-800 z-10">
              <Input
                type="text"
                placeholder="Buscar modelo..."
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                className="bg-zinc-950 border-zinc-800 h-8 text-xs text-zinc-200"
              />
            </div>
            {filteredModels.map((m) => (
              <SelectItem
                key={m.id}
                value={m.id}
                className="focus:bg-zinc-800 focus:text-zinc-100 cursor-pointer py-2"
              >
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-zinc-500">
          Este modelo se utilizará por defecto para el chat, generación de commits y herramientas interactivas.
        </p>
      </div>
    </div>
  );
}

function Context7Section({
  apiKey,
  onSave,
}: {
  apiKey: string;
  onSave: (key: string) => void;
}) {
  const [input, setInput] = useState('');
  const [saved, setSaved] = useState(!!apiKey);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(!!apiKey);
  }, [apiKey]);

  const handleSave = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setInput('');
    setSaved(true);
    toast.success("API Key de Context7 guardada");
  };

  const handleClear = () => {
    onSave('');
    setSaved(false);
    toast.success("API Key de Context7 eliminada");
  };

  return (
    <div className="flex flex-col gap-8 p-6 max-w-2xl">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold text-zinc-200">
            Credenciales de Búsqueda Contextual
          </Label>
          {saved ? (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
              <CheckCircle2 className="w-3 h-3" /> configurada
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
              <XCircle className="w-3 h-3" /> requerida
            </span>
          )}
        </div>

        {saved ? (
          <div className="flex w-full items-center gap-3">
            <div className="flex-1 bg-zinc-950/50 border border-zinc-800/80 rounded-md px-3 py-2 text-sm text-zinc-400 flex items-center gap-2 font-mono">
              <Brain className="w-4 h-4 shrink-0 text-blue-400/70" />
              <span className="truncate">
                {apiKey.slice(0, 6)}••••••••••{apiKey.slice(-4)}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-zinc-800/50 border-zinc-700/50 hover:bg-zinc-700 text-zinc-300 h-9 px-4"
              onClick={() => setSaved(false)}
            >
              Reemplazar
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-zinc-800/50 border-zinc-700/50 hover:bg-red-950/40 hover:text-red-400 hover:border-red-900/60 h-9 px-3"
              onClick={handleClear}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="flex w-full items-center gap-2">
            <Input
              type="password"
              autoComplete="off"
              placeholder="Pega tu token ctx7_..."
              className="bg-zinc-950 border-zinc-800 focus-visible:border-blue-500/50 focus-visible:ring-blue-500/20 text-zinc-200 flex-1 font-mono h-10"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
              }}
            />
            <Button
              variant="secondary"
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 h-10 px-6"
              onClick={handleSave}
              disabled={!input.trim()}
            >
              Guardar
            </Button>
          </div>
        )}

        <p className="text-xs text-zinc-500">
          Permite al Modo Sensei conectarse con la API de Context7 para leer documentación técnica actualizada.
        </p>
      </div>

      <div className="flex flex-col gap-2 p-4 bg-blue-500/5 border border-blue-500/10 rounded-lg">
        <Label className="text-sm font-semibold text-blue-200/90 flex items-center gap-2">
          <Brain className="w-4 h-4" /> Acerca de Context7
        </Label>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Context7 provee acceso en tiempo real a la documentación oficial de React, Next.js, Tailwind, TypeScript, Python y cientos de librerías más. El asistente consulta automáticamente estas bases de conocimiento antes de responder.
        </p>
      </div>
    </div>
  );
}

function FimConfigSection({ providers }: { providers: CuratedProvider[] }) {
  const fimDefaultModel = useLLMConfigStore((s) => s.fimDefaultModel);
  const setFimDefaultModel = useLLMConfigStore((s) => s.setFimDefaultModel);
  const fimFallbackModel = useLLMConfigStore((s) => s.fimFallbackModel);
  const setFimFallbackModel = useLLMConfigStore((s) => s.setFimFallbackModel);
  
  const [isTesting, setIsTesting] = useState(false);
  const [modelSearchMain, setModelSearchMain] = useState("");
  const [modelSearchFallback, setModelSearchFallback] = useState("");

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const res = await fetchHealthOverview("def bad_loop():\n    while True:\n        pass\n", "python", fimDefaultModel, fimFallbackModel);
      if (res && res.clean_code_score !== undefined) {
        toast.success("AI Code Coach respondió exitosamente", {
          description: "La configuración actual de modelos para análisis es válida."
        });
      } else {
        toast.error("El modelo seleccionado no pudo generar el formato JSON requerido por el Coach. Intenta con un modelo de mayor capacidad de razonamiento.");
      }
    } catch {
      toast.error("El modelo seleccionado no pudo generar el formato JSON requerido por el Coach. Intenta con un modelo de mayor capacidad de razonamiento.");
    } finally {
      setIsTesting(false);
    }
  };

  const allModels = providers.flatMap(p => p.models.map(m => ({ ...m, provider: p.provider, provider_id: p.provider_id })));
  
  const filteredModelsMain = allModels.filter(m => 
    m.name.toLowerCase().includes(modelSearchMain.toLowerCase()) || 
    m.id.toLowerCase().includes(modelSearchMain.toLowerCase())
  );
  
  const filteredModelsFallback = allModels.filter(m => 
    m.name.toLowerCase().includes(modelSearchFallback.toLowerCase()) || 
    m.id.toLowerCase().includes(modelSearchFallback.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-8 p-6 max-w-2xl">
      <div className="flex flex-col gap-3">
        <Label className="text-sm font-semibold text-zinc-200">
          Modelo Coach Principal
        </Label>
        <Select value={fimDefaultModel} onValueChange={(val) => val && setFimDefaultModel(val)}>
          <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-200 w-full h-10">
            <SelectValue placeholder="Selecciona el modelo principal..." />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200 max-h-[300px]">
            <div className="p-2 sticky top-0 bg-zinc-900 border-b border-zinc-800 z-10">
              <Input
                type="text"
                placeholder="Buscar modelo..."
                value={modelSearchMain}
                onChange={(e) => setModelSearchMain(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                className="bg-zinc-950 border-zinc-800 h-8 text-xs text-zinc-200"
              />
            </div>
            {filteredModelsMain.map((m) => (
              <SelectItem key={`${m.provider_id}/${m.id}`} value={`${m.provider_id}/${m.id}`} className="focus:bg-zinc-800 focus:text-zinc-100 cursor-pointer py-2">
                {m.name} <span className="text-zinc-500 text-xs ml-1">({m.provider})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-zinc-500">
          El motor pedagógico que analizará tu código en segundo plano para ofrecerte mentoría, detectar vulnerabilidades y sugerir refactorizaciones.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Label className="text-sm font-semibold text-zinc-200">
          Modelo Coach de Respaldo (Fallback)
        </Label>
        <Select value={fimFallbackModel} onValueChange={(val) => val && setFimFallbackModel(val)}>
          <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-200 w-full h-10">
            <SelectValue placeholder="Selecciona un modelo de respaldo..." />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200 max-h-[300px]">
            <div className="p-2 sticky top-0 bg-zinc-900 border-b border-zinc-800 z-10">
              <Input
                type="text"
                placeholder="Buscar modelo..."
                value={modelSearchFallback}
                onChange={(e) => setModelSearchFallback(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                className="bg-zinc-950 border-zinc-800 h-8 text-xs text-zinc-200"
              />
            </div>
            <SelectItem value="none" className="focus:bg-zinc-800 focus:text-zinc-100 cursor-pointer text-zinc-400 py-2">
              Ninguno
            </SelectItem>
            {filteredModelsFallback.map((m) => (
              <SelectItem key={`${m.provider_id}/${m.id}`} value={`${m.provider_id}/${m.id}`} className="focus:bg-zinc-800 focus:text-zinc-100 cursor-pointer py-2">
                {m.name} <span className="text-zinc-500 text-xs ml-1">({m.provider})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-zinc-500">
          Modelo alternativo en caso de que el proveedor principal falle o agotes la cuota de la API (rate limit).
        </p>
      </div>
      
      <div className="flex flex-col gap-4 mt-2 p-5 bg-zinc-950/30 border border-zinc-800/60 rounded-lg">
        <div>
          <Label className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            Diagnóstico de Conectividad
          </Label>
          <p className="text-xs text-zinc-400 mt-1">
            Ejecuta una petición real hacia el backend para asegurarte de que el modelo seleccionado soporta el esquema JSON requerido por el Coach.
          </p>
        </div>
        <Button
          type="button"
          disabled={isTesting || !fimDefaultModel}
          onClick={handleTest}
          variant="secondary"
          className="w-full sm:w-auto bg-zinc-100 hover:bg-white text-zinc-900 font-medium h-10"
        >
          {isTesting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Play className="w-4 h-4 mr-2 fill-current" />
          )}
          {isTesting ? "Procesando prueba Coach..." : "Testear AI Coach"}
        </Button>
      </div>
    </div>
  );
}

function PredictiveFimSection() {
  const fimEnabled = useFimStore((s) => s.fimEnabled);
  const setFimEnabled = useFimStore((s) => s.setFimEnabled);
  const groqApiKey = useFimStore((s) => s.groqApiKey);
  const setGroqApiKey = useFimStore((s) => s.setGroqApiKey);
  const fimModel = useFimStore((s) => s.fimModel);
  const setFimModel = useFimStore((s) => s.setFimModel);

  return (
    <div className="flex flex-col gap-8 p-6 max-w-2xl">
      <div className="flex flex-col gap-4 p-5 bg-zinc-900/50 border border-zinc-800/80 rounded-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/50"></div>
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-emerald-400" />
            Autocompletado Predictivo (FIM - Groq)
          </Label>
          <Switch checked={fimEnabled} onCheckedChange={setFimEnabled} />
        </div>
        
        <p className="text-xs text-zinc-400 leading-relaxed">
          Las peticiones FIM se procesan a alta velocidad. Si notas sugerencias incorrectas, la Mentoría Contextual (Sensei) validará el código 3 segundos después.
        </p>

        <div className="flex flex-col gap-3 mt-2">
          <Label className="text-xs font-medium text-zinc-300">Groq API Key</Label>
          <Input 
            type="password"
            value={groqApiKey}
            onChange={(e) => setGroqApiKey(e.target.value)}
            placeholder="gsk_..."
            autoComplete="off"
            spellCheck={false}
            className="bg-zinc-950 border-zinc-800 focus-visible:border-emerald-500/50 focus-visible:ring-emerald-500/20 text-zinc-200 font-mono h-10"
          />
        </div>

        <div className="flex flex-col gap-3 mt-2">
          <Label className="text-xs font-medium text-zinc-300">Modelo Groq para FIM</Label>
          <Select value={fimModel} onValueChange={setFimModel}>
            <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-200 w-full h-10">
              <SelectValue placeholder="Selecciona un modelo..." />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
              <SelectItem value="llama-3.1-8b-instant" className="focus:bg-zinc-800">llama-3.1-8b-instant</SelectItem>
              <SelectItem value="gemma2-9b-it" className="focus:bg-zinc-800">gemma2-9b-it</SelectItem>
              <SelectItem value="qwen-2.5-coder-32b" className="focus:bg-zinc-800">qwen-2.5-coder-32b</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

export default function LLMSettingsPanel() {
  const defaultModel = useLLMConfigStore((s) => s.defaultModel);
  const setDefaultModel = useLLMConfigStore((s) => s.setDefaultModel);
  const context7ApiKey = useLLMConfigStore((s) => s.context7ApiKey);
  const setContext7ApiKey = useLLMConfigStore((s) => s.setContext7ApiKey);
  
  const [providers, setProviders] = useState<CuratedProvider[]>([]);
  const [activeSection, setActiveSection] = useState<string>("gemini");
  const [loadingProviders, setLoadingProviders] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getCuratedModels().then(async (data) => {
      if (cancelled) return;
      setProviders(data);
      setLoadingProviders(false);
      
      const updatedProviders = [...data];
      let hasUpdates = false;

      await Promise.all(
        updatedProviders.map(async (provider, index) => {
          if (provider.is_configured) {
            try {
              const { fetchProviderModels } = await import('@/lib/api');
              const dynamicModels = await fetchProviderModels(provider.provider_id);
              if (!cancelled && dynamicModels.length > 0) {
                updatedProviders[index] = {
                  ...provider,
                  models: dynamicModels,
                };
                hasUpdates = true;
              }
            } catch (err) {
              console.error(`Failed to fetch dynamic models for ${provider.provider_id}`, err);
            }
          }
        })
      );

      if (!cancelled && hasUpdates) {
        setProviders([...updatedProviders]);
      }
    }).catch(() => {
      if (cancelled) return;
      setLoadingProviders(false);
    });
    return () => { cancelled = true; };
  }, []);

  const handleProviderConfigured = useCallback((providerId: string, models: ModelResult[]) => {
    setProviders(prev => prev.map(p => {
      if (p.provider_id === providerId && models.length > 0) {
        return { ...p, models, is_configured: true };
      }
      return p;
    }));
  }, []);

  const handleSelectModel = useCallback(
    (providerId: string, modelId: string) => {
      setDefaultModel(`${providerId}/${modelId}`);
    },
    [setDefaultModel],
  );

  const isLLMProvider = activeSection !== 'context7' && activeSection !== 'fim-config';
  const activeProviderData = providers.find(p => p.provider_id === activeSection);

  return (
    <div className="flex h-[480px] bg-zinc-950/80 border border-zinc-800/60 rounded-xl shadow-2xl overflow-hidden backdrop-blur-xl">
      {/* Sidebar */}
      <div className="w-[240px] bg-zinc-900/40 border-r border-zinc-800/50 flex flex-col overflow-y-auto shrink-0">
        <div className="px-4 pt-5 pb-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
            Modelos de IA
          </span>
        </div>
        
        {loadingProviders ? (
          <div className="px-4 py-2">
            <SkeletonModelList />
          </div>
        ) : (
          providers.map((provider) => {
            const isActive = activeSection === provider.provider_id;
            return (
              <button
                key={provider.provider_id}
                type="button"
                onClick={() => setActiveSection(provider.provider_id)}
                className={`text-left px-4 py-2 text-sm transition-colors flex items-center justify-between ${
                  isActive
                    ? "bg-blue-500/10 text-blue-300 border-l-2 border-blue-500 font-medium"
                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border-l-2 border-transparent"
                }`}
              >
                <span className="truncate">{provider.provider}</span>
                {provider.provider_id === defaultModel.split("/")[0] && (
                  <span className="text-[9px] font-bold uppercase tracking-wide text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded-sm ml-2 shrink-0">
                    activo
                  </span>
                )}
              </button>
            );
          })
        )}

        <div className="px-4 pt-6 pb-2 mt-2 border-t border-zinc-800/50">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
            Tools
          </span>
        </div>
        <button
          onClick={() => setActiveSection('predictive-fim')}
          className={`text-left px-4 py-2 text-sm transition-colors flex items-center gap-2 ${
            activeSection === 'predictive-fim'
              ? "bg-emerald-500/10 text-emerald-300 border-l-2 border-emerald-500 font-medium"
              : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border-l-2 border-transparent"
          }`}
        >
          <Wand2 className="w-4 h-4 shrink-0" />
          FIM Groq
        </button>
        <button
          onClick={() => setActiveSection('fim-config')}
          className={`text-left px-4 py-2 text-sm transition-colors flex items-center gap-2 ${
            activeSection === 'fim-config'
              ? "bg-blue-500/10 text-blue-300 border-l-2 border-blue-500 font-medium"
              : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border-l-2 border-transparent"
          }`}
        >
          <Sparkles className="w-4 h-4 shrink-0" />
          AI Code Coach
        </button>

        <div className="px-4 pt-6 pb-2 mt-2 border-t border-zinc-800/50">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
            Integraciones
          </span>
        </div>
        <button
          onClick={() => setActiveSection('context7')}
          className={`text-left px-4 py-2 text-sm transition-colors flex items-center gap-2 ${
            activeSection === 'context7'
              ? "bg-blue-500/10 text-blue-300 border-l-2 border-blue-500 font-medium"
              : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border-l-2 border-transparent"
          }`}
        >
          <Brain className="w-4 h-4 shrink-0" />
          Context7 MCP
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 bg-zinc-900/20 overflow-y-auto custom-scrollbar">
        {loadingProviders ? (
          <div className="p-6">
            <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
          </div>
        ) : isLLMProvider && activeProviderData ? (
          <ProviderConfig
            key={activeSection}
            provider={activeProviderData}
            defaultModel={defaultModel}
            onSelectModel={handleSelectModel}
            curatedModels={activeProviderData.models}
            onProviderConfigured={handleProviderConfigured}
          />
        ) : activeSection === 'predictive-fim' ? (
          <PredictiveFimSection key="predictive-fim" />
        ) : activeSection === 'context7' ? (
          <Context7Section
            apiKey={context7ApiKey}
            onSave={setContext7ApiKey}
          />
        ) : (
          <FimConfigSection key="fim-config" providers={providers} />
        )}
      </div>
    </div>
  );
}
