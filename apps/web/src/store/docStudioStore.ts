import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type FontSize = 'sm' | 'base' | 'lg';
export type ZenTheme = 'light' | 'dark' | 'sepia';
export type LineHeight = 'relaxed' | 'loose';

interface DocStudioState {
  fontSize: FontSize;
  theme: ZenTheme;
  lineHeight: LineHeight;
  setFontSize: (size: FontSize) => void;
  setTheme: (theme: ZenTheme) => void;
  setLineHeight: (height: LineHeight) => void;
}

export const useDocStudioStore = create<DocStudioState>()(
  persist(
    (set) => ({
      fontSize: 'base',
      theme: 'dark',
      lineHeight: 'relaxed',
      setFontSize: (size) => set({ fontSize: size }),
      setTheme: (theme) => set({ theme }),
      setLineHeight: (height) => set({ lineHeight: height }),
    }),
    {
      name: 'doc-studio-storage',
    }
  )
);
