import { Box } from "@mui/material";

export default function GlassCard({ children, C, delay = 0, sx = {} }) {
  return (
    <Box sx={{
      bgcolor: C.glass, backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)",
      border: `1px solid ${C.glassBorder}`, borderRadius: "20px",
      boxShadow: C.cardShadow, position: "relative", overflow: "hidden",
      display: "flex", flexDirection: "column",
      opacity: 0, animation: `fadeUp 0.55s ease-out ${delay}s forwards`,
      transition: "all 0.3s cubic-bezier(.4,0,.2,1)",
      "&:hover": { transform: "translateY(-2px)", boxShadow: C.cardShadowHover },
      "&::before": {
        content: '""', position: "absolute", top: 0, left: 0, right: 0, height: 1,
        background: C.glassShimmer, backgroundSize: "200% 100%",
        animation: "shimmer 12s linear infinite", pointerEvents: "none",
      },
      ...sx,
    }}>
      {children}
    </Box>
  );
}