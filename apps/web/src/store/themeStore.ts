import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AccentColor = 'blue' | 'purple' | 'emerald';
export type UiScale = 'compact' | 'normal' | 'large';

interface ThemeState {
  accentColor: AccentColor;
  uiScale: UiScale;
  setAccentColor: (color: AccentColor) => void;
  setUiScale: (scale: UiScale) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      accentColor: 'blue',
      uiScale: 'normal',
      setAccentColor: (color) => set({ accentColor: color }),
      setUiScale: (scale) => set({ uiScale: scale }),
    }),
    {
      name: 'sprintlogic-theme-storage',
    }
  )
);
