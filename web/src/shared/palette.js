/**
 * پالت رنگ واحد برنامه — مستقل از صنعت (کسب‌وکار، کارخانه، فروشگاه، ...).
 *
 * تمام صفحات باید رنگ‌ها را از همین‌جا بگیرند: `buildColors(isDark)`.
 * نام‌ها معنایی هستند (primary/accent/danger/...) نه مربوط به یک صنعت.
 * نام‌های قدیمی (olive/oliveSubtle/burgundy) فقط برای سازگاری موقت نگه داشته شده‌اند.
 */

const LIGHT = {
  bg: "#F2F4F8",
  surface: "#FFFFFF",
  glass: "rgba(255,255,255,0.80)",
  glassBorder: "rgba(30,50,90,0.12)",

  primary: "#1F4E9E",
  primarySubtle: "rgba(31,78,158,0.09)",
  onPrimary: "#FFFFFF",
  accent: "#0E7C86",
  accentSubtle: "rgba(14,124,134,0.10)",
  gold: "#A9741B",

  success: "#1E8A5B",
  successBg: "rgba(30,138,91,0.10)",
  warning: "#B7791F",
  warningBg: "rgba(183,121,31,0.12)",
  info: "#2A7FB8",
  infoBg: "rgba(42,127,184,0.10)",
  danger: "#C0392B",
  dangerBg: "rgba(192,57,43,0.10)",

  text: "#18212F",
  sub: "#516074",
  muted: "#8794A6",
  divider: "rgba(30,50,90,0.12)",
  inputBg: "rgba(255,255,255,0.92)",

  btnGrad: "linear-gradient(135deg, #183F80 0%, #1F4E9E 50%, #2B63BB 100%)",
  sidebarBg: "rgba(255,255,255,0.96)",
  sidebarBorder: "rgba(30,50,90,0.10)",
  headerBg: "rgba(255,255,255,0.92)",
  headerBorder: "rgba(30,50,90,0.10)",
  bgWarm:
    "radial-gradient(ellipse at 15% 10%, rgba(31,78,158,0.08) 0%, transparent 45%), radial-gradient(ellipse at 85% 85%, rgba(14,124,134,0.07) 0%, transparent 40%)",
  orb1: "rgba(31,78,158,0.10)",
  orb2: "rgba(14,124,134,0.08)",
  cardShadow: "0 8px 40px rgba(20,35,70,0.08)",
  cardShadowHover: "0 14px 50px rgba(20,35,70,0.14)",
  scrollThumb: "rgba(31,78,158,0.25)",
  selection: "rgba(31,78,158,0.18)",
  primaryLight: "#2B63BB",
  bgGrid: "rgba(30,50,90,0.03)",
  glassShimmer:
    "linear-gradient(90deg, transparent 0%, rgba(31,78,158,0.05) 25%, rgba(14,124,134,0.05) 50%, rgba(169,116,27,0.05) 75%, transparent 100%)",
  inputFocusGlow: "0 0 0 3px rgba(31,78,158,0.14), 0 0 24px rgba(31,78,158,0.08)",
  btnHover: "linear-gradient(135deg, #1F4E9E 0%, #2B63BB 50%, #3A74CC 100%)",
  tableHeaderBg: "rgba(31,78,158,0.06)",
  tableRowHover: "rgba(31,78,158,0.04)",
  tableRowSelected: "rgba(31,78,158,0.09)",
};

const DARK = {
  bg: "#0E141C",
  surface: "#161E29",
  glass: "rgba(22,30,41,0.72)",
  glassBorder: "rgba(130,160,210,0.14)",

  primary: "#6F9EEA",
  primarySubtle: "rgba(111,158,234,0.12)",
  onPrimary: "#0B1220",
  accent: "#3FBFC8",
  accentSubtle: "rgba(63,191,200,0.12)",
  gold: "#E0AE55",

  success: "#4CC38A",
  successBg: "rgba(76,195,138,0.12)",
  warning: "#E0AE55",
  warningBg: "rgba(224,174,85,0.14)",
  info: "#6FB6E8",
  infoBg: "rgba(111,182,232,0.12)",
  danger: "#F0746A",
  dangerBg: "rgba(240,116,106,0.13)",

  text: "#E8EDF4",
  sub: "#9BA8BA",
  muted: "#5E6B7E",
  divider: "rgba(130,160,210,0.14)",
  inputBg: "rgba(10,15,22,0.60)",

  btnGrad: "linear-gradient(135deg, #2A5BB5 0%, #3F76D4 50%, #5B8FE6 100%)",
  sidebarBg: "rgba(14,20,28,0.96)",
  sidebarBorder: "rgba(130,160,210,0.10)",
  headerBg: "rgba(22,30,41,0.88)",
  headerBorder: "rgba(130,160,210,0.10)",
  bgWarm:
    "radial-gradient(ellipse at 25% 15%, rgba(63,118,212,0.10) 0%, transparent 50%), radial-gradient(ellipse at 75% 85%, rgba(63,191,200,0.07) 0%, transparent 50%)",
  orb1: "rgba(111,158,234,0.10)",
  orb2: "rgba(63,191,200,0.07)",
  cardShadow: "0 8px 40px rgba(0,0,0,0.45)",
  cardShadowHover: "0 14px 50px rgba(0,0,0,0.60)",
  scrollThumb: "rgba(111,158,234,0.28)",
  selection: "rgba(111,158,234,0.25)",
  primaryLight: "#9BBCF2",
  bgGrid: "rgba(255,255,255,0.015)",
  glassShimmer:
    "linear-gradient(90deg, transparent 0%, rgba(111,158,234,0.06) 25%, rgba(63,191,200,0.06) 50%, rgba(224,174,85,0.06) 75%, transparent 100%)",
  inputFocusGlow: "0 0 0 3px rgba(111,158,234,0.18), 0 0 24px rgba(111,158,234,0.08)",
  btnHover: "linear-gradient(135deg, #3F76D4 0%, #5B8FE6 50%, #7AA6EE 100%)",
  tableHeaderBg: "rgba(111,158,234,0.08)",
  tableRowHover: "rgba(111,158,234,0.05)",
  tableRowSelected: "rgba(111,158,234,0.10)",
};

/** رنگ‌های صفحه برای حالت روشن/تیره. */
export function buildColors(isDark) {
  const base = isDark ? DARK : LIGHT;
  return {
    ...base,
    // نام‌های قدیمی (سازگاری موقت تا مهاجرت کامل کدها)
    olive: base.primary,
    oliveLight: base.primaryLight,
    oliveSubtle: base.primarySubtle,
    burgundy: base.accent,
  };
}

/** رنگ‌های خام برای ساخت تم MUI. */
export const palettes = { light: LIGHT, dark: DARK };
