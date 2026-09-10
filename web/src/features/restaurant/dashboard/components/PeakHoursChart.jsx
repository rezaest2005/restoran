import { Box, Typography } from "@mui/material";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, ResponsiveContainer,
} from "recharts";
import GlassCard from "./GlassCard";

export default function PeakHoursChart({
  hourlyData, L, C, isDark, chartGridStroke, tooltipStyle,
}) {
  return (
    <GlassCard C={C} delay={0.5}>
      <Box sx={{ p: { xs: 2, md: 3 }, flex: 1, display: "flex", flexDirection: "column" }}>
        <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text, mb: 2.5 }}>
          {L.peakHours}
        </Typography>
        <Box sx={{ flex: 1, minHeight: 300, width: "100%" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
              <XAxis dataKey="displayName" stroke={C.muted} tick={{ fontSize: 10 }} />
              <YAxis stroke={C.muted} tick={{ fontSize: 10 }} />
              <RTooltip contentStyle={tooltipStyle}
                formatter={(v) => [`${v} ${L.ordersWord}`, L.orders]}
              />
              <defs>
                <linearGradient id="hourGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isDark ? "#6B9B6E" : "#2E4D30"} stopOpacity={0.9} />
                  <stop offset="100%" stopColor={isDark ? "#6B9B6E" : "#2E4D30"} stopOpacity={0.3} />
                </linearGradient>
              </defs>
              <Bar dataKey="orders" fill="url(#hourGrad)" radius={[5, 5, 0, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </Box>
    </GlassCard>
  );
}