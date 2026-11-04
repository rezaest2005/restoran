import { useState } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Button, TextField, Typography,
  MenuItem, IconButton, Alert, CircularProgress,
} from "@mui/material";
import { useRegisteredShortcuts, dialogBindings } from "@shared/common/shortcutKit";
import KbdHint from "@business/pos/common/KbdHint";
import { num, newKey } from "@business/accounting/common";
import { createTrip, errMsg } from "./api";

const blankStop = () => ({
  key: newKey(), customer_name: "", phone: "", address: "", lat: "", lng: "",
  reference: "", amount_due: "", weight_kg: "",
});

export default function TripDialog({ ctx, drivers, vehicles, carriers, onClose, onSaved }) {
  const { t, C, S, fullScreen } = ctx;
  const [stops, setStops] = useState([blankStop()]);
  const [f, setF] = useState({
    driver_id: "", vehicle_id: "", carrier_id: "", delivery_fee: "", carrier_cost: "", waybill: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setStop = (key, patch) => setStops((l) => l.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const addStop = () => setStops((l) => [...l, blankStop()]);
  const removeStop = (key) => setStops((l) => (l.length > 1 ? l.filter((s) => s.key !== key) : l));
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async () => {
    if (saving) return;
    setError("");
    for (const s of stops) {
      if (!s.address.trim() && !s.customer_name.trim()) { setError(t("ui_del.trip.stop_required")); return; }
      if ((s.lat !== "") !== (s.lng !== "")) { setError(t("ui_del.trip.coords_both")); return; }
      if (s.amount_due !== "" && !(num(s.amount_due) >= 0)) { setError(t("ui_del.trip.amount_invalid")); return; }
    }
    const body = {
      stops: stops.map((s) => ({
        customer_name: s.customer_name.trim(), phone: s.phone.trim(), address: s.address.trim(),
        lat: s.lat === "" ? null : num(s.lat), lng: s.lng === "" ? null : num(s.lng),
        reference: s.reference.trim(), amount_due: s.amount_due === "" ? 0 : num(s.amount_due),
        weight_kg: s.weight_kg === "" ? null : num(s.weight_kg),
      })),
      driver_id: f.driver_id || null, vehicle_id: f.vehicle_id || null, carrier_id: f.carrier_id || null,
      delivery_fee: f.delivery_fee === "" ? 0 : num(f.delivery_fee),
      carrier_cost: f.carrier_cost === "" ? 0 : num(f.carrier_cost),
      waybill: f.waybill.trim(), notes: f.notes.trim(),
    };
    setSaving(true);
    try {
      const trip = await createTrip(body);
      onSaved(trip);
    } catch (e) {
      setError(errMsg(e, t("ui_del.common.save_failed")));
    } finally {
      setSaving(false);
    }
  };

  useRegisteredShortcuts([
    ...dialogBindings(t, {
      confirmLabel: t("ui_del.trip.submit"), onConfirm: submit, enter: false,
      onClose: () => { if (!saving) onClose(); },
    }),
    { combo: "F3", label: t("ui_del.keys.add_stop"), handler: addStop, scope: "dialog" },
  ]);

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullScreen={fullScreen} maxWidth="md" fullWidth slotProps={{ paper: { sx: S.dialogPaper } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{t("ui_del.trip.new_title")}</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, mb: 2, mt: 0.5 }}>
          <TextField select size="small" label={t("ui_del.trip.driver")} value={f.driver_id} onChange={set("driver_id")} sx={S.field}>
            <MenuItem value="">{t("ui_del.trip.unassigned")}</MenuItem>
            {drivers.filter((d) => d.is_active).map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
          </TextField>
          <TextField select size="small" label={t("ui_del.trip.vehicle")} value={f.vehicle_id} onChange={set("vehicle_id")} sx={S.field}>
            <MenuItem value="">{t("ui_del.trip.auto")}</MenuItem>
            {vehicles.filter((v) => v.is_active).map((v) => <MenuItem key={v.id} value={v.id}>{v.name} {v.plate}</MenuItem>)}
          </TextField>
          <TextField select size="small" label={t("ui_del.trip.carrier")} value={f.carrier_id} onChange={set("carrier_id")} sx={S.field}>
            <MenuItem value="">—</MenuItem>
            {carriers.filter((c) => c.is_active).map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </TextField>
          <TextField size="small" label={t("ui_del.trip.delivery_fee")} value={f.delivery_fee} onChange={set("delivery_fee")} sx={S.field} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
          <TextField size="small" label={t("ui_del.trip.carrier_cost")} value={f.carrier_cost} onChange={set("carrier_cost")} sx={S.field} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
          <TextField size="small" label={t("ui_del.trip.waybill")} value={f.waybill} onChange={set("waybill")} sx={S.field} />
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
          <Typography sx={{ fontWeight: 700, color: C.text }}>{t("ui_del.trip.stops")}</Typography>
          <Button variant="outlined" sx={S.ghost} onClick={addStop}>+ {t("ui_del.trip.add_stop")}<KbdHint>F3</KbdHint></Button>
        </Box>
        {stops.map((s, i) => (
          <Box key={s.key} sx={{ border: `1px solid ${C.divider}`, borderRadius: 2, p: 1.5, mb: 1.5 }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
              <Typography sx={{ color: C.sub, fontSize: 12, fontWeight: 700 }}>{t("ui_del.trip.stop_n", { n: i + 1 })}</Typography>
              <IconButton size="small" disabled={stops.length === 1} onClick={() => removeStop(s.key)} aria-label={t("ui_del.trip.remove_stop")} sx={{ color: C.danger }}>✕</IconButton>
            </Box>
            <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" } }}>
              <TextField size="small" label={t("ui_del.trip.customer")} value={s.customer_name} onChange={(e) => setStop(s.key, { customer_name: e.target.value })} sx={S.field} />
              <TextField size="small" label={t("ui_del.trip.phone")} value={s.phone} onChange={(e) => setStop(s.key, { phone: e.target.value })} sx={S.field} slotProps={{ htmlInput: { dir: "ltr", inputMode: "tel" } }} />
              <TextField size="small" label={t("ui_del.trip.reference")} value={s.reference} onChange={(e) => setStop(s.key, { reference: e.target.value })} sx={S.field} />
              <TextField size="small" label={t("ui_del.trip.amount_due")} value={s.amount_due} onChange={(e) => setStop(s.key, { amount_due: e.target.value })} sx={S.field} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
              <TextField size="small" label={t("ui_del.trip.address")} value={s.address} onChange={(e) => setStop(s.key, { address: e.target.value })} sx={{ ...S.field, gridColumn: { xs: "1 / -1", sm: "span 2" } }} />
              <TextField size="small" label={t("ui_del.trip.lat")} value={s.lat} onChange={(e) => setStop(s.key, { lat: e.target.value })} sx={S.field} slotProps={{ htmlInput: { dir: "ltr", inputMode: "decimal" } }} />
              <TextField size="small" label={t("ui_del.trip.lng")} value={s.lng} onChange={(e) => setStop(s.key, { lng: e.target.value })} sx={S.field} slotProps={{ htmlInput: { dir: "ltr", inputMode: "decimal" } }} />
              <TextField size="small" label={t("ui_del.trip.weight")} value={s.weight_kg} onChange={(e) => setStop(s.key, { weight_kg: e.target.value })} sx={S.field} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
            </Box>
          </Box>
        ))}
        <TextField size="small" fullWidth multiline minRows={2} label={t("ui_del.trip.notes")} value={f.notes} onChange={set("notes")} sx={S.field} />
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="outlined" sx={S.ghost} onClick={onClose} disabled={saving}>{t("ui_del.common.cancel")}</Button>
        <Button variant="contained" sx={S.btn} onClick={submit} disabled={saving}>
          {saving ? <CircularProgress size={18} color="inherit" /> : <>{t("ui_del.trip.submit")}<KbdHint>Ctrl+D</KbdHint></>}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
