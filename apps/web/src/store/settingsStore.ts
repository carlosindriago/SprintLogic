import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SupportedLanguage = 'en' | 'es' | 'pt';

const getBrowserLanguage = (): SupportedLanguage => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'en';
  }
  const lang = navigator.language.split('-')[0];
  if (['en', 'es', 'pt'].includes(lang)) {
    return lang as SupportedLanguage;
  }
  return 'en';
};

interface SettingsState {
  isVimEnabled: boolean;
  isFimEnabled: boolean;
  language: SupportedLanguage;
  settingsActiveSection: string;
  globalDefault: string;
  configuredModels: Record<string, string>;
  setVimEnabled: (enabled: boolean) => void;
  setFimEnabled: (enabled: boolean) => void;
  setLanguage: (lang: SupportedLanguage) => void;
  setSettingsActiveSection: (section: string) => void;
  setGlobalDefault: (model: string) => void;
  setConfiguredModel: (provider: string, model: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      isVimEnabled: false,
      isFimEnabled: true,
      language: getBrowserLanguage(),
      settingsActiveSection: 'general',
      globalDefault: 'google_gemini__gemini-2.0-flash',
      configuredModels: {},
      setVimEnabled: (enabled) => set({ isVimEnabled: enabled }),
      setFimEnabled: (enabled) => set({ isFimEnabled: enabled }),
      setLanguage: (lang) => set({ language: lang }),
      setSettingsActiveSection: (section) => set({ settingsActiveSection: section }),
      setGlobalDefault: (model) => set({ globalDefault: model }),
      setConfiguredModel: (provider, model) => 
        set((state) => ({
          configuredModels: { ...state.configuredModels, [provider]: model }
        })),
    }),
    {
      name: 'sprintlogic-settings',
      partialize: (state) => ({
        isVimEnabled: state.isVimEnabled,
        isFimEnabled: state.isFimEnabled,
        language: state.language,
        settingsActiveSection: state.settingsActiveSection,
        globalDefault: state.globalDefault,
        configuredModels: state.configuredModels,
      }),
    },
  ),
);
