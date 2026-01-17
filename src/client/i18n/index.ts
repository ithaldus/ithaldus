import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import et from './et.json'

// Get saved language or default to English
const savedLanguage = localStorage.getItem('language') || 'en'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      et: { translation: et },
    },
    lng: savedLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes
    },
  })

// Save language preference when changed
i18n.on('languageChanged', (lng) => {
  localStorage.setItem('language', lng)
})

export default i18n
