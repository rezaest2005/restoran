import { createTheme } from "@mui/material/styles";
import createCache from "@emotion/cache";
import { prefixer } from "stylis";
import rtlPlugin from "stylis-plugin-rtl";

// ── RTL Cache ──
export function createRtlCache() {
  return createCache({
    key: "muirtl",
    stylisPlugins: [prefixer, rtlPlugin],
  });
}

// ── LTR Cache ──
export function createLtrCache() {
  return createCache({
    key: "muiltr",
    stylisPlugins: [prefixer],
  });
}

// ── Shared overrides ──
const sharedOverrides = {
  MuiCssBaseline: {
    styleOverrides: {
      body: {
        fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
      },
      "*::-webkit-scrollbar": {
        width: "6px",
        height: "6px",
      },
      "*::-webkit-scrollbar-track": {
        background: "transparent",
      },
      "*::-webkit-scrollbar-thumb": {
        background: "rgba(128,128,128,0.25)",
        borderRadius: "3px",
      },
      "*::-webkit-scrollbar-thumb:hover": {
        background: "rgba(128,128,128,0.4)",
      },
    },
  },
  MuiButton: {
    styleOverrides: {
      root: {
        textTransform: "none",
        borderRadius: "12px",
        fontWeight: 600,
        fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
      },
    },
  },
  MuiTextField: {
    styleOverrides: {
      root: {
        "& .MuiInputBase-root": {
          fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
        },
      },
    },
  },
};

// ── Light Theme (RTL) ──
export const lightTheme = createTheme({
  direction: "rtl",
  palette: {
    mode: "light",
    primary: { main: "#2E4D30" },
    secondary: { main: "#7A2845" },
    background: {
      default: "#E4E8F0",
      paper: "rgba(240,244,252,0.7)",
    },
    text: {
      primary: "#1A1A24",
      secondary: "#555568",
    },
  },
  typography: {
    fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
  },
  components: { ...sharedOverrides },
});

// ── Dark Theme (RTL) ──
export const darkTheme = createTheme({
  direction: "rtl",
  palette: {
    mode: "dark",
    primary: { main: "#6B9B6E" },
    secondary: { main: "#A84060" },
    background: {
      default: "#0B0A0B",
      paper: "rgba(16,18,16,0.6)",
    },
    text: {
      primary: "#F0ECE8",
      secondary: "#8A8588",
    },
  },
  typography: {
    fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
  },
  components: { ...sharedOverrides },
});

// ── Light Theme (LTR) ──
export const ltrTheme = createTheme({
  direction: "ltr",
  palette: {
    mode: "light",
    primary: { main: "#2E4D30" },
    secondary: { main: "#7A2845" },
    background: {
      default: "#E4E8F0",
      paper: "rgba(240,244,252,0.7)",
    },
    text: {
      primary: "#1A1A24",
      secondary: "#555568",
    },
  },
  typography: {
    fontFamily: "'Plus Jakarta Sans', 'Vazirmatn', sans-serif",
  },
  components: { ...sharedOverrides },
});

// ── Dark Theme (LTR) ──
export const ltrDarkTheme = createTheme({
  direction: "ltr",
  palette: {
    mode: "dark",
    primary: { main: "#6B9B6E" },
    secondary: { main: "#A84060" },
    background: {
      default: "#0B0A0B",
      paper: "rgba(16,18,16,0.6)",
    },
    text: {
      primary: "#F0ECE8",
      secondary: "#8A8588",
    },
  },
  typography: {
    fontFamily: "'Plus Jakarta Sans', 'Vazirmatn', sans-serif",
  },
  components: { ...sharedOverrides },
});