// web/src/shared/palette.js — تنها جای تعریف رنگ‌ها
// تولیدشده از tokens.json سیستم دیزاین «سامانه جامع کسب‌وکار». مقدارها را اینجا دستی عوض نکنید؛ توکن را عوض کنید.

export const tokens = {
  light: {
    bg: '#F7F4F3',
    surface: '#FFFFFF',
    surfaceRaised: '#FFFFFF',
    surfaceSunken: '#F0EBE9',
    line: '#E4DCD9',
    lineStrong: '#8C7D79',
    ink: '#24191C',
    inkMuted: '#6A5A5E',
    primary: '#9B1C44',
    primaryHover: '#7F1236',
    primarySoft: '#FBE8EE',
    onPrimary: '#FFFFFF',
    accent: '#E9A21C',
    accentInk: '#875400',
    accentSoft: '#FDF1D8',
    onAccent: '#2B1A00',
    success: '#1A7550',
    successSoft: '#E2F3EA',
    warning: '#935700',
    warningSoft: '#FDF0D6',
    danger: '#B3330E',
    dangerSoft: '#FCE8E1',
    info: '#2B6689',
    infoSoft: '#E4EFF6',
    onStatus: '#FFFFFF',
    chart1: '#9B1C44',
    chart2: '#D08A0A',
    chart3: '#2E8C78',
    chart4: '#5B6FA8',
    chartGrid: '#EDE6E3',
  },
  dark: {
    bg: '#151012',
    surface: '#1F191B',
    surfaceRaised: '#292124',
    surfaceSunken: '#100C0D',
    line: '#3A2F32',
    lineStrong: '#7D6C71',
    ink: '#F6EEF0',
    inkMuted: '#BBABB0',
    primary: '#F07A9C',
    primaryHover: '#F59AB4',
    primarySoft: '#3E1524',
    onPrimary: '#2A0A15',
    accent: '#F2B544',
    accentInk: '#F2B544',
    accentSoft: '#33240A',
    onAccent: '#2B1A00',
    success: '#5CCF9C',
    successSoft: '#10291E',
    warning: '#F2B24A',
    warningSoft: '#30220A',
    danger: '#FF8B68',
    dangerSoft: '#36160F',
    info: '#7FB7DB',
    infoSoft: '#0F2331',
    onStatus: '#120A0C',
    chart1: '#F07A9C',
    chart2: '#F2B544',
    chart3: '#5CCFB5',
    chart4: '#9CAEE0',
    chartGrid: '#2E2528',
  },
};

export const fonts = {
  fa: '"Vazirmatn", Tahoma, "Segoe UI", sans-serif',
  en: '"Plus Jakarta Sans", system-ui, "Segoe UI", sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};

export const radius = { sm: 6, md: 10, lg: 16, xl: 24 };

// تم MUI: createTheme(getDesignTokens(mode, dir))
export function getDesignTokens(mode = 'light', direction = 'rtl') {
  const c = tokens[mode];
  return {
    direction,
    palette: {
      mode,
      background: { default: c.bg, paper: c.surface },
      text: { primary: c.ink, secondary: c.inkMuted },
      divider: c.line,
      primary: { main: c.primary, dark: c.primaryHover, light: c.primarySoft, contrastText: c.onPrimary },
      secondary: { main: c.accent, light: c.accentSoft, contrastText: c.onAccent },
      success: { main: c.success, light: c.successSoft, contrastText: c.onStatus },
      warning: { main: c.warning, light: c.warningSoft, contrastText: c.onStatus },
      error: { main: c.danger, light: c.dangerSoft, contrastText: c.onStatus },
      info: { main: c.info, light: c.infoSoft, contrastText: c.onStatus },
      action: { hover: c.surfaceSunken, selected: c.primarySoft },
      chart: [c.chart1, c.chart2, c.chart3, c.chart4],
    },
    shape: { borderRadius: radius.md },
    typography: {
      fontFamily: direction === 'rtl' ? fonts.fa : fonts.en,
      fontSize: 15,
      h1: { fontSize: 30, lineHeight: '42px', fontWeight: 800 },
      h2: { fontSize: 22, lineHeight: '34px', fontWeight: 700 },
      h3: { fontSize: 17, lineHeight: '28px', fontWeight: 700 },
      body1: { fontSize: 15, lineHeight: direction === 'rtl' ? '26px' : '22px' },
      body2: { fontSize: 13, lineHeight: '22px' },
      caption: { fontSize: 12, lineHeight: '18px', fontWeight: 600 },
      button: { fontWeight: 600, textTransform: 'none' },
    },
    components: {
      MuiCssBaseline: { styleOverrides: { body: { fontVariantNumeric: 'tabular-nums' } } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { minHeight: 40, borderRadius: radius.md, paddingInline: 16 }, sizeLarge: { minHeight: 48 }, sizeSmall: { minHeight: 32 } },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none', backdropFilter: 'none' } } },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: { root: { borderRadius: radius.lg, border: `1px solid ${c.line}` } },
      },
      MuiDialog: { styleOverrides: { paper: { borderRadius: radius.lg } } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: { borderRadius: radius.md, minHeight: 40 },
          notchedOutline: { borderColor: c.lineStrong },
        },
      },
      MuiChip: { styleOverrides: { root: { borderRadius: 9999, fontWeight: 600 } } },
      MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 44 } } },
    },
  };
}

// ---------------------------------------------------------------------------
// سازگاری: نام‌های قدیمی کلیدها به توکن‌های جدید نگاشت می‌شوند.
// ---------------------------------------------------------------------------
const SHADOWS = {
  light: { sm: '0 1px 2px #24191c0f, 0 1px 3px #24191c14', lg: '0 6px 12px #24191c12, 0 16px 36px -4px #24191c29' },
  dark: { sm: '0 1px 2px #00000066', lg: '0 16px 36px -4px #000000cc' },
};

export function buildColors(isDark) {
  const t = tokens[isDark ? 'dark' : 'light'];
  const sh = SHADOWS[isDark ? 'dark' : 'light'];
  const focusRing = `0 0 0 2px ${t.surface}, 0 0 0 4px ${t.primary}`;
  return {
    ...t,
    bg: t.bg,
    surface: t.surface,
    glass: t.surface,
    glassBorder: t.line,
    divider: t.line,
    primary: t.primary,
    primaryLight: t.primaryHover,
    primarySubtle: t.primarySoft,
    primarySoft: t.primarySoft,
    onPrimary: t.onPrimary,
    olive: t.primary,
    oliveLight: t.primaryHover,
    oliveSubtle: t.primarySoft,
    accent: t.accent,
    accentSubtle: t.accentSoft,
    burgundy: t.accent,
    gold: t.accentInk,
    text: t.ink,
    sub: t.inkMuted,
    muted: t.lineStrong,
    inputBg: t.surface,
    btnGrad: t.primary,
    btnHover: t.primaryHover,
    btnShadow: 'none',
    btnShadowHover: sh.sm,
    iconBg: t.primarySoft,
    iconBorder: t.line,
    danger: t.danger,
    dangerBg: t.dangerSoft,
    warning: t.warning,
    warningBg: t.warningSoft,
    info: t.info,
    infoBg: t.infoSoft,
    success: t.success,
    successBg: t.successSoft,
    sidebarBg: t.bg,
    sidebarBorder: t.line,
    headerBg: t.surface,
    headerBorder: t.line,
    cardShadow: sh.sm,
    cardShadowHover: sh.lg,
    tableHeaderBg: t.surfaceSunken,
    tableRowHover: t.surfaceSunken,
    tableRowSelected: t.primarySoft,
    inputFocusGlow: focusRing,
    focusRing,
    headerShadow: sh.sm,
    noise: 0,
    iconGlow: 'none',
    orb3: 'transparent',
    shadowSm: sh.sm,
    shadowLg: sh.lg,
    bgWarm: 'none',
    bgGrid: 'transparent',
    glassShimmer: 'none',
    orb1: 'transparent',
    orb2: 'transparent',
    scrollThumb: t.lineStrong,
    selection: t.primarySoft,
  };
}

/** رنگ‌های خام (سازگاری). */
export const palettes = tokens;
