
import { createTheme } from "@mui/material/styles";
import rtlPlugin from "stylis-plugin-rtl";
import createCache from "@emotion/cache";
import { prefixer } from "stylis";

const brand = {
  main: "#ff6b35",
  light: "rgba(255,107,53,0.14)",
  glow: "rgba(255,107,53,0.3)",
  hover: "#ff9a3c",
};

export const lightTheme = createTheme({
  direction: "rtl",
  palette: {
    mode: "light",
    primary: { main: brand.main, light: brand.hover },
    background: { default: "#f0f1f5", paper: "#ffffff" },
    text: { primary: "#111827", secondary: "#6b7280" },
    divider: "#cfd2d9",
    brand,
  },
  typography: { fontFamily: '"Vazirmatn", -apple-system, sans-serif' },
  shape: { borderRadius: 14 },
});

export const darkTheme = createTheme({
  direction: "rtl",
  palette: {
    mode: "dark",
    primary: { main: brand.main, light: brand.hover },
    background: { default: "#0d1017", paper: "#1a1d26" },
    text: { primary: "#e8e8ed", secondary: "#9ca3af" },
    divider: "rgba(255,255,255,0.08)",
    brand,
  },
  typography: { fontFamily: '"Vazirmatn", -apple-system, sans-serif' },
  shape: { borderRadius: 14 },
});

export const ltrTheme = createTheme({ ...lightTheme, direction: "ltr" });
export const ltrDarkTheme = createTheme({ ...darkTheme, direction: "ltr" });

export function createRtlCache() {
  return createCache({ key: "muirtl", stylisPlugins: [prefixer, rtlPlugin] });
}

export function createLtrCache() {
  return createCache({ key: "muiltr" });
}
