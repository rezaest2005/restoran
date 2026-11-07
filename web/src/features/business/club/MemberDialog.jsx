import { useState } from "react";
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField,
} from "@mui/material";
import { useRegisteredShortcuts, dialogBindings } from "@shared/common/shortcutKit";
import KbdHint from "@business/pos/common/KbdHint";
import { createMember, errMsg } from "./api";

/** Add a member (phone + name). Ctrl+D / Enter save, Escape closes. */
export default function MemberDialog({ ctx, onClose, onSaved }) {
  const { t, S, fullScreen } = ctx;
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (busy) return;
    if (!phone.trim()) { setError(t("ui_club.err.phone_required")); return; }
    setBusy(true);
    setError("");
    try {
      const m = await createMember({ phone: phone.trim(), name: name.trim() });
      onSaved(m);
    } catch (e) {
      setError(errMsg(e, t("ui_club.err.generic")));
    } finally {
      setBusy(false);
    }
  };

  useRegisteredShortcuts(
    dialogBindings(t, { onConfirm: submit, onClose: () => !busy && onClose(), confirmLabel: t("ui_club.member.save") }),
    { enabled: true },
  );

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullScreen={fullScreen} maxWidth="xs" fullWidth
      slotProps={{ paper: { sx: S.dialogPaper } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{t("ui_club.member.new")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField autoFocus size="small" label={t("ui_club.member.phone")} value={phone} sx={S.field}
            onChange={(e) => setPhone(e.target.value)} slotProps={{ htmlInput: { dir: "ltr", inputMode: "tel" } }} />
          <TextField size="small" label={t("ui_club.member.name")} value={name} sx={S.field}
            onChange={(e) => setName(e.target.value)} />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="outlined" sx={S.ghost} onClick={onClose} disabled={busy}>
          {t("ui_club.close")} <KbdHint>Esc</KbdHint>
        </Button>
        <Button sx={S.btn} onClick={submit} disabled={busy}>
          {busy ? <CircularProgress size={18} color="inherit" /> : <>{t("ui_club.member.save")}<KbdHint>Ctrl+D</KbdHint></>}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
