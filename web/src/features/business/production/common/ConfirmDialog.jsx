import {
  Dialog, DialogTitle, DialogContent, DialogActions, Typography, Button, Alert, CircularProgress,
} from "@mui/material";
import useShortcuts from "@shared/common/useShortcuts";
import KbdHint from "@business/pos/common/KbdHint";

/** Confirm dialog: Enter / Ctrl+D confirm, Escape cancels (MUI). */
export default function ConfirmDialog({ ctx, open, title, text, confirmLabel, danger, busy, error, onClose, onConfirm }) {
  const { t, C, S, fullScreen } = ctx;

  useShortcuts([
    { combo: "Enter", label: t("shortcuts.confirm"), scope: "dialog",
      handler: (e) => (e?.target?.tagName === "BUTTON" || busy ? false : onConfirm()) },
    { combo: "Ctrl+D", label: t("shortcuts.confirm"), scope: "dialog", handler: () => { if (!busy) onConfirm(); } },
  ], { enabled: open });

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullScreen={fullScreen} maxWidth="xs" fullWidth PaperProps={{ sx: S.dialogPaper }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{title}</DialogTitle>
      <DialogContent>
        <Typography sx={{ color: C.sub, fontSize: 14 }}>{text}</Typography>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="outlined" sx={S.ghost} onClick={onClose} disabled={busy}>{t("ui_e.common.cancel")}</Button>
        <Button
          variant="contained" disabled={busy} onClick={onConfirm}
          sx={danger ? { bgcolor: C.danger, color: C.onPrimary, textTransform: "none", fontWeight: 700, "&:hover": { bgcolor: C.danger, opacity: 0.9 } } : S.btn}
        >
          {busy ? <CircularProgress size={18} color="inherit" /> : <>{confirmLabel}<KbdHint>Ctrl+D</KbdHint></>}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
