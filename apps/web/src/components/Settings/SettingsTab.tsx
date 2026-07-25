"use client";

import { useEffect, useMemo } from "react";
import { Bot, FileCode2, GitBranch, ScanSearch, Palette, Settings, Wrench, Plug } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/store/settingsStore";
import { useTranslation } from "@/hooks/useTranslation";
import AIProvidersSection from "./AIProvidersSection";
import PromptRegistrySection from "./PromptRegistrySection";
import GitSettingsSection from "./GitSettingsSection";
import EngineSettingsSection from "./EngineSettingsSection";
import AppearanceSettingsSection from "./AppearanceSettingsSection";
import ToolsSettingsSection from "./ToolsSettingsSection";
import IntegrationsSettingsSection from "./IntegrationsSettingsSection";

type SettingsSection = "providers" | "tools" | "prompts" | "git" | "integrations" | "engine" | "appearance";

interface NavItem {
  id: SettingsSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "NÚCLEO IA & EJECUCIÓN",
    items: [
      {
        id: "providers",
        label: "IA & Modelos",
        icon: Bot,
        description: "Proveedores, modelos y claves API",
      },
      {
        id: "tools",
        label: "Herramientas",
        icon: Wrench,
        description: "Configuración de herramientas",
      },
      {
        id: "prompts",
        label: "Prompt Registry",
        icon: FileCode2,
        description: "Editor de instrucciones del sistema",
      },
    ]
  },
  {
    label: "ECOSISTEMA",
    items: [
      {
        id: "git",
        label: "Git & DevOps",
        icon: GitBranch,
        description: "Estrategia de ramas y control de versiones",
      },
      {
        id: "integrations",
        label: "Integraciones MCP",
        icon: Plug,
        description: "Configuración de integraciones de contexto",
      },
    ]
  },
  {
    label: "SISTEMA",
    items: [
      {
        id: "engine",
        label: "Motor de Análisis",
        icon: ScanSearch,
        description: "Reglas de exclusión y umbrales AST",
      },
      {
        id: "appearance",
        label: "Apariencia",
        icon: Palette,
        description: "Tema, escala y preferencias del editor",
      },
    ]
  }
];

const SECTION_COMPONENTS: Record<SettingsSection, React.ComponentType> = {
  providers: AIProvidersSection,
  tools: ToolsSettingsSection,
  prompts: PromptRegistrySection,
  git: GitSettingsSection,
  integrations: IntegrationsSettingsSection,
  engine: EngineSettingsSection,
  appearance: AppearanceSettingsSection,
};

interface SettingsTabProps {
  data?: {
    initialSection?: string;
  };
}

export default function SettingsTab({ data }: SettingsTabProps) {
  const { settingsActiveSection, setSettingsActiveSection } = useSettingsStore();
  const { t } = useTranslation();

  // Deep-link to a specific section if passed via tab data
  useEffect(() => {
    if (data?.initialSection && data.initialSection !== settingsActiveSection) {
      setSettingsActiveSection(data.initialSection);
    }
    // Only run on mount — intentionally omitting settingsActiveSection to avoid overwrite on re-renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.initialSection]);

  const activeSection = (settingsActiveSection as SettingsSection) ?? "providers";
  const ActiveComponent = SECTION_COMPONENTS[activeSection] ?? AIProvidersSection;

  return (
    <div className="flex h-full bg-zinc-950 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 flex flex-col border-r border-zinc-800 bg-zinc-950">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-5 border-b border-zinc-800/60">
          <Settings className="w-4 h-4 text-zinc-400 shrink-0" />
          <span className="text-sm font-semibold text-zinc-200 tracking-tight">
            {t('settings.title')}
          </span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-4 overflow-y-auto space-y-6">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <h3 className="px-4 text-[10px] font-bold tracking-widest text-zinc-500 uppercase mb-2">
                {group.label}
              </h3>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSettingsActiveSection(item.id)}
                      className={cn(
                        "w-full text-left flex items-center gap-3 px-4 py-2 text-sm transition-all duration-150",
                        "border-l-2 hover:bg-zinc-800/50",
                        isActive
                          ? "border-blue-500 bg-zinc-800/60 text-white"
                          : "border-transparent text-zinc-400 hover:text-zinc-200"
                      )}
                    >
                      <Icon
                        className={cn(
                          "w-4 h-4 shrink-0 transition-colors",
                          isActive ? "text-blue-400" : "text-zinc-500 group-hover:text-zinc-300"
                        )}
                      />
                      <span className="font-medium leading-tight">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer branding */}
        <div className="px-4 py-3 border-t border-zinc-800/60">
          <p className="text-[10px] text-zinc-600 font-mono">SprintLogic v0.1</p>
        </div>
      </aside>

      {/* Viewport */}
      <main className="flex-1 overflow-y-auto">
        <div className="w-full h-full px-12 py-10">
          <ActiveComponent />
        </div>
      </main>
    </div>
  );

}
