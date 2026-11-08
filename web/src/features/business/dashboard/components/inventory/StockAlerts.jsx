import { Box, Typography, Chip } from "@mui/material";
import GlassCard from "./GlassCard";

export default function StockAlerts({ stockAlerts, L, C, isRtl, isDark, fmtN }) {
  return (
    <GlassCard C={C} delay={0.9}>
      <Box sx={{ p: { xs: 2, md: 3 }, flex: 1, display: "flex", flexDirection: "column" }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2.5 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text }}>
            📦 {L.stockAlerts}
          </Typography>
          <Chip size="small" label={`${fmtN(stockAlerts.length)} ${L.low}`}
            sx={{ bgcolor: C.dangerBg, color: C.danger, fontSize: 10, fontWeight: 700 }} />
        </Box>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.2, flex: 1 }}>
          {stockAlerts.map((item, i) => {
            const pct = item.min > 0 ? Math.min((item.current / item.min) * 100, 100) : 0;
            const critical = pct < 30;
            return (
              <Box key={i} sx={{
                p: 1.3, borderRadius: "12px",
                border: `1px solid ${critical ? "color-mix(in srgb, var(--danger) 22%, transparent)" : C.glassBorder}`,
                bgcolor: critical ? "color-mix(in srgb, var(--danger) 5%, transparent)" : "transparent",
                transition: "all 0.2s ease",
              }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.6 }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>
                    {isRtl ? item.name : item.nameEn}
                  </Typography>
                  <Typography sx={{ fontSize: 11, fontWeight: 700, color: critical ? C.danger : "var(--warning)" }}>
                    {fmtN(item.current)} {isRtl ? item.unit : item.unitEn}
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Box sx={{
                    flex: 1, height: 5, borderRadius: 3,
                    bgcolor: isDark ? "var(--surface-sunken)" : "color-mix(in srgb, var(--ink) 5%, transparent)",
                    overflow: "hidden",
                  }}>
                    <Box sx={{
                      width: `${pct}%`, height: "100%", borderRadius: 3,
                      bgcolor: critical ? C.danger : "var(--warning)",
                      transition: "width 0.8s ease",
                    }} />
                  </Box>
                  <Typography sx={{ fontSize: 9, color: C.muted, whiteSpace: "nowrap" }}>
                    {L.minLabel}: {fmtN(item.min)}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>
    </GlassCard>
  );
}
