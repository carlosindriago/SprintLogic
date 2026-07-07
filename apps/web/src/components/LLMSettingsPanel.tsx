"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchProviderModels,
  verifyAndSaveProviderKey,
  checkApiKeyStatus,
  deleteProviderKey,
  ModelResult,
  getCuratedModels,
  CuratedProvider,
  fetchFimCompletion,
} from "@/lib/api";
import { useLLMConfigStore } from "@/store/llmConfigStore";
import { Loader2, KeyRound, CheckCircle2, XCircle, Trash2, Brain, Sparkles, Play } from "lucide-react";

const PROVIDERS = [
  { id: "gemini", name: "Google Gemini" },
  { id: "openai", name: "OpenAI" },
  { id: "anthropic", name: "Anthropic" },
  { id: "openrouter", name: "OpenRouter" },
  { id: "opencode-zen", name: "OpenCode Zen" },
  { id: "opencode-go", name: "OpenCode Go" },
  { id: "nvidia", name: "Nvidia NIM" },
];

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
}: {
  provider: string;
  defaultModel: string;
  onSelectModel: (provider: string, modelId: string) => void;
}) {
  const [keyInput, setKeyInput] = useState("");
  const [isConfigured, setIsConfigured] = useState(false);
  const [storedKeyPreview, setStoredKeyPreview] = useState<string | null>(null);
  const [models, setModels] = useState<ModelResult[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [isFetchingModels, setIsFetchingModels] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const setApiKey = useLLMConfigStore((s) => s.setApiKey);
  const removeApiKey = useLLMConfigStore((s) => s.removeApiKey);
  const inputRef = useRef<HTMLInputElement | null>(null);

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await checkApiKeyStatus(provider);
        if (cancelled) return;
        setIsConfigured(status.is_configured);
        if (status.is_configured) {
          const fetchedModels = await fetchProviderModels(provider);
          if (cancelled) return;
          setModels(fetchedModels);
          setStoredKeyPreview(maskKey("x".repeat(32)));
        } else {
          setIsEditing(true);
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setValidationError(message);
      } finally {
        if (!cancelled) setIsFetchingModels(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  const handleBlurValidation = useCallback(async () => {
    const trimmed = keyInput.trim();
    if (!trimmed || trimmed.length < KEY_MIN_LENGTH || isValidating) return;

    setIsValidating(true);
    setValidationError(null);
    try {
      const fetchedModels = await verifyAndSaveProviderKey(provider, trimmed);
      setModels(fetchedModels);
      setIsConfigured(true);
      setKeyInput("");
      setIsEditing(false);
      setStoredKeyPreview(maskKey(trimmed));
      setApiKey(provider, trimmed);
      toast.success("Llave validada y guardada", {
        description: "Modelos cargados correctamente",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setValidationError(message);
    } finally {
      setIsValidating(false);
    }
  }, [keyInput, provider, isValidating, setApiKey]);

  const handleModelSelect = useCallback(
    (modelId: string | null) => {
      if (!modelId) return;
      onSelectModel(provider, modelId);
      toast.success("Modelo predeterminado actualizado", {
        description: `${provider}/${modelId}`,
      });
    },
    [provider, onSelectModel],
  );

  const handleReplaceKey = useCallback(() => {
    setIsEditing(true);
    setKeyInput("");
    setValidationError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleDeleteKey = useCallback(async () => {
    try {
      await deleteProviderKey(provider);
      setIsConfigured(false);
      setModels([]);
      setStoredKeyPreview(null);
      setIsEditing(true);
      setValidationError(null);
      removeApiKey(provider);
      toast.success("Llave eliminada", {
        description: `La credencial de ${provider} fue removida.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error("No se pudo eliminar la llave", { description: message });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const isCurrentProviderDefault = defaultModel.startsWith(`${provider}/`);
  const activeModelId = isCurrentProviderDefault
    ? defaultModel.split("/").slice(1).join("/")
    : "";

  return (
    <div className="flex flex-col gap-6 p-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
            API Key
          </Label>
          {isConfigured && !isEditing && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-emerald-400/90">
              <CheckCircle2 className="w-3 h-3" /> configurada
            </span>
          )}
          {!isConfigured && isEditing && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-amber-400/90">
              <XCircle className="w-3 h-3" /> faltante
            </span>
          )}
        </div>

        {isConfigured && !isEditing ? (
          <div className="flex w-full items-center gap-2">
            <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-500 flex items-center gap-2 font-mono">
              <KeyRound className="w-4 h-4 shrink-0" />
              <span className="truncate" title="Llave almacenada en el keyring del sistema">
                {storedKeyPreview ?? maskKey(null)}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-zinc-800 border-zinc-700/50 hover:bg-zinc-700 h-9"
              onClick={handleReplaceKey}
            >
              Reemplazar
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-zinc-800 border-zinc-700/50 hover:bg-red-950/40 hover:text-red-300 hover:border-red-900/60 h-9"
              onClick={handleDeleteKey}
              aria-label="Eliminar llave almacenada"
            >
              <Trash2 className="w-3.5 h-3.5" />
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
              className="bg-zinc-950 border-zinc-800 text-zinc-200 pr-10 font-mono px-3 py-2"
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
          <p role="alert" className="text-xs text-red-400 flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{validationError}</span>
          </p>
        )}

        <p className="text-xs text-zinc-500 mt-1">
          {isConfigured && !isEditing
            ? "La llave se almacena cifrada en el keyring del sistema. Nunca abandona tu máquina."
            : "La llave se valida y guarda automáticamente al salir del campo."}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
          Modelo predeterminado
        </Label>
        {isFetchingModels ? (
          <SkeletonModelList />
        ) : models.length > 0 ? (
          <Select value={activeModelId} onValueChange={handleModelSelect}>
            <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-200 w-full">
              <SelectValue placeholder="Selecciona un modelo…" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200 max-h-[200px]">
              {models.map((m) => (
                <SelectItem
                  key={m.id}
                  value={m.id}
                  className="focus:bg-zinc-800 focus:text-zinc-100 cursor-pointer"
                >
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="text-sm text-zinc-500 bg-zinc-950 border border-zinc-800/50 rounded-md px-3 py-2">
            {isConfigured
              ? "No se encontraron modelos para esta llave."
              : "Configura la llave para listar los modelos disponibles."}
          </div>
        )}
        {isCurrentProviderDefault && models.length > 0 && (
          <p className="text-[11px] text-zinc-500 mt-1">
            El modelo seleccionado se usa como predeterminado global para chat,
            generación de commits y demás funciones IA.
          </p>
        )}
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
    <div className="flex flex-col gap-6 p-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
            API Key
          </Label>
          {saved ? (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-emerald-400/90">
              <CheckCircle2 className="w-3 h-3" /> configurada
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-amber-400/90">
              <XCircle className="w-3 h-3" /> faltante
            </span>
          )}
        </div>

        {saved ? (
          <div className="flex w-full items-center gap-2">
            <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-500 flex items-center gap-2 font-mono">
              <Brain className="w-4 h-4 shrink-0 text-blue-400" />
              <span className="truncate">
                {apiKey.slice(0, 6)}••••••••••{apiKey.slice(-4)}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-zinc-800 border-zinc-700/50 hover:bg-zinc-700 h-9"
              onClick={() => setSaved(false)}
            >
              Reemplazar
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-zinc-800 border-zinc-700/50 hover:bg-red-950/40 hover:text-red-300 hover:border-red-900/60 h-9"
              onClick={handleClear}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex w-full items-center gap-2">
            <Input
              type="password"
              autoComplete="off"
              placeholder="ctx7_..."
              className="bg-zinc-950 border-zinc-800 text-zinc-200 flex-1 font-mono px-3 py-2"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="bg-zinc-800 border-zinc-700/50 hover:bg-zinc-700 h-9"
              onClick={handleSave}
              disabled={!input.trim()}
            >
              Guardar
            </Button>
          </div>
        )}

        <p className="text-xs text-zinc-500 mt-1">
          Permite al Modo Sensei leer la documentación oficial actualizada de tus librerías.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
          Acerca de Context7
        </Label>
        <p className="text-xs text-zinc-500 leading-relaxed">
          Context7 provee acceso en tiempo real a la documentación oficial de React, Next.js,
          Tailwind, TypeScript, Python y cientos de librerías más. El Modo Sensei la consulta
          automáticamente para fundamentar sus respuestas en la documentación vigente.
        </p>
      </div>
    </div>
  );
}

type ActiveSection = string; // provider id, 'context7', or 'fim-config'

function FimConfigSection() {
  const fimDefaultModel = useLLMConfigStore((s) => s.fimDefaultModel);
  const setFimDefaultModel = useLLMConfigStore((s) => s.setFimDefaultModel);
  const fimFallbackModel = useLLMConfigStore((s) => s.fimFallbackModel);
  const setFimFallbackModel = useLLMConfigStore((s) => s.setFimFallbackModel);
  
  const [providers, setProviders] = useState<CuratedProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCuratedModels().then((data) => {
      if (cancelled) return;
      setProviders(data);
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const res = await fetchFimCompletion("def add(a, b):\n  ", "\n", "python", fimDefaultModel, fimFallbackModel);
      if (res.code) {
        toast.success("FIM Engine test successful!");
      } else {
        toast.error("FIM Engine test failed: No completion returned.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`FIM Engine test failed: ${message}`);
    } finally {
      setIsTesting(false);
    }
  };

  const allModels = providers.flatMap(p => p.models.map(m => ({ ...m, provider: p.provider_id })));

  return (
    <div className="flex flex-col gap-6 p-5">
      <div className="flex flex-col gap-2">
        <Label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
          Primary FIM Model
        </Label>
        {loading ? (
          <div className="flex flex-col gap-2" role="status" aria-label="Loading models">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-9 w-full rounded-md bg-zinc-950 border border-zinc-800/50 animate-pulse" />
            ))}
          </div>
        ) : (
          <Select value={fimDefaultModel} onValueChange={(val) => val && setFimDefaultModel(val)}>
            <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-200 w-full">
              <SelectValue placeholder="Selecciona el modelo principal..." />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200 max-h-[200px]">
              {allModels.map((m) => (
                <SelectItem key={m.id} value={m.id} className="focus:bg-zinc-800 focus:text-zinc-100 cursor-pointer">
                  {m.name} ({m.provider})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <p className="text-[11px] text-zinc-500 mt-1">
          El modelo que se usará por defecto para autocompletar código.
        </p>
      </div>

      <div className="flex flex-col gap-2 mt-2">
        <Label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
          Fallback FIM Model (Optional)
        </Label>
        {loading ? (
          <div className="flex flex-col gap-2" role="status" aria-label="Loading models">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-9 w-full rounded-md bg-zinc-950 border border-zinc-800/50 animate-pulse" />
            ))}
          </div>
        ) : (
          <Select value={fimFallbackModel} onValueChange={(val) => val && setFimFallbackModel(val)}>
            <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-200 w-full">
              <SelectValue placeholder="Selecciona un modelo de respaldo..." />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200 max-h-[200px]">
              <SelectItem value="none" className="focus:bg-zinc-800 focus:text-zinc-100 cursor-pointer text-zinc-400">
                Ninguno
              </SelectItem>
              {allModels.map((m) => (
                <SelectItem key={m.id} value={m.id} className="focus:bg-zinc-800 focus:text-zinc-100 cursor-pointer">
                  {m.name} ({m.provider})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <p className="text-[11px] text-zinc-500 mt-1">
          Modelo alternativo si el principal falla (ej: límites de tasa o llave no configurada).
        </p>
      </div>
      
      <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-zinc-800/50">
        <Label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
          Testing
        </Label>
        <p className="text-[11px] text-zinc-500 mb-2">
          Verifica que la configuración actual funcione enviando un fragmento de código de prueba al backend.
        </p>
        <Button
          type="button"
          disabled={isTesting || !fimDefaultModel}
          onClick={handleTest}
          variant="secondary"
          className="w-fit bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/50 h-9"
        >
          {isTesting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin text-emerald-400" />
          ) : (
            <Play className="w-4 h-4 mr-2 text-emerald-400" />
          )}
          {isTesting ? "Testeando..." : "Test FIM Engine"}
        </Button>
      </div>
    </div>
  );
}

export default function LLMSettingsPanel() {
  const defaultModel = useLLMConfigStore((s) => s.defaultModel);
  const setDefaultModel = useLLMConfigStore((s) => s.setDefaultModel);
  const context7ApiKey = useLLMConfigStore((s) => s.context7ApiKey);
  const setContext7ApiKey = useLLMConfigStore((s) => s.setContext7ApiKey);
  const [activeSection, setActiveSection] = useState<ActiveSection>("gemini");

  const handleSelectModel = useCallback(
    (provider: string, modelId: string) => {
      setDefaultModel(`${provider}/${modelId}`);
    },
    [setDefaultModel],
  );

  const isLLMProvider = activeSection !== 'context7' && activeSection !== 'fim-config';

  return (
    <div className="flex h-[440px] border border-zinc-800/50 rounded-lg overflow-hidden">
      {/* Sidebar */}
      <div className="w-[220px] bg-zinc-900/50 border-r border-zinc-800/50 flex flex-col overflow-y-auto shrink-0">
        <div className="px-3 pt-4 pb-1">
          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">
            Modelos LLM
          </span>
        </div>
        {PROVIDERS.map((provider) => {
          const isActive = activeSection === provider.id;
          return (
            <button
              key={provider.id}
              type="button"
              onClick={() => setActiveSection(provider.id)}
              className={`text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between ${
                isActive
                  ? "bg-blue-500/10 text-blue-300 border-l-2 border-blue-500 font-medium"
                  : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border-l-2 border-transparent"
              }`}
            >
              <span className="truncate">{provider.name}</span>
              {provider.id === defaultModel.split("/")[0] && (
                <span className="text-[9px] uppercase tracking-wide text-blue-400/80 ml-1 shrink-0">
                  activo
                </span>
              )}
            </button>
          );
        })}

        <div className="px-3 pt-4 pb-1 mt-1 border-t border-zinc-800/50">
          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">
            FIM Autocomplete
          </span>
        </div>
        <button
          onClick={() => setActiveSection('fim-config')}
          className={`text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${
            activeSection === 'fim-config'
              ? "bg-blue-500/10 text-blue-300 border-l-2 border-blue-500 font-medium"
              : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border-l-2 border-transparent"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          FIM Engine
        </button>

        <div className="px-3 pt-4 pb-1 mt-1 border-t border-zinc-800/50">
          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">
            Integraciones
          </span>
        </div>
        <button
          onClick={() => setActiveSection('context7')}
          className={`text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${
            activeSection === 'context7'
              ? "bg-blue-500/10 text-blue-300 border-l-2 border-blue-500 font-medium"
              : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border-l-2 border-transparent"
          }`}
        >
          <Brain className="w-3.5 h-3.5 shrink-0" />
          Context7 MCP
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 bg-zinc-900 overflow-y-auto custom-scrollbar">
        {isLLMProvider ? (
          <ProviderConfig
            key={activeSection}
            provider={activeSection}
            defaultModel={defaultModel}
            onSelectModel={handleSelectModel}
          />
        ) : activeSection === 'context7' ? (
          <Context7Section
            apiKey={context7ApiKey}
            onSave={setContext7ApiKey}
          />
        ) : (
          <FimConfigSection key="fim-config" />
        )}
      </div>
    </div>
  );
}
