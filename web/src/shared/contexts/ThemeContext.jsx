import { createContext, useContext, useState, useMemo, useEffect } from "react";

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem("theme_mode") || "dark"; }
    catch { return "dark"; }
  });

  useEffect(() => {
    try { localStorage.setItem("theme_mode", mode); }
    catch {}
  }, [mode]);

  const toggleTheme = () => setMode(m => m === "dark" ? "light" : "dark");

  const value = useMemo(() => ({ mode, toggleTheme, setMode }), [mode]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeMode() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeMode must be inside ThemeProvider");
  return ctx;
}