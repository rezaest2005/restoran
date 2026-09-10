import { Box, Typography } from "@mui/material";
import {
  PieChart, Pie, Cell, Tooltip as RTooltip, Legend, ResponsiveContainer,
} from "recharts";
import GlassCard from "./GlassCard";

export default function CategoryPieChart({ categories, L, C, isRtl, tooltipStyle }) {
    const displayCategories = categories.map(cat => ({
    ...cat,
    displayName: isRtl ? cat.name : cat.nameEn,
  }));
  return (
    <GlassCard C={C} delay={0.4}>
      <Box sx={{ p: { xs: 2, md: 3 }, flex: 1, display: "flex", flexDirection: "column" }}>
        <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text, mb: 2 }}>
          {L.salesByCategory}
        </Typography>
        <Box sx={{ flex: 1, minHeight: 250, display: "flex", justifyContent: "center" }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={displayCategories} cx="50%" cy="50%"
  innerRadius={52} outerRadius={78} paddingAngle={4}
  dataKey="value" nameKey="displayName" stroke="none">
  {displayCategories.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <RTooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontFamily: "Vazirmatn", fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </Box>
        <Box sx={{ mt: 1.5, display: "flex", flexDirection: "column", gap: 0.8 }}>
          {displayCategories.map((cat, i) => {
            const total = displayCategories.reduce((s, c) => s + c.value, 0);
            const pct = total > 0 ? ((cat.value / total) * 100).toFixed(0) : 0;
            return (
              <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: cat.color, flexShrink: 0 }} />
                <Typography sx={{ fontSize: 11.5, color: C.sub, flex: 1 }}>
                  {cat.displayName}
                </Typography>
                <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: C.text }}>{pct}%</Typography>
              </Box>
            );
          })}
        </Box>
      </Box>
    </GlassCard>
  );
}