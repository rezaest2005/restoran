import { createContext, useContext, useState, useMemo, useEffect } from "react";
import { ThemeProvider as MuiThemeProvider } from "@mui/material/styles";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import CssBaseline from "@mui/material/CssBaseline";
import {
  lightTheme, darkTheme, ltrTheme, ltrDarkTheme,
  createRtlCache, createLtrCache,
} from "../theme";
import { useThemeMode } from "./ThemeContext";
import i18n from "../../i18n";

const LangContext = createContext();

export function LangProvider({ children }) {
  const { mode } = useThemeMode();
  const isDark = mode === "dark";

  const [lang, setLang] = useState(() => i18n.language || "fa");
  const isRtl = lang === "fa";

  useEffect(() => {
    i18n.changeLanguage(lang);
    localStorage.setItem("app_lang", lang);
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [lang, isRtl]);

  const muiTheme = useMemo(() => {
    if (isRtl) return isDark ? darkTheme : lightTheme;
    return isDark ? ltrDarkTheme : ltrTheme;
  }, [isRtl, isDark]);

  const cache = useMemo(() => {
    return isRtl ? createRtlCache() : createLtrCache();
  }, [isRtl]);

  const toggleLang = () => setLang(l => l === "fa" ? "en" : "fa");

  const value = useMemo(() => ({ lang, isRtl, toggleLang, setLang }), [lang, isRtl]);

  return (
    <LangContext.Provider value={value}>
      <CacheProvider value={cache}>
        <MuiThemeProvider theme={muiTheme}>
          <CssBaseline />
          {children}
        </MuiThemeProvider>
      </CacheProvider>
    </LangContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be inside LangProvider");
  return ctx;
}