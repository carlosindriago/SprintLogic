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
  setVimEnabled: (enabled: boolean) => void;
  setFimEnabled: (enabled: boolean) => void;
  setLanguage: (lang: SupportedLanguage) => void;
  setSettingsActiveSection: (section: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      isVimEnabled: false,
      isFimEnabled: true,
      language: getBrowserLanguage(),
      settingsActiveSection: 'general',
      setVimEnabled: (enabled) => set({ isVimEnabled: enabled }),
      setFimEnabled: (enabled) => set({ isFimEnabled: enabled }),
      setLanguage: (lang) => set({ language: lang }),
      setSettingsActiveSection: (section) => set({ settingsActiveSection: section }),
    }),
    {
      name: 'sprintlogic-settings',
      partialize: (state) => ({
        isVimEnabled: state.isVimEnabled,
        isFimEnabled: state.isFimEnabled,
        language: state.language,
        settingsActiveSection: state.settingsActiveSection,
      }),
    },
  ),
);
