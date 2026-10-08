import { Box } from "@mui/material";

export default function GlassCard({ children, C, delay = 0, sx = {} }) {
  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: C?.glass || "rgba(16,18,16,0.65)",
        border: `1px solid ${C?.glassBorder || "rgba(107,155,110,0.12)"}`,
        borderRadius: "18px",
        boxShadow: C?.cardShadow || "0 8px 60px rgba(0,0,0,0.5)",
        overflow: "hidden",
        transition: "all 0.3s cubic-bezier(.4,0,.2,1)",
        "&:hover": {
          boxShadow: "0 16px 80px rgba(0,0,0,0.2)",
          transform: "translateY(-2px)",
        },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}