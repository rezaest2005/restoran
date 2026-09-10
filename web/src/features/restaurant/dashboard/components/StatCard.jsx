import { Box, Typography } from "@mui/material";
import ChangeChip from "./ChangeChip";

export default function StatCard({ icon, color, value, label, subValue, change, delay, C }) {
  return (
    <Box sx={{
      bgcolor: C.glass, backdropFilter: "blur(28px)",
      border: `1px solid ${C.glassBorder}`, borderRadius: "18px",
      boxShadow: C.cardShadow, p: 2.5,
      position: "relative", overflow: "hidden",
      opacity: 0, animation: `fadeUp 0.5s ease-out ${delay}s forwards`,
      transition: "all 0.3s cubic-bezier(.4,0,.2,1)",
      "&:hover": {
        transform: "translateY(-4px)",
        boxShadow: `0 12px 40px ${color}18, ${C.cardShadow}`,
      },
    }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 1.5 }}>
        <Box sx={{
          width: 46, height: 46, borderRadius: "14px",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, background: `${color}18`, border: `1px solid ${color}28`,
          animation: "float 5s ease-in-out infinite",
        }}>
          {icon}
        </Box>
        {change !== undefined && <ChangeChip value={change} />}
      </Box>
      <Typography sx={{
        fontSize: { xs: 19, md: 24 }, fontWeight: 900, color: C.text, lineHeight: 1.1,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        {value}
      </Typography>
      <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: C.sub, mt: 0.6 }}>
        {label}
      </Typography>
      {subValue && (
        <Typography sx={{ fontSize: 10, color: C.muted, mt: 0.3 }}>{subValue}</Typography>
      )}
    </Box>
  );
}