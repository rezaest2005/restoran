/** Parse a user-typed number (commas allowed); NaN when invalid. */
export const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

export const fmt = (v) =>
  Number.isFinite(Number(v))
    ? Number(v).toLocaleString("en-US", { maximumFractionDigits: 3 })
    : "—";

export const fmtDate = (v, lang) => {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString(lang === "fa" ? "fa-IR" : "en-GB", {
      dateStyle: "short", timeStyle: "short",
    });
  } catch { return "—"; }
};
