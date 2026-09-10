import { Box, Typography } from "@mui/material";

export default function SectionHeader({ icon, title, subtitle, C, isRtl, first, delay = 0 }) {
  return (
    <Box sx={{
      display: "flex", alignItems: "center", gap: 1.5,
      mb: 3,
      mt: first ? 2 : { xs: 5, md: 7 },
      opacity: 0,
      animation: `fadeUp 0.5s ease-out ${delay}s forwards`,
    }}>
      <Box sx={{
        width: 44, height: 44, borderRadius: "13px", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 20,
        background: `linear-gradient(135deg, ${C.olive}1A, ${C.olive}0A)`,
        border: `1px solid ${C.olive}25`,
        boxShadow: `0 4px 16px ${C.olive}12`,
        animation: "float 6s ease-in-out infinite",
      }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{
          fontSize: { xs: 15, md: 18 }, fontWeight: 800, color: C.text,
          fontFamily: "'Plus Jakarta Sans', 'Vazirmatn', sans-serif",
          lineHeight: 1.25,
        }}>
          {title}
        </Typography>
        <Typography sx={{ fontSize: 11.5, color: C.sub, mt: 0.2, lineHeight: 1.4 }}>
          {subtitle}
        </Typography>
      </Box>
      <Box sx={{
        flex: 1, height: 1, minWidth: 40, ml: 1,
        background: `linear-gradient(${isRtl ? "to left" : "to right"}, ${C.glassBorder}, transparent)`,
        borderRadius: 1,
        transformOrigin: isRtl ? "right" : "left",
        animation: `lineGrow 0.8s ease-out ${delay + 0.15}s both`,
      }} />
    </Box>
  );
}