import { createTheme } from "@mui/material/styles";
import createCache from "@emotion/cache";
import rtlPlugin from "stylis-plugin-rtl";
import { prefixer } from "stylis";
import { getDesignTokens } from "./palette";

/** چهار تم: روشن/تیره × راست‌به‌چپ/چپ‌به‌راست، از توکن‌های دیزاین. */
const buildTheme = (mode, direction) => createTheme(getDesignTokens(mode, direction));

export const lightTheme = buildTheme("light", "rtl");
export const darkTheme = buildTheme("dark", "rtl");
export const ltrTheme = buildTheme("light", "ltr");
export const ltrDarkTheme = buildTheme("dark", "ltr");

export const createRtlCache = () =>
  createCache({ key: "muirtl", stylisPlugins: [prefixer, rtlPlugin] });

export const createLtrCache = () =>
  createCache({ key: "muiltr", stylisPlugins: [prefixer] });
