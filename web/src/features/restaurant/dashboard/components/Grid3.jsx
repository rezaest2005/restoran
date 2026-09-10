import { Box } from "@mui/material";

export default function Grid3({ children, gap = 2.5 }) {
  return (
    <Box sx={{
      display: "grid",
      gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(3, 1fr)" },
      gap,
    }}>
      {children}
    </Box>
  );
}