import { Box, Grid, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useAppNavigate } from "./links";
import { visibleWidgets } from "./kpiRegistry";

function KpiCard({ widget, data, C, fmt, title, onOpen }) {
  const { t } = useTranslation();
  const Icon = widget.icon;
  let value = "—";
  let sub = "";
  try {
    value = fmt(widget.value(data));
    sub = widget.sub(data, t, fmt);
  } catch {
    /* malformed block: show a dash instead of breaking the page */
  }
  return (
    <Box
      role="link" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      sx={{
        height: "100%", p: { xs: 2, md: 2.5 }, borderRadius: "18px", cursor: "pointer",
        background: C.glass, border: `1px solid ${C.glassBorder}`, boxShadow: C.cardShadow,
        display: "flex", flexDirection: "column", gap: 1, transition: "transform .2s, box-shadow .2s",
        "&:hover": { transform: "translateY(-3px)" },
        "&:focus-visible": { outline: `2px solid ${C.primary}`, outlineOffset: 2 },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
        <Box sx={{
          width: 40, height: 40, borderRadius: "12px", display: "grid", placeItems: "center", flexShrink: 0,
          color: widget.color, background: `color-mix(in srgb, ${widget.color} 14%, transparent)`,
        }}>
          <Icon fontSize="small" />
        </Box>
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.sub }}>{title}</Typography>
      </Box>
      <Typography sx={{ fontSize: { xs: 22, md: 26 }, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>{value}</Typography>
      {sub && <Typography sx={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{sub}</Typography>}
    </Box>
  );
}

export default function KpiWidgets({ summary, C, fmt }) {
  const { t } = useTranslation();
  const go = useAppNavigate();
  const widgets = visibleWidgets(summary);
  const data = summary?.data || {};
  if (!widgets.length) {
    return (
      <Box sx={{ p: 3, mb: 3, borderRadius: 3, border: `1px dashed ${C.glassBorder}`, textAlign: "center" }}>
        <Typography sx={{ color: C.sub, fontSize: 14 }}>{t("ui_dash2.no_modules")}</Typography>
      </Box>
    );
  }
  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      {widgets.map((w) => (
        <Grid key={w.key} size={{ xs: 12, sm: 6, lg: 3 }}>
          <KpiCard widget={w} data={data} C={C} fmt={fmt} title={t(`ui_dash2.w.${w.key}`)} onOpen={() => go(w.path(data))} />
        </Grid>
      ))}
    </Grid>
  );
}
