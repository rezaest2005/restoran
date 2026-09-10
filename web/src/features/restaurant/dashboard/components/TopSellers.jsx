import { Box, Typography, Chip } from "@mui/material";
import GlassCard from "./GlassCard";

export default function TopSellers({ topItems, L, C, isRtl, isDark, fmtN }) {
  return (
    <GlassCard C={C} delay={0.65}>
      <Box sx={{ p: { xs: 2, md: 3 }, flex: 1, display: "flex", flexDirection: "column" }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text }}>
            🏆 {L.topSellers}
          </Typography>
          <Chip size="small" label={`${fmtN(topItems.length)} ${L.items}`}
            sx={{ bgcolor: C.oliveSubtle, color: C.olive, fontSize: 10, fontWeight: 600 }} />
        </Box>
        <Box sx={{
          display: "flex", alignItems: "center", px: 1.5, pb: 1,
          borderBottom: `1px solid ${C.glassBorder}`, mb: 0.5,
        }}>
          <Typography sx={{ width: 32, fontSize: 10, fontWeight: 700, color: C.muted }}>#</Typography>
          <Typography sx={{ flex: 1, fontSize: 10, fontWeight: 700, color: C.muted }}>{L.item}</Typography>
          <Typography sx={{ width: 60, fontSize: 10, fontWeight: 700, color: C.muted, textAlign: "center" }}>{L.qty}</Typography>
          <Typography sx={{ width: 95, fontSize: 10, fontWeight: 700, color: C.muted, textAlign: isRtl ? "left" : "right" }}>{L.revenue}</Typography>
          <Typography sx={{ width: 50, fontSize: 10, fontWeight: 700, color: C.muted, textAlign: "center" }}>%</Typography>
        </Box>
        <Box sx={{ flex: 1, overflowY: "auto" }}>
          {topItems.map((item, i) => (
            <Box key={item.id} sx={{
              display: "flex", alignItems: "center", px: 1.5, py: 1.2,
              borderRadius: "10px", transition: "all 0.2s ease",
              opacity: 0, animation: `fadeUp 0.4s ease-out ${0.7 + i * 0.04}s forwards`,
              "&:hover": { bgcolor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" },
            }}>
              <Box sx={{
                width: 26, height: 26, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, flexShrink: 0,
                bgcolor: i === 0 ? "#D4B76A" : i === 1 ? "#8A8588" : i === 2 ? "#A84060" : C.muted + "33",
                color: i < 3 ? "#fff" : C.sub,
              }}>{fmtN(i + 1)}</Box>
              <Typography sx={{
                flex: 1, fontSize: 12.5, fontWeight: 600, color: C.text,
                mx: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {isRtl ? item.name : item.nameEn}
              </Typography>
              <Typography sx={{ width: 60, fontSize: 12, color: C.sub, textAlign: "center" }}>{fmtN(item.qty)}</Typography>
              <Typography sx={{ width: 95, fontSize: 12, fontWeight: 700, color: C.olive, textAlign: isRtl ? "left" : "right" }}>{fmtN(item.total)}</Typography>
              <Box sx={{ width: 50, textAlign: "center" }}>
                <Chip size="small" label={`${item.pct}%`}
                  sx={{ height: 20, fontSize: 9, fontWeight: 700, borderRadius: "5px", bgcolor: `${C.olive}15`, color: C.olive }} />
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </GlassCard>
  );
}