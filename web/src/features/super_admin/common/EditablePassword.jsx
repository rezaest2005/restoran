import { useState } from "react";
import { Box, Button, InputAdornment, TextField } from "@mui/material";
import { useTranslation } from "react-i18next";
import { PasswordField } from "@shared/ui/AuthShell";

/**
 * Password input for the super-admin forms.
 * - New account (`canEdit` false): a plain password field with the eye button.
 * - Existing account: the password is shown hidden with an "Edit" button. Pressing it opens an empty field
 *   for the new password (with a Cancel button). The value stays "" unless the admin typed a new password,
 *   and the server only changes the password when it is non-empty.
 */
export default function EditablePassword({ canEdit, value, onChange, label, helperText, sx, size }) {
  const { t } = useTranslation();
  const [changing, setChanging] = useState(false);

  if (!canEdit) {
    return (
      <PasswordField size={size} label={label} autoComplete="new-password" value={value}
        onChange={(e) => onChange(e.target.value)} helperText={helperText} sx={sx} />
    );
  }

  if (!changing) {
    return (
      <TextField
        size={size} fullWidth disabled label={label} type="password" value="********" sx={sx}
        helperText={t("ui_resp.pw_saved_hint")}
        slotProps={{
          htmlInput: { dir: "ltr", style: { textAlign: "start" } },
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <Button size="small" onClick={() => setChanging(true)} sx={{ minHeight: 32, fontWeight: 700 }}>
                  {t("ui_resp.edit")}
                </Button>
              </InputAdornment>
            ),
          },
        }}
      />
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
