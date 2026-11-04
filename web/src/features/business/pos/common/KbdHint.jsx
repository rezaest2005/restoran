import { Box } from "@mui/material";

/** Small keyboard-shortcut badge for buttons (hidden on touch-size screens). */
export default function KbdHint({ children, sx }) {
  return (
    <Box
      component="kbd"
      dir="ltr"
      aria-hidden="true"
      sx={{
        ms: 1, px: 0.6, borderRadius: "4px", fontSize: 10, lineHeight: 1.6,
        fontFamily: "monospace", fontWeight: 600, opacity: 0.75,
        border: "1px solid currentColor", whiteSpace: "nowrap",
        display: { xs: "none", md: "inline-block" },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}
