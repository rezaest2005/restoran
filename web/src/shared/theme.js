import { createTheme } from "@mui/material/styles";
import createCache from "@emotion/cache";
import rtlPlugin from "stylis-plugin-rtl";
import { prefixer } from "stylis";
import { palettes } from "./palette";

const FONT_FA = "'Vazirmatn', 'Plus Jakarta Sans', sans-serif";
const FONT_EN = "'Plus Jakarta Sans', 'Vazirmatn', sans-serif";

/** ساخت تم MUI از روی پالت واحد (روشن/تیره × راست‌به‌چپ/چپ‌به‌راست). */
function buildTheme(mode, direction) {
  const p = palettes[mode];
  const fontFamily = direction === "rtl" ? FONT_FA : FONT_EN;

  return createTheme({
    direction,
    palette: {
      mode,
      primary: { main: p.primary, contrastText: p.onPrimary },
      secondary: { main: p.accent },
      success: { main: p.success },
      warning: { main: p.warning },
      info: { main: p.info },
      error: { main: p.danger },
      background: { default: p.bg, paper: p.surface },
      text: { primary: p.text, secondary: p.sub, disabled: p.muted },
      divider: p.divider,
    },
    shape: { borderRadius: 12 },
    typography: { fontFamily },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { fontFamily },
          "*::-webkit-scrollbar": { width: "6px", height: "6px" },
          "*::-webkit-scrollbar-track": { background: "transparent" },
          "*::-webkit-scrollbar-thumb": {
            background: p.scrollThumb,
            borderRadius: "3px",
          },
          "::selection": { background: p.selection },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: { textTransform: "none", borderRadius: 12, fontWeight: 600, fontFamily },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: { "& .MuiInputBase-root": { fontFamily } },
        },
      },
    },
  });
}

export const lightTheme = buildTheme("light", "rtl");
export const darkTheme = buildTheme("dark", "rtl");
export const ltrTheme = buildTheme("light", "ltr");
export const ltrDarkTheme = buildTheme("dark", "ltr");

export const createRtlCache = () =>
  createCache({ key: "muirtl", stylisPlugins: [prefixer, rtlPlugin] });

export const createLtrCache = () =>
  createCache({ key: "muiltr", stylisPlugins: [prefixer] });
