import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Button, TextField, MenuItem, Alert, Chip, CircularProgress,
} from "@mui/material";
import {
  Money, ConfirmDialog, fmtDate, jalaliFiscalYear, jalaliYearOf, todayISO,
} from "../common";
import {
  fetchAccSettings, saveAccSettings, applyChartTemplate, fetchFiscalYears, createFiscalYear, fetchFiscalYear,
  deleteFiscalYear, closeFiscalYear, reopenFiscalYear, lockPeriod, errMsg,
} from "../api";

/** Fiscal years & period locks, year-end closing, industry chart template and VAT rate. */
export default function SettingsTab(ctx) {
  const { t, C, S, lang, notify, refreshKey, bump, reloadAccounts } = ctx;
  const [settings, setSettings] = useState(null);
  const [years, setYears] = useState([]);
  const [error, setError] = useState("");
  const [tpl, setTpl] = useState("");
  const [vat, setVat] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // {kind, year, preview}
  const [newYear, setNewYear] = useState({ mode: "jalali", jy: String(jalaliYearOf(todayISO())), name: "", start: "", end: "" });

  const load = useCallback(() => {
    fetchAccSettings().then((s) => { setSettings(s); setTpl(s.chart_template); setVat(String(Number(s.vat_rate))); })
      .catch((e) => setError(errMsg(e, t("ui_i.common.load_failed"))));
    fetchFiscalYears().then((d) => setYears(d?.years || [])).catch(() => {});
  }, [t]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const run = async (fn, ok) => {
    setBusy(true); setError("");
    try { const r = await fn(); if (ok) notify(ok); load(); bump(); return r; } catch (e) {
      setError(errMsg(e, t("ui_i.common.save_failed"))); return null;
    } finally { setBusy(false); }
  };

  const createYear = () => {
    let body;
    if (newYear.mode === "jalali") {
      const jy = Number(newYear.jy);
      if (!jy) return;
      body = jalaliFiscalYear(jy);
    } else {
      if (!newYear.name.trim() || !newYear.start || !newYear.end) return;
      body = { name: newYear.name.trim(), start_date: newYear.start, end_date: newYear.end };
    }
    run(() => createFiscalYear(body), t("acc2.fiscal.created"));
  };

  const askClose = async (y) => {
    const d = await run(() => fetchFiscalYear(y.id));
    if (d) setConfirm({ kind: "close", year: y, preview: d.preview });
  };
  const doConfirm = async () => {
    const { kind, year } = confirm;
    setConfirm(null);
    if (kind === "close") await run(() => closeFiscalYear(year.id), t("acc2.fiscal.closed_ok"));
    else if (kind === "reopen") await run(() => reopenFiscalYear(year.id), t("acc2.fiscal.reopened_ok"));
    else if (kind === "delete") await run(() => deleteFiscalYear(year.id), t("acc2.entry.deleted_ok"));
  };

  const section = { p: { xs: 1.5, sm: 2 }, borderRadius: 2, border: `1px solid ${C.glassBorder}`, mb: 2 };

  return (
    <Box sx={S.card}>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}

      <Box sx={section}>
        <Typography sx={{ color: C.text, fontWeight: 800, mb: 0.5 }}>{t("acc2.fiscal.title")}</Typography>
        <Typography sx={{ color: C.sub, fontSize: 13, mb: 1.5 }}>{t("acc2.fiscal.intro")}</Typography>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
          <TextField select size="small" value={newYear.mode} onChange={(e) => setNewYear({ ...newYear, mode: e.target.value })} sx={{ ...S.field, width: 170 }}>
            <MenuItem value="jalali">{t("acc2.fiscal.jalali")}</MenuItem>
            <MenuItem value="custom">{t("acc2.fiscal.custom")}</MenuItem>
          </TextField>
          {newYear.mode === "jalali" ? (
            <TextField size="small" label={t("acc2.fiscal.jalali_year")} value={newYear.jy} onChange={(e) => setNewYear({ ...newYear, jy: e.target.value })}
              sx={{ ...S.field, width: 140 }} slotProps={{ htmlInput: { dir: "ltr", inputMode: "numeric" } }} />
          ) : (
            <>
              <TextField size="small" label={t("ui_i.common.name")} value={newYear.name} onChange={(e) => setNewYear({ ...newYear, name: e.target.value })} sx={{ ...S.field, width: 140 }} />
              <TextField type="date" size="small" label={t("ui_i.common.from")} value={newYear.start} onChange={(e) => setNewYear({ ...newYear, start: e.target.value })} sx={{ ...S.field, width: 160 }} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField type="date" size="small" label={t("ui_i.common.to")} value={newYear.end} onChange={(e) => setNewYear({ ...newYear, end: e.target.value })} sx={{ ...S.field, width: 160 }} slotProps={{ inputLabel: { shrink: true } }} />
            </>
          )}
          <Button sx={S.btn} onClick={createYear} disabled={busy}>{t("acc2.fiscal.create")}</Button>
        </Box>
        {years.length === 0 && <Typography sx={{ color: C.muted }}>{t("acc2.fiscal.none")}</Typography>}
        {years.map((y) => (
          <Box key={y.id} sx={{ borderTop: `1px solid ${C.divider}`, py: 1.5 }}>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mb: 1 }}>
              <Typography sx={{ color: C.text, fontWeight: 700 }}>{y.name}</Typography>
              <Typography sx={{ color: C.sub, fontSize: 13 }}>{fmtDate(y.start_date, lang)} — {fmtDate(y.end_date, lang)}</Typography>
              <Chip size="small" label={y.status === "closed" ? t("acc2.fiscal.closed") : t("acc2.fiscal.open")}
                sx={{ color: y.status === "closed" ? C.muted : C.success, bgcolor: y.status === "closed" ? C.divider : C.successBg, fontWeight: 700 }} />
              <Box sx={{ flex: 1 }} />
              {y.status === "open" ? (
                <>
                  <Button size="small" sx={{ ...S.link, color: C.danger }} onClick={() => setConfirm({ kind: "delete", year: y })}>{t("ui_i.common.remove")}</Button>
                  <Button size="small" variant="outlined" sx={S.ghost} onClick={() => askClose(y)} disabled={busy}>{t("acc2.fiscal.close")}</Button>
                </>
              ) : (
                <Button size="small" variant="outlined" sx={S.ghost} onClick={() => setConfirm({ kind: "reopen", year: y })} disabled={busy}>{t("acc2.fiscal.reopen")}</Button>
              )}
            </Box>
            <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
              {y.periods.map((p) => (
                <Chip key={p.id} size="small" label={<Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                  {p.is_locked ? "🔒" : ""}{p.name}
                </Box>}
                  clickable={y.status === "open"} disabled={busy}
                  onClick={() => y.status === "open" && run(() => lockPeriod(p.id, !p.is_locked), p.is_locked ? t("acc2.fiscal.unlocked") : t("acc2.fiscal.locked"))}
                  sx={{ height: 32, bgcolor: p.is_locked ? C.warningBg : "transparent", color: p.is_locked ? C.warning : C.sub,
                    border: `1px solid ${p.is_locked ? C.warning : C.glassBorder}` }} />
              ))}
            </Box>
          </Box>
        ))}
        <Typography sx={{ color: C.muted, fontSize: 12, mt: 1 }}>{t("acc2.fiscal.lock_hint")}</Typography>
      </Box>

      <Box sx={section}>
        <Typography sx={{ color: C.text, fontWeight: 800, mb: 0.5 }}>{t("acc2.settings.chart_title")}</Typography>
        <Typography sx={{ color: C.sub, fontSize: 13, mb: 1.5 }}>{t("acc2.settings.chart_intro")}</Typography>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
          <TextField select size="small" value={tpl} onChange={(e) => setTpl(e.target.value)} sx={{ ...S.field, minWidth: 220 }}>
            {(settings?.templates || []).map((x) => <MenuItem key={x.key} value={x.key}>{lang === "fa" ? x.fa : x.en}</MenuItem>)}
          </TextField>
          <Button sx={S.btn} disabled={busy || !tpl}
            onClick={async () => { const r = await run(() => applyChartTemplate(tpl)); if (r) { notify(t("acc2.settings.applied", { n: r.created })); reloadAccounts(); } }}>
            {t("acc2.settings.apply")}
          </Button>
        </Box>
      </Box>

      <Box sx={section}>
        <Typography sx={{ color: C.text, fontWeight: 800, mb: 1 }}>{t("acc2.settings.vat_title")}</Typography>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
          <TextField size="small" label={t("acc2.vat.rate")} value={vat} onChange={(e) => setVat(e.target.value)}
            sx={{ ...S.field, width: 160 }} slotProps={{ htmlInput: { dir: "ltr", inputMode: "decimal" } }} />
          <Button sx={S.btn} disabled={busy} onClick={() => run(() => saveAccSettings({ vat_rate: vat }), t("ui_i.entry.saved"))}>{t("ui_i.common.save")}</Button>
          {busy && <CircularProgress size={18} />}
        </Box>
      </Box>

      <ConfirmDialog
        ctx={ctx} open={!!confirm} danger={confirm?.kind !== "reopen"} busy={busy}
        title={confirm?.kind === "close" ? t("acc2.fiscal.close") : confirm?.kind === "reopen" ? t("acc2.fiscal.reopen") : t("ui_i.common.remove")}
        text={confirm?.kind === "close" ? t("acc2.fiscal.close_text") : confirm?.kind === "reopen" ? t("acc2.fiscal.reopen_text") : t("acc2.fiscal.delete_text")}
        confirmLabel={confirm?.kind === "close" ? t("acc2.fiscal.close") : confirm?.kind === "reopen" ? t("acc2.fiscal.reopen") : t("ui_i.common.remove")}
        onClose={() => setConfirm(null)} onConfirm={doConfirm}
      >
        {confirm?.kind === "close" && confirm.preview && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            <Typography sx={{ color: C.text }}>{t("acc2.fiscal.net_profit")}: <Money v={confirm.preview.net_profit} lang={lang} C={C} bold /></Typography>
            {confirm.preview.drafts > 0 && <Alert severity="warning">{t("acc2.fiscal.has_drafts", { n: confirm.preview.drafts })}</Alert>}
          </Box>
        )}
      </ConfirmDialog>
    </Box>
  );
}
