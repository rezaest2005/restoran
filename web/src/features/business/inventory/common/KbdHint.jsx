import { Box } from "@mui/material";

/** Small keyboard-key badge shown on primary buttons (hidden on narrow screens). */
export default function KbdHint({ children, sx }) {
  return (
    <Box
      component="kbd"
      sx={{
        display: { xs: "none", md: "inline-block" },
        marginInlineStart: 1, px: 0.6, py: 0.05,
        fontSize: 10, fontWeight: 600, fontFamily: "inherit", lineHeight: 1.5,
        opacity: 0.7, border: "1px solid currentColor", borderRadius: "6px",
        whiteSpace: "nowrap", direction: "ltr",
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}
