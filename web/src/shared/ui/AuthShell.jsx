import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Box, Typography, IconButton, TextField, InputAdornment, Tooltip,
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import Language from "@mui/icons-material/Language";
import DarkMode from "@mui/icons-material/DarkMode";
import LightMode from "@mui/icons-material/LightMode";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import { appName } from "@shared/branding";
import { BrandSquare } from "@shared/ui/BrandMark";

/**
 * Shared sign-in layout (business + super admin): flat design-system background, one centred card,
 * language and theme buttons in the corner. No decoration, no blue — colours come only from tokens.
 */
export default function AuthShell({ title, subtitle, footer, children }) {
  const { t, i18n } = useTranslation();
  const { mode, toggleTheme } = useThemeMode();
  const { toggleLang, isRtl } = useLang();
  const dark = mode === "dark";

  return (
    <Box
      dir={isRtl ? "rtl" : "ltr"}
      sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", bgcolor: "var(--bg)", color: "var(--ink)" }}
    >
      <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 0.5, p: 1.5 }}>
        <Tooltip title={t("ui_a.login.switch_lang")}>
          <IconButton onClick={toggleLang} aria-label={t("ui_a.login.switch_lang")} sx={{ color: "var(--ink-muted)" }}>
            <Language />
          </IconButton>
        </Tooltip>
        <Tooltip title={t("login.darkMode")}>
          <IconButton onClick={toggleTheme} aria-label={t("login.darkMode")} sx={{ color: "var(--ink-muted)" }}>
            {dark ? <LightMode /> : <DarkMode />}
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ flex: 1, display: "grid", placeItems: "center", px: 2, pb: 4 }}>
        <Box
          component="main"
          sx={{
            width: "100%", maxWidth: 400, p: { xs: 3, sm: 4 },
            bgcolor: "var(--surface)", border: "1px solid var(--line)",
            borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)",
          }}
        >
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1.25, mb: 3, textAlign: "center" }}>
            <BrandSquare size={44} />
            <Typography sx={{ fontWeight: 800, fontSize: 13, color: "var(--ink-muted)" }}>{appName(i18n.language)}</Typography>
            <Typography component="h1" sx={{ fontWeight: 800, fontSize: 22, lineHeight: 1.5 }}>{title}</Typography>
            {subtitle && <Typography sx={{ color: "var(--ink-muted)", fontSize: 14, lineHeight: 1.8 }}>{subtitle}</Typography>}
          </Box>
          {children}
        </Box>
      </Box>

      {footer && (
        <Typography sx={{ textAlign: "center", color: "var(--ink-muted)", fontSize: 12, pb: 2 }}>{footer}</Typography>
      )}
    </Box>
  );
}

/** Password input with an eye button (instead of a text link) to reveal / hide the value. */
export function PasswordField({ label, value, onChange, placeholder, autoComplete = "current-password", disabled, ...rest }) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const toggle = t(show ? "ui_auth.hide_password" : "ui_auth.show_password");
  return (
    <TextField
      {...rest}
      fullWidth label={label} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled}
      type={show ? "text" : "password"} autoComplete={autoComplete}
      slotProps={{
        htmlInput: { dir: "ltr", style: { textAlign: "start" } },
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                edge="end" onClick={() => setShow((v) => !v)} onMouseDown={(e) => e.preventDefault()}
                aria-label={toggle} aria-pressed={show} title={toggle} disabled={disabled}
                sx={{ color: "var(--ink-muted)" }}
              >
                {show ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
