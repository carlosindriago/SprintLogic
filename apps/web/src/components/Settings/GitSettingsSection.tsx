"use client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function GitSettingsSection() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-white">Git & DevOps</h2>
        <p className="text-sm text-zinc-400 mt-1">Preferencias de control de versiones y convenciones de equipo.</p>
      </div>
      
      <div className="grid gap-6 bg-zinc-900/50 p-6 rounded-lg border border-zinc-800/50">
        <div className="flex flex-col gap-3">
          <Label className="text-sm font-semibold text-zinc-200">Estrategia de Ramas</Label>
          <Select defaultValue="lazy">
            <SelectTrigger className="w-[300px] bg-zinc-950 border-zinc-800 text-zinc-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
              <SelectItem value="lazy">Lazy Branching (Recomendado)</SelectItem>
              <SelectItem value="gitflow">Git Flow Tradicional</SelectItem>
              <SelectItem value="trunk">Trunk-based Development</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-3">
          <Label className="text-sm font-semibold text-zinc-200">Patrón de Ramas (Features)</Label>
          <Input 
            className="w-[300px] bg-zinc-950 border-zinc-800 text-zinc-200"
            defaultValue="feat/{ticket}-{description}"
          />
        </div>
      </div>
    </div>
  );
}
