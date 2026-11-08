import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import { useRegisteredShortcuts, dialogBindings } from "@shared/common/shortcutKit";
import KbdHint from "@business/pos/common/KbdHint";
import { STATUSES, errMsg, statusColor, fmtStamp } from "./common";

/**
 * Ticket thread, shared by the business hub and the super admin panel.
 * `api` = { get(id), reply(id, text), resolve?(id), setStatus?(id, status) }.
 * `admin` shows the business name and the status selector instead of the "resolve" button.
 * Ctrl+D sends the reply, Escape closes.
 */
export default function ThreadDialog({ ctx, id, api, admin = false, onClose, onChanged }) {
  const { t, C, S, lang, fullScreen } = ctx;
  const [ticket, setTicket] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const endRef = useRef(null);

  const adopt = useCallback((d) => { setTicket(d); }, []);
  useEffect(() => {
    api.get(id).then(adopt).catch((e) => setLoadError(errMsg(e, t("ui_sup.common.err_generic"))));
  }, [id, api, adopt, t]);
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: "nearest" }); }, [ticket?.messages?.length]);

  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const d = await fn();
      if (d && d.messages) adopt(d);
      onChanged?.();
      return true;
    } catch (e) {
      setError(errMsg(e, t("ui_sup.common.err_generic")));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const body = text.trim();
    if (!body) { setError(t("ui_sup.common.err_message")); return; }
    if (body.length > 4000) { setError(t("ui_sup.common.err_long")); return; }
    if (await run(() => api.reply(id, body))) setText("");
  };

  useRegisteredShortcuts(
    dialogBindings(t, { onConfirm: send, onClose: () => !busy && onClose(), confirmLabel: t("ui_sup.common.send"), enter: false }),
    { enabled: true },
  );

  const bubble = (m) => {
    const platform = m.author_kind === "platform";
    // a business sees its own messages as "you"; the platform inbox sees them as the business
    const mine = admin ? platform : !platform;
    return (
      <Box key={m.id} sx={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
        <Box sx={{
          maxWidth: "85%", p: 1.25, borderRadius: 2,
          bgcolor: platform ? C.accentSubtle : C.primarySubtle, border: `1px solid ${C.divider}`,
        }}>
          <Typography sx={{ color: C.sub, fontSize: 11, mb: 0.5 }}>
            {platform ? t("ui_sup.common.platform") : (admin ? (m.author_name || ticket.business?.name) : (m.author_name || t("ui_sup.common.you")))}
            {" · "}{fmtStamp(m.created_at, lang)}
          </Typography>
          <Typography sx={{ color: C.text, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 14 }}>{m.body}</Typography>
        </Box>
      </Box>
    );
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullScreen={fullScreen} maxWidth="md" fullWidth
      slotProps={{ paper: { sx: S.dialogPaper } }}>
      <DialogTitle sx={{ fontWeight: 700, pb: 0.5 }}>
        {ticket ? ticket.subject : t("ui_sup.common.loading")}
      </DialogTitle>
      <DialogContent>
        {loadError && <Alert severity="error" sx={{ mt: 1 }}>{loadError}</Alert>}
        {!ticket && !loadError && <Box sx={{ textAlign: "center", py: 3 }}><CircularProgress size={26} /></Box>}
        {ticket && (
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
              <Chip size="small" label={t(`ui_sup.status.${ticket.status}`)}
                sx={{ color: statusColor(C, ticket.status), border: `1px solid ${statusColor(C, ticket.status)}`, bgcolor: "transparent", fontWeight: 700 }} />
              <Chip size="small" variant="outlined" label={t(`ui_sup.cat.${ticket.category}`)} sx={{ color: C.sub, borderColor: C.glassBorder }} />
              {ticket.priority === "high" && (
                <Chip size="small" label={t("ui_sup.priority.high")} sx={{ bgcolor: C.dangerBg, color: C.danger, fontWeight: 700 }} />
              )}
              {admin && ticket.business && (
                <Typography sx={{ color: C.text, fontWeight: 700, fontSize: 13 }}>
                  {ticket.business.name} <span dir="ltr" style={{ color: C.muted }}>({ticket.business.slug})</span>
                </Typography>
              )}
              {admin && ticket.created_by_name && (
                <Typography sx={{ color: C.sub, fontSize: 12 }}>{t("ui_sup.adm.by")}: {ticket.created_by_name}</Typography>
              )}
            </Box>

            <Stack spacing={1} sx={{ maxHeight: { xs: "none", sm: 360 }, overflowY: "auto", py: 0.5 }}>
              {ticket.messages.map(bubble)}
              <span ref={endRef} />
            </Stack>

            <TextField multiline minRows={3} maxRows={8} value={text} sx={S.field}
              placeholder={t("ui_sup.common.reply_ph")} onChange={(e) => setText(e.target.value)}
              slotProps={{ htmlInput: { maxLength: 4000 } }} />
            {!admin && ticket.status === "resolved" && (
              <Typography sx={{ color: C.muted, fontSize: 12 }}>{t("ui_sup.biz.reopen_note")}</Typography>
            )}
            {admin && (
              <TextField select size="small" label={t("ui_sup.adm.set_status")} value={ticket.status} sx={{ ...S.field, maxWidth: 240 }}
                disabled={busy}
                onChange={(e) => run(() => api.setStatus(id, e.target.value))}>
                {STATUSES.map((s) => <MenuItem key={s} value={s}>{t(`ui_sup.status.${s}`)}</MenuItem>)}
              </TextField>
            )}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, flexWrap: "wrap", gap: 1 }}>
        {!admin && ticket && ticket.status !== "resolved" && api.resolve && (
          <Button variant="outlined" sx={S.ghost} disabled={busy} onClick={() => run(() => api.resolve(id))}>
            {t("ui_sup.biz.resolve")}
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" sx={S.ghost} onClick={onClose}>{t("ui_sup.common.close")}</Button>
        <Button sx={S.btn} onClick={send} disabled={busy || !ticket}>{t("ui_sup.common.send")}<KbdHint>Ctrl+D</KbdHint></Button>
      </DialogActions>
    </Dialog>
  );
}
