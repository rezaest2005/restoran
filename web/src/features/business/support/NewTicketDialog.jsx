import { useState } from "react";
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import { useRegisteredShortcuts, dialogBindings } from "@shared/common/shortcutKit";
import KbdHint from "@business/pos/common/KbdHint";
import { createTicket } from "./api";
import { CATEGORIES, PRIORITIES, errMsg } from "./common";

/** New support ticket: subject, category, priority and the first message. Ctrl+D creates, Escape closes. */
export default function NewTicketDialog({ ctx, onClose, onCreated }) {
  const { t, C, S, fullScreen } = ctx;
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("question");
  const [priority, setPriority] = useState("normal");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (busy) return;
    if (!subject.trim()) { setError(t("ui_sup.common.err_subject")); return; }
    if (!message.trim()) { setError(t("ui_sup.common.err_message")); return; }
    setBusy(true);
    setError("");
    try {
      const d = await createTicket({ subject: subject.trim(), category, priority, message: message.trim() });
      onCreated(d);
    } catch (e) {
      setError(errMsg(e, t("ui_sup.common.err_generic")));
    } finally {
      setBusy(false);
    }
  };

  useRegisteredShortcuts(
    dialogBindings(t, { onConfirm: submit, onClose: () => !busy && onClose(), confirmLabel: t("ui_sup.biz.create"), enter: false }),
    { enabled: true },
  );

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth
      slotProps={{ paper: { sx: S.dialogPaper } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{t("ui_sup.biz.new_title")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography sx={{ color: C.sub, fontSize: 13 }}>{t("ui_sup.biz.hint")}</Typography>
          <TextField autoFocus size="small" label={t("ui_sup.common.subject")} value={subject} sx={S.field}
            onChange={(e) => setSubject(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField select fullWidth size="small" label={t("ui_sup.common.category")} value={category} sx={S.field}
              onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{t(`ui_sup.cat.${c}`)}</MenuItem>)}
            </TextField>
            <TextField select fullWidth size="small" label={t("ui_sup.common.priority_l")} value={priority} sx={S.field}
              onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => <MenuItem key={p} value={p}>{t(`ui_sup.priority.${p}`)}</MenuItem>)}
            </TextField>
          </Stack>
          <TextField multiline minRows={5} maxRows={12} label={t("ui_sup.common.message")} value={message} sx={S.field}
            onChange={(e) => setMessage(e.target.value)} slotProps={{ htmlInput: { maxLength: 4000 } }} />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="outlined" sx={S.ghost} onClick={onClose}>{t("ui_sup.common.close")}</Button>
        <Button sx={S.btn} onClick={submit} disabled={busy}>{t("ui_sup.biz.create")}<KbdHint>Ctrl+D</KbdHint></Button>
      </DialogActions>
    </Dialog>
  );
}
