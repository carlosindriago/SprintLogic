import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  isVimEnabled: boolean;
  isFimEnabled: boolean;
  setVimEnabled: (enabled: boolean) => void;
  setFimEnabled: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      isVimEnabled: false,
      isFimEnabled: true,
      setVimEnabled: (enabled) => set({ isVimEnabled: enabled }),
      setFimEnabled: (enabled) => set({ isFimEnabled: enabled }),
    }),
    {
      name: 'sprintlogic-settings',
      partialize: (state) => ({
        isVimEnabled: state.isVimEnabled,
        isFimEnabled: state.isFimEnabled,
      }),
    },
  ),
);
