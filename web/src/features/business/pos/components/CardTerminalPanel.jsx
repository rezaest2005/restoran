import { useState } from "react";
import { Box, Typography, Button, CircularProgress, LinearProgress, TextField, Alert } from "@mui/material";
import { CreditCard, Payments, Language, Replay, Cancel, Search, CheckCircle, Error as ErrorOutline, WarningAmber } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { formatMoney } from "../common";

const FONT = "'Vazirmatn', sans-serif";

/**
 * What the cashier sees while an (unpaid) order is being charged on the card terminal:
 * waiting (countdown + cancel) / failed (retry, other way, cancel order) / unknown (check, confirm by hand, not paid).
 */
export default function CardTerminalPanel({ order, terminal, onSettle, onCancelOrder, onLeave, working, error, C, isRtl }) {
  const { t } = useTranslation();
  const { phase, attempt, failure, busy, secondsLeft, totalSeconds } = terminal;
  const [tracing, setTracing] = useState(false);
  const [trace, setTrace] = useState("");
  const [traceErr, setTraceErr] = useState("");
  const [note, setNote] = useState("");
  const disabled = busy || working;

  const card = (color, children) => (
    <Box sx={{ border: `2px solid ${color}40`, bgcolor: `${color}0C`, borderRadius: "16px", p: 2, textAlign: "center" }}>
      {children}
    </Box>
  );

  const amount = (
    <Box sx={{ mb: 1.5 }}>
      <Typography sx={{ fontSize: 12, color: C.sub, fontFamily: FONT }}>{t("ui_card.checkout.amount")}</Typography>
      <Typography sx={{ fontSize: 28, fontWeight: 900, color: C.text, fontFamily: FONT, lineHeight: 1.2 }} data-testid="terminal-amount">
        {formatMoney(order.total_price)} <Typography component="span" sx={{ fontSize: 12, color: C.muted, fontFamily: FONT }}>{isRtl ? "تومان" : "Toman"}</Typography>
      </Typography>
      <Typography sx={{ fontSize: 12, color: C.muted, fontFamily: FONT }}>#{order.order_id}</Typography>
    </Box>
  );

  const doCheck = async () => {
    setNote("");
    await terminal.check();
    setNote("check");
  };

  const confirmPaid = async () => {
    setTraceErr("");
    if (trace.replace(/\W/g, "").length < 3) { setTraceErr(t("ui_card.checkout.trace_required")); return; }
    const r = await terminal.resolve("paid", trace);
    if (!r.ok) setTraceErr(r.code === "trace_required" ? t("ui_card.checkout.trace_required") : t("ui_card.checkout.failure.server_error"));
  };

  /* ───────── waiting ───────── */
  if (phase === "waiting" || phase === "idle") {
    const pct = totalSeconds ? Math.max(0, Math.min(100, (secondsLeft / totalSeconds) * 100)) : 0;
    return card(C.gold, (
      <>
        {amount}
        <CircularProgress size={34} sx={{ color: C.gold, mb: 1 }} />
        <Typography sx={{ fontWeight: 900, fontSize: 15, color: C.text, fontFamily: FONT }} data-testid="terminal-waiting" role="status" aria-live="polite">
          {t("ui_card.checkout.waiting_title")}
        </Typography>
        <LinearProgress variant="determinate" value={pct} sx={{ height: 8, borderRadius: 4, my: 1 }} />
        <Typography sx={{ fontSize: 13, fontWeight: 800, color: secondsLeft <= 10 ? C.danger : C.text, fontFamily: FONT, mb: 1.5 }} data-testid="terminal-countdown">
          {t("ui_card.checkout.countdown", { s: secondsLeft })}
        </Typography>
        <Button onClick={terminal.cancel} disabled={busy} color="error" variant="outlined" startIcon={<Cancel />} data-testid="terminal-cancel"
          sx={{ fontFamily: FONT, borderRadius: "12px", minHeight: 44 }}>
          {t(busy ? "ui_card.checkout.cancelling" : "ui_card.checkout.cancel")}
        </Button>
      </>
    ));
  }

  /* ───────── unknown outcome ───────── */
  if (phase === "unknown") {
    return card(C.danger, (
      <>
        {amount}
        <WarningAmber sx={{ fontSize: 36, color: C.danger }} />
        <Typography sx={{ fontWeight: 900, fontSize: 15, color: C.text, my: 0.5, fontFamily: FONT }} data-testid="terminal-unknown">
          {t("ui_card.checkout.unknown_title")}
        </Typography>
        <Typography sx={{ fontSize: 12.5, color: C.sub, mb: 1.5, fontFamily: FONT }}>{t("ui_card.checkout.unknown_text")}</Typography>
        {note === "check" && attempt?.status === "unknown" && (
          <Alert severity="info" sx={{ mb: 1.5, textAlign: "start" }}>
            {t("ui_card.checkout.status_pending")}
          </Alert>
        )}
        {tracing ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1, textAlign: "start" }}>
            <TextField size="small" autoFocus label={t("ui_card.checkout.trace_label")} value={trace}
              onChange={(e) => setTrace(e.target.value)} error={!!traceErr} helperText={traceErr}
              slotProps={{ htmlInput: { dir: "ltr", inputMode: "numeric", "data-testid": "trace-input" } }} />
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button fullWidth variant="contained" onClick={confirmPaid} disabled={disabled} startIcon={<CheckCircle />}
                data-testid="trace-confirm" sx={{ fontFamily: FONT, minHeight: 44 }}>
                {t("ui_card.checkout.confirm_paid")}
              </Button>
              <Button onClick={() => { setTracing(false); setTraceErr(""); }} disabled={disabled} sx={{ fontFamily: FONT }}>
                {t("ui_card.checkout.back")}
              </Button>
            </Box>
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Button variant="outlined" onClick={doCheck} disabled={disabled} startIcon={busy ? <CircularProgress size={16} /> : <Search />}
              data-testid="unknown-check" sx={{ fontFamily: FONT, minHeight: 44 }}>
              {t("ui_card.checkout.check_status")}
            </Button>
            <Button variant="contained" color="success" onClick={() => setTracing(true)} disabled={disabled} startIcon={<CheckCircle />}
              data-testid="unknown-paid" sx={{ fontFamily: FONT, minHeight: 44 }}>
              {t("ui_card.checkout.mark_paid")}
            </Button>
            <Button variant="outlined" color="error" onClick={() => terminal.resolve("not_paid")} disabled={disabled} startIcon={<ErrorOutline />}
              data-testid="unknown-notpaid" sx={{ fontFamily: FONT, minHeight: 44 }}>
              {t("ui_card.checkout.not_paid")}
            </Button>
          </Box>
        )}
      </>
    ));
  }

  /* ───────── failed (definitely not charged) ───────── */
  const code = failure?.code;
  const known = ["declined", "cancelled", "timeout", "unreachable", "failed", "not_paid", "lost", "disabled", "order_not_payable", "server_error"];
  const reason = t(`ui_card.checkout.failure.${known.includes(code) ? code : "other"}`);
  return card(C.danger, (
    <>
      {amount}
      <ErrorOutline sx={{ fontSize: 34, color: C.danger }} />
      <Typography sx={{ fontWeight: 900, fontSize: 15, color: C.text, my: 0.5, fontFamily: FONT }}>{t("ui_card.checkout.fail_title")}</Typography>
      <Typography sx={{ fontSize: 13, color: C.text, fontFamily: FONT }} data-testid="terminal-failure" data-code={code}>{reason}</Typography>
      {failure?.detail ? (
        <Typography sx={{ fontSize: 11, color: C.muted, mt: 0.5, fontFamily: FONT, overflowWrap: "anywhere" }}>{failure.detail}</Typography>
      ) : null}
      {error && <Alert severity="error" sx={{ mb: 1, textAlign: "start" }}>{error}</Alert>}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {code !== "order_not_payable" && code !== "disabled" && (
          <Button variant="contained" onClick={() => terminal.start(order)} disabled={disabled} startIcon={<Replay />}
            data-testid="terminal-retry" sx={{ fontFamily: FONT, minHeight: 44 }}>
            {t("ui_card.checkout.retry")}
          </Button>
        )}
        <Typography sx={{ fontSize: 12, fontWeight: 800, color: C.sub, fontFamily: FONT, mt: 1 }}>{t("ui_card.checkout.other_way")}</Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button variant="outlined" onClick={() => onSettle("cash")} disabled={disabled} startIcon={<Payments />}
            data-testid="settle-cash" sx={{ fontFamily: FONT, flex: "1 1 120px", minHeight: 44 }}>
            {isRtl ? "نقدی" : "Cash"}
          </Button>
          <Button variant="outlined" onClick={() => onSettle("card")} disabled={disabled} startIcon={<CreditCard />}
            data-testid="settle-card" sx={{ fontFamily: FONT, flex: "1 1 120px", minHeight: 44 }}>
            {isRtl ? "کارت" : "Card"}
          </Button>
          <Button variant="outlined" onClick={() => onSettle("online")} disabled={disabled} startIcon={<Language />}
            data-testid="settle-online" sx={{ fontFamily: FONT, flex: "1 1 120px", minHeight: 44 }}>
            {isRtl ? "آنلاین" : "Online"}
          </Button>
        </Box>
        <Button color="error" onClick={onCancelOrder} disabled={disabled} data-testid="terminal-cancel-order" sx={{ fontFamily: FONT, minHeight: 44 }}>
          {t("ui_card.checkout.cancel_order")}
        </Button>
        <Button size="small" onClick={onLeave} disabled={disabled} sx={{ fontFamily: FONT, color: C.muted }} data-testid="terminal-leave">
          {t("ui_card.checkout.leave")}
        </Button>
      </Box>
    </>
  ));
}
