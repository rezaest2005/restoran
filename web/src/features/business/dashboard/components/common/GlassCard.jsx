import { Box } from "@mui/material";

export default function GlassCard({ children, C, delay = 0, sx = {} }) {
  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: C?.glass || "color-mix(in srgb, var(--ink) 65%, transparent)",
        border: `1px solid ${C?.glassBorder || "color-mix(in srgb, var(--success) 12%, transparent)"}`,
        borderRadius: "18px",
        boxShadow: C?.cardShadow || "0 8px 60px color-mix(in srgb, var(--ink) 50%, transparent)",
        overflow: "hidden",
        transition: "all 0.3s cubic-bezier(.4,0,.2,1)",
        "&:hover": {
          boxShadow: "0 16px 80px color-mix(in srgb, var(--ink) 20%, transparent)",
          transform: "translateY(-2px)",
        },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}