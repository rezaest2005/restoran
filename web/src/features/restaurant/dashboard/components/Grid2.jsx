import { Box } from "@mui/material";

export default function Grid2({ children, ratio = "7fr 5fr", gap = 2.5 }) {
  return (
    <Box sx={{
      display: "grid",
      gridTemplateColumns: { xs: "1fr", md: ratio },
      gap,
    }}>
      {children}
    </Box>
  );
}