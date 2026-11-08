// src/features/business/dashboard/components/common/StatCard.jsx
import { Box, Typography } from "@mui/material";

export default function StatCard({ icon, color, value, label, change, subValue, delay = 0, C }) {
  return (
    <Box
      sx={{
        width: "100%",
        p: { xs: 2.5, md: 3 },
        borderRadius: "20px",
        background: C?.glass || "color-mix(in srgb, var(--ink) 65%, transparent)",
        border: `1px solid ${C?.glassBorder || "color-mix(in srgb, var(--success) 12%, transparent)"}`,
        boxShadow: C?.cardShadow || "0 8px 60px color-mix(in srgb, var(--ink) 50%, transparent)",
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        transition: "all 0.3s cubic-bezier(.4,0,.2,1)",
        "&:hover": {
          transform: "translateY(-4px)",
          boxShadow: "0 20px 80px color-mix(in srgb, var(--ink) 25%, transparent)",
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
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: C?.sub || "var(--ink-muted)" }}>
          {label}
        </Typography>
      </Box>

      {/* مقدار اصلی */}
      <Typography sx={{ fontSize: { xs: 22, md: 26 }, fontWeight: 800, color: C?.text || "var(--ink-muted)" }}>
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
              bgcolor: change >= 0 ? "color-mix(in srgb, var(--success) 12%, transparent)" : "color-mix(in srgb, var(--danger) 12%, transparent)",
            }}
          >
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: change >= 0 ? "var(--success)" : "var(--danger)" }}>
              {change >= 0 ? "▲" : "▼"} {Math.abs(change)}%
            </Typography>
          </Box>
        )}
        {subValue && (
          <Typography sx={{ fontSize: 11.5, color: C?.muted || "var(--ink)" }}>
            {subValue}
          </Typography>
        )}
      </Box>
    </Box>
  );
}