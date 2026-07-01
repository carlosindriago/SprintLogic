"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchProviderModels, verifyAndSaveProviderKey, checkApiKeyStatus, ModelResult } from "@/lib/api";
import { Loader2, KeyRound } from "lucide-react";

const PROVIDERS = [
  { id: "gemini", name: "Google Gemini" },
  { id: "openai", name: "OpenAI" },
  { id: "anthropic", name: "Anthropic" },
  { id: "openrouter", name: "OpenRouter" },
];

export default function LLMSettingsPanel({
  defaultAiModel,
  setDefaultAiModel,
}: {
  defaultAiModel: string;
  setDefaultAiModel: (val: string) => void;
}) {
  const [activeProvider, setActiveProvider] = useState("gemini");
  const [keyInput, setKeyInput] = useState("");
  const [isConfigured, setIsConfigured] = useState(false);
  const [models, setModels] = useState<ModelResult[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [isFetchingModels, setIsFetchingModels] = useState(false);

  // Determine if the current default model belongs to the active provider
  const isCurrentProviderDefault = defaultAiModel.startsWith(`${activeProvider}/`);
  const activeModelId = isCurrentProviderDefault ? defaultAiModel.split("/").slice(1).join("/") : "";

  useEffect(() => {
    // Reset state when provider changes
    setKeyInput("");
    setModels([]);
    setIsConfigured(false);
    checkStatusAndLoadModels(activeProvider);
  }, [activeProvider]);

  const checkStatusAndLoadModels = async (provider: string) => {
    try {
      const status = await checkApiKeyStatus(provider);
      setIsConfigured(status.is_configured);
      
      if (status.is_configured) {
        setIsFetchingModels(true);
        const fetchedModels = await fetchProviderModels(provider);
        setModels(fetchedModels);
      }
    } catch (e) {
      console.error("Failed to load provider status", e);
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleBlurValidation = async () => {
    if (!keyInput.trim() || isValidating) return;
    
    setIsValidating(true);
    try {
      const fetchedModels = await verifyAndSaveProviderKey(activeProvider, keyInput.trim());
      setModels(fetchedModels);
      setIsConfigured(true);
      setKeyInput(""); // Clear the input since it's now saved securely
      toast.success("Llave validada y guardada", { description: "Modelos cargados correctamente" });
    } catch (e) {
      toast.error("Error de Validación", { description: String(e) });
      setKeyInput(""); // Clear on failure to prevent broken state
    } finally {
      setIsValidating(false);
    }
  };

  const handleModelSelect = (modelId: string | null) => {
    if (!modelId) return;
    const fullModelString = `${activeProvider}/${modelId}`;
    setDefaultAiModel(fullModelString);
    localStorage.setItem("default_ai_model", fullModelString);
    toast.success("Modelo Predeterminado Actualizado", { description: fullModelString });
  };

  return (
    <div className="flex h-[350px] border border-zinc-800/50 rounded-md overflow-hidden">
      {/* Sidebar de Proveedores */}
      <div className="w-1/3 bg-zinc-900/50 border-r border-zinc-800/50 flex flex-col">
        {PROVIDERS.map((provider) => (
          <button
            key={provider.id}
            onClick={() => setActiveProvider(provider.id)}
            className={`text-left px-4 py-3 text-sm transition-colors ${
              activeProvider === provider.id 
                ? "bg-zinc-800 text-zinc-100 border-l-2 border-blue-500 font-medium" 
                : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border-l-2 border-transparent"
            }`}
          >
            {provider.name}
          </button>
        ))}
      </div>

      {/* Área Principal de Configuración */}
      <div className="w-2/3 p-4 flex flex-col gap-6 bg-zinc-900">
        <div className="flex flex-col gap-2">
          <Label className="text-zinc-300">API Key</Label>
          <div className="relative flex items-center">
            {isConfigured && !keyInput ? (
              <div className="flex w-full items-center gap-2">
                <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-500 flex items-center gap-2">
                  <KeyRound className="w-4 h-4" />
                  sk-••••••••••••••••••••••••••••••••
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="bg-zinc-800 border-zinc-700/50 hover:bg-zinc-700 h-9"
                  onClick={() => {
                    setIsConfigured(false);
                    setModels([]);
                  }}
                >
                  Reemplazar
                </Button>
              </div>
            ) : (
              <div className="relative w-full">
                <Input
                  type="password"
                  placeholder="Pega tu API Key aquí..."
                  className="bg-zinc-950 border-zinc-800 text-zinc-200 pr-10"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  onBlur={handleBlurValidation}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleBlurValidation();
                  }}
                  disabled={isValidating}
                />
                {isValidating && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                  </div>
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-zinc-500">
            {isConfigured ? "Llave guardada de forma segura." : "La llave se validará automáticamente al salir del campo."}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label className="text-zinc-300">Modelo Predeterminado</Label>
          {isFetchingModels ? (
            <div className="flex items-center gap-2 text-sm text-zinc-500 py-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando modelos...
            </div>
          ) : models.length > 0 ? (
            <Select 
              value={activeModelId} 
              onValueChange={handleModelSelect}
            >
              <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-200 w-full">
                <SelectValue placeholder="Selecciona un modelo..." />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200 max-h-[200px]">
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="focus:bg-zinc-800 focus:text-zinc-100 cursor-pointer">
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="text-sm text-zinc-500 bg-zinc-950 border border-zinc-800/50 rounded-md px-3 py-2">
              {isConfigured 
                ? "No se encontraron modelos." 
                : "Configura la llave para ver los modelos."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
