import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      "dashboard": "Dashboard",
      "inventory": "Inventory",
      "smartprep": "SmartPrep",
      "timeclock": "Time Clock",
      "settings": "Settings",
      "logout": "Log Out",
      "welcome": "Welcome back",
      "punch_in": "Clock In",
      "punch_out": "Clock Out",
      "recipes": "Recipes",
      "language": "Language"
    }
  },
  es: {
    translation: {
      "dashboard": "Panel de Control",
      "inventory": "Inventario",
      "smartprep": "Prep Inteligente",
      "timeclock": "Reloj de Fichaje",
      "settings": "Configuración",
      "logout": "Cerrar Sesión",
      "welcome": "Bienvenido de nuevo",
      "punch_in": "Fichar Entrada",
      "punch_out": "Fichar Salida",
      "recipes": "Recetas",
      "language": "Idioma"
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: "en", // default language
    fallbackLng: "en",
    interpolation: {
      escapeValue: false 
    }
  });

export default i18n;
