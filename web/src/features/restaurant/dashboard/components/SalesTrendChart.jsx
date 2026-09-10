import { Box, Typography } from "@mui/material";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Legend, ResponsiveContainer,
} from "recharts";
import GlassCard from "./GlassCard";

export default function SalesTrendChart({
  chartView, setChartView, chartData, L, C, isDark, isRtl,
  chartGridStroke, tooltipStyle,
}) {
  return (
    <GlassCard C={C} delay={0.35}>
      <Box sx={{ p: { xs: 2, md: 3 }, flex: 1, display: "flex", flexDirection: "column" }}>
        <Box sx={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          mb: 2.5, flexWrap: "wrap", gap: 1,
        }}>
          <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text }}>
            {L.salesTrend}
          </Typography>
          <Box sx={{
            display: "flex", gap: 0.5, bgcolor: C.oliveSubtle,
            borderRadius: "10px", p: 0.5,
          }}>
            {[["week", L.week], ["month", L.month]].map(([v, lbl]) => (
              <Box key={v} component="button" onClick={() => setChartView(v)} sx={{
                px: 2, py: 0.6, borderRadius: "8px",
                fontSize: 11, fontWeight: 700, cursor: "pointer",
                border: "none", outline: "none", transition: "all 0.25s ease",
                background: chartView === v ? C.olive : "transparent",
                color: chartView === v ? "#fff" : C.sub,
                boxShadow: chartView === v ? `0 2px 8px ${C.olive}40` : "none",
                fontFamily: "inherit",
              }}>
                {lbl}
              </Box>
            ))}
          </Box>
        </Box>
        <Box sx={{ flex: 1, minHeight: 320, width: "100%" }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
              <XAxis dataKey="displayName" stroke={C.muted} tick={{ fontSize: 11, fontFamily: "Vazirmatn" }} />
              <YAxis stroke={C.muted} tick={{ fontSize: 10 }}
                tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}
              />
              <RTooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontFamily: "Vazirmatn", fontSize: 12 }} />
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff6b35" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#ff6b35" stopOpacity={0.35} />
                </linearGradient>
              </defs>
              <Bar dataKey="sales" name={L.sales} fill="url(#salesGrad)"
                radius={[6, 6, 0, 0]} barSize={chartView === "week" ? 30 : 52} />
              <Line type="monotone" dataKey="orders" name={L.orders}
                stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: "#3b82f6" }} />
            </ComposedChart>
          </ResponsiveContainer>
        </Box>
      </Box>
    </GlassCard>
  );
}