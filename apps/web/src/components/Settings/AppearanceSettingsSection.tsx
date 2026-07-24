"use client";
import { useThemeStore, AccentColor, UiScale } from '@/store/themeStore';
import { useSettingsStore, SupportedLanguage } from '@/store/settingsStore';
import { useTranslation } from '@/hooks/useTranslation';
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export default function AppearanceSettingsSection() {
  const { accentColor, setAccentColor, uiScale, setUiScale } = useThemeStore();
  const { isVimEnabled, setVimEnabled, language, setLanguage } = useSettingsStore();
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-white">{t('settings.appearance')}</h2>
        <p className="text-sm text-zinc-400 mt-1">Personaliza el tema, idioma y comportamiento del editor.</p>
      </div>

      <div className="grid gap-6 bg-zinc-900/50 p-6 rounded-lg border border-zinc-800/50">
        
        <div className="flex flex-col gap-3">
          <Label className="text-sm font-semibold text-zinc-200">{t('settings.language')}</Label>
          <Select value={language} onValueChange={(val: SupportedLanguage | null) => { if (val) setLanguage(val); }}>
            <SelectTrigger className="w-[200px] bg-zinc-950 border-zinc-800 text-zinc-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="es">Español</SelectItem>
              <SelectItem value="pt">Português</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-3">
          <Label className="text-sm font-semibold text-zinc-200">Color de Acento</Label>
          <Select value={accentColor} onValueChange={(val: AccentColor | null) => { if (val) setAccentColor(val); }}>
            <SelectTrigger className="w-[200px] bg-zinc-950 border-zinc-800 text-zinc-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
              <SelectItem value="blue">Azul</SelectItem>
              <SelectItem value="purple">Púrpura</SelectItem>
              <SelectItem value="emerald">Esmeralda</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-3">
          <Label className="text-sm font-semibold text-zinc-200">Tamaño de UI</Label>
          <Select value={uiScale} onValueChange={(val: UiScale | null) => { if (val) setUiScale(val); }}>
            <SelectTrigger className="w-[200px] bg-zinc-950 border-zinc-800 text-zinc-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
              <SelectItem value="compact">Compacto</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="large">Grande</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center space-x-2 pt-4 border-t border-zinc-800/50">
          <Switch id="vim-mode-settings" checked={isVimEnabled} onCheckedChange={setVimEnabled} />
          <Label htmlFor="vim-mode-settings" className="text-sm font-semibold text-zinc-200">Habilitar Modo Vim en Editor</Label>
        </div>
      </div>
    </div>
  );
}
