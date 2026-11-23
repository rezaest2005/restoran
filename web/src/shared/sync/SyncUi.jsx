import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, List,
  ListItem, ListItemText, Popover, Stack, Switch, Tooltip, Typography,
} from "@mui/material";
import CloudDoneIcon from "@mui/icons-material/CloudDone";
import CloudOffIcon from "@mui/icons-material/CloudOff";
import CloudSyncIcon from "@mui/icons-material/CloudSync";
import SyncProblemIcon from "@mui/icons-material/SyncProblem";
import { useSync } from "./syncContext";
import { localNumber } from "./localOrders";

const fmtTime = (ms, lng) => {
  if (!ms) return null;
  try { return new Intl.DateTimeFormat(lng === "fa" ? "fa-IR" : "en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(ms)); }
  catch { return new Date(ms).toLocaleTimeString(); }
};

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
        <Typography variant="body2" sx={{ mb: 1.5 }}>{t("sync.conflict_help")}</Typography>
        {rows.length === 0 && <Typography variant="body2" color="text.secondary">{t("sync.no_errors")}</Typography>}
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
      <DialogActions><Button onClick={onClose}>OK</Button></DialogActions>
    </Dialog>
  );
}

/** Online/offline + pending chip for the business header; click opens the details. */
export function SyncStatus({ client, isOwner }) {
  const { t, i18n } = useTranslation();
  const s = useSync();
  const [anchor, setAnchor] = useState(null);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [enabledBusy, setEnabledBusy] = useState(false);
  if (!s.ready) return null;

  const offline = !s.online;
  const bad = s.conflicts > 0 || s.locked;
  const Icon = !s.enabled ? CloudOffIcon : offline ? CloudOffIcon : bad ? SyncProblemIcon : s.syncing ? CloudSyncIcon : CloudDoneIcon;
  const color = !s.enabled ? "default" : offline ? "warning" : bad ? "error" : "success";
  const label = !s.enabled ? t("sync.title")
    : s.syncing ? t("sync.syncing")
      : s.pending > 0 ? t("sync.pending_n", { n: s.pending }) : offline ? t("sync.offline") : t("sync.online");

  const toggle = async (v) => {
    setEnabledBusy(true);
    try { await client.post("/api/sync/settings/", { enabled: v }); await s.syncNow(); } catch { /* shown by the next status */ }
    setEnabledBusy(false);
  };
  const last = fmtTime(s.lastSyncAt, i18n.language);

  return (
    <>
      <Tooltip title={t("sync.title")}>
        <Chip data-testid="sync-status" size="small" color={color} variant={color === "default" ? "outlined" : "filled"}
          icon={<Icon fontSize="small" />} label={label} onClick={(e) => setAnchor(e.currentTarget)}
          sx={{ maxWidth: { xs: 130, sm: 220 }, "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" } }} />
      </Tooltip>
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}>
        <Box sx={{ p: 2, width: "min(340px, 92vw)" }} data-testid="sync-popover">
          <Typography sx={{ fontWeight: 800, mb: 0.5 }}>{t("sync.title")}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{s.enabled ? t("sync.desc_on") : t("sync.desc_off")}</Typography>
          {s.locked && <Alert severity="error" sx={{ mb: 1 }}>{s.lockReason === "subscription" ? t("sync.locked_subscription") : t("sync.locked_grace")}</Alert>}
          {s.clockTampered && <Alert severity="warning" sx={{ mb: 1 }}>{t("sync.clock_back")}</Alert>}
          <Stack spacing={0.5} sx={{ mb: 1 }}>
            <Row k={t("sync.online") + " / " + t("sync.offline")} v={offline ? t("sync.offline") : t("sync.online")} />
            <Row k={t("sync.pending")} v={String(s.pending)} />
            <Row k={t("sync.last_sync")} v={last || t("sync.never")} />
          </Stack>
          <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: "wrap", rowGap: 1 }}>
            <Button size="small" variant="contained" disabled={s.syncing || offline} onClick={() => s.syncNow()}>{t("sync.sync_now")}</Button>
            {s.conflicts > 0 && <Button size="small" color="error" variant="outlined" onClick={() => { setAnchor(null); setConflictsOpen(true); }}>{t("sync.conflicts")} ({s.conflicts})</Button>}
          </Stack>
          <Typography variant="caption" color={s.persisted ? "success.main" : "text.secondary"}>
            {s.persisted ? t("sync.storage_persisted") : t("sync.storage_not_persisted")}
          </Typography>
          <Divider sx={{ my: 1 }} />
          <Typography sx={{ fontWeight: 700, fontSize: 13 }}>{t("sync.errors")}</Typography>
          {s.errors.length === 0 ? <Typography variant="body2" color="text.secondary">{t("sync.no_errors")}</Typography> : (
            <List dense disablePadding sx={{ maxHeight: 120, overflow: "auto" }}>
              {s.errors.slice(0, 5).map((e, i) => <ListItem key={i} disableGutters><ListItemText primary={e.message} secondary={fmtTime(e.at, i18n.language)} /></ListItem>)}
            </List>
          )}
          {isOwner && (
            <>
              <Divider sx={{ my: 1 }} />
              <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                <Box><Typography sx={{ fontWeight: 700, fontSize: 13 }}>{t("sync.owner_switch")}</Typography>
                  <Typography variant="caption" color="text.secondary">{t("sync.owner_switch_hint")}</Typography></Box>
                <Switch data-testid="sync-owner-switch" checked={s.enabled} disabled={enabledBusy} onChange={(e) => toggle(e.target.checked)} />
              </Stack>
            </>
          )}
        </Box>
      </Popover>
      <SyncConflictsDialog open={conflictsOpen} onClose={() => setConflictsOpen(false)} />
    </>
  );
}

const Row = ({ k, v }) => (
  <Stack direction="row" sx={{ fontSize: 13, justifyContent: "space-between", gap: 1 }}>
    <span style={{ opacity: 0.7 }}>{k}</span><b>{v}</b>
  </Stack>
);

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
