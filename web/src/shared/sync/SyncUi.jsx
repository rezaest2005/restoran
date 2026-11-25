import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Popover, Stack, Tooltip, Typography,
} from "@mui/material";
import { useSync } from "./syncContext";
import { localNumber } from "./localOrders";

/** Small badge for one order: pending / synced / conflict / rejected. */
export function SyncBadge({ state, size = "small" }) {
  const { t } = useTranslation();
  if (!state) return null;
  const map = {
    pending: ["warning", "badge_pending"], sending: ["warning", "badge_pending"], synced: ["success", "badge_synced"],
    conflict: ["error", "badge_conflict"], rejected: ["error", "badge_rejected"],
  };
  const [color, key] = map[state] || ["default", "badge_pending"];
  return <Chip size={size} color={color} variant="outlined" label={t(`sync.${key}`)} data-testid={`sync-badge-${state}`} sx={{ height: 20, fontSize: 11 }} />;
}

function describeLine(t, code, l) {
  if (code === "price_changed") return t("sync.line_price", { name: l.name, was: l.was, now: l.now });
  if (code === "stock") return t("sync.line_stock", { name: l.name, requested: l.requested, available: l.available });
  return t("sync.line_missing", { name: l.name || `#${l.food_id}` });
}

/** The cashier's list of orders the server could not accept, with a way to fix each. */
export function SyncConflictsDialog({ open, onClose }) {
  const { t } = useTranslation();
  const { engine, rev } = useSync();
  const [rows, setRows] = useState([]);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!open || !engine) return;
    engine.outbox().then((r) => {
      const bad = r.filter((x) => x.status === "conflict" || x.status === "rejected");
      setRows(bad);
      if (bad.length) setSeen(true);
      else if (seen) { setSeen(false); onClose(); }       // everything fixed: close by itself
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, engine, rev?.outbox]);
  const act = (id, a) => engine.resolve(id, a);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("sync.conflict_title")}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          {rows.map((r) => (
            <Box key={r.id} data-testid="sync-conflict" sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 1.5 }}>
              <Stack direction="row" spacing={1} sx={{ mb: 0.5, flexWrap: "wrap", alignItems: "center" }}>
                <Typography sx={{ fontWeight: 700 }}>{localNumber(r)}</Typography>
                <SyncBadge state={r.status} />
                <Typography variant="body2" color="text.secondary">{(r.snapshot?.total ?? 0).toLocaleString()}</Typography>
              </Stack>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {t(`sync.code_${r.code}`, { defaultValue: r.error || r.code })}
              </Typography>
              {(r.details?.lines || []).map((l, i) => (
                <Typography key={i} variant="body2" color="text.secondary">{describeLine(t, r.code, l)}</Typography>
              ))}
              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap", rowGap: 1 }}>
                {r.code === "price_changed" && <Button size="small" variant="contained" onClick={() => act(r.id, "accept_prices")}>{t("sync.act_accept_prices")}</Button>}
                {r.code === "stock" && (r.details?.lines || []).length > 0 && <Button size="small" variant="contained" onClick={() => act(r.id, "adjust_qty")}>{t("sync.act_adjust_qty")}</Button>}
                {r.code === "product_missing" && <Button size="small" variant="contained" onClick={() => act(r.id, "drop_missing")}>{t("sync.act_drop_missing")}</Button>}
                {r.status === "conflict" && r.code !== "product_missing" && <Button size="small" variant="outlined" onClick={() => act(r.id, "retry")}>{t("sync.act_retry")}</Button>}
                <Button size="small" color="error" onClick={() => act(r.id, "discard")}>{t("sync.act_discard")}</Button>
              </Stack>
            </Box>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>{t("sync.close")}</Button></DialogActions>
    </Dialog>
  );
}

/** Small relative time ("2 minutes ago"). */
const ago = (ms, lng, now) => {
  if (!ms) return null;
  const sec = Math.round((ms - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lng === "fa" ? "fa" : "en", { numeric: "auto" });
  if (Math.abs(sec) < 60) return rtf.format(0, "second");
  if (Math.abs(sec) < 3600) return rtf.format(Math.round(sec / 60), "minute");
  if (Math.abs(sec) < 86400) return rtf.format(Math.round(sec / 3600), "hour");
  return rtf.format(Math.round(sec / 86400), "day");
};

const Dot = ({ c }) => <Box component="span" sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: c, ml: 1, mr: "-2px", flexShrink: 0 }} />;

/** Online/offline + pending chip for the business header; click opens the details. */
export function SyncStatus() {
  const { t, i18n } = useTranslation();
  const s = useSync();
  const [anchor, setAnchor] = useState(null);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!anchor) return undefined;
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, [anchor]);
  if (!s.ready) return null;

  const offline = !s.online;
  const bad = s.conflicts > 0 || s.locked;
  const dot = bad ? "error.main" : s.pending > 0 ? "warning.main" : offline ? "text.disabled" : "success.main";
  const word = s.syncing ? t("sync.syncing") : offline ? t("sync.offline") : t("sync.online");
  const label = s.pending > 0 ? String(s.pending) : word;

  const last = ago(s.lastSyncAt, i18n.language, now);

  // everything fine (online, nothing waiting, no problem): only a small dot; words and a number appear when needed
  const calm = !offline && !bad && s.pending === 0 && !s.clockTampered && s.errors.length === 0 && !s.syncing;
  const open = (e) => { setNow(Date.now()); setAnchor(e.currentTarget); };
  return (
    <>
      {calm ? (
        <Tooltip title={word}>
          <IconButton data-testid="sync-status" size="small" aria-label={word} onClick={open} sx={{ width: 32, height: 32 }}>
            <Box component="span" sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: dot }} />
          </IconButton>
        </Tooltip>
      ) : (
        <Chip data-testid="sync-status" size="small" variant="outlined" icon={<Dot c={dot} />} label={label}
          aria-label={word} onClick={open} />
      )}
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}>
        <Stack spacing={1} sx={{ p: 1.5, width: "min(240px, 92vw)" }} data-testid="sync-popover">
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
            <Typography sx={{ fontWeight: 700 }}>{word}</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" data-testid="sync-explain">{t("sync.explain")}</Typography>
          {last && <Typography variant="caption" color="text.secondary">{t("sync.last_sent", { when: last })}</Typography>}
          {s.pending > 0 && <Typography variant="body2">{t("sync.pending_n", { n: s.pending })}</Typography>}
          {s.locked && <Typography variant="body2" color="error">{s.lockReason === "subscription" ? t("sync.locked_subscription") : t("sync.locked_grace")}</Typography>}
          {s.clockTampered && <Typography variant="body2" color="warning.main">{t("sync.clock_back")}</Typography>}
          {s.errors.slice(0, 3).map((e, i) => <Typography key={i} variant="body2" color="error">{e.message}</Typography>)}
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
            <Button size="small" variant="contained" disabled={s.syncing || offline} onClick={() => s.syncNow()}>{t("sync.sync_now")}</Button>
            {s.conflicts > 0 && <Button size="small" color="error" variant="outlined" onClick={() => { setAnchor(null); setConflictsOpen(true); }}>{t("sync.conflicts")} ({s.conflicts})</Button>}
          </Stack>
        </Stack>
      </Popover>
      <SyncConflictsDialog open={conflictsOpen} onClose={() => setConflictsOpen(false)} />
    </>
  );
}

/** Shown before signing out while orders have not reached the server. */
export function LogoutGuardDialog({ open, unsynced, onCancel, onKeep, onDiscard }) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="xs">
      <DialogTitle>{t("sync.logout_title")}</DialogTitle>
      <DialogContent><Typography>{t("sync.logout_body", { n: unsynced })}</Typography></DialogContent>
      <DialogActions sx={{ flexWrap: "wrap", gap: 1, p: 2 }}>
        <Button onClick={onCancel} variant="contained">{t("sync.logout_cancel")}</Button>
        <Button onClick={onKeep}>{t("sync.logout_keep")}</Button>
        <Button onClick={onDiscard} color="error">{t("sync.logout_discard")}</Button>
      </DialogActions>
    </Dialog>
  );
}
