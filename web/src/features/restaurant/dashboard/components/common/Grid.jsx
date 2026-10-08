// components/common/Grid.jsx
import React from "react";
import { Box } from "@mui/material";

export default function Grid2({ ratio = "1fr 1fr", children }) {
  return (
    <Box sx={{
      display: "grid",
      gridTemplateColumns: { xs: "1fr", md: ratio },
      gap: { xs: 2, md: 3 },
      mb: 3,
    }}>
      {children}
    </Box>
  );
}