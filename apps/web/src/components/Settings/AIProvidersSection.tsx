"use client";
import LLMSettingsPanel from "../LLMSettingsPanel";

export default function AIProvidersSection() {
  return (
    <div className="flex flex-col gap-6 h-full">
      <div>
        <h2 className="text-2xl font-semibold text-white">IA y Modelos</h2>
        <p className="text-sm text-zinc-400 mt-1">Configura tus proveedores de IA y llaves API.</p>
      </div>
      <div className="flex-1 overflow-hidden">
        <LLMSettingsPanel />
      </div>
    </div>
  );
}
