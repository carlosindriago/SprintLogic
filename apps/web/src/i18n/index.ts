import { en } from './en';
import { es } from './es';
import { pt } from './pt';

export const translations = {
  en,
  es,
  pt,
};

export type Language = keyof typeof translations;
export type TranslationKey = keyof typeof en;
export type TranslationScope = typeof en;
