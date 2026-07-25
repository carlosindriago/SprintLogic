"use client";

import { Plug, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function IntegrationsSettingsSection() {
  const isConnected = false;

  return (
    <div className="flex flex-col gap-8 h-full">
      <div>
        <h2 className="text-2xl font-semibold text-white">Integraciones MCP</h2>
        <p className="text-sm text-zinc-400 mt-1">Configura integraciones de protocolos de contexto de modelo (Model Context Protocol).</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 overflow-y-auto pr-2 pb-8">
        {/* Context7 MCP Card */}
        <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="p-2.5 bg-blue-500/10 rounded-lg">
              <Plug className="w-6 h-6 text-blue-400" />
            </div>
            {isConnected ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded-full">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Conectado
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 bg-zinc-800 px-2.5 py-1 rounded-full">
                <XCircle className="w-3.5 h-3.5" />
                Inactivo
              </span>
            )}
          </div>
          
          <div>
            <h3 className="text-lg font-medium text-white">Context7 MCP</h3>
            <p className="text-sm text-zinc-400 mt-1 line-clamp-2">
              Provee contexto de repositorios remotos y telemetría a través del protocolo estándar MCP.
            </p>
          </div>

          <div className="mt-auto pt-4 border-t border-zinc-800/60">
            <Button 
              variant={isConnected ? "outline" : "default"}
              className={isConnected 
                ? "w-full bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white" 
                : "w-full bg-blue-600 hover:bg-blue-700 text-white border-transparent"
              }
            >
              {isConnected ? "Configurar" : "Conectar"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
