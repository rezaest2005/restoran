import { blurFocused } from "../common/focus";
import { useState } from "react";
import {
  Box, Typography, Button, Chip, Switch, FormControlLabel, IconButton, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Alert,
} from "@mui/material";
import { VolumeUp, VolumeOff, Print, TableBar, Public } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { setOrderStatus, rejectOnlineOrder } from "../api";
import { printTicket } from "../services/printService";
import useShortcuts from "@shared/common/useShortcuts";
import { FONT } from "../common/constants";
import KbdHint from "../common/KbdHint";
import { formatMoney } from "../common/format";

const MAX_ACCEPTED = 20;

function relTime(order, t) {
  let ts = Number(order.created_at_ts);
  if (!ts) return order.created_at || "";
  if (ts < 1e12) ts *= 1000;
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return t("ui_f.incoming.just_now");
  if (min < 60) return t("ui_f.incoming.min_ago", { n: min });
  return t("ui_f.incoming.hour_ago", { n: Math.floor(min / 60) });
}

export default function IncomingOrders({
  orders, error, refresh, muted, setMuted, autoPrint, setAutoPrint,
  accepted, setAccepted, onToast, C, glassCardSx, isRtl, lang,
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState({});
  const [errors, setErrors] = useState({});
  const [confirmId, setConfirmId] = useState(null);
  const [focusId, setFocusId] = useState(null);

  // سفارش هدفِ میان‌برها: سفارش فوکوس‌شده، وگرنه اولین سفارش در انتظار
  const targetOrder = orders.find((o) => o.id === focusId) || orders[0] || null;
  const moveFocus = (dir) => {
    if (orders.length === 0) return;
    const i = orders.findIndex((o) => o.id === targetOrder?.id);
    const next = focusId == null ? (dir > 0 ? 0 : orders.length - 1)
      : Math.min(Math.max(i + dir, 0), orders.length - 1);
    setFocusId(orders[next].id);
  };

  const printOpts = {
    lang, isRtl, t,
    onError: () => onToast?.(t("ui_f.print.failed"), "error"),
  };
  const printBoth = async (order) => {
    await printTicket(order, "production", printOpts);
    await printTicket(order, "receipt", printOpts);
  };

  const run = async (order, fn, okKey, after) => {
    setBusy((b) => ({ ...b, [order.id]: true }));
    setErrors((e) => ({ ...e, [order.id]: "" }));
    try {
      const res = await fn();
      if (res && res.success === false) throw new Error(res.error || "");
      onToast?.(t(okKey), "success");
      await after?.();
      refresh();
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || t("ui_f.incoming.action_failed");
      setErrors((e) => ({ ...e, [order.id]: msg }));
      refresh();
    } finally {
      setBusy((b) => ({ ...b, [order.id]: false }));
    }
  };

  const accept = (order) => run(order, () => setOrderStatus(order.id, "confirmed"),
    "ui_f.incoming.accepted_ok", async () => {
      setAccepted((prev) => [order, ...prev.filter((o) => o.id !== order.id)].slice(0, MAX_ACCEPTED));
      if (autoPrint) await printBoth(order);
    });

  const reject = (order) => run(order, () => rejectOnlineOrder(order.id), "ui_f.incoming.rejected_ok");

  const confirmReject = () => {
    const o = orders.find((x) => x.id === confirmId);
    setConfirmId(null);
    if (o) reject(o);
  };

  useShortcuts([
    { combo: "Ctrl+D", label: t("ui_g.pos.accept_first"), when: !!targetOrder && !busy[targetOrder.id],
      handler: () => accept(targetOrder) },
    { combo: "Ctrl+A", label: t("ui_g.pos.next_order"), handler: () => moveFocus(1) },
    { combo: "Ctrl+Z", label: t("ui_g.pos.prev_order"), handler: () => moveFocus(-1) },
    { combo: "Delete", label: t("ui_g.pos.reject_focused"), when: !!targetOrder && !busy[targetOrder.id],
      handler: () => setConfirmId(targetOrder.id) },
  ]);

  useShortcuts([
    { combo: "Enter", label: t("ui_g.pos.confirm_reject"), scope: "dialog", handler: confirmReject },
    { combo: "Ctrl+D", label: t("ui_g.pos.confirm_reject"), scope: "dialog", handler: confirmReject },
  ], { enabled: confirmId !== null });

  const btnBase = { minHeight: 44, fontFamily: FONT, fontWeight: 800, borderRadius: "12px", flex: 1 };

  const renderCard = (o, isAccepted) => {
    const isQr = o.source === "qr";
    const pending = !!busy[o.id];
    return (
      <Box key={o.id} sx={{ ...glassCardSx, p: 2, display: "flex", flexDirection: "column", gap: 1.2,
        ...(!isAccepted && focusId === o.id ? { outline: `2px solid ${C.olive}`, outlineOffset: 2 } : null) }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Chip
            size="small" icon={isQr ? <TableBar /> : <Public />}
            label={t(isQr ? "ui_f.incoming.source_qr" : "ui_f.incoming.source_online")}
            sx={{ bgcolor: `${C.olive}22`, color: C.olive, fontFamily: FONT, fontWeight: 700,
              "& .MuiChip-icon": { color: C.olive } }}
          />
          <Typography sx={{ fontSize: 12, color: C.muted, fontFamily: FONT }}>
            {t("ui_f.incoming.order_no", { id: o.id })} · {relTime(o, t)}
          </Typography>
        </Box>

        {o.table_number ? (
          <Typography sx={{ fontSize: 30, fontWeight: 900, color: C.olive, fontFamily: FONT, lineHeight: 1.1 }}>
            {t("ui_f.incoming.table", { n: o.table_number })}
          </Typography>
        ) : null}

        <Typography sx={{ fontSize: 14, color: C.text, fontFamily: FONT, wordBreak: "break-word" }}>
          {(isRtl ? o.customer_name : (o.customer_name_en || o.customer_name)) || t("ui_f.incoming.no_name")}
          {o.phone ? <Box component="span" dir="ltr" sx={{ color: C.muted, mx: 1 }}>{o.phone}</Box> : null}
        </Typography>

        {o.customer_note ? (
          <Box sx={{ p: 1, borderRadius: "10px", bgcolor: `${C.burgundy}18`, border: `1px solid ${C.burgundy}`,
            color: C.text, fontFamily: FONT, fontSize: 14, fontWeight: 700, wordBreak: "break-word" }}>
            {t("ui_f.incoming.note")}: {o.customer_note}
          </Box>
        ) : null}

        <Box sx={{ borderTop: `1px dashed ${C.glassBorder}`, pt: 1 }}>
          {(o.items || []).map((it) => (
            <Box key={it.id} sx={{ display: "flex", justifyContent: "space-between", gap: 1, py: 0.3, fontFamily: FONT, fontSize: 14, color: C.text }}>
              <span style={{ wordBreak: "break-word" }}>
                {it.quantity} × {isRtl ? it.food_name : (it.name_en || it.food_name)}
              </span>
              <span style={{ whiteSpace: "nowrap", color: C.sub }}>
                {formatMoney(it.price)} → {formatMoney(Number(it.price || 0) * Number(it.quantity || 0))}
              </span>
            </Box>
          ))}
          <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.8, fontWeight: 900, fontFamily: FONT, color: C.olive }}>
            <span>{t("ui_f.incoming.total")}</span>
            <span>{formatMoney(o.total_price)} {t("ui_f.incoming.currency")}</span>
          </Box>
        </Box>

        {errors[o.id] ? <Alert severity="error" sx={{ fontFamily: FONT }}>{errors[o.id]}</Alert> : null}

        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {isAccepted ? (
            <Button variant="outlined" startIcon={<Print />} onClick={() => printBoth(o)}
              sx={{ ...btnBase, color: C.olive, borderColor: C.olive }}>
              {t("ui_f.incoming.print_again")}
            </Button>
          ) : (
            <>
              <Button variant="contained" disabled={pending} onClick={() => accept(o)}
                sx={{ ...btnBase, bgcolor: C.olive, color: "#fff", "&:hover": { bgcolor: C.olive } }}>
                {t("ui_f.incoming.accept")}
               
              </Button>
              <Button variant="outlined" disabled={pending} onClick={() => setConfirmId(o.id)}
                sx={{ ...btnBase, color: C.burgundy, borderColor: C.burgundy }}>
                {t("ui_f.incoming.reject")}
              </Button>
            </>
          )}
        </Box>
      </Box>
    );
  };

  const grid = { display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(auto-fill, minmax(320px, 1fr))" }, gap: 1.5 };

  return (
    <Box sx={{ p: { xs: 1, sm: 2 }, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ fontWeight: 800, fontSize: { xs: 17, sm: 20 }, fontFamily: FONT, color: C.text }}>
          {t("ui_f.incoming.title")}
        </Typography>
        {error ? <Chip size="small" color="warning" label={t("ui_f.incoming.connection_problem")} sx={{ fontFamily: FONT }} /> : null}
        <Box sx={{ flex: 1 }} />
        <FormControlLabel
          control={<Switch checked={autoPrint} onChange={(e) => setAutoPrint(e.target.checked)} />}
          label={<span style={{ fontFamily: FONT, fontSize: 13, color: C.text }}>{t("ui_f.incoming.auto_print")}</span>}
        />
        <Tooltip title={t(muted ? "ui_f.incoming.unmute" : "ui_f.incoming.mute")}>
          <IconButton onClick={() => setMuted(!muted)} aria-label={t(muted ? "ui_f.incoming.unmute" : "ui_f.incoming.mute")}
            sx={{ width: 44, height: 44, color: muted ? C.muted : C.olive }}>
            {muted ? <VolumeOff /> : <VolumeUp />}
          </IconButton>
        </Tooltip>
      </Box>

      {orders.length === 0 ? (
        <Box sx={{ ...glassCardSx, p: 3 }}>
          <Typography sx={{ color: C.sub, fontFamily: FONT }}>{t("ui_f.incoming.empty")}</Typography>
        </Box>
      ) : (
        <Box sx={grid}>{orders.map((o) => renderCard(o, false))}</Box>
      )}

      {accepted.length > 0 && (
        <>
          <Typography sx={{ fontWeight: 800, fontSize: 15, fontFamily: FONT, color: C.sub, mt: 1 }}>
            {t("ui_f.incoming.accepted_section")}
          </Typography>
          <Box sx={grid}>{accepted.map((o) => renderCard(o, true))}</Box>
        </>
      )}

      <Dialog open={confirmId !== null} onClose={() => setConfirmId(null)} dir={isRtl ? "rtl" : "ltr"} slotProps={{ transition: { onExit: blurFocused } }}>
        <DialogTitle sx={{ fontFamily: FONT }}>{t("ui_f.incoming.reject_title")}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontFamily: FONT }}>{t("ui_f.incoming.reject_text")}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmId(null)} sx={{ minHeight: 40, fontFamily: FONT }}>
            {t("ui_f.incoming.cancel")}
          </Button>
          <Button color="error" variant="contained" sx={{ minHeight: 40, fontFamily: FONT }}
            onClick={confirmReject}>
            {t("ui_f.incoming.confirm_reject")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
