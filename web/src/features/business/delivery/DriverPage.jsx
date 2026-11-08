import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Box, Typography, Button, Alert, Snackbar, TextField, CircularProgress, Dialog, DialogTitle,
  DialogContent, DialogActions, Chip,
} from "@mui/material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import { buildColors } from "@shared/palette";
import { useRegisteredShortcuts, dialogBindings } from "@shared/common/shortcutKit";
import { fmtMoney, fmtInt, num } from "@business/accounting/common";
import { fetchDriverMe, setMyShift, setMyStopStatus, sendMyLocation, errMsg } from "./api";
import { PAY_METHODS, routeUrl, fmtTime } from "./common";

const SEND_EVERY_MS = 10000;
const REFRESH_MS = 30000;
const NEXT = { pending: "picked_up", picked_up: "arrived", arrived: "delivered" };
const ACTIVE_TRIP = ["assigned", "in_progress"];
const OPEN_STOP = ["pending", "picked_up", "arrived"];

function FailDialog({ t, C, onClose, onSubmit, busy }) {
  const [reason, setReason] = useState("");
  const submit = () => { if (reason.trim() && !busy) onSubmit(reason.trim()); };
  useRegisteredShortcuts(dialogBindings(t, {
    confirmLabel: t("ui_del.driver.fail_submit"), onConfirm: submit, onClose, enter: false,
  }));
  const reasons = ["fail_absent", "fail_refused", "fail_address", "fail_other"];
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" PaperProps={{ sx: { bgcolor: C.surface, color: C.text, backgroundImage: "none" } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{t("ui_del.driver.fail_title")}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2, mt: 0.5 }}>
          {reasons.map((r) => (
            <Chip key={r} label={t(`ui_del.driver.${r}`)} onClick={() => setReason(t(`ui_del.driver.${r}`))}
              sx={{ fontSize: 14, height: 36, color: C.text, border: `1px solid ${C.divider}`, bgcolor: "transparent" }} />
          ))}
        </Box>
        <TextField
          fullWidth multiline minRows={2} autoFocus value={reason} onChange={(e) => setReason(e.target.value)}
          label={t("ui_del.driver.fail_reason")}
          sx={{ "& .MuiInputBase-root": { bgcolor: C.inputBg, color: C.text }, "& .MuiInputLabel-root": { color: C.sub } }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ color: C.sub, minHeight: 44 }}>{t("ui_del.common.cancel")}</Button>
        <Button onClick={submit} disabled={!reason.trim() || busy} variant="contained"
          sx={{ bgcolor: C.danger, color: C.onPrimary, minHeight: 44, fontWeight: 700, "&:hover": { bgcolor: C.danger } }}>
          {t("ui_del.driver.fail_submit")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function DriverPage() {
  const { t } = useTranslation();
  const { mode } = useThemeMode();
  const { isRtl, lang } = useLang();
  const C = useMemo(() => buildColors(mode === "dark"), [mode]);

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failOpen, setFailOpen] = useState(false);
  const [collected, setCollected] = useState("");
  const [method, setMethod] = useState("");
  const [formFor, setFormFor] = useState("");
  const [geo, setGeo] = useState(() => ("geolocation" in navigator ? "pending" : "unsupported"));   // pending | on | denied | unsupported
  const [toast, setToast] = useState({ open: false, msg: "", sev: "success" });
  const lastPos = useRef(null);
  const lastSent = useRef(0);

  const notify = useCallback((msg, sev = "success") => setToast({ open: true, msg, sev }), []);

  const load = useCallback(() => {
    fetchDriverMe()
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError(e?.response?.status === 404 ? t("ui_del.driver.no_profile") : errMsg(e, t("ui_del.common.load_failed"))))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  // GPS: send at most once per SEND_EVERY_MS while the page is open
  useEffect(() => {
    if (!("geolocation" in navigator)) return undefined;
    const wid = navigator.geolocation.watchPosition(
      (pos) => {
        setGeo("on");
        const c = pos.coords;
        lastPos.current = { lat: c.latitude, lng: c.longitude };
        const now = Date.now();
        if (now - lastSent.current < SEND_EVERY_MS) return;
        lastSent.current = now;
        sendMyLocation({
          lat: c.latitude, lng: c.longitude,
          speed_kmh: c.speed != null ? Math.round(c.speed * 3.6 * 10) / 10 : null,
          heading: c.heading != null && !Number.isNaN(c.heading) ? Math.round(c.heading) : null,
          accuracy_m: c.accuracy != null ? Math.round(c.accuracy * 10) / 10 : null,
        }).catch(() => {});
      },
      (err) => setGeo(err.code === 1 ? "denied" : "pending"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(wid);
  }, []);

  // صفحه روشن بماند تا GPS قطع نشود (در مرورگرهای پشتیبان)
  useEffect(() => {
    let lock = null;
    const acquire = async () => {
      try { if ("wakeLock" in navigator && !document.hidden) lock = await navigator.wakeLock.request("screen"); } catch { /* ignore */ }
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => { document.removeEventListener("visibilitychange", acquire); lock?.release?.().catch(() => {}); };
  }, []);

  let current = null;
  let remaining = 0;
  (data?.trips || []).forEach((trip) => {
    if (!ACTIVE_TRIP.includes(trip.status)) return;
    const open = trip.stops.filter((s) => OPEN_STOP.includes(s.status));
    remaining += open.length;
    if (!current && open.length) current = { trip, stop: open[0] };
  });

  // reset the collection form when the current stop changes
  const formKey = current ? `${current.stop.id}|${current.stop.amount_due}` : "";
  if (formKey !== formFor) {
    setFormFor(formKey);
    setCollected(current && current.stop.amount_due ? String(current.stop.amount_due) : "");
    setMethod("");
  }

  const toggleShift = async () => {
    setBusy(true);
    try {
      await setMyShift(!data.on_shift);
      load();
    } catch (e) {
      notify(errMsg(e, t("ui_del.common.save_failed")), "error");
    } finally { setBusy(false); }
  };

  const act = async (status, extra = {}) => {
    if (!current || busy) return;
    setBusy(true);
    try {
      await setMyStopStatus(current.stop.id, { status, ...(lastPos.current || {}), ...extra });
      setFailOpen(false);
      notify(t("ui_del.driver.updated"));
      load();
    } catch (e) {
      notify(errMsg(e, t("ui_del.common.save_failed")), "error");
    } finally { setBusy(false); }
  };

  const amount = num(collected);
  const needsMethod = current?.stop.status === "arrived" && amount > 0 && !method;
  const primary = () => {
    const next = NEXT[current.stop.status];
    if (next === "delivered") {
      if (!(amount >= 0)) { notify(t("ui_del.cash.amount_invalid"), "error"); return; }
      if (needsMethod) { notify(t("ui_del.driver.pick_method"), "warning"); return; }
      act("delivered", { collected_amount: amount || 0, collected_method: amount > 0 ? method : "" });
    } else {
      act(next);
    }
  };

  useRegisteredShortcuts([
    { combo: "Ctrl+D", label: t("ui_del.driver.next_action"), handler: () => { if (current && !failOpen) primary(); } },
  ], { enabled: !failOpen });

  const bigBtn = (bg) => ({
    width: "100%", minHeight: 76, fontSize: 22, fontWeight: 800, borderRadius: 3, textTransform: "none",
    background: bg, color: C.onPrimary, "&:hover": { background: bg, opacity: 0.92 }, "&.Mui-disabled": { opacity: 0.5, color: C.onPrimary },
  });
  const card = { bgcolor: C.glass, border: `1px solid ${C.glassBorder}`, borderRadius: 3, p: 2, boxShadow: C.cardShadow };

  const geoBanner = geo === "denied" || geo === "unsupported"
    ? <Alert severity="warning" sx={{ mb: 2 }}>{t(geo === "denied" ? "ui_del.driver.geo_denied" : "ui_del.driver.geo_unsupported")}</Alert>
    : geo === "pending"
      ? <Alert severity="info" sx={{ mb: 2 }}>{t("ui_del.driver.geo_waiting")}</Alert>
      : null;

  const s = current?.stop;
  const actionLabel = s ? t(`ui_del.driver.action_${NEXT[s.status]}`) : "";

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ minHeight: "100vh", bgcolor: C.bg, p: 2, pb: 6, maxWidth: 520, mx: "auto", fontFamily: "'Vazirmatn', sans-serif" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 2 }}>
        <Box>
          <Typography sx={{ color: C.text, fontWeight: 800, fontSize: 20 }}>{data?.driver?.name || t("ui_del.driver.title")}</Typography>
          <Typography sx={{ color: C.sub, fontSize: 12 }}>{data?.business}</Typography>
        </Box>
        {data && (
          <Button onClick={toggleShift} disabled={busy} sx={{
            minHeight: 48, px: 2.5, borderRadius: 3, fontWeight: 700, textTransform: "none",
            bgcolor: data.on_shift ? C.successBg : C.warningBg, color: data.on_shift ? C.success : C.warning,
            border: `1px solid ${data.on_shift ? C.success : C.warning}`,
          }}>
            {data.on_shift ? t("ui_del.driver.shift_end") : t("ui_del.driver.shift_start")}
          </Button>
        )}
      </Box>

      {geoBanner}
      {loading && <Box sx={{ textAlign: "center", py: 6 }}><CircularProgress /></Box>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {data && !current && (
        <Box sx={{ ...card, textAlign: "center", py: 5 }}>
          <Typography sx={{ fontSize: 40 }}>✅</Typography>
          <Typography sx={{ color: C.text, fontWeight: 700, fontSize: 18 }}>{t("ui_del.driver.no_stops")}</Typography>
        </Box>
      )}

      {current && (
        <Box sx={{ display: "grid", gap: 2 }}>
          <Typography sx={{ color: C.sub, fontSize: 13 }}>
            TR-{fmtInt(current.trip.number, lang)} · {t("ui_del.driver.remaining", { n: fmtInt(remaining, lang) })}
          </Typography>

          <Box sx={card}>
            <Typography sx={{ color: C.text, fontWeight: 800, fontSize: 22 }}>{s.customer_name || t("ui_del.driver.customer")}</Typography>
            {s.phone && (
              <Button component="a" href={`tel:${s.phone}`} sx={{ mt: 1, minHeight: 48, fontSize: 18, fontWeight: 700, color: C.primary, justifyContent: "flex-start", textTransform: "none" }} dir="ltr">
                📞 {s.phone}
              </Button>
            )}
            <Typography sx={{ color: C.text, fontSize: 16, mt: 1 }}>{s.address || "—"}</Typography>
            {s.eta && <Typography sx={{ color: C.sub, fontSize: 12, mt: 0.5 }}>{t("ui_del.dispatch.eta")}: {fmtTime(s.eta, lang)}</Typography>}
            <Button
              component="a" href={routeUrl(s)} target="_blank" rel="noreferrer" variant="outlined"
              sx={{ mt: 1.5, minHeight: 52, width: "100%", fontSize: 16, fontWeight: 700, color: C.primary, borderColor: C.primary, borderRadius: 2, textTransform: "none" }}
            >
              🧭 {t("ui_del.driver.open_route")}
            </Button>
          </Box>

          {s.amount_due > 0 && (
            <Box sx={card}>
              <Typography sx={{ color: C.sub, fontSize: 13 }}>{t("ui_del.driver.to_collect")}</Typography>
              <Typography sx={{ color: C.text, fontWeight: 800, fontSize: 30 }}>{fmtMoney(s.amount_due, lang)}</Typography>
              {s.status === "arrived" && (
                <>
                  <TextField
                    fullWidth value={collected} onChange={(e) => setCollected(e.target.value)} label={t("ui_del.driver.collected")}
                    inputProps={{ inputMode: "decimal", dir: "ltr", style: { fontSize: 20 } }} sx={{ mt: 1.5, "& .MuiInputBase-root": { bgcolor: C.inputBg, color: C.text }, "& .MuiInputLabel-root": { color: C.sub } }}
                  />
                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mt: 1.5 }}>
                    {PAY_METHODS.map((m) => (
                      <Button key={m} onClick={() => setMethod(m)} sx={{
                        minHeight: 52, fontSize: 15, fontWeight: 700, borderRadius: 2, textTransform: "none",
                        color: method === m ? C.onPrimary : C.text, bgcolor: method === m ? C.primary : "transparent",
                        border: `1px solid ${method === m ? C.primary : C.divider}`, "&:hover": { bgcolor: method === m ? C.primary : C.primarySubtle },
                      }}>
                        {t(`ui_del.method.${m}`)}
                      </Button>
                    ))}
                  </Box>
                </>
              )}
            </Box>
          )}

          <Button onClick={primary} disabled={busy} sx={bigBtn(C.btnGrad)}>
            {busy ? <CircularProgress size={28} color="inherit" /> : actionLabel}
          </Button>
          <Button onClick={() => setFailOpen(true)} disabled={busy} sx={{ minHeight: 56, fontSize: 16, fontWeight: 700, color: C.danger, border: `1px solid ${C.danger}`, borderRadius: 3, textTransform: "none" }}>
            {t("ui_del.driver.action_failed")}
          </Button>
        </Box>
      )}

      {data && (
        <Box sx={{ ...card, mt: 3 }}>
          <Typography sx={{ color: C.sub, fontSize: 13 }}>{t("ui_del.driver.uncollected")}</Typography>
          <Typography sx={{ color: C.text, fontWeight: 800, fontSize: 22 }}>{fmtMoney(data.uncollected_cash, lang)}</Typography>
        </Box>
      )}

      {failOpen && <FailDialog t={t} C={C} busy={busy} onClose={() => setFailOpen(false)} onSubmit={(r) => act("failed", { failure_reason: r })} />}

      <Snackbar
        open={toast.open} autoHideDuration={3500} onClose={() => setToast((x) => ({ ...x, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={toast.sev} variant="filled" onClose={() => setToast((x) => ({ ...x, open: false }))}>{toast.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
