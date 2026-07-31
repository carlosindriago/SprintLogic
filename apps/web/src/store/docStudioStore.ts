import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type FontSize = 'sm' | 'base' | 'lg';
export type ZenTheme = 'light' | 'dark' | 'sepia';
export type LineHeight = 'relaxed' | 'loose';

interface DocStudioState {
  fontSize: FontSize;
  theme: ZenTheme;
  lineHeight: LineHeight;
  activeZenFilePath: string | null;
  setFontSize: (size: FontSize) => void;
  setTheme: (theme: ZenTheme) => void;
  setLineHeight: (height: LineHeight) => void;
  setActiveZenFilePath: (path: string | null) => void;
}

export const useDocStudioStore = create<DocStudioState>()(
  persist(
    (set) => ({
      fontSize: 'base',
      theme: 'dark',
      lineHeight: 'relaxed',
      activeZenFilePath: null,
      setFontSize: (size) => set({ fontSize: size }),
      setTheme: (theme) => set({ theme }),
      setLineHeight: (height) => set({ lineHeight: height }),
      setActiveZenFilePath: (path) => set({ activeZenFilePath: path }),
    }),
    {
      name: 'doc-studio-storage',
    }
  )
);
