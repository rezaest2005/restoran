import { Box, Typography } from "@mui/material";
import GlassCard from "./GlassCard";

export default function LatestActivity({ activities, C, isRtl }) {
  return (
    <GlassCard C={C} delay={0.85}>
      <Box sx={{ p: { xs: 2, md: 3 }, flex: 1, display: "flex", flexDirection: "column" }}>
        <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text, mb: 2.5 }}>
          ⚡ {isRtl ? "آخرین فعالیت‌ها" : "Latest Activity"}
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.8, flex: 1 }}>
          {activities.map((act, i) => (
            <Box key={i} sx={{ display: "flex", alignItems: "flex-start", gap: 1.2 }}>
              <Box sx={{
                width: 9, height: 9, borderRadius: "50%", flexShrink: 0, mt: 0.5,
                bgcolor: act.dot === "green" ? "#10b981" : act.dot === "blue" ? "#3b82f6" : "#ff6b35",
                boxShadow: `0 0 10px ${act.dot === "green" ? "#10b981" : act.dot === "blue" ? "#3b82f6" : "#ff6b35"}55`,
                animation: "pulse 2s ease-in-out infinite",
              }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 12.5, color: C.text, lineHeight: 1.55 }}>
                  {isRtl ? act.text : act.textEn}
                </Typography>
                <Typography sx={{ fontSize: 10, color: C.muted, mt: 0.2 }}>
                  {isRtl ? act.time : act.timeEn}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </GlassCard>
  );
}