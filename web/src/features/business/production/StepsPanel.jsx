import { useState } from "react";
import { Box, Typography, Button, TextField, Chip, Alert, CircularProgress, MenuItem } from "@mui/material";
import { num, fmt, fmtMinutes } from "./common";
import { startStep, completeStep, skipStep, errMsg } from "./api";

/** Job cards of one order: stages run in sequence; each records good qty, scrap, time and QC. */
export default function StepsPanel({ ctx, order, onChanged }) {
  const { t, C, S } = ctx;
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState("");
  const [form, setForm] = useState(null); // { id, good, scrap, minutes, qc, notes }
  const steps = order.steps || [];
  const open = order.status === "planned" || order.status === "in_progress";
  if (!steps.length) return null;

  const firstOpen = steps.find((s) => s.status === "pending" || s.status === "in_progress");
  const tone = (s) => ({
    pending: [C.muted, C.divider], in_progress: [C.warning, C.warningBg],
    done: [C.success, C.successBg], skipped: [C.muted, C.divider],
  }[s] || [C.muted, C.divider]);

  const act = async (fn, id) => {
    setBusy(id); setErr("");
    try { const updated = await fn(); setForm(null); onChanged(updated); }
    catch (e) { setErr(errMsg(e, t("ui_e.common.save_failed"))); }
    finally { setBusy(null); }
  };
  const finish = () => act(() => completeStep(order.id, form.id, {
    good_quantity: form.good === "" ? null : num(form.good),
    scrap_quantity: form.scrap === "" ? null : num(form.scrap),
    actual_minutes: form.minutes === "" ? null : num(form.minutes),
    quality_ok: form.qc === "" ? null : form.qc === "ok",
    notes: form.notes,
  }), form.id);

  const done = steps.filter((s) => s.status === "done" || s.status === "skipped").length;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Typography sx={{ color: C.text, fontWeight: 700 }}>
        {t("ui_mrp.steps_title")} <Box component="span" sx={{ color: C.sub, fontWeight: 400, fontSize: 13 }}>({t("ui_mrp.steps_progress", { done, total: steps.length })})</Box>
      </Typography>
      {err && <Alert severity="error">{err}</Alert>}
      {steps.map((s) => {
        const [fg, bg] = tone(s.status);
        const isNext = open && firstOpen?.id === s.id;
        return (
          <Box key={s.id} sx={{ border: `1px solid ${isNext ? C.primary : C.glassBorder}`, borderRadius: 2, p: 1.25 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
              <Typography sx={{ fontWeight: 700, color: C.text }}>{s.sequence}. {s.name}</Typography>
              {s.workstation && <Typography sx={{ color: C.sub, fontSize: 12 }}>· {s.workstation}</Typography>}
              <Chip size="small" label={t(`ui_mrp.step_status_${s.status}`)} sx={{ color: fg, bgcolor: bg, fontWeight: 700, height: 22 }} />
              <Typography sx={{ color: C.sub, fontSize: 12, marginInlineStart: "auto" }}>
                {t("ui_mrp.planned_time")}: {fmtMinutes(t, s.planned_minutes)}
                {s.actual_minutes != null && ` · ${t("ui_mrp.actual_time")}: ${fmtMinutes(t, s.actual_minutes)}`}
              </Typography>
            </Box>
            {s.instructions && <Typography sx={{ color: C.sub, fontSize: 12, mt: 0.5, whiteSpace: "pre-wrap" }}>{s.instructions}</Typography>}
            {s.quality_check && <Typography sx={{ color: C.warning, fontSize: 12, mt: 0.25 }}>{t("ui_mrp.quality_check")}: {s.quality_check}</Typography>}
            {(s.good_quantity != null || s.scrap_quantity > 0 || s.quality_ok != null) && (
              <Typography sx={{ color: C.sub, fontSize: 12, mt: 0.25 }}>
                {s.good_quantity != null && `${t("ui_mrp.good_qty")}: ${fmt(s.good_quantity)} · `}
                {s.scrap_quantity > 0 && `${t("ui_mrp.scrap")}: ${fmt(s.scrap_quantity)} · `}
                {s.quality_ok != null && (s.quality_ok ? t("ui_mrp.qc_ok") : t("ui_mrp.qc_fail"))}
              </Typography>
            )}
            {open && (s.status === "pending" || s.status === "in_progress") && (
              <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
                {s.status === "pending" && (
                  <Button size="small" variant="outlined" sx={S.ghost} disabled={!isNext || busy != null}
                    onClick={() => act(() => startStep(order.id, s.id), s.id)}>
                    {busy === s.id ? <CircularProgress size={16} color="inherit" /> : t("ui_mrp.step_start")}
                  </Button>
                )}
                <Button size="small" sx={S.btn} disabled={!isNext || busy != null}
                  onClick={() => setForm({ id: s.id, good: "", scrap: "", minutes: "", qc: "", notes: "" })}>
                  {t("ui_mrp.step_finish")}
                </Button>
                <Button size="small" sx={{ textTransform: "none", color: C.muted }} disabled={busy != null}
                  onClick={() => act(() => skipStep(order.id, s.id), s.id)}>
                  {t("ui_mrp.step_skip")}
                </Button>
              </Box>
            )}
            {form?.id === s.id && (
              <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" }, mt: 1.25 }}>
                {[["good", t("ui_mrp.good_qty")], ["scrap", t("ui_mrp.scrap")], ["minutes", t("ui_mrp.actual_minutes")]].map(([k, label]) => (
                  <TextField key={k} size="small" type="number" label={label} value={form[k]} sx={S.field}
                    onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                    slotProps={{ htmlInput: { min: 0, step: "any", inputMode: "decimal" } }} />
                ))}
                <TextField select size="small" label={t("ui_mrp.quality_check")} value={form.qc} sx={S.field}
                  onChange={(e) => setForm((f) => ({ ...f, qc: e.target.value }))}>
                  <MenuItem value="">—</MenuItem>
                  <MenuItem value="ok">{t("ui_mrp.qc_ok")}</MenuItem>
                  <MenuItem value="fail">{t("ui_mrp.qc_fail")}</MenuItem>
                </TextField>
                <TextField size="small" label={t("ui_e.orders.f_notes")} value={form.notes} sx={{ ...S.field, gridColumn: "1 / -1" }}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
                <Box sx={{ gridColumn: "1 / -1", display: "flex", gap: 1, justifyContent: "flex-end" }}>
                  <Button size="small" variant="outlined" sx={S.ghost} onClick={() => setForm(null)}>{t("ui_e.common.cancel")}</Button>
                  <Button size="small" sx={S.btn} onClick={finish} disabled={busy != null}>
                    {busy === s.id ? <CircularProgress size={16} color="inherit" /> : t("ui_mrp.step_finish")}
                  </Button>
                </Box>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
