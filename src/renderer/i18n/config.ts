import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import es from './locales/es.json';
import en from './locales/en.json';
import de from './locales/de.json';
import hu from './locales/hu.json';

const SUPPORTED = ['es', 'en', 'de', 'hu'] as const;
type SupportedLng = (typeof SUPPORTED)[number];

const mode = import.meta.env.MODE;
const defaultLng: SupportedLng = mode === 'international' ? 'en' : 'es';

function resolveLng(): SupportedLng {
  try {
    const stored = localStorage.getItem('i18nextLng');
    if (stored) {
      const base = stored.split('-')[0].toLowerCase();
      if ((SUPPORTED as readonly string[]).includes(base)) return base as SupportedLng;
    }
  } catch {
    /* ignore */
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    const base = navigator.language.split('-')[0].toLowerCase();
    if ((SUPPORTED as readonly string[]).includes(base)) return base as SupportedLng;
  }
  return defaultLng;
}

i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
    de: { translation: de },
    hu: { translation: hu },
  },
  lng: resolveLng(),
  fallbackLng: defaultLng,
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
