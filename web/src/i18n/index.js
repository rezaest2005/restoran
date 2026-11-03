import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import fa from "./locales/fa.json";
import en from "./locales/en.json";

/**
 * ترجمه‌های تکمیلی: هر فایل `locales/parts/<نام>.fa.json` و `<نام>.en.json`
 * کلیدهای سطح‌بالای خودش را (با پیشوند یکتا) به ترجمه‌ی اصلی اضافه می‌کند.
 */
function mergeParts(base, parts) {
  const out = { ...base };
  for (const mod of Object.values(parts)) {
    for (const [ns, value] of Object.entries(mod)) {
      if (ns in base) {
        console.warn(`[i18n] namespace "${ns}" با ترجمه‌ی اصلی تداخل دارد و نادیده گرفته شد`);
        continue;
      }
      out[ns] = value;
    }
  }
  return out;
}

const faParts = import.meta.glob("./locales/parts/*.fa.json", { eager: true, import: "default" });
const enParts = import.meta.glob("./locales/parts/*.en.json", { eager: true, import: "default" });

let savedLang = "fa";
try {
  savedLang = localStorage.getItem("app_lang") || "fa";
} catch {
  /* localStorage در دسترس نیست */
}

i18n.use(initReactI18next).init({
  resources: {
    fa: { translation: mergeParts(fa, faParts) },
    en: { translation: mergeParts(en, enParts) },
  },
  lng: savedLang,
  fallbackLng: "fa",
  supportedLngs: ["fa", "en"],
  interpolation: { escapeValue: false },
});

export default i18n;
