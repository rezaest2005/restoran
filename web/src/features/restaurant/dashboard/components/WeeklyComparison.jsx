import { Box, Typography, Chip } from "@mui/material";
import GlassCard from "./GlassCard";
import ChangeChip from "./ChangeChip";

export default function WeeklyComparison({ weeklyCompare, L, C, isRtl, isDark, fmtN }) {
  return (
    <GlassCard C={C} delay={0.55}>
      <Box sx={{ p: { xs: 2, md: 3 }, flex: 1, display: "flex", flexDirection: "column" }}>
        <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text, mb: 2.5 }}>
          {L.weeklyComparison}
        </Typography>
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {[
            { label: L.totalSales, thisW: weeklyCompare.thisWeek.sales, lastW: weeklyCompare.lastWeek.sales, suffix: ` ${L.tuman}` },
            { label: L.totalOrders, thisW: weeklyCompare.thisWeek.orders, lastW: weeklyCompare.lastWeek.orders, suffix: "" },
            { label: L.avgOrder, thisW: weeklyCompare.thisWeek.avg, lastW: weeklyCompare.lastWeek.avg, suffix: ` ${L.tuman}` },
          ].map((row, i) => {
            const pct = row.lastW > 0 ? ((row.thisW - row.lastW) / row.lastW * 100) : 0;
            const barPct = row.thisW > 0 ? Math.min((row.thisW / (row.thisW + row.lastW)) * 100, 100) : 50;
            return (
              <Box key={i} sx={{ mb: i < 2 ? 2.5 : 0 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.8 }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: C.sub }}>{row.label}</Typography>
                  <ChangeChip value={parseFloat(pct.toFixed(1))} />
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.2 }}>
                  <Box sx={{
                    flex: 1, height: 10, borderRadius: 5,
                    bgcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                    overflow: "hidden",
                  }}>
                    <Box sx={{
                      width: `${barPct}%`, height: "100%", borderRadius: 5,
                      background: `linear-gradient(90deg, ${C.olive}, ${C.olive}CC)`,
                      transition: "width 1.2s cubic-bezier(.4,0,.2,1)",
                    }} />
                  </Box>
                  <Typography sx={{
                    fontSize: 11.5, fontWeight: 700, color: C.text,
                    minWidth: 75, textAlign: isRtl ? "left" : "right",
                  }}>
                    {fmtN(row.thisW)}{row.suffix}
                  </Typography>
                </Box>
                <Typography sx={{
                  fontSize: 10, color: C.muted, mt: 0.4,
                  textAlign: isRtl ? "right" : "left",
                }}>
                  {L.lastWeek}: {fmtN(row.lastW)}{row.suffix}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>
    </GlassCard>
  );
}