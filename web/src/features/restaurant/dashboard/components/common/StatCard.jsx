// src/features/restaurant/dashboard/components/common/StatCard.jsx
import { Box, Typography } from "@mui/material";

export default function StatCard({ icon, color, value, label, change, subValue, delay = 0, C }) {
  return (
    <Box
      sx={{
        width: "100%",
        p: { xs: 2.5, md: 3 },
        borderRadius: "20px",
        background: C?.glass || "rgba(16,18,16,0.65)",
        border: `1px solid ${C?.glassBorder || "rgba(107,155,110,0.12)"}`,
        boxShadow: C?.cardShadow || "0 8px 60px rgba(0,0,0,0.5)",
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        transition: "all 0.3s cubic-bezier(.4,0,.2,1)",
        "&:hover": {
          transform: "translateY(-4px)",
          boxShadow: "0 20px 80px rgba(0,0,0,0.25)",
        },
      }}
    >
      {/* آیکون + برچسب */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Box
          sx={{
            width: 50,
            height: 50,
            borderRadius: "14px",
            background: `linear-gradient(135deg, ${color}33, ${color}11)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 26,
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: C?.sub || "#8A8588" }}>
          {label}
        </Typography>
      </Box>

      {/* مقدار اصلی */}
      <Typography sx={{ fontSize: { xs: 22, md: 26 }, fontWeight: 800, color: C?.text || "#F0ECE8" }}>
        {value}
      </Typography>

      {/* تغییرات */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
        {change != null && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              px: 1.2,
              py: 0.3,
              borderRadius: "8px",
              bgcolor: change >= 0 ? "rgba(76,175,80,0.12)" : "rgba(244,67,54,0.12)",
            }}
          >
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: change >= 0 ? "#4caf50" : "#f44336" }}>
              {change >= 0 ? "▲" : "▼"} {Math.abs(change)}%
            </Typography>
          </Box>
        )}
        {subValue && (
          <Typography sx={{ fontSize: 11.5, color: C?.muted || "#4A4548" }}>
            {subValue}
          </Typography>
        )}
      </Box>
    </Box>
  );
}