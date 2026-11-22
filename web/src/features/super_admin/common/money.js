export const PERIODS = ["monthly", "quarterly", "semiannual", "yearly"];

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** Digits typed in any script (Persian, Arabic-Indic, Latin) -> a plain integer (0 for nothing). Letters are dropped. */
export function parseMoney(text) {
  const latin = String(text ?? "").replace(/[۰-۹٠-٩]/g, (ch) => {
    const i = FA_DIGITS.indexOf(ch);
    return String(i >= 0 ? i : AR_DIGITS.indexOf(ch));
  });
  const digits = latin.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 13);
  return digits ? Number(digits) : 0;
}

/** 1250000 -> "1,250,000" (Persian digits and separator when `fa`). */
export function formatMoney(n, fa) {
  return new Intl.NumberFormat(fa ? "fa-IR" : "en-US", { useGrouping: true, maximumFractionDigits: 0 }).format(Number(n) || 0);
}

/** Totals of the prices of every section that has at least one ticked (non-locked) tab. */
export function quoteFor(groups, ticked, locked, prices) {
  const sections = Object.entries(groups)
    .filter(([gid, g]) => gid !== "general" && g.codes.some((c) => !locked.includes(c) && ticked.has(c)))
    .map(([gid]) => gid);
  const totals = Object.fromEntries(PERIODS.map((p) => [p, sections.reduce((sum, s) => sum + (prices?.[s]?.[p] || 0), 0)]));
  return { sections, totals };
}

/** Subscription chip content for the Users list: {label, color}. */
export function subStatus(sub, t, fa) {
  if (!sub || sub.unlimited) return { label: t("ui_c.super.sub.unlimited"), color: "default" };
  if (sub.expired) return { label: t("ui_c.super.sub.expired"), color: "error" };
  if (sub.seconds_left < 86400) return { label: t("ui_c.super.sub.left_hours"), color: "warning" };
  const days = Math.ceil(sub.seconds_left / 86400);
  return {
    label: t("ui_c.super.sub.left_days", { n: new Intl.NumberFormat(fa ? "fa-IR" : "en").format(days) }),
    color: days <= 7 ? "warning" : "success",
  };
}
