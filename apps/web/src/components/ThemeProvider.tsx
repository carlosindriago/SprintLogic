"use client";

import { useEffect } from "react";
import { useThemeStore } from "@/store/themeStore";

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { accentColor, uiScale } = useThemeStore();

  useEffect(() => {
    const root = document.documentElement;

    // Remove existing theme classes
    root.classList.remove('theme-blue', 'theme-purple', 'theme-emerald');
    root.classList.add(`theme-${accentColor}`);

    // Adjust font size base on UI scale
    if (uiScale === 'compact') {
      root.style.fontSize = '14px';
    } else if (uiScale === 'large') {
      root.style.fontSize = '18px';
    } else {
      root.style.fontSize = '16px'; // normal
    }

    // Set some CSS variables based on accent
    if (accentColor === 'blue') {
      root.style.setProperty('--primary', '221.2 83.2% 53.3%');
    } else if (accentColor === 'purple') {
      root.style.setProperty('--primary', '262.1 83.3% 57.8%');
    } else if (accentColor === 'emerald') {
      root.style.setProperty('--primary', '142.1 76.2% 36.3%');
    }
  }, [accentColor, uiScale]);

  return <>{children}</>;
}
