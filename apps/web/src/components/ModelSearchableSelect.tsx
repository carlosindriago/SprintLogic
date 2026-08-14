"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Search, ChevronDown, Check, X, Sparkles, Filter, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModelHealthMetric } from "@/lib/api";
import { ModelHealthBadge } from "./ModelHealthBadge";

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  provider_id: string;
}

export interface ModelSearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  models: ModelOption[];
  healthMetrics?: Record<string, ModelHealthMetric>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  popoverWidthClass?: string;
  allowDefault?: boolean;
  defaultLabel?: string;
  allowNone?: boolean;
  noneLabel?: string;
  renderEffectivePreview?: boolean;
}

export function ModelSearchableSelect({
  value,
  onChange,
  models,
  healthMetrics = {},
  placeholder = "Selecciona un modelo...",
  disabled = false,
  className,
  popoverWidthClass = "w-[480px] max-w-[95vw]",
  allowDefault = false,
  defaultLabel = "Usar modelo por defecto",
  allowNone = false,
  noneLabel = "Ninguno",
}: ModelSearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [selectedHealthFilter, setSelectedHealthFilter] = useState<string>("all");

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const getMetric = (providerId?: string, modelId?: string): ModelHealthMetric | undefined => {
    if (!modelId) return undefined;
    return (
      healthMetrics[modelId] ||
      healthMetrics[`${providerId}/${modelId}`] ||
      healthMetrics[modelId.replace(/^[^\/]+\//, "")] ||
      undefined
    );
  };

  // Provider list with model counts
  const providersList = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    models.forEach((m) => {
      const key = m.provider_id || m.provider || "other";
      const name = m.provider || m.provider_id || "Otro";
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, { id: key, name, count: 1 });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [models]);

  // Health statistics counts
  const healthStats = useMemo(() => {
    let healthy = 0;
    let degraded = 0;
    let failing = 0;
    let untested = 0;
    models.forEach((m) => {
      const metric = getMetric(m.provider_id, m.id);
      const status = metric?.status || "untested";
      if (status === "healthy") healthy++;
      else if (status === "degraded") degraded++;
      else if (status === "failing") failing++;
      else untested++;
    });
    return { healthy, degraded, failing, untested, total: models.length };
  }, [models, healthMetrics]);

  const filteredModels = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return models.filter((m) => {
      // Provider filter (match provider_id or provider display name)
      if (
        selectedProvider !== "all" &&
        m.provider_id !== selectedProvider &&
        m.provider !== selectedProvider
      ) {
        return false;
      }

      // Health filter
      const metric = getMetric(m.provider_id, m.id);
      const status = metric?.status || "untested";
      if (selectedHealthFilter !== "all" && status !== selectedHealthFilter) {
        return false;
      }

      // Search query
      if (q) {
        const matchesName = m.name.toLowerCase().includes(q);
        const matchesId = m.id.toLowerCase().includes(q);
        const matchesProvider = m.provider.toLowerCase().includes(q);
        return matchesName || matchesId || matchesProvider;
      }

      return true;
    });
  }, [models, searchQuery, selectedProvider, selectedHealthFilter, healthMetrics]);

  const hasActiveFilters = selectedProvider !== "all" || selectedHealthFilter !== "all" || searchQuery.length > 0;

  const resetFilters = () => {
    setSelectedProvider("all");
    setSelectedHealthFilter("all");
    setSearchQuery("");
  };

  // Selected item display resolution
  const selectedModel = models.find(
    (m) => m.id === value || `${m.provider_id}/${m.id}` === value || m.name === value
  );
  const selectedMetric = selectedModel ? getMetric(selectedModel.provider_id, selectedModel.id) : undefined;

  let triggerLabel = placeholder;
  if (value === "__default__") {
    triggerLabel = defaultLabel;
  } else if (value === "__none__" || !value) {
    triggerLabel = allowNone ? noneLabel : placeholder;
  } else if (selectedModel) {
    triggerLabel = selectedModel.name;
  } else {
    triggerLabel = value;
  }

  return (
    <div ref={containerRef} className={cn("relative inline-block w-full", className)}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={cn(
          "flex items-center justify-between gap-2 w-full px-3 py-2 text-sm rounded-md border text-left transition-colors",
          "bg-zinc-950 border-zinc-800 text-zinc-200 hover:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-blue-500",
          disabled && "opacity-50 cursor-not-allowed",
          isOpen && "border-blue-500/50 ring-1 ring-blue-500/20"
        )}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {value === "__default__" ? (
            <span className="text-zinc-400 truncate text-xs">{defaultLabel}</span>
          ) : value === "__none__" || !value ? (
            <span className="text-zinc-500 truncate text-xs">{triggerLabel}</span>
          ) : (
            <div className="flex items-center gap-2 min-w-0 truncate">
              {selectedModel && (
                <span className="text-blue-400 font-medium text-xs shrink-0">
                  {selectedModel.provider}:
                </span>
              )}
              <span className="text-zinc-200 text-xs font-mono truncate">{triggerLabel}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {selectedMetric && <ModelHealthBadge metric={selectedMetric} />}
          <ChevronDown
            className={cn("w-4 h-4 text-zinc-400 transition-transform duration-200", isOpen && "rotate-180")}
          />
        </div>
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div
          className={cn(
            "absolute z-50 mt-1 right-0 top-full bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl p-3 flex flex-col gap-2.5 backdrop-blur-xl animate-in fade-in-0 zoom-in-95",
            popoverWidthClass
          )}
        >
          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-2.5 top-2.5" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre, ID o proveedor..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md pl-9 pr-8 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Row: Selects for Provider & Health Status */}
          <div className="grid grid-cols-2 gap-2 pb-2 border-b border-zinc-800/80">
            {/* Provider Filter Select */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">
                  Proveedor
                </label>
                {selectedProvider !== "all" && (
                  <span className="text-[10px] text-blue-400 font-mono">filtrado</span>
                )}
              </div>
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="all">Todos los proveedores ({models.length})</option>
                {providersList.map(({ id, name, count }) => (
                  <option key={id} value={id}>
                    {name} ({count})
                  </option>
                ))}
              </select>
            </div>

            {/* Health Filter Select */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">
                  Salud / Estado
                </label>
                {selectedHealthFilter !== "all" && (
                  <span className="text-[10px] text-blue-400 font-mono">filtrado</span>
                )}
              </div>
              <select
                value={selectedHealthFilter}
                onChange={(e) => setSelectedHealthFilter(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="all">Todos los estados ({models.length})</option>
                <option value="healthy">🟢 Healthy ({healthStats.healthy})</option>
                <option value="degraded">🟡 Degraded ({healthStats.degraded})</option>
                <option value="failing">🔴 Failing ({healthStats.failing})</option>
                <option value="untested">⚪ Sin llamadas ({healthStats.untested})</option>
              </select>
            </div>
          </div>

          {/* Active filter summary & Clear button */}
          {hasActiveFilters && (
            <div className="flex items-center justify-between px-1 text-[11px] text-zinc-400">
              <span>
                Mostrando {filteredModels.length} de {models.length} modelos
              </span>
              <button
                type="button"
                onClick={resetFilters}
                className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-[11px]"
              >
                <RotateCcw className="w-3 h-3" /> Limpiar filtros
              </button>
            </div>
          )}

          {/* Model Options List */}
          <div className="flex flex-col gap-1 max-h-[260px] overflow-y-auto pr-1">
            {/* Special Option: Default */}
            {allowDefault && (
              <button
                type="button"
                onClick={() => {
                  onChange("__default__");
                  setIsOpen(false);
                }}
                className={cn(
                  "flex items-center justify-between p-2 rounded-md text-xs text-left transition-colors",
                  value === "__default__"
                    ? "bg-blue-600/20 text-blue-300 border border-blue-500/30"
                    : "hover:bg-zinc-800/70 text-zinc-400"
                )}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                  <span>{defaultLabel}</span>
                </div>
                {value === "__default__" && <Check className="w-3.5 h-3.5 text-blue-400" />}
              </button>
            )}

            {/* Special Option: None */}
            {allowNone && (
              <button
                type="button"
                onClick={() => {
                  onChange("__none__");
                  setIsOpen(false);
                }}
                className={cn(
                  "flex items-center justify-between p-2 rounded-md text-xs text-left transition-colors",
                  value === "__none__" || !value
                    ? "bg-zinc-800 text-zinc-300 border border-zinc-700"
                    : "hover:bg-zinc-800/70 text-zinc-500"
                )}
              >
                <span>{noneLabel}</span>
                {(value === "__none__" || !value) && <Check className="w-3.5 h-3.5 text-zinc-400" />}
              </button>
            )}

            {/* Empty state */}
            {filteredModels.length === 0 && (
              <div className="py-6 text-center text-xs text-zinc-500">
                No se encontraron modelos con los filtros seleccionados.
              </div>
            )}

            {/* Filtered Models */}
            {filteredModels.map((m) => {
              const fullVal = `${m.provider_id}/${m.id}`;
              const isSelected = value === m.id || value === fullVal || value === m.name;
              const metric = getMetric(m.provider_id, m.id);

              return (
                <button
                  key={`${m.provider_id}-${m.id}`}
                  type="button"
                  onClick={() => {
                    onChange(fullVal);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "flex items-center justify-between gap-3 p-2 rounded-md text-left transition-colors group",
                    isSelected
                      ? "bg-blue-600/20 text-white border border-blue-500/30"
                      : "hover:bg-zinc-800/70 text-zinc-300"
                  )}
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-zinc-100 truncate group-hover:text-blue-300 transition-colors">
                        {m.name}
                      </span>
                      <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1 rounded border border-zinc-700/50">
                        {m.provider}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-zinc-500 truncate mt-0.5">
                      {m.id}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <ModelHealthBadge metric={metric} />
                    {isSelected && <Check className="w-4 h-4 text-blue-400 shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
