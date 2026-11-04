import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography,
} from "@mui/material";
import { useRegisteredShortcuts, dialogBindings } from "@shared/common/shortcutKit";
import KbdHint from "@business/pos/common/KbdHint";
import { fetchRevisions, restoreRevision, errMsg } from "./api";

export default function RevisionsTab({ reloadKey, onRestored, onToast }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [pending, setPending] = useState(null); // { id, publish } awaiting confirmation
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchRevisions().then(setRows).catch((e) => setErr(errMsg(e, t("ui_k.error"))));
  }, [t]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [reloadKey]);

  const restore = async (id, publish) => {
    setBusy(true);
    try {
      await restoreRevision(id, publish);
      onToast(t("ui_k.revisions.restored"), "success");
      setPending(null);
      onRestored();
    } catch (e) {
      onToast(errMsg(e, t("ui_k.error")), "error");
      setPending(null);
    } finally {
      setBusy(false);
    }
  };
  const confirmRestore = () => { if (pending && !busy) restore(pending.id, pending.publish); };

  // Ctrl+D / Enter confirm · Escape cancel (only while the confirm dialog is open)
  useRegisteredShortcuts(
    dialogBindings(t, {
      onConfirm: confirmRestore,
      onClose: () => !busy && setPending(null),
      confirmLabel: t("ui_l.store.restore_focused"),
    }),
    { enabled: !!pending },
  );

  // Row keyboard: Enter restore (draft) · Ctrl+A / ArrowDown next · Ctrl+Z / ArrowUp previous
  const onRowKeyDown = (e, id) => {
    if (e.target !== e.currentTarget) return;
    const ctrl = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;
    const next = (ctrl && e.code === "KeyA") || e.key === "ArrowDown";
    const prev = (ctrl && e.code === "KeyZ") || e.key === "ArrowUp";
    if (next || prev) {
      e.preventDefault();
      const sib = next ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling;
      if (sib && sib.hasAttribute("data-revision-row")) sib.focus();
    } else if (e.key === "Enter" && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      setPending({ id, publish: false });
    }
  };

  if (err) return <Alert severity="error">{err}</Alert>;
  if (!rows) return <Typography>{t("ui_k.loading")}</Typography>;
  if (!rows.length) return <Typography color="text.secondary">{t("ui_k.revisions.empty")}</Typography>;
  return (
    <Stack spacing={1.5} sx={{ maxWidth: 640 }}>
      {rows.map((r) => (
        <Box key={r.id} data-revision-row tabIndex={0} onKeyDown={(e) => onRowKeyDown(e, r.id)}
          aria-label={`${t("ui_k.revisions.restore")} ${new Date(r.created_at).toLocaleString()}`}
          sx={{ "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" }, border: 1, borderColor: "divider", borderRadius: 2, p: 1.5, display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
          <Box sx={{ flex: 1, minWidth: 180 }}>
            <Typography dir="ltr" sx={{ textAlign: "start", fontWeight: 700 }}>
              {new Date(r.created_at).toLocaleString(document.documentElement.lang === "en" ? "en-GB" : "fa-IR")}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t("ui_k.revisions.sections_n", { count: r.sections })}
              {r.by ? ` · ${t("ui_k.revisions.by", { name: r.by })}` : ""}
            </Typography>
          </Box>
          <Button size="small" onClick={() => setPending({ id: r.id, publish: false })}>{t("ui_k.revisions.restore")}</Button>
          <Button size="small" variant="outlined" onClick={() => setPending({ id: r.id, publish: true })}>{t("ui_k.revisions.restore_publish")}</Button>
        </Box>
      ))}
      <Dialog open={!!pending} onClose={busy ? undefined : () => setPending(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t("ui_l.store.restore_title")}</DialogTitle>
        <DialogContent>
          <Typography>
            {pending?.publish ? t("ui_l.store.restore_publish_text") : t("ui_l.store.restore_text")}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPending(null)} disabled={busy}>
            {t("shortcuts.close_dialog")} <KbdHint>Esc</KbdHint>
          </Button>
          <Button variant="contained" onClick={confirmRestore} disabled={busy}>
            {t("shortcuts.confirm")} <KbdHint>Ctrl+D</KbdHint>
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
