import { useState } from "react";
import { Box, Button, CircularProgress, IconButton, InputAdornment, TextField, Typography } from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { useTranslation } from "react-i18next";
import { PasswordField } from "@shared/ui/AuthShell";

/**
 * Password input for the super-admin forms.
 * - New account (`canEdit` false): a plain password field with the eye button.
 * - Existing account: the password is shown hidden with an eye button and an "Edit" button.
 *   The eye asks `onReveal()` (a promise of the customer's current password, or null when the panel holds no
 *   valid copy) and shows it with a copy button; a second click hides it again.
 *   "Edit" opens an empty field for a new password (with a Cancel button). The value stays "" unless the admin
 *   typed a new password, and the server only changes the password when it is non-empty.
 */
export default function EditablePassword({ canEdit, value, onChange, label, helperText, sx, size, onReveal }) {
  const { t } = useTranslation();
  const [changing, setChanging] = useState(false);
  // revealed: null = hidden, {text} = shown (text null = the panel holds no valid copy)
  const [revealed, setRevealed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!canEdit) {
    return (
      <PasswordField size={size} label={label} autoComplete="new-password" value={value}
        onChange={(e) => onChange(e.target.value)} helperText={helperText} sx={sx} />
    );
  }

  const toggleReveal = async () => {
    if (revealed) { setRevealed(null); setCopied(false); return; }
    if (busy || !onReveal) return;
    setBusy(true);
    setFailed(false);
    try {
      setRevealed({ text: await onReveal() });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(revealed.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked: the password is visible and can be copied by hand */ }
  };

  if (!changing) {
    const showing = !!revealed && revealed.text != null;
    const eyeLabel = t(revealed ? "ui_resp.pw_hide" : "ui_resp.pw_reveal");
    return (
      <Box>
        <TextField
          size={size} fullWidth disabled label={label} type={showing ? "text" : "password"}
          value={showing ? revealed.text : "********"} sx={sx}
          helperText={revealed && revealed.text == null ? undefined : t("ui_resp.pw_saved_hint")}
          slotProps={{
            htmlInput: { dir: "ltr", style: { textAlign: "start" }, "data-testid": "password-field" },
            input: {
              endAdornment: (
                <InputAdornment position="end" sx={{ gap: 0.25 }}>
                  {onReveal && (
                    <IconButton size="small" onClick={toggleReveal} disabled={busy} data-testid="password-eye"
                      aria-label={eyeLabel} aria-pressed={!!revealed} title={eyeLabel}
                      sx={{ minWidth: 36, minHeight: 36, color: "var(--ink-muted)", pointerEvents: "auto" }}>
                      {busy ? <CircularProgress size={16} /> : (revealed ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />)}
                    </IconButton>
                  )}
                  {showing && (
                    <Button size="small" onClick={copy} data-testid="password-copy" sx={{ minHeight: 32, minWidth: 0, fontWeight: 700 }}>
                      {copied ? t("ui_resp.pw_copied") : t("ui_resp.pw_copy")}
                    </Button>
                  )}
                  <Button size="small" onClick={() => setChanging(true)} sx={{ minHeight: 32, fontWeight: 700 }}>
                    {t("ui_resp.edit")}
                  </Button>
                </InputAdornment>
              ),
            },
          }}
        />
        {revealed && revealed.text == null && (
          <Typography role="status" data-testid="password-unknown" sx={{ fontSize: 12, mt: 0.5, px: 1.5, color: "warning.main" }}>
            {t("ui_resp.pw_unknown")}
          </Typography>
        )}
        {failed && (
          <Typography role="alert" sx={{ fontSize: 12, mt: 0.5, px: 1.5, color: "error.main" }}>{t("ui_resp.pw_reveal_failed")}</Typography>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", flexWrap: "wrap" }}>
      <Box sx={{ flex: "1 1 220px", minWidth: 0 }}>
        <PasswordField size={size} label={t("ui_resp.new_password")} autoComplete="new-password" autoFocus value={value}
          onChange={(e) => onChange(e.target.value)} helperText={t("ui_resp.pw_new_hint")} sx={sx} />
      </Box>
      <Button variant="outlined" size="small" onClick={() => { onChange(""); setChanging(false); }}
        sx={{ minHeight: 40, fontWeight: 700 }}>
        {t("ui_resp.cancel_edit")}
      </Button>
    </Box>
  );
}
