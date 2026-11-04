/**
 * Single source of truth for the product identity (frontend side).
 * Keep in sync with dashboard/core/branding.py.
 */
export const APP_NAME = "Business Suite";
export const APP_NAME_FA = "سامانه جامع کسب‌وکار";
export const APP_SLUG = "business-suite";

/** Display name for a language code ("fa" | "en"). */
export const appName = (lang) => (lang === "en" ? APP_NAME : APP_NAME_FA);
