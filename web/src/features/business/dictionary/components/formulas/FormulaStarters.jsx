import { useState } from "react";
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Alert, CircularProgress,
} from "@mui/material";
import { blurFocused } from "@shared/common/focus";
import { fmt } from "@business/production/common";
import { parseProcess, errMsg } from "../../api";
import { TEMPLATES, pick, templateDraft } from "./templates";

/** Pick an industry template to start from. */
export function TemplateDialog({ ctx, onClose, onApply }) {
  const { t, C, S, fullScreen, lang } = ctx;
  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} maxWidth="md" fullWidth
      slotProps={{ paper: { sx: S.dialogPaper }, transition: { onExit: blurFocused } }}>
      <DialogTitle sx={{ fontWeight: 800 }}>{t("ui_mrp.templates_title")}</DialogTitle>
      <DialogContent dividers sx={{ borderColor: C.divider }}>
        <Typography sx={{ color: C.sub, fontSize: 13, mb: 2 }}>{t("ui_mrp.templates_hint")}</Typography>
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
          {TEMPLATES.map((tpl) => (
            <Box key={tpl.key} component="button" type="button" onClick={() => onApply(templateDraft(tpl, lang))}
              sx={{
                textAlign: "start", cursor: "pointer", border: `1px solid ${C.glassBorder}`, borderRadius: 2, p: 1.5,
                bgcolor: "transparent", color: C.text, font: "inherit",
                "&:hover, &:focus-visible": { borderColor: C.primary, outline: "none", bgcolor: C.infoBg },
              }}>
              <Typography sx={{ fontWeight: 800, mb: 0.5 }}>
                <span aria-hidden="true">{tpl.icon} </span>{t(`ui_mrp.tpl_${tpl.key}`)}
              </Typography>
              <Typography sx={{ color: C.sub, fontSize: 12 }}>
                {tpl.stages.map((s) => pick(s.name, lang)).join(" ← ")}
              </Typography>
              <Typography sx={{ color: C.muted, fontSize: 11, mt: 0.5 }}>
                {t("ui_mrp.tpl_counts", { stages: tpl.stages.length, items: tpl.components.length })}
              </Typography>
            </Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="outlined" sx={S.ghost} onClick={onClose}>{t("ui_e.common.cancel")}</Button>
      </DialogActions>
    </Dialog>
  );
}

/** "Describe your process": plain lines → draft stages and components (server-side, deterministic). */
export function ProcessDialog({ ctx, onClose, onApply }) {
  const { t, C, S, fullScreen } = ctx;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(null);

  const run = async () => {
    if (!text.trim()) return;
    setBusy(true); setError("");
    try { setDraft(await parseProcess(text)); }
    catch (e) { setError(errMsg(e, t("ui_def.common.load_failed"))); }
    finally { setBusy(false); }
  };

  const apply = () => {
    const stages = (draft?.stages || []).map((s) => ({
      name: s.name, workstation: s.workstation, setup_minutes: 0, run_minutes: s.run_minutes || 0,
      capacity: 0, instructions: s.instructions, quality_check: "",
    }));
    const components = [];
    (draft?.stages || []).forEach((s, i) => (s.components || []).forEach((c) => {
      components.push({ name: c.material || c.name, altNames: [c.name], quantity: c.quantity, unit: c.unit, type: "raw", stageIndex: i, material_id: c.material_id });
    }));
    onApply({ stages, components });
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullScreen={fullScreen} maxWidth="md" fullWidth
      slotProps={{ paper: { sx: S.dialogPaper }, transition: { onExit: blurFocused } }}>
      <DialogTitle sx={{ fontWeight: 800 }}>{t("ui_mrp.describe_title")}</DialogTitle>
      <DialogContent dividers sx={{ borderColor: C.divider }}>
        <Typography sx={{ color: C.sub, fontSize: 13, mb: 1 }}>{t("ui_mrp.describe_hint")}</Typography>
        <Box component="pre" dir="auto" sx={{ bgcolor: C.infoBg, borderRadius: 1.5, p: 1.25, fontSize: 12, color: C.sub, whiteSpace: "pre-wrap", m: 0, mb: 1.5, fontFamily: "inherit" }}>
          {t("ui_mrp.describe_example")}
        </Box>
        <TextField fullWidth multiline minRows={5} value={text} onChange={(e) => { setText(e.target.value); setDraft(null); }}
          label={t("ui_mrp.describe_label")} sx={S.field} slotProps={{ htmlInput: { dir: "auto", maxLength: 6000 } }} autoFocus />
        {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
        {draft && (
          <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 1 }}>
            <Typography sx={{ fontWeight: 700, color: C.text }}>{t("ui_mrp.describe_preview", { count: draft.stages.length })}</Typography>
            {draft.stages.length === 0 && <Alert severity="warning">{t("ui_mrp.describe_nothing")}</Alert>}
            {draft.stages.map((s) => (
              <Box key={s.sequence} sx={{ border: `1px solid ${C.glassBorder}`, borderRadius: 1.5, p: 1 }}>
                <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
                  {s.sequence}. {s.name}
                  {s.workstation && <Box component="span" sx={{ color: C.sub, fontWeight: 400 }}> · {s.workstation}</Box>}
                  {s.run_minutes > 0 && <Box component="span" sx={{ color: C.sub, fontWeight: 400 }}> · {t("ui_mrp.min_short", { n: fmt(s.run_minutes) })}</Box>}
                </Typography>
                {(s.components || []).map((c, i) => (
                  <Typography key={i} sx={{ fontSize: 12, color: c.material_id ? C.text : C.warning }}>
                    • {fmt(c.quantity)} {t(`ui_def.units.${c.unit}`, { defaultValue: c.unit })} {c.material || c.name}
                    {!c.material_id && ` — ${t("ui_mrp.describe_new_item")}`}
                  </Typography>
                ))}
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1, flexWrap: "wrap" }}>
        <Button variant="outlined" sx={S.ghost} onClick={onClose} disabled={busy}>{t("ui_e.common.cancel")}</Button>
        <Button variant="outlined" sx={S.ghost} onClick={run} disabled={busy || !text.trim()}>
          {busy ? <CircularProgress size={18} color="inherit" /> : t("ui_mrp.describe_read")}
        </Button>
        <Button sx={S.btn} onClick={apply} disabled={!draft || draft.stages.length === 0}>{t("ui_mrp.describe_apply")}</Button>
      </DialogActions>
    </Dialog>
  );
}
