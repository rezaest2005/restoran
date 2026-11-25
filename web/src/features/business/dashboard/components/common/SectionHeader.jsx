import { Typography } from "@mui/material";

export default function SectionHeader({ title, C, delay = 0 }) {
  return (
    <Typography component="h2" sx={{
      fontSize: { xs: 17, md: 20 }, fontWeight: 800, color: C.text,
      mb: 2, mt: 2, width: "100%", animation: `fadeUp 0.5s ease ${delay}s both`,
    }}>
      {title}
    </Typography>
  );
}
