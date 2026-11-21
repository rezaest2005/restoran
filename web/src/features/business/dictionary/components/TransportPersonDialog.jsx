import { useState } from "react";
import { Box, Typography, TextField, MenuItem, Switch, FormControlLabel } from "@mui/material";
import { FormDialog } from "../common";

const TRANSPORT_SERVICES = ["both", "orders", "cargo"];
const TRANSPORT_VEHICLE_KINDS = ["motorbike", "car", "van", "truck", "other"];
const NEW = "__new";

/** Big tappable option (used for "what do they carry"). */
export function OptionCard({ ctx, selected, onClick, icon, title, hint, disabled }) {
  const { C } = ctx;
  return (
    <Box role="radio" aria-checked={selected} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onClick}
      onKeyDown={(e) => { if (!disabled && (e.key === " " || e.key === "Enter")) { e.preventDefault(); e.stopPropagation(); onClick(); } }}
      sx={{
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, p: 1.5, borderRadius: 2, minWidth: 0,
        border: `2px solid ${selected ? C.primary : C.glassBorder}`, bgcolor: selected ? C.primarySubtle : "transparent",
        transition: "border-color .15s, background-color .15s", outline: "none",
        "&:focus-visible": { boxShadow: `0 0 0 3px ${C.primarySubtle}` },
      }}>
      <Typography sx={{ fontSize: 14, fontWeight: 800, color: selected ? C.primary : C.text }}>
        {icon && <span aria-hidden="true" style={{ marginInlineEnd: 6 }}>{icon}</span>}{title}
      </Typography>
      {hint && <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.25 }}>{hint}</Typography>}
    </Box>
  );
}

/**
 * The ONE form for a transport person (order courier, cargo / unit driver, or both):
 * name, phone, what they carry, vehicle (pick or add right here), pay per trip and sign-in.
 *
 * Used by Definitions → Users & access (mode "users": sign-in required) and by Delivery → Fleet
 * (mode "fleet": sign-in optional, carrier selectable). Both save through the same server service.
 *
 * `person` = driver record from the API (or null for a new one); `onSubmit(body)` saves it.
 */
export default function TransportPersonDialog({ ctx, mode = "users", person, vehicles = [], carriers = [], onSubmit, onClose }) {
  const { t, C, S } = ctx;
  const isEdit = !!person;
  const linked = !!person?.user_id;
  const [f, setF] = useState(() => ({
    name: person?.name || "", phone: person?.phone || "", service: person?.service || "both",
    vehicle: person?.default_vehicle_id ? String(person.default_vehicle_id) : (vehicles.length ? "" : NEW),
    newKind: "motorbike", newPlate: "", pay: person?.pay_per_trip ? String(person.pay_per_trip) : "",
    carrier: person?.carrier_id ? String(person.carrier_id) : "",
    username: person?.username || "", password: "", is_active: person ? person.is_active !== false : true,
  }));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const needSignIn = mode === "users" && !isEdit;
  const wantsSignIn = !linked && (f.username.trim() || f.password);
  const errs = {
    name: !f.name.trim(),
    username: (needSignIn || wantsSignIn) && !linked && !f.username.trim(),
    password: ((needSignIn || wantsSignIn) && !linked && f.password.length < 4) || (f.password !== "" && f.password.length < 4),
    pay: f.pay !== "" && !(Number(f.pay) >= 0),
  };

  const submit = async () => {
    setTouched(true);
    if (Object.values(errs).some(Boolean)) return;
    setSaving(true); setError("");
    const name = f.name.trim();
    const body = {
      name, first_name: name, last_name: "", phone: f.phone.trim(), service: f.service,
      pay_per_trip: f.pay === "" ? 0 : Number(f.pay), is_active: f.is_active,
    };
    if (mode === "users" && !isEdit && f.phone.trim()) body.phone_number = f.phone.trim();
    if (f.vehicle === NEW) {
      if (f.newPlate.trim() || f.newKind) body.new_vehicle = { kind: f.newKind, plate: f.newPlate.trim() };
    } else {
      body.default_vehicle_id = f.vehicle ? Number(f.vehicle) : null;
    }
    if (mode === "fleet") body.carrier_id = f.carrier ? Number(f.carrier) : null;
    if (!linked && f.username.trim()) body.username = f.username.trim();
    if (f.password) body.password = f.password;
    try {
      await onSubmit(body);
    } catch (e) {
      const d = e?.response?.data;
      setError((typeof d?.error === "string" && d.error) || d?.message || e?.message || t("ui_def.common.save_failed"));
    } finally { setSaving(false); }
  };

  const label = (k) => t(`ui_dh.transport.${k}`);
  const heading = (k) => <Typography sx={{ fontSize: 12, fontWeight: 800, color: C.primary }}>{label(k)}</Typography>;

  return (
    <FormDialog ctx={ctx} maxWidth="sm" saving={saving} error={error} onClose={onClose} onSave={submit}
      title={isEdit ? t("ui_dh.transport.edit_title", { name: person.name }) : label("new_title")}
      saveLabel={isEdit ? t("ui_def.common.save") : label("create")}>
      {heading("who")}
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
        <TextField label={label("name")} value={f.name} onChange={(e) => set("name", e.target.value)} size="small" sx={S.field}
          required autoFocus error={touched && errs.name} helperText={touched && errs.name ? t("ui_def.common.required") : ""} />
        <TextField label={label("phone")} value={f.phone} onChange={(e) => set("phone", e.target.value)} size="small" sx={S.field}
          slotProps={{ htmlInput: { dir: "ltr", inputMode: "tel" } }} />
      </Box>

      {heading("service")}
      <Box role="radiogroup" aria-label={label("service")} sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" } }}>
        {TRANSPORT_SERVICES.map((s) => (
          <OptionCard key={s} ctx={ctx} selected={f.service === s} onClick={() => set("service", s)}
            icon={{ both: "🔁", orders: "🛵", cargo: "🚚" }[s]}
            title={t(`ui_dh.transport.services.${s}.title`)} hint={t(`ui_dh.transport.services.${s}.hint`)} />
        ))}
      </Box>

      {heading("vehicle")}
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: f.vehicle === NEW ? "1fr 1fr 1fr" : "1fr 1fr" } }}>
        <TextField select label={label("vehicle")} value={f.vehicle} onChange={(e) => set("vehicle", e.target.value)} size="small" sx={S.field}>
          <MenuItem value="">{label("vehicle_none")}</MenuItem>
          {vehicles.map((v) => <MenuItem key={v.id} value={String(v.id)}>{v.plate ? `${v.name} — ${v.plate}` : v.name}</MenuItem>)}
          <MenuItem value={NEW} sx={{ fontWeight: 700, color: C.primary }}>+ {label("vehicle_new")}</MenuItem>
        </TextField>
        {f.vehicle === NEW && (
          <>
            <TextField select label={label("vehicle_kind")} value={f.newKind} onChange={(e) => set("newKind", e.target.value)} size="small" sx={S.field}>
              {TRANSPORT_VEHICLE_KINDS.map((k) => <MenuItem key={k} value={k}>{t(`ui_del.vehicle_kind.${k}`)}</MenuItem>)}
            </TextField>
            <TextField label={label("plate")} value={f.newPlate} onChange={(e) => set("newPlate", e.target.value)} size="small" sx={S.field} />
          </>
        )}
        {f.vehicle !== NEW && (
          <TextField label={label("pay")} value={f.pay} onChange={(e) => set("pay", e.target.value)} size="small" sx={S.field}
            error={touched && errs.pay} helperText={touched && errs.pay ? t("ui_def.common.invalid_number") : label("pay_hint")}
            slotProps={{ htmlInput: { dir: "ltr", inputMode: "decimal" } }} />
        )}
      </Box>
      {f.vehicle === NEW && (
        <TextField label={label("pay")} value={f.pay} onChange={(e) => set("pay", e.target.value)} size="small" sx={S.field}
          error={touched && errs.pay} helperText={touched && errs.pay ? t("ui_def.common.invalid_number") : label("pay_hint")}
          slotProps={{ htmlInput: { dir: "ltr", inputMode: "decimal" } }} />
      )}
      {mode === "fleet" && carriers.length > 0 && (
        <TextField select label={label("carrier")} value={f.carrier} onChange={(e) => set("carrier", e.target.value)} size="small" sx={S.field}>
          <MenuItem value="">—</MenuItem>
          {carriers.map((c) => <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>)}
        </TextField>
      )}

      {heading("signin")}
      <Typography sx={{ fontSize: 12, color: C.sub, mt: -1 }}>
        {linked ? label("signin_linked") : mode === "fleet" ? label("signin_optional") : label("signin_hint")}
      </Typography>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
        <TextField label={t("ui_def.users.username")} value={f.username} disabled={linked} size="small" sx={S.field}
          required={needSignIn} onChange={(e) => set("username", e.target.value)} error={touched && errs.username}
          helperText={touched && errs.username ? t("ui_def.common.required") : ""}
          slotProps={{ htmlInput: { dir: "ltr", autoComplete: "off" } }} />
        <TextField label={linked ? label("password_new") : t("ui_def.users.password")} type="password" value={f.password} size="small" sx={S.field}
          required={needSignIn} onChange={(e) => set("password", e.target.value)} error={touched && errs.password}
          helperText={touched && errs.password ? t("ui_def.users.password_min") : linked ? label("password_keep") : ""}
          slotProps={{ htmlInput: { autoComplete: "new-password" } }} />
      </Box>

      {isEdit && (
        <FormControlLabel sx={{ color: C.text, m: 0 }} label={label("active")}
          control={<Switch checked={f.is_active} onChange={(e) => set("is_active", e.target.checked)} />} />
      )}
    </FormDialog>
  );
}
