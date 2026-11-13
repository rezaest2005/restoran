import { useState } from "react";
import {
  Box, Typography, Button, Table, TableHead, TableBody, TableRow, TableCell, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, FormControlLabel, Switch, Alert, Chip, CircularProgress,
} from "@mui/material";
import { useRegisteredShortcuts, dialogBindings } from "@shared/common/shortcutKit";
import KbdHint from "@business/pos/common/KbdHint";
import { TableWrap, ConfirmDialog, fmtMoney, fmtInt, num } from "@business/accounting/common";
import { vehiclesApi, carriersApi, driversApi, setDriverShift, errMsg } from "./api";
import { VEHICLE_KINDS } from "./common";
import DriverLinkCard from "./DriverLinkCard";
import CopyLink from "./CopyLink";
import { appUrl } from "@shared/basePath";

/** Generic edit dialog: `fields` = [{ key, label, type?: "text"|"number"|"select"|"switch", options? }]. */
function EditDialog({ ctx, title, fields, initial, onClose, onSave }) {
  const { t, S, fullScreen } = ctx;
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await onSave(v);
    } catch (e) {
      setError(errMsg(e, t("ui_del.common.save_failed")));
    } finally {
      setSaving(false);
    }
  };

  useRegisteredShortcuts(dialogBindings(t, {
    confirmLabel: t("ui_del.common.save"), onConfirm: submit,
    onClose: () => { if (!saving) onClose(); },
  }));

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullScreen={fullScreen} maxWidth="xs" fullWidth PaperProps={{ sx: S.dialogPaper }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{title}</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: "grid", gap: 1.5, mt: 0.5 }}>
          {fields.map((fd) => {
            const f = fd.readOnlyWhenLinked && initial?.__linked ? { ...fd, readOnly: true } : fd;
            if (f.type === "switch") {
              return (
                <FormControlLabel
                  key={f.key} label={f.label}
                  control={<Switch checked={!!v[f.key]} onChange={(e) => setV((x) => ({ ...x, [f.key]: e.target.checked }))} />}
                />
              );
            }
            return (
              <TextField
                key={f.key} size="small" label={f.label} value={v[f.key] ?? ""} select={f.type === "select"}
                disabled={!!f.readOnly} type={f.type === "password" ? "password" : undefined}
                autoComplete={f.type === "password" ? "new-password" : undefined} helperText={f.hint}
                onChange={(e) => setV((x) => ({ ...x, [f.key]: e.target.value }))} sx={S.field}
                inputProps={f.type === "number" ? { inputMode: "decimal", dir: "ltr" } : undefined}
              >
                {f.type === "select" && f.options.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </TextField>
            );
          })}
        </Box>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="outlined" sx={S.ghost} onClick={onClose} disabled={saving}>{t("ui_del.common.cancel")}</Button>
        <Button variant="contained" sx={S.btn} onClick={submit} disabled={saving}>
          {saving ? <CircularProgress size={18} color="inherit" /> : <>{t("ui_del.common.save")}<KbdHint>Ctrl+D</KbdHint></>}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const numOrNull = (x) => (x === "" || x == null ? null : num(x));

export default function FleetTab({ ctx, vehicles, carriers, drivers, reloadFleet }) {
  const { t, C, S, lang, notify } = ctx;
  const [edit, setEdit] = useState(null);       // { kind, row|null }
  const [del, setDel] = useState(null);         // { kind, row }
  const [busy, setBusy] = useState(false);
  const [delError, setDelError] = useState("");

  useRegisteredShortcuts([
    { combo: "F2", label: t("ui_del.keys.new_driver"), handler: () => setEdit({ kind: "driver", row: null }) },
  ], { enabled: !edit && !del });

  const kindOpts = VEHICLE_KINDS.map((k) => ({ value: k, label: t(`ui_del.vehicle_kind.${k}`) }));
  const carrierOpts = [{ value: "", label: "—" }, ...carriers.map((c) => ({ value: c.id, label: c.name }))];
  const vehicleOpts = [{ value: "", label: "—" }, ...vehicles.map((x) => ({ value: x.id, label: x.name }))];

  const defs = {
    vehicle: {
      api: vehiclesApi,
      title: t("ui_del.fleet.vehicle"),
      fields: [
        { key: "name", label: t("ui_del.fleet.name") },
        { key: "plate", label: t("ui_del.fleet.plate") },
        { key: "kind", label: t("ui_del.fleet.kind"), type: "select", options: kindOpts },
        { key: "capacity_kg", label: t("ui_del.fleet.capacity_kg"), type: "number" },
        { key: "capacity_m3", label: t("ui_del.fleet.capacity_m3"), type: "number" },
        { key: "is_active", label: t("ui_del.common.active"), type: "switch" },
      ],
      blank: { name: "", plate: "", kind: "motorbike", capacity_kg: "", capacity_m3: "", is_active: true },
      toBody: (v) => ({ ...v, capacity_kg: numOrNull(v.capacity_kg), capacity_m3: numOrNull(v.capacity_m3) }),
    },
    carrier: {
      api: carriersApi,
      title: t("ui_del.fleet.carrier"),
      fields: [
        { key: "name", label: t("ui_del.fleet.name") },
        { key: "phone", label: t("ui_del.fleet.phone") },
        { key: "notes", label: t("ui_del.fleet.notes") },
        { key: "is_external", label: t("ui_del.fleet.external"), type: "switch" },
        { key: "is_active", label: t("ui_del.common.active"), type: "switch" },
      ],
      blank: { name: "", phone: "", notes: "", is_external: false, is_active: true },
      toBody: (v) => v,
    },
    driver: {
      api: driversApi,
      title: t("ui_del.fleet.driver"),
      fields: [
        { key: "name", label: t("ui_del.fleet.name") },
        { key: "phone", label: t("ui_del.fleet.phone") },
        { key: "carrier_id", label: t("ui_del.trip.carrier"), type: "select", options: carrierOpts },
        { key: "default_vehicle_id", label: t("ui_del.fleet.default_vehicle"), type: "select", options: vehicleOpts },
        { key: "pay_per_trip", label: t("ui_del.fleet.pay_per_trip"), type: "number" },
        { key: "username", label: t("ui_del.fleet.username"), hint: t("ui_del.fleet.account_hint"), readOnlyWhenLinked: true },
        { key: "password", label: t("ui_del.fleet.password"), type: "password" },
        { key: "is_active", label: t("ui_del.common.active"), type: "switch" },
      ],
      blank: { name: "", phone: "", carrier_id: "", default_vehicle_id: "", pay_per_trip: "", username: "", password: "", is_active: true },
      toBody: (v) => {
        const body = {
          ...v, carrier_id: v.carrier_id || null, default_vehicle_id: v.default_vehicle_id || null,
          pay_per_trip: numOrNull(v.pay_per_trip) ?? 0,
        };
        delete body.__linked;
        if (!body.password) delete body.password;
        return body;
      },
    },
  };

  const save = async (kind, row, v) => {
    const d = defs[kind];
    const body = d.toBody(v);
    if (row) await d.api.update(row.id, body);
    else await d.api.create(body);
    setEdit(null);
    notify(t("ui_del.common.saved"));
    reloadFleet();
  };

  const remove = async () => {
    setBusy(true);
    setDelError("");
    try {
      await defs[del.kind].api.remove(del.row.id);
      setDel(null);
      notify(t("ui_del.common.deleted"));
      reloadFleet();
    } catch (e) {
      setDelError(errMsg(e, t("ui_del.common.save_failed")));
    } finally { setBusy(false); }
  };

  const toggleShift = async (d) => {
    try {
      await setDriverShift(d.id, !d.on_shift);
      reloadFleet();
    } catch (e) {
      notify(errMsg(e, t("ui_del.common.save_failed")), "error");
    }
  };

  const rowActions = (kind, row) => (
    <TableCell sx={S.td} align="end">
      <Button size="small" sx={S.link} onClick={() => setEdit({ kind, row })}>{t("ui_del.common.edit")}</Button>
      <Button size="small" sx={{ ...S.link, color: C.danger }} onClick={() => { setDelError(""); setDel({ kind, row }); }}>{t("ui_del.common.delete")}</Button>
    </TableCell>
  );

  const section = (kind, heading, head, rows, renderRow) => (
    <Box sx={{ ...S.card, mb: 2 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
        <Typography sx={{ fontWeight: 800, color: C.text }}>{heading}</Typography>
        <Button sx={S.btn} onClick={() => setEdit({ kind, row: null })}>+ {t("ui_del.common.add")}</Button>
      </Box>
      <TableWrap C={C}>
        <Table size="small">
          <TableHead><TableRow>{head.map((h) => <TableCell key={h} sx={S.th}>{h}</TableCell>)}<TableCell sx={S.th} /></TableRow></TableHead>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell sx={{ ...S.td, color: C.muted }} colSpan={head.length + 1}>{t("ui_del.common.empty")}</TableCell></TableRow>}
            {rows.map(renderRow)}
          </TableBody>
        </Table>
      </TableWrap>
    </Box>
  );

  const activeChip = (on) => (
    <Chip size="small" label={on ? t("ui_del.common.active") : t("ui_del.common.inactive")}
      sx={{ height: 22, fontSize: 11, color: on ? C.success : C.muted, bgcolor: on ? C.successBg : "transparent", border: `1px solid ${on ? C.success : C.divider}` }} />
  );

  const editing = edit ? defs[edit.kind] : null;
  const initialOf = (kind, row) => {
    if (!row) return defs[kind].blank;
    const out = { ...defs[kind].blank };
    Object.keys(out).forEach((k) => { out[k] = row[k] ?? out[k]; });
    if (kind === "driver" && row.user_id) out.__linked = true;   // already has a sign-in: the username is shown, not edited
    return out;
  };

  return (
    <Box>
      <DriverLinkCard ctx={ctx} />
      {section("driver", t("ui_del.fleet.drivers"),
        [t("ui_del.fleet.number"), t("ui_del.fleet.name"), t("ui_del.fleet.username"), t("ui_del.fleet.phone"), t("ui_del.fleet.pay_per_trip"), t("ui_del.fleet.link"), t("ui_del.fleet.shift"), t("ui_del.common.status")],
        drivers, (d) => (
          <TableRow key={d.id}>
            <TableCell sx={{ ...S.td, fontWeight: 800 }}>{d.number ? fmtInt(d.number, lang) : "—"}</TableCell>
            <TableCell sx={S.td}>{d.name}</TableCell>
            <TableCell sx={S.td} dir="ltr">{d.username || "—"}</TableCell>
            <TableCell sx={S.td} dir="ltr">{d.phone}</TableCell>
            <TableCell sx={S.td}>{fmtMoney(d.pay_per_trip, lang)}</TableCell>
            <TableCell sx={S.td}>
              <CopyLink url={appUrl(d.link_path)} label={t("ui_del.fleet.copy_link")} doneLabel={t("ui_del.ship.copied")} />
            </TableCell>
            <TableCell sx={S.td}>
              <Button size="small" sx={S.link} onClick={() => toggleShift(d)}>
                {d.on_shift ? t("ui_del.fleet.shift_end") : t("ui_del.fleet.shift_start")}
              </Button>
            </TableCell>
            <TableCell sx={S.td}>{activeChip(d.is_active)}</TableCell>
            {rowActions("driver", d)}
          </TableRow>
        ))}
      {section("vehicle", t("ui_del.fleet.vehicles"),
        [t("ui_del.fleet.name"), t("ui_del.fleet.plate"), t("ui_del.fleet.kind"), t("ui_del.fleet.capacity_kg"), t("ui_del.common.status")],
        vehicles, (v) => (
          <TableRow key={v.id}>
            <TableCell sx={S.td}>{v.name}</TableCell>
            <TableCell sx={S.td} dir="ltr">{v.plate}</TableCell>
            <TableCell sx={S.td}>{t(`ui_del.vehicle_kind.${v.kind}`)}</TableCell>
            <TableCell sx={S.td}>{v.capacity_kg != null ? fmtMoney(v.capacity_kg, lang) : "—"}</TableCell>
            <TableCell sx={S.td}>{activeChip(v.is_active)}</TableCell>
            {rowActions("vehicle", v)}
          </TableRow>
        ))}
      {section("carrier", t("ui_del.fleet.carriers"),
        [t("ui_del.fleet.name"), t("ui_del.fleet.phone"), t("ui_del.fleet.type"), t("ui_del.common.status")],
        carriers, (c) => (
          <TableRow key={c.id}>
            <TableCell sx={S.td}>{c.name}</TableCell>
            <TableCell sx={S.td} dir="ltr">{c.phone}</TableCell>
            <TableCell sx={S.td}>{c.is_external ? t("ui_del.fleet.external") : t("ui_del.fleet.internal")}</TableCell>
            <TableCell sx={S.td}>{activeChip(c.is_active)}</TableCell>
            {rowActions("carrier", c)}
          </TableRow>
        ))}

      {edit && (
        <EditDialog
          key={`${edit.kind}-${edit.row?.id || "new"}`} ctx={ctx} title={editing.title}
          fields={editing.fields} initial={initialOf(edit.kind, edit.row)}
          onClose={() => setEdit(null)} onSave={(v) => save(edit.kind, edit.row, v)}
        />
      )}
      <ConfirmDialog
        ctx={ctx} open={!!del} busy={busy} danger error={delError}
        title={t("ui_del.common.delete")} text={t("ui_del.fleet.delete_text", { name: del?.row?.name || "" })}
        confirmLabel={t("ui_del.common.delete")} onClose={() => setDel(null)} onConfirm={remove}
      />
    </Box>
  );
}
