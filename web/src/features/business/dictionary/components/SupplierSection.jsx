import { useState, useMemo } from "react";
import { Box, Typography, Button, Table, TableHead, TableBody, TableRow, TableCell, TextField } from "@mui/material";
import {
  SectionHeader, LoadState, TableWrap, ConfirmDialog, FormDialog, useRegisteredShortcuts, useRowCursor, cursorAttrs,
  cursorSx, cursorBindings, onEnter, useLoader,
} from "../common";
import { fetchSuppliers, saveSupplier, deleteSupplier, errMsg } from "../api";

const EMPTY = { name: "", contact_person: "", phone: "", address: "" };

export default function SupplierSection({ ctx }) {
  const { t, C, S, notify } = ctx;
  const { data, loading, error, reload: load } = useLoader(fetchSuppliers, "all", t("ui_def.common.load_failed"));
  const rows = Array.isArray(data) ? data : [];
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null); // null | { id?, ...fields }
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
    return rows.filter((r) => `${r.name} ${r.contact_person} ${r.phone} ${r.address}`.toLowerCase().includes(s));
  }, [rows, q]);

  const open = (row) => {
    setTouched(false); setFormErr("");
    setForm(row ? { name: row.name || "", contact_person: row.contact_person || "", phone: row.phone || "", address: row.address || "" } : EMPTY);
    setEditing(row || {});
  };

  const cursor = useRowCursor(shown.length);
  useRegisteredShortcuts([
    { combo: "F2", label: t("ui_def.suppliers.new"), handler: () => open(null) },
    ...cursorBindings(t, cursor),
    { combo: "Enter", label: t("ui_def.common.open_row"), handler: onEnter(() => { const r = shown[cursor.index]; if (!r) return false; open(r); return true; }) },
  ]);

  const submit = async () => {
    setTouched(true);
    if (!form.name.trim()) return;
    setSaving(true); setFormErr("");
    try {
      await saveSupplier({ ...(editing.id ? { id: editing.id } : {}), ...form, name: form.name.trim() });
      notify(t("ui_def.suppliers.saved", { name: form.name.trim() }), "success");
      setEditing(null); load();
    } catch (e) { setFormErr(errMsg(e, t("ui_def.common.save_failed"))); } finally { setSaving(false); }
  };

  const doDelete = async () => {
    setDelBusy(true); setDelErr("");
    try {
      await deleteSupplier(del.id);
      notify(t("ui_def.suppliers.deleted", { name: del.name }), "success");
      setDel(null); load();
    } catch (e) { setDelErr(errMsg(e, t("ui_def.common.save_failed"))); } finally { setDelBusy(false); }
  };

  const f = (k, label, extra = {}) => (
    <TextField label={label} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} size="small" sx={S.field} {...extra} />
  );

  return (
    <Box>
      <SectionHeader ctx={ctx} title={t("ui_def.suppliers.title")} subtitle={t("ui_def.suppliers.subtitle")}
        onNew={() => open(null)} newLabel={t("ui_def.suppliers.new")} search={q} onSearch={setQ} />
      <LoadState ctx={ctx} loading={loading && rows.length === 0} error={error} onRetry={load}
        empty={!loading && shown.length === 0} emptyText={q ? t("ui_def.common.no_results") : t("ui_def.suppliers.empty")}>
        <TableWrap C={C}>
          <Table size="small" sx={{ minWidth: 620 }}>
            <TableHead>
              <TableRow>
                {["name", "contact", "phone", "address", "actions"].map((k) => <TableCell key={k} sx={S.th}>{t(`ui_def.suppliers.col_${k}`)}</TableCell>)}
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((r, i) => (
                <TableRow key={r.id} hover {...cursorAttrs(cursor.isActive(i))} sx={{ ...cursorSx(C, cursor.isActive(i)), cursor: "pointer" }} onDoubleClick={() => open(r)}>
                  <TableCell sx={{ ...S.td, fontWeight: 700 }}>{r.name}</TableCell>
                  <TableCell sx={S.td}>{r.contact_person || "—"}</TableCell>
                  <TableCell sx={{ ...S.td, direction: "ltr", textAlign: "start" }}>{r.phone || "—"}</TableCell>
                  <TableCell sx={S.td}><Typography sx={{ fontSize: 13, maxWidth: 260 }} noWrap title={r.address}>{r.address || "—"}</Typography></TableCell>
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
          title={editing.id ? t("ui_def.suppliers.edit_title", { name: editing.name }) : t("ui_def.suppliers.new_title")}>
          {f("name", t("ui_def.suppliers.f_name"), { required: true, autoFocus: true, error: touched && !form.name.trim(), helperText: touched && !form.name.trim() ? t("ui_def.common.required") : "" })}
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
            {f("contact_person", t("ui_def.suppliers.f_contact"))}
            {f("phone", t("ui_def.suppliers.f_phone"), { slotProps: { htmlInput: { dir: "ltr", inputMode: "tel" } } })}
          </Box>
          {f("address", t("ui_def.suppliers.f_address"), { multiline: true, minRows: 2 })}
        </FormDialog>
      )}
      <ConfirmDialog ctx={ctx} open={!!del} danger busy={delBusy} error={delErr}
        title={t("ui_def.suppliers.delete_title")} text={t("ui_def.suppliers.delete_text", { name: del?.name })}
        confirmLabel={t("ui_def.common.delete")} onClose={() => setDel(null)} onConfirm={doDelete} />
    </Box>
  );
}
