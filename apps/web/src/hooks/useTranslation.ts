import { useCallback } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { translations, Language } from '../i18n';

// Simple nested path resolver for objects
// e.g., getNestedValue({ a: { b: 1 } }, 'a.b') => 1
function getNestedValue(obj: Record<string, unknown> | unknown, path: string): string | undefined {
  return path.split('.').reduce((acc: unknown, part: string) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

export const useTranslation = () => {
  const language = useSettingsStore((state) => state.language) as Language;
  
  const t = useCallback((key: string) => {
    const defaultLang = translations['en'];
    const currentLangDict = translations[language] || defaultLang;

    // Try current language first
    let val = getNestedValue(currentLangDict, key);
    
    // Fallback to English
    if (val === undefined) {
      val = getNestedValue(defaultLang, key);
    }
    
    return (val as string) || key;
  }, [language]);

  return { t, language };
};
