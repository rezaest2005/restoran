import { Box, Typography } from "@mui/material";

export default function SectionHeader({ icon, title, subtitle, C, isRtl, delay = 0 }) {
  return (
    <Box sx={{ mb: 3, mt: 2, width: "100%", animation: `fadeUp 0.5s ease ${delay}s both` }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <Typography sx={{ fontSize: 24 }}>{icon}</Typography>
        <Typography sx={{ 
          fontSize: { xs: 20, md: 24 }, 
          fontWeight: 800, 
          color: C.text 
        }}>
          {title}
        </Typography>
      </Box>
      {subtitle && (
        <Typography sx={{ 
          fontSize: 14, 
          color: C.sub, 
          mt: 0.5, 
          ml: isRtl ? 5 : 0,
          mr: isRtl ? 0 : 5
        }}>
          {subtitle}
        </Typography>
      )}
    </Box>
  );
}