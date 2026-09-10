import { Box, Typography, LinearProgress } from "@mui/material";
import GlassCard from "./GlassCard";

export default function OrderStatus({ orderStatus, totalOrders, L, C, isRtl, isDark, fmtN }) {
  return (
    <GlassCard C={C} delay={0.8}>
      <Box sx={{ p: { xs: 2, md: 3 }, flex: 1, display: "flex", flexDirection: "column" }}>
        <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text, mb: 2.5 }}>
          📊 {L.orderStatus}
        </Typography>
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {orderStatus.map((st, i) => {
            const pct = totalOrders > 0 ? ((st.count / totalOrders) * 100).toFixed(0) : 0;
            return (
              <Box key={i} sx={{ mb: i < orderStatus.length - 1 ? 2 : 0 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.6 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.8 }}>
                    <Typography sx={{ fontSize: 14 }}>{st.icon}</Typography>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>
                      {isRtl ? st.label : st.labelEn}
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 800, color: st.color }}>{fmtN(st.count)}</Typography>
                    <Typography sx={{ fontSize: 10, color: C.muted }}>({pct}%)</Typography>
                  </Box>
                </Box>
                <LinearProgress variant="determinate" value={parseFloat(pct)} sx={{
                  height: 7, borderRadius: 4,
                  bgcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                  "& .MuiLinearProgress-bar": { bgcolor: st.color, borderRadius: 4 },
                }} />
              </Box>
            );
          })}
        </Box>
      </Box>
    </GlassCard>
  );
}