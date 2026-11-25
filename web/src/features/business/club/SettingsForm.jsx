import { useCallback, useEffect, useState } from "react";
import {
  Alert, Box, Button, CircularProgress, FormControlLabel, MenuItem, Switch, TextField, Typography,
} from "@mui/material";
import { useRegisteredShortcuts } from "@shared/common/shortcutKit";
import { fmtInt } from "../accounting/common";
import { fetchSettings, saveSettings, runDaily, errMsg } from "./api";
import CrudSection from "./CrudSection";
import TierBadge from "./TierBadge";

const GROUPS = [
  { id: "earn", fields: ["earn_amount", "visit_points", "welcome_points", "points_expiry_days"] },
  { id: "redeem", fields: ["redeem_value", "min_redeem_points", "redeem_max_percent"] },
  { id: "tiers", fields: ["tier_basis", "tier_window_days"] },
  { id: "referral", fields: ["referrer_points", "referee_points"] },
  { id: "segments", fields: ["new_days", "loyal_visits", "at_risk_days", "lost_days"] },
];
const SWITCHES = ["is_active", "wallet_enabled", "public_lookup_enabled", "sms_enabled"];

/** Club settings, tiers and earn rules. Ctrl+D saves the general settings. */
export default function SettingsForm({ ctx, onSaved }) {
  const { t, C, S, lang, notify } = ctx;
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
      const body = {};
      SWITCHES.forEach((k) => { body[k] = !!form[k]; });
      GROUPS.flatMap((g) => g.fields).forEach((k) => {
        body[k] = k === "tier_basis" ? form[k] : form[k] === "" ? form[k] : Number(form[k]);
      });
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

  const daily = async () => {
    try {
      const r = await runDaily();
      notify(t("ui_club2.daily_done", { expired: r.expired, tiers: r.tier_changes, campaigns: r.campaigns }));
    } catch (e) {
      notify(errMsg(e, t("ui_club.err.generic")), "error");
    }
  };

  useRegisteredShortcuts([{ combo: "Ctrl+D", label: t("ui_club.settings.save"), handler: save }], { enabled: !!form });

  if (!form) {
    return error
      ? <Alert severity="error">{error}</Alert>
      : <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress size={28} /></Box>;
  }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const publicUrl = form.business_slug ? `${window.location.origin}/club/${form.business_slug}` : "";

  const field = (k) => (k === "tier_basis" ? (
    <TextField key={k} select size="small" label={t("ui_club2.set.tier_basis")} value={form[k]} sx={S.field}
      onChange={set(k)}>
      <MenuItem value="points">{t("ui_club2.set.basis_points")}</MenuItem>
      <MenuItem value="spend">{t("ui_club2.set.basis_spend")}</MenuItem>
    </TextField>
  ) : (
    <TextField key={k} size="small" type="number" value={form[k] ?? ""} sx={S.field} onChange={set(k)}
      label={t(["earn_amount", "redeem_value", "min_redeem_points", "welcome_points"].includes(k)
        ? `ui_club.settings.${k}` : `ui_club2.set.${k}`)}
      slotProps={{ htmlInput: { min: 0, dir: "ltr" } }} />
  ));

  const tierFields = [
    { key: "name", type: "text", label: "ui_club2.tier.name" },
    { key: "min_value", type: "number", label: "ui_club2.tier.min_value" },
    { key: "multiplier", type: "number", step: 0.1, label: "ui_club2.tier.multiplier" },
    { key: "color", type: "text", label: "ui_club2.tier.color", ltr: true },
    { key: "perks", type: "text", label: "ui_club2.tier.perks" },
  ];
  const ruleKinds = ["product", "category", "min_amount", "weekday"];
  const ruleFields = [
    { key: "name", type: "text", label: "ui_club2.rule.name" },
    { key: "kind", type: "select", label: "ui_club2.rule.kind",
      options: ruleKinds.map((k) => ({ value: k, labelKey: `ui_club2.rule.k_${k}` })) },
    { key: "match", type: "text", label: "ui_club2.rule.match",
      when: (f) => ["product", "category"].includes(f.kind) },
    { key: "min_amount", type: "number", label: "ui_club2.rule.min_amount", when: (f) => f.kind === "min_amount" },
    { key: "weekdays", type: "weekdays", label: "ui_club2.rule.weekdays", when: (f) => f.kind === "weekday" },
    { key: "multiplier", type: "number", step: 0.1, label: "ui_club2.rule.multiplier" },
    { key: "bonus_points", type: "number", label: "ui_club2.rule.bonus_points" },
    { key: "starts_on", type: "date", label: "ui_club2.rule.starts_on" },
    { key: "ends_on", type: "date", label: "ui_club2.rule.ends_on" },
    { key: "is_active", type: "bool", label: "ui_club2.active" },
  ];

  return (
    <Box>
      <Box sx={{ ...S.card, mb: 2 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 0.5 }}>
          {SWITCHES.map((k) => (
            <FormControlLabel key={k}
              control={<Switch checked={!!form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.checked })} />}
              label={<Typography sx={{ color: C.text, fontWeight: 600 }}>
                {t(k === "is_active" ? "ui_club.settings.active" : `ui_club2.set.${k}`)}</Typography>} />
          ))}
        </Box>
        {form.public_lookup_enabled && publicUrl && (
          <Alert severity="info" sx={{ mt: 1, wordBreak: "break-all" }}>
            {t("ui_club2.set.public_url")}: <a href={publicUrl} target="_blank" rel="noreferrer" dir="ltr">{publicUrl}</a>
          </Alert>
        )}
        {GROUPS.map((g) => (
          <Box key={g.id} sx={{ mt: 2.5 }}>
            <Typography sx={{ color: C.text, fontWeight: 800, mb: 1.5 }}>{t(`ui_club2.set.group_${g.id}`)}</Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
              {g.fields.map(field)}
            </Box>
          </Box>
        ))}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 2 }}>
          <Button sx={S.btn} onClick={save} disabled={busy}>
            {busy ? <CircularProgress size={18} color="inherit" /> : <>{t("ui_club.settings.save")}</>}
          </Button>
          <Button variant="outlined" sx={S.ghost} onClick={daily}>{t("ui_club2.run_daily")}</Button>
        </Box>
      </Box>

      <CrudSection ctx={ctx} kind="tiers" title={t("ui_club2.tier.title")}
        fields={tierFields} defaults={{ multiplier: 1, min_value: 0 }} onChanged={onSaved}
        columns={[
          { label: t("ui_club2.tier.name"), render: (r) => <TierBadge tier={r} C={C} /> },
          { label: t("ui_club2.tier.min_value"), num: true, render: (r) => fmtInt(r.min_value, lang) },
          { label: t("ui_club2.tier.multiplier"), num: true, render: (r) => `×${r.multiplier}` },
          { label: t("ui_club2.tier.perks"), render: (r) => r.perks || "—" },
        ]} />

      <CrudSection ctx={ctx} kind="rules" title={t("ui_club2.rule.title")}
        fields={ruleFields} defaults={{ kind: "category", multiplier: 1, bonus_points: 0, is_active: true }}
        columns={[
          { label: t("ui_club2.rule.name"), render: (r) => r.name },
          { label: t("ui_club2.rule.kind"), render: (r) => t(`ui_club2.rule.k_${r.kind}`) },
          { label: t("ui_club2.rule.effect"), render: (r) => `×${r.multiplier}${r.bonus_points ? ` +${r.bonus_points}` : ""}` },
          { label: t("ui_club2.active"), render: (r) => (r.is_active ? "✓" : "—") },
        ]} />
    </Box>
  );
}
