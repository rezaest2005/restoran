import { createTheme } from "@mui/material/styles";
import createCache from "@emotion/cache";
import rtlPlugin from "stylis-plugin-rtl";
import { prefixer } from "stylis";

export const lightTheme = createTheme({
  direction: "rtl",
  palette: {
    mode: "light",
    primary: { main: "#2E4D30" },
    background: { default: "#E4E8F0", paper: "#F0F4FC" },
  },
  typography: { fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif" },
});

export const darkTheme = createTheme({
  direction: "rtl",
  palette: {
    mode: "dark",
    primary: { main: "#6B9B6E" },
    background: { default: "#0B0A0B", paper: "#161816" },
  },
  typography: { fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif" },
});

export const ltrTheme = createTheme({
  direction: "ltr",
  palette: {
    mode: "light",
    primary: { main: "#2E4D30" },
    background: { default: "#E4E8F0", paper: "#F0F4FC" },
  },
  typography: { fontFamily: "'Plus Jakarta Sans', 'Vazirmatn', sans-serif" },
});

export const ltrDarkTheme = createTheme({
  direction: "ltr",
  palette: {
    mode: "dark",
    primary: { main: "#6B9B6E" },
    background: { default: "#0B0A0B", paper: "#161816" },
  },
  typography: { fontFamily: "'Plus Jakarta Sans', 'Vazirmatn', sans-serif" },
});

export const createRtlCache = () =>
  createCache({ key: "muirtl", stylisPlugins: [prefixer, rtlPlugin] });

export const createLtrCache = () =>
  createCache({ key: "muiltr" });