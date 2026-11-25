import { Box, Typography, Button, TextField, IconButton, Collapse } from "@mui/material";
import { useState } from "react";
import { num, fmt, stageMinutes, stageCost, fmtMinutes } from "@business/production/common";

/**
 * Production line editor: ordered stage cards (name, workstation, time, rates, instructions, QC)
 * plus which components each stage consumes (read from the lines' stage).
 */
export default function StagesEditor({ ctx, stages, setStages, lines, matName, batch, touched }) {
  const { t, C, S } = ctx;
  const [open, setOpen] = useState({});
  const set = (key, patch) => setStages((ss) => ss.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const move = (i, dir) => setStages((ss) => {
    const j = i + dir;
    if (j < 0 || j >= ss.length) return ss;
    const copy = [...ss];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  });
  const numField = (s, field, label, adorn) => (
    <TextField size="small" type="number" label={label} value={s[field] ?? ""} sx={S.field}
      error={touched && s[field] !== "" && s[field] != null && !(num(s[field]) >= 0)}
      onChange={(e) => set(s.key, { [field]: e.target.value })}
      slotProps={{ htmlInput: { min: 0, step: "any", inputMode: "decimal" }, input: adorn ? { endAdornment: <Typography sx={{ color: C.muted, fontSize: 11, whiteSpace: "nowrap" }}>{adorn}</Typography> } : undefined }} />
  );

  if (stages.length === 0) {
    return (
      <Typography sx={{ color: C.sub, fontSize: 13, textAlign: "center", py: 1 }}>{t("ui_mrp.stages_empty")}</Typography>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {stages.map((s, i) => {
        const minutes = stageMinutes(s, num(batch), num(batch));
        const cost = stageCost(s, minutes);
        const used = lines.filter((l) => l.stageKey === s.key && l.material_id);
        const expanded = open[s.key] !== undefined ? open[s.key] : !!(s.instructions || s.quality_check);
        return (
          <Box key={s.key} sx={{ border: `1px solid ${C.glassBorder}`, borderRadius: 2, p: 1.5, bgcolor: C.card || "transparent" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5, flexWrap: "wrap" }}>
              <Box aria-hidden="true" sx={{ width: 28, height: 28, borderRadius: "50%", bgcolor: C.primary, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{i + 1}</Box>
              <TextField size="small" label={t("ui_mrp.stage_name")} value={s.name} sx={{ ...S.field, flex: "1 1 180px" }}
                error={touched && !s.name.trim()} onChange={(e) => set(s.key, { name: e.target.value })} />
              <TextField size="small" label={t("ui_mrp.workstation")} value={s.workstation} sx={{ ...S.field, flex: "1 1 140px" }}
                onChange={(e) => set(s.key, { workstation: e.target.value })} />
              <Box sx={{ display: "flex", gap: 0.25 }}>
                <IconButton size="small" aria-label={t("ui_mrp.move_up")} disabled={i === 0} onClick={() => move(i, -1)}>▲</IconButton>
                <IconButton size="small" aria-label={t("ui_mrp.move_down")} disabled={i === stages.length - 1} onClick={() => move(i, 1)}>▼</IconButton>
                <IconButton size="small" aria-label={t("ui_e.common.remove")} sx={{ color: C.danger }}
                  onClick={() => setStages((ss) => ss.filter((x) => x.key !== s.key))}>✕</IconButton>
              </Box>
            </Box>
            <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)", md: "repeat(5, 1fr)" } }}>
              {numField(s, "setup_minutes", t("ui_mrp.setup_minutes"), t("ui_mrp.min"))}
              {numField(s, "run_minutes", t("ui_mrp.run_minutes"), t("ui_mrp.min"))}
              <Box title={t("ui_mrp.capacity_hint")}>{numField(s, "capacity", t("ui_mrp.capacity"))}</Box>
              {numField(s, "labour_rate", t("ui_mrp.labour_rate"))}
              {numField(s, "overhead_rate", t("ui_mrp.overhead_rate"))}
            </Box>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mt: 1 }}>
              <Typography sx={{ color: C.sub, fontSize: 12 }}>
                {t("ui_mrp.stage_per_batch", { time: fmtMinutes(t, minutes), cost: fmt(cost) })}
              </Typography>
              {used.length > 0 && (
                <Typography sx={{ color: C.sub, fontSize: 12 }}>
                  · {t("ui_mrp.consumes")}: {used.map((l) => matName(l)).join("، ")}
                </Typography>
              )}
              <Button size="small" sx={{ textTransform: "none", marginInlineStart: "auto" }}
                onClick={() => setOpen((o) => ({ ...o, [s.key]: !expanded }))} aria-expanded={expanded}>
                {expanded ? t("ui_mrp.less") : t("ui_mrp.instructions_qc")}
              </Button>
            </Box>
            <Collapse in={expanded} unmountOnExit>
              <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr" }, mt: 1 }}>
                <TextField size="small" multiline minRows={2} label={t("ui_mrp.instructions")} value={s.instructions} sx={S.field}
                  onChange={(e) => set(s.key, { instructions: e.target.value })} />
                <TextField size="small" multiline minRows={2} label={t("ui_mrp.quality_check")} value={s.quality_check} sx={S.field}
                  onChange={(e) => set(s.key, { quality_check: e.target.value })} />
              </Box>
            </Collapse>
          </Box>
        );
      })}
    </Box>
  );
}
