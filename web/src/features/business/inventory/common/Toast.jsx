import { Snackbar, Alert } from "@mui/material";

/** Glass-styled top-center snackbar bound to `useToast()` state. */
export default function ToastSnackbar({ toast, onClose, C }) {
  return (
    <Snackbar
      open={toast.open}
      autoHideDuration={3000}
      onClose={onClose}
      anchorOrigin={{ vertical: "top", horizontal: "center" }}
    >
      <Alert
        onClose={onClose}
        severity={toast.type}
        sx={{
          bgcolor: C.glass,
          backdropFilter: "blur(16px)",
          color: C.text,
          border: `1px solid ${C.olive}`,
          borderRadius: "12px",
          fontSize: 13,
          fontWeight: 600,
          boxShadow: C.cardShadow,
        }}
      >
        {toast.message}
      </Alert>
    </Snackbar>
  );
}
