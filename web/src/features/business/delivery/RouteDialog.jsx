import { useEffect, useState } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Alert, CircularProgress, Box,
} from "@mui/material";
import { useRegisteredShortcuts, dialogBindings } from "@shared/common/shortcutKit";
import { fmtInt } from "@business/accounting/common";
import { planRoute, applyRoute, errMsg } from "./api";

/** Preview of the suggested stop order (nearest-neighbour + 2-opt on the server) and apply it. */
export default function RouteDialog({ ctx, trip, onClose, onApplied }) {
  const { t, C, S, lang, fullScreen, notify } = ctx;
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    planRoute(trip.id).then(setPlan).catch((e) => setError(errMsg(e, t("ui_del.common.load_failed"))));
  }, [trip.id, t]);

  const byId = Object.fromEntries((trip.stops || []).map((s) => [s.id, s]));
  const currentOrder = (trip.stops || []).map((s) => s.id);
  const same = plan && plan.order.join(",") === currentOrder.join(",");

  const apply = async () => {
    if (busy || !plan || same) return;
    setBusy(true);
    try {
      await applyRoute(trip.id);
      notify(t("dlv.route.applied"));
      onApplied();
    } catch (e) {
      setError(errMsg(e, t("ui_del.common.save_failed")));
    } finally { setBusy(false); }
  };

  useRegisteredShortcuts(dialogBindings(t, { confirmLabel: t("dlv.route.apply"), onConfirm: apply, onClose, enter: false }));
  const km = (v) => Number(v).toLocaleString(lang === "fa" ? "fa-IR" : "en-US", { maximumFractionDigits: 1 });

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth slotProps={{ paper: { sx: S.dialogPaper } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{t("dlv.route.title")}</DialogTitle>
      <DialogContent dividers>
        {!plan && !error && <CircularProgress size={22} />}
        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
        {plan && (
          <>
            <Typography sx={{ color: C.text, fontWeight: 700, mb: 1 }}>
              {t("dlv.route.km", { before: km(plan.km_before), after: km(plan.km_after) })}
            </Typography>
            {same && <Alert severity="success" sx={{ mb: 1 }}>{t("dlv.route.same")}</Alert>}
            {plan.late.length > 0 && <Alert severity="warning" sx={{ mb: 1 }}>{t("dlv.route.late", { n: fmtInt(plan.late.length, lang) })}</Alert>}
            <Box component="ol" sx={{ m: 0, ps: 3, color: C.text }}>
              {plan.order.map((id) => {
                const s = byId[id];
                if (!s) return null;
                return (
                  <li key={id} style={{ marginBottom: 4, color: plan.late.includes(id) ? C.warning : undefined }}>
                    <Typography component="span" sx={{ fontSize: 14 }}>{s.customer_name || s.address || `#${s.sequence}`}</Typography>
                    {s.priority > 0 && <Typography component="span" sx={{ fontSize: 12, color: C.danger }}> · {t(`dlv.stop.priority_${s.priority}`)}</Typography>}
                    <Typography component="span" sx={{ fontSize: 12, color: C.sub }}> ({t("ui_del.trip.stop_n", { n: s.sequence })})</Typography>
                  </li>
                );
              })}
            </Box>
            <Typography sx={{ color: C.muted, fontSize: 11, mt: 1.5 }}>{t("dlv.route.note")}</Typography>
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="outlined" sx={S.ghost} onClick={onClose} disabled={busy}>{t("ui_del.common.cancel")}</Button>
        <Button variant="contained" sx={S.btn} onClick={apply} disabled={busy || !plan || same}>
          {busy ? <CircularProgress size={18} color="inherit" /> : t("dlv.route.apply")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
