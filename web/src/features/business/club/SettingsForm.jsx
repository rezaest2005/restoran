import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, FormControlLabel, Stack, Switch, TextField, Typography } from "@mui/material";
import { useRegisteredShortcuts } from "@shared/common/shortcutKit";
import KbdHint from "@business/pos/common/KbdHint";
import { fetchSettings, saveSettings, errMsg } from "./api";

const FIELDS = ["earn_amount", "redeem_value", "min_redeem_points", "welcome_points", "silver_points", "gold_points"];

/** Club settings. Ctrl+D saves. Server validation messages are shown as-is. */
export default function SettingsForm({ ctx, onSaved }) {
  const { t, C, S, notify } = ctx;
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetchSettings().then(setForm).catch((e) => setError(errMsg(e, t("ui_club.err.generic"))));
  }, [t]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form || busy) return;
    setBusy(true);
    setError("");
    try {
      const body = { is_active: !!form.is_active };
      FIELDS.forEach((k) => { body[k] = form[k] === "" ? form[k] : Number(form[k]); });
      const d = await saveSettings(body);
      setForm(d);
      notify(t("ui_club.settings.saved"));
      onSaved?.();
    } catch (e) {
      setError(errMsg(e, t("ui_club.err.generic")));
    } finally {
      setBusy(false);
    }
  };

  useRegisteredShortcuts([{ combo: "Ctrl+D", label: t("ui_club.settings.save"), handler: save }], { enabled: !!form });

  if (!form) {
    return error
      ? <Alert severity="error">{error}</Alert>
      : <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress size={28} /></Box>;
  }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <Box sx={{ ...S.card, maxWidth: 560 }}>
      <FormControlLabel
        control={<Switch checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />}
        label={<Typography sx={{ color: C.text, fontWeight: 600 }}>{t("ui_club.settings.active")}</Typography>} />
      <Stack spacing={2} sx={{ mt: 1.5 }}>
        {FIELDS.map((k) => (
          <TextField key={k} size="small" type="number" label={t(`ui_club.settings.${k}`)} value={form[k] ?? ""}
            sx={S.field} helperText={t(`ui_club.settings.${k}_hint`)} onChange={set(k)}
            slotProps={{ htmlInput: { min: 0, dir: "ltr" } }} />
        ))}
      </Stack>
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      <Button sx={{ ...S.btn, mt: 2 }} onClick={save} disabled={busy}>
        {busy ? <CircularProgress size={18} color="inherit" /> : <>{t("ui_club.settings.save")}<KbdHint>Ctrl+D</KbdHint></>}
      </Button>
    </Box>
  );
}
