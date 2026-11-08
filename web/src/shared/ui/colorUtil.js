/** رنگ نیمه‌شفاف از یک رنگ هگز یا var(--token): soft(c, "20") ≈ alpha ۱۲٪. */
export const soft = (c, hh) =>
  `color-mix(in srgb, ${c} ${Math.round(parseInt(hh, 16) / 2.55)}%, transparent)`;
