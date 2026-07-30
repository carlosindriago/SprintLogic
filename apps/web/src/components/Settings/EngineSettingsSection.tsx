 
 
 
/* eslint-disable react/no-unescaped-entities */
 

"use client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export default function EngineSettingsSection() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-white">Motor de Análisis (Engine)</h2>
        <p className="text-sm text-zinc-400 mt-1">Reglas de indexación, parsing AST y detección de anti-patrones.</p>
      </div>
      
      <div className="grid gap-6 bg-zinc-900/50 p-6 rounded-lg border border-zinc-800/50">
        <div className="flex flex-col gap-3">
          <Label className="text-sm font-semibold text-zinc-200">Exclusiones Adicionales (Glob patterns)</Label>
          <textarea 
            className="min-h-[100px] bg-zinc-950 border border-zinc-800 text-zinc-200 font-mono text-sm rounded-md px-3 py-2 w-full resize-y"
            defaultValue={`node_modules/
dist/
.git/
build/`}
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-3">
            <Label className="text-sm font-semibold text-zinc-200">Umbral "God Object" (Líneas)</Label>
            <Input 
              type="number"
              className="bg-zinc-950 border-zinc-800 text-zinc-200"
              defaultValue="500"
            />
          </div>
          <div className="flex flex-col gap-3">
            <Label className="text-sm font-semibold text-zinc-200">Límite Parsing AST (Archivos)</Label>
            <Input 
              type="number"
              className="bg-zinc-950 border-zinc-800 text-zinc-200"
              defaultValue="2000"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
