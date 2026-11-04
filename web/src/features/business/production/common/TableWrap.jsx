import { Box } from "@mui/material";

export default function TableWrap({ C, children }) {
  return (
    <Box sx={{ overflowX: "auto", width: "100%", border: `1px solid ${C.divider}`, borderRadius: 2 }}>
      {children}
    </Box>
  );
}
