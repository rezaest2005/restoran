import { useTranslation } from "react-i18next";
import { Box, Chip, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { PERIODS, subStatus } from "@super/common/money";

/**
 * «اشتراک» section of the customer form: pick one of the four periods (nothing is typed by hand).
 * For an existing customer it shows the current state and lets the admin start from now or extend.
 */
export default function SubscriptionSection({ current, isNew, period, setPeriod, mode, setMode, C }) {
  const { t, i18n } = useTranslation();
  const fa = i18n.language !== "en";
  const status = subStatus(current, t, fa);
  const ends = current && !current.unlimited && current.ends_at
    ? new Date(current.ends_at).toLocaleString(fa ? "fa-IR" : "en-GB", { dateStyle: "medium", timeStyle: "short" })
    : "";
  const canExtend = !!current && !current.unlimited;

  return (
    <Box data-testid="sub-section" sx={{ bgcolor: C.oliveSubtle, borderRadius: "12px", p: 1.5, minWidth: 0 }}>
      <Typography sx={{ fontSize: 13, fontWeight: 800, color: C.olive, mb: 1 }}>{t("ui_c.super.sub.title")}</Typography>
      {!isNew && (
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mb: 1.25 }}>
          <Typography sx={{ fontSize: 12.5, color: C.sub }}>{t("ui_c.super.sub.current")}:</Typography>
          <Chip size="small" color={status.color} label={status.label} data-testid="sub-current" />
          {ends && <Typography sx={{ fontSize: 12.5, color: C.sub }}>{t("ui_c.super.sub.ends")}: {ends}</Typography>}
        </Box>
      )}
      <Typography sx={{ fontSize: 12.5, color: C.sub, mb: 0.75 }}>{t("ui_c.super.sub.pick")}</Typography>
      <ToggleButtonGroup
        exclusive fullWidth value={period} onChange={(_, v) => setPeriod(v)} aria-label={t("ui_c.super.sub.title")}
        sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" }, gap: 0.75, "& .MuiToggleButton-root": { borderRadius: "10px !important", border: `1px solid ${C.glassBorder} !important`, minHeight: 44, fontWeight: 700, textTransform: "none", color: C.text } }}
      >
        {PERIODS.map((p) => (
          <ToggleButton key={p} value={p} data-testid={`period-${p}`}>{t(`ui_c.super.sub.${p}`)}</ToggleButton>
        ))}
      </ToggleButtonGroup>
      {period && canExtend && (
        <>
          <ToggleButtonGroup
            exclusive size="small" value={mode} onChange={(_, v) => v && setMode(v)} sx={{ mt: 1.25, flexWrap: "wrap", "& .MuiToggleButton-root": { minHeight: 40, textTransform: "none", fontWeight: 700, color: C.text } }}
          >
            <ToggleButton value="set" data-testid="mode-set">{t("ui_c.super.sub.mode_set")}</ToggleButton>
            <ToggleButton value="extend" data-testid="mode-extend">{t("ui_c.super.sub.mode_extend")}</ToggleButton>
          </ToggleButtonGroup>
          <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.5 }}>
            {t(mode === "extend" ? "ui_c.super.sub.mode_extend_hint" : "ui_c.super.sub.mode_set_hint")}
          </Typography>
        </>
      )}
      <Typography sx={{ fontSize: 12, color: C.sub, mt: 1 }}>
        {period ? "" : t(isNew ? "ui_c.super.sub.new_hint" : "ui_c.super.sub.none_chosen")}
      </Typography>
    </Box>
  );
}
