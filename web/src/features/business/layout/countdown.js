const DAY = 86400;

/**
 * Split the seconds left into the parts that are worth showing.
 * Days are hidden at 0 days; hours are hidden under an hour; minutes under a minute. Seconds always show.
 * Returns [{ unit: "d"|"h"|"m"|"s", value: number }].
 */
export function countdownParts(left) {
  const s = Math.max(0, Math.floor(left));
  const d = Math.floor(s / DAY);
  const h = Math.floor((s % DAY) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push({ unit: "d", value: d });
  if (d > 0 || h > 0) parts.push({ unit: "h", value: h });
  if (d > 0 || h > 0 || m > 0) parts.push({ unit: "m", value: m });
  parts.push({ unit: "s", value: s % 60 });
  return parts;
}

/** Number in the UI's digits. Days have no padding; hours/minutes/seconds are padded to 2. */
export function formatPart(part, lang) {
  const nf = new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en", {
    minimumIntegerDigits: part.unit === "d" ? 1 : 2,
    useGrouping: false,
  });
  return nf.format(part.value);
}

/**
 * A readable one-line duration for running text ("91 days, 09 hours, ..."), wrapped in Unicode
 * isolates so surrounding right-to-left / left-to-right text cannot reorder it.
 * `unitName(unit, value)` returns the translated unit word.
 */
export function durationText(left, lang, unitName) {
  const sep = lang === "fa" ? "، " : ", ";
  const body = countdownParts(left).map((p) => `${formatPart(p, lang)} ${unitName(p.unit)}`).join(sep);
  return `\u2068${body}\u2069`;
}
