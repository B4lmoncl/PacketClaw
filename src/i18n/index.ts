import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import de from '../../content/i18n/de.json';
import en from '../../content/i18n/en.json';

void i18n.use(initReactI18next).init({
  resources: {
    de: { translation: de },
    en: { translation: en },
  },
  lng: 'de',
  fallbackLng: 'de',
  interpolation: { escapeValue: false },
});

export default i18n;
