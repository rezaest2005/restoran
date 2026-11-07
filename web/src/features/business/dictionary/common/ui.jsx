import { Box, Snackbar, Alert } from "@mui/material";

/** Small keyboard-key badge shown on primary buttons (hidden on narrow screens). */
export function KbdHint({ children }) {
  return (
    <Box
      component="kbd"
      sx={{
        display: { xs: "none", md: "inline-block" }, marginInlineStart: 1, px: 0.6,
        fontSize: 10, fontWeight: 600, fontFamily: "inherit", lineHeight: 1.5, opacity: 0.7,
        border: "1px solid currentColor", borderRadius: "6px", whiteSpace: "nowrap", direction: "ltr",
      }}
    >
      {children}
    </Box>
  );
}

export function ToastSnackbar({ toast, onClose, C }) {
  return (
    <Snackbar open={toast.open} autoHideDuration={4000} onClose={onClose}
      anchorOrigin={{ vertical: "top", horizontal: "center" }}>
      <Alert onClose={onClose} severity={toast.type}
        sx={{ bgcolor: C.surface, color: C.text, border: `1px solid ${C.glassBorder}`, borderRadius: 2, fontSize: 13, fontWeight: 600, boxShadow: C.cardShadow }}>
        {toast.message}
      </Alert>
    </Snackbar>
  );
}

