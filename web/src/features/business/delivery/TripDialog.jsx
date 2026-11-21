import { useState } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Button, TextField, Typography,
  MenuItem, IconButton, Alert, CircularProgress, Checkbox, FormControlLabel,
} from "@mui/material";
import { useRegisteredShortcuts, dialogBindings } from "@shared/common/shortcutKit";
import KbdHint from "@business/pos/common/KbdHint";
import { num, newKey, fmtMoney } from "@business/accounting/common";
import { createTrip, quoteZone, errMsg } from "./api";
import { PRIORITIES } from "./common";

const blankStop = () => ({
  key: newKey(), customer_name: "", phone: "", address: "", lat: "", lng: "",
  reference: "", amount_due: "", weight_kg: "", cargo_description: "", order_id: null,
  invoice_id: null, purchase_id: null, cod: false, stop_type: "delivery",
  packages: "", volume_m3: "", priority: 0, window_start: "", window_end: "", instructions: "", fee: "",
  require_otp: false, require_photo: false, require_signature: false, more: false, quote: null,
});

const blankCargo = () => ({
  shipper_name: "", shipper_phone: "", cargo_description: "", cargo_weight_kg: "",
  origin_name: "", destination_name: "", expected_arrival: "",
});

/**
 * mode "trip": courier/delivery run. mode "shipment": a cargo owner's load (shows the cargo block).
 * initialStops: pre-filled stops (e.g. from the POS dispatch queue; those carry order_id).
 */
export default function TripDialog({ ctx, drivers, vehicles, carriers, onClose, onSaved, mode = "trip", initialStops = null }) {
  const { t, C, S, fullScreen, lang } = ctx;
  const shipment = mode === "shipment";
  const [cargo, setCargo] = useState(blankCargo);
  const [stops, setStops] = useState(() => (initialStops?.length
    ? initialStops.map((s) => ({ ...blankStop(), ...s, key: newKey() }))
    : [blankStop()]));
  const [f, setF] = useState({
    driver_id: "", vehicle_id: "", carrier_id: "", delivery_fee: "", carrier_cost: "", waybill: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setStop = (key, patch) => setStops((l) => l.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const addStop = () => setStops((l) => [...l, blankStop()]);
  const removeStop = (key) => setStops((l) => (l.length > 1 ? l.filter((s) => s.key !== key) : l));
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const setC = (k) => (e) => setCargo((x) => ({ ...x, [k]: e.target.value }));

  // which delivery zone (and fee) a stop falls in, once both coordinates are typed
  const checkZone = (s) => {
    if (s.lat === "" || s.lng === "" || !Number.isFinite(num(s.lat)) || !Number.isFinite(num(s.lng))) return;
    quoteZone({ lat: num(s.lat), lng: num(s.lng), amount: s.amount_due === "" ? undefined : num(s.amount_due) })
      .then((q) => setStop(s.key, { quote: q }))
      .catch(() => setStop(s.key, { quote: null }));
  };

  const submit = async () => {
    if (saving) return;
    setError("");
    for (const s of stops) {
      if (!s.address.trim() && !s.customer_name.trim()) { setError(t("ui_del.trip.stop_required")); return; }
      if ((s.lat !== "") !== (s.lng !== "")) { setError(t("ui_del.trip.coords_both")); return; }
      if (s.amount_due !== "" && !(num(s.amount_due) >= 0)) { setError(t("ui_del.trip.amount_invalid")); return; }
    }
    if (shipment && !cargo.cargo_description.trim()) { setError(t("ui_del.ship.cargo_required")); return; }
    const body = {
      ...(shipment ? {
        shipper_name: cargo.shipper_name.trim(), shipper_phone: cargo.shipper_phone.trim(),
        cargo_description: cargo.cargo_description.trim(),
        cargo_weight_kg: cargo.cargo_weight_kg === "" ? null : num(cargo.cargo_weight_kg),
        origin_name: cargo.origin_name.trim(), destination_name: cargo.destination_name.trim(),
        expected_arrival: cargo.expected_arrival || null,
      } : {}),
      stops: stops.map((s) => ({
        order_id: s.order_id || undefined, invoice_id: s.invoice_id || undefined, purchase_id: s.purchase_id || undefined,
        cod: s.cod || undefined,
        cargo_description: s.cargo_description.trim(),
        customer_name: s.customer_name.trim(), phone: s.phone.trim(), address: s.address.trim(),
        lat: s.lat === "" ? null : num(s.lat), lng: s.lng === "" ? null : num(s.lng),
        reference: s.reference.trim(), amount_due: s.amount_due === "" ? 0 : num(s.amount_due),
        weight_kg: s.weight_kg === "" ? null : num(s.weight_kg),
        packages: s.packages === "" ? undefined : num(s.packages),
        volume_m3: s.volume_m3 === "" ? undefined : num(s.volume_m3),
        priority: Number(s.priority) || 0,
        window_start: s.window_start || undefined, window_end: s.window_end || undefined,
        instructions: s.instructions.trim(), fee: s.fee === "" ? undefined : num(s.fee),
        require_otp: s.require_otp || undefined, require_photo: s.require_photo || undefined,
        require_signature: s.require_signature || undefined,
        ...(s.stop_type === "pickup" ? { stop_type: "pickup" } : {}),
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
      <DialogTitle sx={{ fontWeight: 700 }}>{shipment ? t("ui_del.ship.new_title") : t("ui_del.trip.new_title")}</DialogTitle>
      <DialogContent dividers>
        {shipment && (
          <Box sx={{ border: `1px solid ${C.divider}`, borderRadius: 2, p: 1.5, mb: 2, mt: 0.5 }}>
            <Typography sx={{ fontWeight: 700, color: C.text, mb: 1 }}>{t("ui_del.ship.cargo_block")}</Typography>
            <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" } }}>
              <TextField size="small" label={t("ui_del.ship.shipper")} value={cargo.shipper_name} onChange={setC("shipper_name")} sx={S.field} />
              <TextField size="small" label={t("ui_del.ship.shipper_phone")} value={cargo.shipper_phone} onChange={setC("shipper_phone")} sx={S.field} slotProps={{ htmlInput: { dir: "ltr" } }} />
              <TextField size="small" label={t("ui_del.ship.weight")} value={cargo.cargo_weight_kg} onChange={setC("cargo_weight_kg")} sx={S.field} slotProps={{ htmlInput: { inputMode: "decimal", dir: "ltr" } }} />
              <TextField size="small" type="datetime-local" label={t("ui_del.ship.expected")} value={cargo.expected_arrival} onChange={setC("expected_arrival")} sx={S.field} slotProps={{ inputLabel: { shrink: true }, htmlInput: { dir: "ltr" } }} />
              <TextField size="small" required label={t("ui_del.ship.cargo")} value={cargo.cargo_description} onChange={setC("cargo_description")} sx={{ ...S.field, gridColumn: "1 / -1" }} />
              <TextField size="small" label={t("ui_del.ship.origin")} value={cargo.origin_name} onChange={setC("origin_name")} sx={{ ...S.field, gridColumn: { xs: "1 / -1", sm: "span 2" } }} />
              <TextField size="small" label={t("ui_del.ship.destination")} value={cargo.destination_name} onChange={setC("destination_name")} sx={{ ...S.field, gridColumn: { xs: "1 / -1", sm: "span 2" } }} />
            </Box>
          </Box>
        )}
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
          <Button variant="outlined" sx={S.ghost} onClick={addStop}>+ {t("ui_del.trip.add_stop")}</Button>
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
              {shipment && <TextField size="small" label={t("ui_del.ship.stop_cargo")} value={s.cargo_description} onChange={(e) => setStop(s.key, { cargo_description: e.target.value })} sx={S.field} />}
              <TextField size="small" label={t("ui_del.trip.reference")} value={s.reference} onChange={(e) => setStop(s.key, { reference: e.target.value })} sx={S.field} />
              <TextField size="small" label={t("ui_del.trip.amount_due")} value={s.amount_due} onChange={(e) => setStop(s.key, { amount_due: e.target.value })} sx={S.field} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
              <TextField size="small" label={t("ui_del.trip.address")} value={s.address} onChange={(e) => setStop(s.key, { address: e.target.value })} sx={{ ...S.field, gridColumn: { xs: "1 / -1", sm: "span 2" } }} />
              <TextField size="small" label={t("ui_del.trip.lat")} value={s.lat} onChange={(e) => setStop(s.key, { lat: e.target.value, quote: null })} onBlur={() => checkZone(s)} sx={S.field} slotProps={{ htmlInput: { dir: "ltr", inputMode: "decimal" } }} />
              <TextField size="small" label={t("ui_del.trip.lng")} value={s.lng} onChange={(e) => setStop(s.key, { lng: e.target.value, quote: null })} onBlur={() => checkZone(s)} sx={S.field} slotProps={{ htmlInput: { dir: "ltr", inputMode: "decimal" } }} />
              <TextField size="small" label={t("ui_del.trip.weight")} value={s.weight_kg} onChange={(e) => setStop(s.key, { weight_kg: e.target.value })} sx={S.field} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
            </Box>
            {s.quote && (
              <Typography sx={{ fontSize: 12, mt: 0.75, color: s.quote.deliverable ? C.success : C.danger }}>
                {s.quote.zone_id
                  ? t("dlv.stop.zone_fee", { zone: s.quote.zone_name, fee: fmtMoney(s.quote.fee, lang) })
                  : s.quote.deliverable ? "" : t("dlv.stop.no_zone")}
              </Typography>
            )}
            <Button size="small" onClick={() => setStop(s.key, { more: !s.more })} sx={{ mt: 0.5, color: C.primary, textTransform: "none", px: 0.5 }}>
              {s.more ? t("dlv.stop.less") : t("dlv.stop.more")}
            </Button>
            {s.more && (
              <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" }, mt: 1 }}>
                <TextField select size="small" label={t("dlv.stop.type")} value={s.stop_type} onChange={(e) => setStop(s.key, { stop_type: e.target.value })} sx={S.field} disabled={!!s.purchase_id}>
                  <MenuItem value="delivery">{t("dlv.stop.type_delivery")}</MenuItem>
                  <MenuItem value="pickup">{t("dlv.stop.type_pickup")}</MenuItem>
                </TextField>
                <TextField select size="small" label={t("dlv.stop.priority")} value={s.priority} onChange={(e) => setStop(s.key, { priority: e.target.value })} sx={S.field}>
                  {PRIORITIES.map((p) => <MenuItem key={p} value={p}>{t(`dlv.stop.priority_${p}`)}</MenuItem>)}
                </TextField>
                <TextField size="small" label={t("dlv.stop.packages")} value={s.packages} onChange={(e) => setStop(s.key, { packages: e.target.value })} sx={S.field} slotProps={{ htmlInput: { inputMode: "numeric", dir: "ltr" } }} />
                <TextField size="small" label={t("dlv.stop.volume")} value={s.volume_m3} onChange={(e) => setStop(s.key, { volume_m3: e.target.value })} sx={S.field} slotProps={{ htmlInput: { inputMode: "decimal", dir: "ltr" } }} />
                <TextField size="small" type="datetime-local" label={t("dlv.stop.window_start")} value={s.window_start} onChange={(e) => setStop(s.key, { window_start: e.target.value })} sx={{ ...S.field, gridColumn: { xs: "1 / -1", sm: "span 2" } }} slotProps={{ inputLabel: { shrink: true }, htmlInput: { dir: "ltr" } }} />
                <TextField size="small" type="datetime-local" label={t("dlv.stop.window_end")} value={s.window_end} onChange={(e) => setStop(s.key, { window_end: e.target.value })} sx={{ ...S.field, gridColumn: { xs: "1 / -1", sm: "span 2" } }} slotProps={{ inputLabel: { shrink: true }, htmlInput: { dir: "ltr" } }} />
                <TextField size="small" label={t("dlv.stop.fee")} value={s.fee} placeholder={s.quote?.zone_id ? String(s.quote.fee) : ""} onChange={(e) => setStop(s.key, { fee: e.target.value })} sx={S.field} slotProps={{ htmlInput: { inputMode: "decimal", dir: "ltr" } }} />
                <TextField size="small" label={t("dlv.stop.instructions")} value={s.instructions} onChange={(e) => setStop(s.key, { instructions: e.target.value })} sx={{ ...S.field, gridColumn: { xs: "1 / -1", sm: "span 3" } }} />
                <Box sx={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 1 }}>
                  <Typography sx={{ color: C.sub, fontSize: 12, fontWeight: 700 }}>{t("dlv.stop.proof")}:</Typography>
                  {["require_otp", "require_photo", "require_signature"].map((k) => (
                    <FormControlLabel key={k} sx={{ color: C.text, m: 0 }}
                      control={<Checkbox size="small" checked={!!s[k]} onChange={(e) => setStop(s.key, { [k]: e.target.checked })} />}
                      label={<Typography sx={{ fontSize: 13 }}>{t(`dlv.stop.${k}`)}</Typography>} />
                  ))}
                </Box>
              </Box>
            )}
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
