import { createContext, useContext, useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ThemeProvider as MuiThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { CacheProvider } from "@emotion/react";
import {
  lightTheme, darkTheme, ltrTheme, ltrDarkTheme,
  createRtlCache, createLtrCache,
} from "../theme";
import { useThemeMode } from "./ThemeContext";

const LangContext = createContext();

export function LangProvider({ children }) {
  const { i18n } = useTranslation();
  const { mode } = useThemeMode();
  const [lang, setLang] = useState(
    () => localStorage.getItem("lang") || "fa"
  );

  const isRtl = lang === "fa";

  // ★ ست کردن direction موقع لود اولیه و هر بار تغییر زبان
  useEffect(() => {
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [lang, isRtl]);

  const toggleLang = () => {
    const next = lang === "fa" ? "en" : "fa";
    setLang(next);
    i18n.changeLanguage(next);
    localStorage.setItem("lang", next);
  };

  const theme = useMemo(() => {
    if (isRtl) return mode === "dark" ? darkTheme : lightTheme;
    return mode === "dark" ? ltrDarkTheme : ltrTheme;
  }, [mode, isRtl]);

  const cache = useMemo(
    () => (isRtl ? createRtlCache() : createLtrCache()),
    [isRtl]
  );

  const value = useMemo(() => ({ lang, isRtl, toggleLang }), [lang, isRtl]);

  return (
    <LangContext.Provider value={value}>
      <CacheProvider value={cache} key={isRtl ? "rtl" : "ltr"}>
        <MuiThemeProvider theme={theme}>
          <CssBaseline />
          {children}
        </MuiThemeProvider>
      </CacheProvider>
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}