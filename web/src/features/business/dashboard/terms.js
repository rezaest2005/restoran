import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useLang } from "@shared/contexts/LangContext";

/**
 * Industry terminology ("table/order" vs "customer/invoice", "kitchen" vs "production line"...).
 *
 * The server is the source of truth (bizsuite/industries.py): it sends `business_terms` with the login / me payload
 * and `terms` with /api/dashboard/summary/. Each term is `{fa, en}`. When nothing is known yet the neutral
 * words from i18n (`ui_dash2.term.*`) are used, so a page never shows restaurant words by accident.
 *
 *   const product = useTerm("product");          // "Menu item" / "Product" / "Service" ...
 *   const term = useTerms(); term("customers");  // several at once
 */
let current = readCached();
const listeners = new Set();

function readCached() {
  try {
    const raw = sessionStorage.getItem("user") || localStorage.getItem("user");
    const u = raw ? JSON.parse(raw) : null;
    return u && typeof u.business_terms === "object" && u.business_terms ? u.business_terms : null;
  } catch {
    return null;
  }
}

/** Store fresh terms (from the summary / setup responses) and keep the cached user in sync. */
export function setBusinessTerms(terms, extra = {}) {
  if (!terms || typeof terms !== "object") return;
  const same = JSON.stringify(terms) === JSON.stringify(current);
  current = terms;
  try {
    const store = sessionStorage.getItem("user") ? sessionStorage : localStorage;
    const cached = JSON.parse(store.getItem("user") || "null");
    if (cached) store.setItem("user", JSON.stringify({ ...cached, business_terms: terms, ...extra }));
  } catch {
    /* storage not available */
  }
  if (!same) listeners.forEach((fn) => fn());
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const snapshot = () => current;

/** Pure lookup (usable outside React). */
export function termFor(terms, key, lang, fallback) {
  const entry = terms?.[key];
  const word = entry && (entry[lang] || entry.fa || entry.en);
  return word || fallback || key;
}

export function useTerms() {
  const terms = useSyncExternalStore(subscribe, snapshot, snapshot);
  const { lang } = useLang();
  const { t } = useTranslation();
  return (key) => termFor(terms, key, lang === "en" ? "en" : "fa", t(`ui_dash2.term.${key}`, { defaultValue: key }));
}

export function useTerm(key) {
  return useTerms()(key);
}
