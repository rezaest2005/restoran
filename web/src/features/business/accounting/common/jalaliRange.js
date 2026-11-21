import { gregorianToJalali, jalaliToGregorian } from "@business/inventory/common/jalali";

const pad = (n) => String(n).padStart(2, "0");
const iso = ([y, m, d]) => `${y}-${pad(m)}-${pad(d)}`;

export const JALALI_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

/** Jalali year of an ISO date (e.g. "2026-04-01" -> 1405). */
export function jalaliYearOf(isoDate) {
  const [y, m, d] = String(isoDate).slice(0, 10).split("-").map(Number);
  return gregorianToJalali(y, m, d)[0];
}

/** "1405/01/12" for an ISO date. */
export function toJalaliStr(isoDate) {
  const s = String(isoDate || "").slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return s;
  const [jy, jm, jd] = gregorianToJalali(y, m, d);
  return `${jy}/${pad(jm)}/${pad(jd)}`;
}

/**
 * A Persian fiscal year (1 Farvardin .. 29/30 Esfand) as ISO dates, with its 12 Jalali-month periods —
 * the shape the fiscal-year API takes.
 */
export function jalaliFiscalYear(jy) {
  const periods = [];
  for (let m = 1; m <= 12; m += 1) {
    const start = jalaliToGregorian(jy, m, 1);
    const next = m === 12 ? jalaliToGregorian(jy + 1, 1, 1) : jalaliToGregorian(jy, m + 1, 1);
    const end = new Date(Date.UTC(next[0], next[1] - 1, next[2]) - 86400000);
    periods.push({
      name: `${JALALI_MONTHS[m - 1]} ${jy}`,
      start: iso(start),
      end: `${end.getUTCFullYear()}-${pad(end.getUTCMonth() + 1)}-${pad(end.getUTCDate())}`,
    });
  }
  return { name: String(jy), start_date: periods[0].start, end_date: periods[11].end, periods };
}

/** Start of the current Jalali year and month as ISO dates (report presets). */
export function jalaliPresets(todayIso) {
  const [y, m, d] = todayIso.split("-").map(Number);
  const [jy, jm] = gregorianToJalali(y, m, d);
  const season = Math.floor((jm - 1) / 3) * 3 + 1;
  return {
    month: iso(jalaliToGregorian(jy, jm, 1)),
    season: iso(jalaliToGregorian(jy, season, 1)),
    year: iso(jalaliToGregorian(jy, 1, 1)),
  };
}
