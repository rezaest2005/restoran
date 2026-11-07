import { useState, useMemo } from "react";
import { Box, Button, Table, TableHead, TableBody, TableRow, TableCell, TextField, Chip, FormControlLabel, Switch } from "@mui/material";
import {
  SectionHeader, LoadState, TableWrap, ConfirmDialog, FormDialog, useRegisteredShortcuts, useRowCursor, cursorAttrs,
  cursorSx, cursorBindings, onEnter, useLoader, fmtMoney,
} from "../common";
import { fetchCustomers, createCustomer, updateCustomer, deleteCustomer, errMsg } from "../api";

const EMPTY = { name: "", phone: "", address: "", opening_balance: "0", note: "", is_active: true };

export default function CustomerSection({ ctx }) {
  const { t, C, S, notify } = ctx;
  const { data, loading, error, reload: load } = useLoader(fetchCustomers, "all", t("ui_def.common.load_failed"));
  const rows = Array.isArray(data) ? data : [];
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [del, setDel] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState("");


  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => `${r.name} ${r.phone} ${r.address}`.toLowerCase().includes(s));
  }, [rows, q]);

  const open = (row) => {
    setTouched(false); setFormErr("");
    setForm(row ? {
      name: row.name || "", phone: row.phone || "", address: row.address || "",
      opening_balance: String(row.opening_balance ?? 0), note: row.note || "", is_active: row.is_active !== false,
    } : EMPTY);
    setEditing(row || {});
  };

  const cursor = useRowCursor(shown.length);
  useRegisteredShortcuts([
    { combo: "F2", label: t("ui_def.customers.new"), handler: () => open(null) },
    ...cursorBindings(t, cursor),
    { combo: "Enter", label: t("ui_def.common.open_row"), handler: onEnter(() => { const r = shown[cursor.index]; if (!r) return false; open(r); return true; }) },
  ]);

  const balanceBad = form.opening_balance !== "" && !Number.isFinite(Number(form.opening_balance));
  const submit = async () => {
    setTouched(true);
    if (!form.name.trim() || balanceBad) return;
    setSaving(true); setFormErr("");
    const body = {
      name: form.name.trim(), phone: form.phone.trim(), address: form.address, note: form.note,
      opening_balance: form.opening_balance === "" ? 0 : Number(form.opening_balance),
    };
    try {
      if (editing.id) await updateCustomer(editing.id, { ...body, is_active: form.is_active });
      else await createCustomer(body);
      notify(t("ui_def.customers.saved", { name: body.name }), "success");
      setEditing(null); load();
    } catch (e) { setFormErr(errMsg(e, t("ui_def.common.save_failed"))); } finally { setSaving(false); }
  };

  const doDelete = async () => {
    setDelBusy(true); setDelErr("");
    try {
      await deleteCustomer(del.id);
      notify(t("ui_def.customers.deleted", { name: del.name }), "success");
      setDel(null); load();
    } catch (e) { setDelErr(errMsg(e, t("ui_def.common.save_failed"))); } finally { setDelBusy(false); }
  };

  return (
    <Box>
      <SectionHeader ctx={ctx} title={t("ui_def.customers.title")} subtitle={t("ui_def.customers.subtitle")}
        onNew={() => open(null)} newLabel={t("ui_def.customers.new")} search={q} onSearch={setQ} />
      <LoadState ctx={ctx} loading={loading && rows.length === 0} error={error} onRetry={load}
        empty={!loading && shown.length === 0} emptyText={q ? t("ui_def.common.no_results") : t("ui_def.customers.empty")}>
        <TableWrap C={C}>
          <Table size="small" sx={{ minWidth: 680 }}>
            <TableHead>
              <TableRow>
                {["name", "phone", "address", "debt", "status", "actions"].map((k) => <TableCell key={k} sx={S.th}>{t(`ui_def.customers.col_${k}`)}</TableCell>)}
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((r, i) => (
                <TableRow key={r.id} hover {...cursorAttrs(cursor.isActive(i))} sx={{ ...cursorSx(C, cursor.isActive(i)), cursor: "pointer" }} onDoubleClick={() => open(r)}>
                  <TableCell sx={{ ...S.td, fontWeight: 700 }}>{r.name}</TableCell>
                  <TableCell sx={{ ...S.td, direction: "ltr", textAlign: "start" }}>{r.phone || "—"}</TableCell>
                  <TableCell sx={{ ...S.td, maxWidth: 220 }}>{r.address || "—"}</TableCell>
                  <TableCell sx={{ ...S.td, color: Number(r.total_debt) > 0 ? C.danger : C.text, fontWeight: Number(r.total_debt) > 0 ? 700 : 400 }}>{fmtMoney(r.total_debt ?? 0)}</TableCell>
                  <TableCell sx={S.td}>
                    <Chip size="small" label={r.is_active !== false ? t("ui_def.common.active") : t("ui_def.common.inactive")}
                      sx={{ color: r.is_active !== false ? C.success : C.muted, bgcolor: r.is_active !== false ? C.successBg : C.divider, fontWeight: 700 }} />
                  </TableCell>
                  <TableCell sx={{ ...S.td, whiteSpace: "nowrap" }}>
                    <Button size="small" sx={{ color: C.primary, textTransform: "none" }} onClick={() => open(r)}>{t("ui_def.common.edit")}</Button>
                    <Button size="small" sx={{ color: C.danger, textTransform: "none" }} onClick={() => { setDelErr(""); setDel(r); }}>{t("ui_def.common.delete")}</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
      </LoadState>

      {editing && (
        <FormDialog ctx={ctx} saving={saving} error={formErr} onClose={() => setEditing(null)} onSave={submit}
          title={editing.id ? t("ui_def.customers.edit_title", { name: editing.name }) : t("ui_def.customers.new_title")}>
          <TextField label={t("ui_def.customers.f_name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} size="small" sx={S.field}
            required autoFocus error={touched && !form.name.trim()} helperText={touched && !form.name.trim() ? t("ui_def.common.required") : ""} />
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
            <TextField label={t("ui_def.customers.f_phone")} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} size="small" sx={S.field}
              slotProps={{ htmlInput: { dir: "ltr", inputMode: "tel" } }} />
            <TextField label={t("ui_def.customers.f_balance")} type="number" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })}
              size="small" sx={S.field} error={touched && balanceBad} helperText={touched && balanceBad ? t("ui_def.common.invalid_number") : t("ui_def.customers.balance_hint")} />
          </Box>
          <TextField label={t("ui_def.customers.f_address")} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} size="small" sx={S.field} multiline minRows={2} />
          <TextField label={t("ui_def.customers.f_note")} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} size="small" sx={S.field} multiline minRows={2} />
          {editing.id && (
            <FormControlLabel sx={{ color: C.text, m: 0 }} control={<Switch checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />}
              label={t("ui_def.customers.f_active")} />
          )}
        </FormDialog>
      )}
      <ConfirmDialog ctx={ctx} open={!!del} danger busy={delBusy} error={delErr}
        title={t("ui_def.customers.delete_title")} text={t("ui_def.customers.delete_text", { name: del?.name })}
        confirmLabel={t("ui_def.common.delete")} onClose={() => setDel(null)} onConfirm={doDelete} />
    </Box>
  );
}
