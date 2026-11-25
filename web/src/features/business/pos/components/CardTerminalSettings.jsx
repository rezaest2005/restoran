import { useMemo, useState } from "react";
import {
  Box, Typography, Switch, FormControlLabel, TextField, Button, Alert, CircularProgress,
  ToggleButton, ToggleButtonGroup, MenuItem,
} from "@mui/material";
import { NetworkCheck, Save } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { saveCardSettings, testCardConnection, probeBridge } from "../services/cardTerminal";

const FONT = "'Vazirmatn', sans-serif";

const pick = (s) => ({
  enabled: !!s.enabled, mode: s.mode, adapter: s.adapter, host: s.host, port: s.port,
  timeout_seconds: s.timeout_seconds, amount_unit: s.amount_unit,
});

/** POS settings tab: card terminal (owner / manager change it, others see it read-only). */
export default function CardTerminalSettings({ settings, onSaved, C, glassCardSx }) {
  const { t } = useTranslation();
  const canEdit = !!settings?.can_edit;
  const [form, setForm] = useState(() => (settings ? pick(settings) : null));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState(null);                 // { sev, text }
  const [fieldErr, setFieldErr] = useState({});

  // new settings from the server (after a save / first load) replace the form
  const [seen, setSeen] = useState(settings);
  if (seen !== settings) {
    setSeen(settings);
    setForm(settings ? pick(settings) : null);
  }

  const dirty = useMemo(
    () => !!form && !!settings && JSON.stringify(form) !== JSON.stringify(pick(settings)),
    [form, settings],
  );

  if (!form) return <Alert severity="warning">{t("ui_card.settings.load_failed")}</Alert>;

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setMsg(null); };
  const local = form.mode === "local_bridge";

  const save = async () => {
    setSaving(true); setMsg(null); setFieldErr({});
    try {
      const d = await saveCardSettings({
        ...form, port: Number(form.port), timeout_seconds: Number(form.timeout_seconds),
      });
      onSaved?.(d.settings);
      setMsg({ sev: "success", text: t("ui_card.settings.saved") });
    } catch (err) {
      setFieldErr(err?.response?.data?.fields || {});
      setMsg({ sev: "error", text: t("ui_card.settings.save_failed") });
    } finally { setSaving(false); }
  };

  const test = async () => {
    setTesting(true); setMsg(null);
    try {
      if (local) {
        const r = await probeBridge(`http://127.0.0.1:${Number(form.port)}`);
        setMsg(r.ok
          ? { sev: "success", text: t("ui_card.settings.test_ok_local") }
          : { sev: "error", text: t("ui_card.settings.test_unreachable") });
      } else {
        const d = await testCardConnection();
        const code = d.result?.code;
        if (d.result?.ok) setMsg({ sev: "success", text: t("ui_card.settings.test_ok") });
        else if (code === "not_private") setMsg({ sev: "error", text: t("ui_card.settings.test_not_private") });
        else if (code === "dns") setMsg({ sev: "error", text: t("ui_card.settings.test_dns") });
        else setMsg({ sev: "error", text: t("ui_card.settings.test_unreachable") });
      }
    } catch {
      setMsg({ sev: "error", text: t("ui_card.settings.test_unreachable") });
    } finally { setTesting(false); }
  };

  const fieldSx = { "& .MuiInputBase-root": { fontFamily: FONT }, "& .MuiInputLabel-root": { fontFamily: FONT } };

  return (
    <Box sx={{ flex: 1, overflowY: "auto", p: { xs: 1, sm: 2 } }}>
      <Box sx={{ ...glassCardSx, p: { xs: 1.5, sm: 2.5 }, maxWidth: 720, mx: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        <Typography sx={{ fontWeight: 900, fontSize: 18, color: C.text, fontFamily: FONT }}>
          {t("ui_card.settings.title")}
        </Typography>
        {!canEdit && <Alert severity="info">{t("ui_card.settings.readonly")}</Alert>}

        <FormControlLabel
          control={<Switch checked={form.enabled} disabled={!canEdit} onChange={(e) => set("enabled", e.target.checked)}
            inputProps={{ "aria-label": t("ui_card.settings.enabled") }} />}
          label={<Typography sx={{ fontFamily: FONT, fontWeight: 700 }}>{t("ui_card.settings.enabled")}</Typography>}
        />

        <Box>
          <Typography sx={{ fontSize: 13, fontWeight: 800, mb: 0.8, color: C.text, fontFamily: FONT }}>
            {t("ui_card.settings.mode")}
          </Typography>
          <ToggleButtonGroup
            exclusive fullWidth value={form.mode} disabled={!canEdit}
            onChange={(_, v) => v && set("mode", v)}
            orientation="vertical" sx={{ "& .MuiToggleButton-root": { fontFamily: FONT, justifyContent: "flex-start", textAlign: "start" } }}
          >
            <ToggleButton value="local_bridge" data-testid="mode-local" title={t("ui_card.settings.mode_local_hint")}>{t("ui_card.settings.mode_local")}</ToggleButton>
            <ToggleButton value="server" data-testid="mode-server" title={t("ui_card.settings.mode_server_hint")}>{t("ui_card.settings.mode_server")}</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
          <TextField select size="small" label={t("ui_card.settings.adapter")} value={form.adapter} disabled={!canEdit}
            onChange={(e) => set("adapter", e.target.value)} sx={fieldSx}>
            {(settings.adapters || [{ code: "http_bridge" }]).map((a) => (
              <MenuItem key={a.code} value={a.code}>{t(`ui_card.settings.adapter_${a.code}`, { defaultValue: a.label || a.code })}</MenuItem>
            ))}
          </TextField>
          <TextField size="small" label={t("ui_card.settings.host")} value={local ? t("ui_card.settings.host_local") : form.host}
            disabled={!canEdit || local} onChange={(e) => set("host", e.target.value)} sx={fieldSx}
            error={!!fieldErr.host} helperText={fieldErr.host ? t("ui_card.settings.err_host") : ""}
            slotProps={{ htmlInput: { dir: "ltr", "data-testid": "host" } }} />
          <TextField size="small" type="number" label={t("ui_card.settings.port")} value={form.port} disabled={!canEdit}
            onChange={(e) => set("port", e.target.value)} sx={fieldSx}
            error={!!fieldErr.port} helperText={fieldErr.port ? t("ui_card.settings.err_port") : ""}
            slotProps={{ htmlInput: { min: 1, max: 65535, dir: "ltr", "data-testid": "port" } }} />
          <TextField size="small" type="number" label={t("ui_card.settings.timeout")} value={form.timeout_seconds}
            disabled={!canEdit} onChange={(e) => set("timeout_seconds", e.target.value)} sx={fieldSx}
            error={!!fieldErr.timeout_seconds} helperText={fieldErr.timeout_seconds ? t("ui_card.settings.err_timeout") : ""}
            slotProps={{ htmlInput: { min: 15, max: 300, dir: "ltr", "data-testid": "timeout" } }} />
          <TextField select size="small" label={t("ui_card.settings.unit")} value={form.amount_unit} disabled={!canEdit}
            onChange={(e) => set("amount_unit", e.target.value)} sx={{ ...fieldSx, gridColumn: { sm: "1 / -1" } }}
            data-testid="unit">
            <MenuItem value="rial">{t("ui_card.settings.unit_rial")}</MenuItem>
            <MenuItem value="toman">{t("ui_card.settings.unit_toman")}</MenuItem>
          </TextField>
        </Box>

        {msg && <Alert severity={msg.sev} data-testid="card-settings-msg">{msg.text}</Alert>}

        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button variant="contained" startIcon={saving ? <CircularProgress size={16} /> : <Save />}
            onClick={save} disabled={!canEdit || saving || !dirty} data-testid="card-save">
            {t("ui_card.settings.save")}
          </Button>
          <Button variant="outlined" startIcon={testing ? <CircularProgress size={16} /> : <NetworkCheck />}
            onClick={test} disabled={testing || !canEdit || (!local && dirty)} data-testid="card-test"
            title={!local && dirty ? t("ui_card.settings.save_first") : undefined}>
            {t(testing ? "ui_card.settings.testing" : "ui_card.settings.test")}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
