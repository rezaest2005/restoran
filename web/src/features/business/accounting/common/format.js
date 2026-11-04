export const toPersianDigits = (s) => String(s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

/** Parse a user-typed number (commas allowed); NaN when invalid. */
export const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Thousand-separated amount; Persian digits only when the UI language is fa. */
export const fmtMoney = (v, lang) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const opts = { minimumFractionDigits: 0, maximumFractionDigits: 2 };
  return n.toLocaleString(lang === "fa" ? "fa-IR" : "en-US", opts);
};

export const fmtInt = (v, lang) => {
  const s = String(v ?? "");
  return lang === "fa" ? toPersianDigits(s) : s;
};

export const fmtDate = (d, lang) => {
  if (!d) return "—";
  const s = String(d).slice(0, 10);
  return lang === "fa" ? toPersianDigits(s) : s;
};

const pad = (n) => String(n).padStart(2, "0");
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => isoDate(new Date());
export const monthStartISO = () => {
  const d = new Date();
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
};

let seq = 0;
export const newKey = () => `k${Date.now().toString(36)}${(seq += 1)}`;

/** Account display name: English name when the UI is English and one exists. */
export const accName = (a, lang) => {
  if (!a) return "";
  return lang === "en" && a.name_en ? a.name_en : a.name;
};
