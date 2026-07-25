"use client";

import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wrench } from "lucide-react";

export default function ToolsSettingsSection() {
  const [tools] = useState([
    { id: "tool-git", name: "Git Analyzer", description: "Analiza el historial de Git", defaultOverride: "global" },
    { id: "tool-fs", name: "File System Scanner", description: "Escanea el sistema de archivos local", defaultOverride: "2" },
    { id: "tool-ast", name: "AST Parser", description: "Genera árboles de sintaxis abstracta", defaultOverride: "global" },
  ]);

  return (
    <div className="flex flex-col gap-8 h-full">
      <div>
        <h2 className="text-2xl font-semibold text-white">Herramientas</h2>
        <p className="text-sm text-zinc-400 mt-1">Configura las herramientas del sistema y sus modelos específicos (Overrides).</p>
      </div>
      
      <div className="space-y-4 flex-1 overflow-y-auto pr-2 pb-8">
        {tools.map((tool) => (
          <div key={tool.id} className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg flex justify-between items-center gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-zinc-800 rounded-md shrink-0">
                <Wrench className="w-5 h-5 text-zinc-400" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-white">{tool.name}</h3>
                <p className="text-xs text-zinc-400 mt-0.5">{tool.description}</p>
              </div>
            </div>
            
            <div className="w-64 shrink-0">
              <Select defaultValue={tool.defaultOverride}>
                <SelectTrigger className="w-full bg-zinc-950 border-zinc-800 text-zinc-200">
                  <SelectValue placeholder="Selecciona override" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Predeterminado Global</SelectItem>
                  <SelectItem value="1">Default OpenAI (openai)</SelectItem>
                  <SelectItem value="2">Mi Azure OpenAI (openai)</SelectItem>
                  <SelectItem value="3">Claude (anthropic)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
