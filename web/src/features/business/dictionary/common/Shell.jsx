import { Box, Typography, Button, TextField, CircularProgress, Alert, Dialog, DialogTitle, DialogContent, DialogActions } from "@mui/material";
import { useRegisteredShortcuts, dialogBindings } from "@shared/common/shortcutKit";
import { KbdHint } from "./ui";
import { blurFocused } from "./kit";

/** Title + subtitle + search + primary "new" button (F2 is registered by the section). */
export function SectionHeader({ ctx, title, subtitle, onNew, newLabel, search, onSearch, children }) {
  const { t, C, S } = ctx;
  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1.5, flexWrap: "wrap", mb: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: { xs: 16, sm: 18 }, fontWeight: 800, color: C.text }}>{title}</Typography>
          {subtitle && <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.3 }}>{subtitle}</Typography>}
        </Box>
        {onNew && (
          <Button sx={{ ...S.btn, py: 1 }} onClick={onNew}>
            + {newLabel}<KbdHint>F2</KbdHint>
          </Button>
        )}
      </Box>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
        {onSearch && (
          <TextField size="small" value={search} onChange={(e) => onSearch(e.target.value)}
            placeholder={t("ui_def.common.search")} sx={{ ...S.field, width: { xs: "100%", sm: 280 } }} />
        )}
        {children}
      </Box>
    </Box>
  );
}

/** loading / error (with retry) / empty / content. */
export function LoadState({ ctx, loading, error, empty, emptyText, onRetry, children }) {
  const { t, C } = ctx;
  if (loading) {
    return <Box sx={{ textAlign: "center", py: 5 }}><CircularProgress size={28} sx={{ color: C.primary }} /></Box>;
  }
  if (error) {
    return (
      <Alert severity="error" sx={{ my: 1 }}
        action={onRetry && <Button color="inherit" size="small" onClick={onRetry} sx={{ textTransform: "none" }}>{t("ui_def.common.retry")}</Button>}>
        {error}
      </Alert>
    );
  }
  if (empty) {
    return <Typography sx={{ color: C.muted, textAlign: "center", py: 5 }}>{emptyText}</Typography>;
  }
  return children;
}

/**
 * Dialog with Ctrl+D = save, Enter = save (outside multiline/select), Escape = close.
 * Mount it only while open. Pass `shortcuts={false}` while a nested dialog is shown.
 */
export function FormDialog({ ctx, title, saving, error, onClose, onSave, saveLabel, children, maxWidth = "sm", shortcuts = true, extraActions, disabled }) {
  const { t, C, S, fullScreen } = ctx;
  useRegisteredShortcuts(
    dialogBindings(t, { onConfirm: () => { if (!saving && !disabled) onSave(); }, onClose, confirmLabel: saveLabel }),
    { enabled: shortcuts },
  );
  return (
    <Dialog open onClose={saving ? undefined : onClose} fullScreen={fullScreen} maxWidth={maxWidth} fullWidth
      slotProps={{ paper: { sx: S.dialogPaper }, transition: { onExit: blurFocused } }}>
      <DialogTitle sx={{ fontWeight: 800, color: C.text }}>{title}</DialogTitle>
      <DialogContent dividers sx={{ borderColor: C.divider }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 0.5 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {children}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, flexWrap: "wrap", gap: 1 }}>
        {extraActions}
        <Button variant="outlined" sx={S.ghost} onClick={onClose} disabled={saving}>{t("ui_def.common.cancel")}</Button>
        <Button sx={S.btn} onClick={onSave} disabled={saving || disabled}>
          {saving ? <CircularProgress size={18} color="inherit" /> : <>{saveLabel || t("ui_def.common.save")}<KbdHint>Ctrl+D</KbdHint></>}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
