import { Box, Typography, Chip } from "@mui/material";
import GlassCard from "./GlassCard";

export default function LeastSellers({ lowItems, L, C, isRtl, isDark, fmtN }) {
  return (
    <GlassCard C={C} delay={0.7}>
      <Box sx={{ p: { xs: 2, md: 3 }, flex: 1, display: "flex", flexDirection: "column" }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text }}>
            📉 {L.leastSellers}
          </Typography>
          <Chip size="small" label={L.review}
            sx={{ bgcolor: C.dangerBg, color: C.danger, fontSize: 10, fontWeight: 600 }} />
        </Box>
        <Box sx={{ flex: 1 }}>
          {lowItems.map((item, i) => (
            <Box key={item.id} sx={{
              display: "flex", alignItems: "center", gap: 1.5,
              p: 1.5, borderRadius: "10px", mb: 0.5, transition: "all 0.2s ease",
              opacity: 0, animation: `fadeUp 0.4s ease-out ${0.75 + i * 0.04}s forwards`,
              "&:hover": { bgcolor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" },
            }}>
              <Box sx={{
                width: 28, height: 28, borderRadius: "8px",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, bgcolor: C.dangerBg, color: C.danger,
                fontWeight: 700, flexShrink: 0,
              }}>{fmtN(i + 1)}</Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{
                  fontSize: 12.5, fontWeight: 600, color: C.text,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {isRtl ? item.name : item.nameEn}
                </Typography>
                <Typography sx={{ fontSize: 10, color: C.muted }}>{fmtN(item.qty)} {L.sold}</Typography>
              </Box>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.sub }}>{fmtN(item.total)}</Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </GlassCard>
  );
}