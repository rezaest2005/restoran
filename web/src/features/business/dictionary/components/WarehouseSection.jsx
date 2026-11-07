import { useState, useMemo } from "react";
import { Box, Typography, Button, Table, TableHead, TableBody, TableRow, TableCell, TextField, MenuItem, Chip, Switch } from "@mui/material";
import {
  SectionHeader, LoadState, TableWrap, ConfirmDialog, FormDialog, useRegisteredShortcuts, useRowCursor, cursorAttrs,
  cursorSx, cursorBindings, onEnter, useLoader, WAREHOUSE_TYPES, fmtNum,
} from "../common";
import { fetchWarehouses, saveWarehouse, deleteWarehouse, setSalesDefault, errMsg } from "../api";

const EMPTY = { name: "", warehouse_type: "other", description: "" };

export default function WarehouseSection({ ctx }) {
  const { t, C, S, notify } = ctx;
  const { data, loading, error, reload: load } = useLoader(fetchWarehouses, "all", t("ui_def.common.load_failed"));
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
  const [flagBusy, setFlagBusy] = useState(null);


  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => `${r.name} ${r.description}`.toLowerCase().includes(s));
  }, [rows, q]);

  const open = (row) => {
    setTouched(false); setFormErr("");
    setForm(row ? { name: row.name || "", warehouse_type: row.warehouse_type || "other", description: row.description || "" } : EMPTY);
    setEditing(row || {});
  };

  const cursor = useRowCursor(shown.length);
  useRegisteredShortcuts([
    { combo: "F2", label: t("ui_def.warehouses.new"), handler: () => open(null) },
    ...cursorBindings(t, cursor),
    { combo: "Enter", label: t("ui_def.common.open_row"), handler: onEnter(() => { const r = shown[cursor.index]; if (!r) return false; open(r); return true; }) },
  ]);

  const submit = async () => {
    setTouched(true);
    if (!form.name.trim()) return;
    setSaving(true); setFormErr("");
    try {
      await saveWarehouse({ ...(editing.id ? { id: editing.id } : {}), ...form, name: form.name.trim() });
      notify(t("ui_def.warehouses.saved", { name: form.name.trim() }), "success");
      setEditing(null); load();
    } catch (e) { setFormErr(errMsg(e, t("ui_def.common.save_failed"))); } finally { setSaving(false); }
  };

  const doDelete = async () => {
    setDelBusy(true); setDelErr("");
    try {
      await deleteWarehouse(del.id);
      notify(t("ui_def.warehouses.deleted", { name: del.name }), "success");
      setDel(null); load();
    } catch (e) { setDelErr(errMsg(e, t("ui_def.common.save_failed"))); } finally { setDelBusy(false); }
  };

  const toggleSales = async (w) => {
    setFlagBusy(w.id);
    try {
      await setSalesDefault(w.id, !w.is_sales_default);
      notify(!w.is_sales_default ? t("ui_def.warehouses.sales_on", { name: w.name }) : t("ui_def.warehouses.sales_off", { name: w.name }), "success");
      load();
    } catch (e) { notify(errMsg(e, t("ui_def.common.save_failed")), "error"); } finally { setFlagBusy(null); }
  };

  const typeLabel = (k) => t(`ui_def.warehouse_types.${k}`, { defaultValue: k });

  return (
    <Box>
      <SectionHeader ctx={ctx} title={t("ui_def.warehouses.title")} subtitle={t("ui_def.warehouses.subtitle")}
        onNew={() => open(null)} newLabel={t("ui_def.warehouses.new")} search={q} onSearch={setQ} />
      <LoadState ctx={ctx} loading={loading && rows.length === 0} error={error} onRetry={load}
        empty={!loading && shown.length === 0} emptyText={q ? t("ui_def.common.no_results") : t("ui_def.warehouses.empty")}>
        <TableWrap C={C}>
          <Table size="small" sx={{ minWidth: 700 }}>
            <TableHead>
              <TableRow>
                {["name", "type", "stock", "sales", "description", "actions"].map((k) => <TableCell key={k} sx={S.th}>{t(`ui_def.warehouses.col_${k}`)}</TableCell>)}
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((r, i) => (
                <TableRow key={r.id} hover {...cursorAttrs(cursor.isActive(i))} sx={{ ...cursorSx(C, cursor.isActive(i)), cursor: "pointer" }} onDoubleClick={() => open(r)}>
                  <TableCell sx={{ ...S.td, fontWeight: 700 }}>
                    {r.name} {r.is_mother && <Chip size="small" label={t("ui_def.warehouses.central")} sx={{ marginInlineStart: 0.5, color: C.accent, bgcolor: C.accentSubtle, fontWeight: 700 }} />}
                  </TableCell>
                  <TableCell sx={S.td}>{typeLabel(r.warehouse_type)}</TableCell>
                  <TableCell sx={S.td}>{t("ui_def.warehouses.stock_count", { count: fmtNum(r.stock_count) })}</TableCell>
                  <TableCell sx={S.td}>
                    <Switch size="small" checked={!!r.is_sales_default} disabled={flagBusy === r.id} onChange={() => toggleSales(r)}
                      slotProps={{ input: { "aria-label": t("ui_def.warehouses.sales_default") } }} />
                  </TableCell>
                  <TableCell sx={S.td}><Typography noWrap sx={{ fontSize: 13, maxWidth: 220 }} title={r.description}>{r.description || "—"}</Typography></TableCell>
                  <TableCell sx={{ ...S.td, whiteSpace: "nowrap" }}>
                    <Button size="small" sx={{ color: C.primary, textTransform: "none" }} onClick={() => open(r)}>{t("ui_def.common.edit")}</Button>
                    {!r.is_mother && <Button size="small" sx={{ color: C.danger, textTransform: "none" }} onClick={() => { setDelErr(""); setDel(r); }}>{t("ui_def.common.delete")}</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
        <Typography sx={{ color: C.muted, fontSize: 11, mt: 1 }}>{t("ui_def.warehouses.sales_hint")}</Typography>
      </LoadState>

      {editing && (
        <FormDialog ctx={ctx} saving={saving} error={formErr} onClose={() => setEditing(null)} onSave={submit}
          title={editing.id ? t("ui_def.warehouses.edit_title", { name: editing.name }) : t("ui_def.warehouses.new_title")}>
          <TextField label={t("ui_def.warehouses.f_name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} size="small" sx={S.field}
            required autoFocus error={touched && !form.name.trim()} helperText={touched && !form.name.trim() ? t("ui_def.common.required") : ""} />
          <TextField select label={t("ui_def.warehouses.f_type")} value={form.warehouse_type} onChange={(e) => setForm({ ...form, warehouse_type: e.target.value })}
            size="small" sx={S.field} disabled={!!editing.is_mother}>
            {WAREHOUSE_TYPES.filter((k) => k !== "mother" || editing.is_mother).map((k) => <MenuItem key={k} value={k}>{typeLabel(k)}</MenuItem>)}
          </TextField>
          <TextField label={t("ui_def.warehouses.f_description")} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} size="small" sx={S.field} multiline minRows={2} />
        </FormDialog>
      )}
      <ConfirmDialog ctx={ctx} open={!!del} danger busy={delBusy} error={delErr}
        title={t("ui_def.warehouses.delete_title")} text={t("ui_def.warehouses.delete_text", { name: del?.name })}
        confirmLabel={t("ui_def.common.delete")} onClose={() => setDel(null)} onConfirm={doDelete} />
    </Box>
  );
}
