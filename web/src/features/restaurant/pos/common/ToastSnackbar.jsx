import { Snackbar, Alert } from "@mui/material";
import { FONT } from "./constants";

export default function ToastSnackbar({ toast, onClose, C }) {
  return (
    <Snackbar
      open={toast.open} autoHideDuration={3000}
      onClose={onClose}
      anchorOrigin={{ vertical: "top", horizontal: "center" }}
    >
      <Alert severity={toast.type} sx={{
        bgcolor: C.glass,
        backdropFilter: "blur(16px)",
        color: C.text,
        border: `1px solid ${C.olive}`,
        borderRadius: "12px",
        fontFamily: FONT,
      }}>
        {toast.message}
      </Alert>
    </Snackbar>
  );
}
