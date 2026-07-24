"use client";
import LLMSettingsPanel from "../LLMSettingsPanel";

export default function AIProvidersSection() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-white">IA y Modelos</h2>
        <p className="text-sm text-zinc-400 mt-1">Configura tus proveedores de IA y llaves API.</p>
      </div>
      <div className="border border-zinc-800/50 rounded-lg bg-zinc-900/20 overflow-hidden">
        <LLMSettingsPanel />
      </div>
    </div>
  );
}
