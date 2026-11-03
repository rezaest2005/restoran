/** Locale-grouped integer/price text (same as `n.toLocaleString()`), tolerant of null. */
export const formatMoney = (n) => Number(n || 0).toLocaleString();

export const toPersianDigits = (s) => String(s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

/** Comma-grouped digits ("1234567" -> "1,234,567") independent of locale. */
export const groupDigits = (n) => String(n || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
