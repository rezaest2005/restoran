import { Box } from "@mui/material";

export default function Grid4({ children, gap = 2 }) {
  return (
    <Box sx={{
      display: "grid",
      gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" },
      gap,
    }}>
      {children}
    </Box>
  );
}