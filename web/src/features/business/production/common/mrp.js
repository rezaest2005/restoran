/* Client-side mirror of dashboard/bizsuite/production_engine.py: used only for
   live previews while editing. The server's numbers are authoritative. */

const UNIT_FACTORS = {
  g: ["mass", 0.001], kg: ["mass", 1], ton: ["mass", 1000],
  ml: ["volume", 0.001], l: ["volume", 1], m3: ["volume", 1000],
  cm: ["length", 0.01], meter: ["length", 1],
  unit: ["count", 1], piece: ["count", 1], dozen: ["count", 12],
};

/** Units a line may be written in for an item stored in `unit` (always includes `unit`). */
export const compatibleUnits = (unit) => {
  const f = UNIT_FACTORS[unit];
  if (!f) return unit ? [unit] : [];
  return Object.keys(UNIT_FACTORS).filter((u) => UNIT_FACTORS[u][0] === f[0]);
};

export const unitsCompatible = (a, b) =>
  !a || !b || a === b || (UNIT_FACTORS[a] && UNIT_FACTORS[b] && UNIT_FACTORS[a][0] === UNIT_FACTORS[b][0]);

export const convertQty = (q, from, to) => {
  if (!from || !to || from === to) return q;
  const a = UNIT_FACTORS[from], b = UNIT_FACTORS[to];
  if (!a || !b || a[0] !== b[0]) return q;
  return (q * a[1]) / b[1];
};

const n = (v) => {
  const x = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
};

/** InvenTree-style line requirement (see THIRD_PARTY_NOTICES.md): base × scale × (1+waste%) + setup, rounded up. */
export const lineNeed = (base, waste, setup, rounding, scale) => {
  if (!(scale > 0)) return 0;
  let r = n(base) * scale * (1 + n(waste) / 100);
  if (n(setup) > 0) r += n(setup);
  if (n(rounding) > 0) r = Math.ceil(r / n(rounding) - 1e-9) * n(rounding);
  return Math.round(r * 1000) / 1000;
};

/** Minutes for one stage making `qty` output units: setup + runs × run time. */
export const stageMinutes = (stage, batch, qty) => {
  if (!(qty > 0)) return 0;
  const cap = n(stage.capacity) > 0 ? n(stage.capacity) : n(batch);
  const runs = cap > 0 ? Math.ceil(qty / cap - 1e-9) : 1;
  return n(stage.setup_minutes) + runs * n(stage.run_minutes);
};

export const stageCost = (stage, minutes) => (minutes / 60) * (n(stage.labour_rate) + n(stage.overhead_rate));

export const fmtMinutes = (t, m) => {
  const v = Math.round(n(m));
  if (v < 60) return t("ui_mrp.min_short", { n: v });
  const h = Math.floor(v / 60), r = v % 60;
  return r ? t("ui_mrp.h_min_short", { h, m: r }) : t("ui_mrp.h_short", { h });
};
