export const SOURCE_TYPES = [
  "manual", "sales_invoice", "sales_return", "purchase_invoice",
  "purchase_return", "expense", "pos_order", "reversal",
];

export const ACCOUNT_TYPES = ["asset", "liability", "equity", "income", "expense"];

/** Split `sales_invoice_v2` into { base: "sales_invoice", version: 2 }. */
export function parseSource(type) {
  const m = /^(.*)_v(\d+)$/.exec(type || "");
  return m ? { base: m[1], version: Number(m[2]) } : { base: type || "manual", version: null };
}

/** Human label such as "Sales invoice #12" (plus "(superseded v2)" for old versions). */
export function sourceLabel(t, entry, fi = (x) => x) {
  const { base, version } = parseSource(entry.source_type);
  let s = t(`ui_i.src.${base}`, { defaultValue: base });
  if (entry.source_id && base !== "manual" && base !== "reversal") s += ` #${fi(entry.source_id)}`;
  if (version) s += ` (${t("ui_i.src.version", { n: fi(version) })})`;
  return s;
}
