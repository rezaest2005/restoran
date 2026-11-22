import { useTranslation } from "react-i18next";
import { Box, Chip, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import AllInclusive from "@mui/icons-material/AllInclusive";
import { PERIODS, subStatus } from "@super/common/money";

/**
 * «اشتراک» section of the customer form: a prominent «دائمی» (permanent) button above the four periods
 * (nothing is typed by hand). `period` is null (leave as is), "unlimited" or one of the four periods.
 * For an existing customer it shows the current state and lets the admin start from now or extend a period.
 */
export default function SubscriptionSection({ current, isNew, period, setPeriod, mode, setMode, C }) {
  const { t, i18n } = useTranslation();
  const fa = i18n.language !== "en";
  const status = subStatus(current, t, fa);
  const ends = current && !current.unlimited && current.ends_at
    ? new Date(current.ends_at).toLocaleString(fa ? "fa-IR" : "en-GB", { dateStyle: "medium", timeStyle: "short" })
    : "";
  const canExtend = !!current && !current.unlimited;
  // permanent looks selected when picked, or when it is what the customer already has / what a new account gets
  const permanent = period === "unlimited" || (!period && (isNew || !!current?.unlimited));
  const picked = period === "unlimited" ? null : period;

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
      <ToggleButton
        value="unlimited" selected={permanent} fullWidth data-testid="period-unlimited" aria-pressed={permanent}
        onChange={() => setPeriod(period === "unlimited" ? null : "unlimited")}
        sx={{
          mb: 1, minHeight: 52, gap: 1, borderRadius: "12px", fontWeight: 800, fontSize: 15, textTransform: "none", color: C.text,
          border: `1px solid ${C.glassBorder}`,
          "&.Mui-selected": { bgcolor: C.olive, color: "var(--on-primary)", "&:hover": { bgcolor: C.olive } },
        }}
      >
        <AllInclusive fontSize="small" />
        {t("ui_c.super.sub.unlimited")}
        <Typography component="span" sx={{ fontSize: 11.5, fontWeight: 500, opacity: 0.85, display: { xs: "none", sm: "inline" } }}>
          — {t("ui_c.super.sub.permanent_hint")}
        </Typography>
      </ToggleButton>
      <Typography sx={{ fontSize: 12.5, color: C.sub, mb: 0.75 }}>{t("ui_c.super.sub.pick")}</Typography>
      <ToggleButtonGroup
        exclusive fullWidth value={picked} onChange={(_, v) => setPeriod(v)} aria-label={t("ui_c.super.sub.title")}
        sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" }, gap: 0.75, "& .MuiToggleButton-root": { borderRadius: "10px !important", border: `1px solid ${C.glassBorder} !important`, minHeight: 44, fontWeight: 700, textTransform: "none", color: C.text } }}
      >
        {PERIODS.map((p) => (
          <ToggleButton key={p} value={p} data-testid={`period-${p}`}>{t(`ui_c.super.sub.${p}`)}</ToggleButton>
        ))}
      </ToggleButtonGroup>
      {picked && canExtend && (
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
