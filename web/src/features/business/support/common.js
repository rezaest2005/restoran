import { fmtInt } from "../accounting/common";

export const STATUSES = ["open", "in_progress", "answered", "resolved"];
export const CATEGORIES = ["bug", "question", "request", "billing"];
export const PRIORITIES = ["normal", "high"];

export const errMsg = (e, fallback = "") =>
  e?.response?.data?.error || e?.response?.data?.message || e?.response?.data?.detail || e?.message || fallback;

export const unwrap = (r) => r.data?.data ?? r.data;

/** Palette colour for a ticket status. */
export const statusColor = (C, s) => {
  if (s === "open") return C.warning;
  if (s === "in_progress") return C.info;
  if (s === "answered") return C.success;
  return C.muted;
};

/** "2026-01-31 14:05" (Persian digits when the UI language is fa). */
export const fmtStamp = (iso, lang) => {
  if (!iso) return "—";
  return fmtInt(String(iso).slice(0, 16).replace("T", " "), lang);
};
