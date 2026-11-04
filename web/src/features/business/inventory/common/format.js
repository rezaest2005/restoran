// Small display helpers shared by inventory tabs/modals.

/** Font-size scaler used by the dense table layouts. */
export const makeScale = (factor) => (size) => Math.round(size * factor);

export const now = () => new Date();
export const faDate = (d) => {
  try { return d.toLocaleDateString("fa-IR"); } catch { return d.toISOString().slice(0, 10); }
};
export const faTime = (d) => {
  try { return d.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }); } catch { return d.toTimeString().slice(0, 5); }
};
export const faDay = (d) => {
  try { return d.toLocaleDateString("fa-IR", { weekday: "long" }); } catch { return ""; }
};

/** Unit labels used by modals (long form). */
export const UNIT_LABELS = {
  kilogram: "کیلوگرم", gram: "گرم", liter: "لیتر", ml: "میلی‌لیتر",
  count: "عدد", box: "بسته", kg: "کیلوگرم", unit: "واحد",
};

export const whIcon = (w) => {
  if (!w) return "📦";
  return w.icon || "📦";
};
