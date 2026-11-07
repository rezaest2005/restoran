import { useState, useMemo } from "react";
import { Box, Typography, Button, Table, TableHead, TableBody, TableRow, TableCell, Switch, Alert } from "@mui/material";
import { fmt, TypeBadge } from "@business/production/common";
import {
  SectionHeader, LoadState, TableWrap, ConfirmDialog, useRegisteredShortcuts, useRowCursor, cursorAttrs, cursorSx,
  cursorBindings, onEnter, useLoader,
} from "../../common";
import { fetchFormulas, fetchMaterials, updateFormula, deleteFormula, errMsg } from "../../api";
import FormulaDialog from "./FormulaDialog";

/** Formula (bill of materials) definitions. Orders that use them live in Production. */
export default function FormulasSection({ ctx, jump }) {
  const { t, C, S, notify } = ctx;
  const { data, loading, error, reload: load } = useLoader(fetchFormulas, "all", t("ui_def.common.load_failed"));
  const { data: matData, reload: reloadMaterials } = useLoader(fetchMaterials, "mats");
  const rows = Array.isArray(data) ? data : [];
  const materials = Array.isArray(matData) ? matData : [];
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(jump ? { id: jump } : null); // null | {} (new) | { id }
  const [del, setDel] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState("");

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((f) => `${f.name} ${f.code} ${f.output_material}`.toLowerCase().includes(s));
  }, [rows, q]);

  const cursor = useRowCursor(shown.length);
  const openNew = () => setEditing({});
  useRegisteredShortcuts([
    { combo: "F2", label: t("ui_g.prod.new_formula"), handler: openNew },
    ...cursorBindings(t, cursor),
    { combo: "Enter", label: t("ui_def.common.open_row"), handler: onEnter(() => { const r = shown[cursor.index]; if (!r) return false; setEditing(r); return true; }) },
  ]);

  const toggleActive = async (f) => {
    try { await updateFormula(f.id, { is_active: !f.is_active }); load(); }
    catch (e) { notify(errMsg(e, t("ui_def.common.save_failed")), "error"); }
  };

  const doDelete = async () => {
    setDelBusy(true); setDelErr("");
    try {
      await deleteFormula(del.id);
      notify(t("ui_e.formulas.deleted"), "success");
      setDel(null); load();
    } catch (e) {
      setDelErr(errMsg(e, t("ui_def.common.save_failed")) + " — " + t("ui_e.formulas.delete_hint"));
    } finally { setDelBusy(false); }
  };

  return (
    <Box>
      <SectionHeader ctx={ctx} title={t("ui_def.formulas.title")} subtitle={t("ui_def.formulas.subtitle")}
        onNew={openNew} newLabel={t("ui_e.formulas.new")} search={q} onSearch={setQ} />
      <Alert severity="info" sx={{ mb: 2 }}>{t("ui_def.formulas.production_hint")}</Alert>

      <LoadState ctx={ctx} loading={loading && rows.length === 0} error={error} onRetry={load}
        empty={!loading && shown.length === 0} emptyText={q ? t("ui_def.common.no_results") : t("ui_e.formulas.empty")}>
        <TableWrap C={C}>
          <Table size="small" sx={{ minWidth: 720 }}>
            <TableHead>
              <TableRow>
                {["name", "code", "output", "batch", "version", "active", "actions"].map((k) => (
                  <TableCell key={k} sx={S.th}>{t(`ui_e.formulas.col_${k}`)}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((f, i) => (
                <TableRow key={f.id} hover {...cursorAttrs(cursor.isActive(i))} sx={{ ...cursorSx(C, cursor.isActive(i)), cursor: "pointer" }}
                  onDoubleClick={() => setEditing(f)}>
                  <TableCell sx={{ ...S.td, fontWeight: 700 }}>{f.name}</TableCell>
                  <TableCell sx={S.td}>{f.code || "—"}</TableCell>
                  <TableCell sx={S.td}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
                      <span>{f.output_material || "—"}</span>
                      <TypeBadge t={t} C={C} type={f.output_type} />
                    </Box>
                  </TableCell>
                  <TableCell sx={S.td}>{fmt(f.output_quantity)} {t(`ui_def.units.${f.output_unit}`, { defaultValue: f.output_unit })}</TableCell>
                  <TableCell sx={S.td}>{f.version}</TableCell>
                  <TableCell sx={S.td}>
                    <Switch size="small" checked={!!f.is_active} onChange={() => toggleActive(f)}
                      slotProps={{ input: { "aria-label": t("ui_e.formulas.col_active") } }} />
                  </TableCell>
                  <TableCell sx={{ ...S.td, whiteSpace: "nowrap" }}>
                    <Button size="small" sx={{ color: C.primary, textTransform: "none" }} onClick={() => setEditing(f)}>{t("ui_def.common.edit")}</Button>
                    <Button size="small" sx={{ color: C.danger, textTransform: "none" }} onClick={() => { setDelErr(""); setDel(f); }}>{t("ui_def.common.delete")}</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
        <Typography sx={{ color: C.muted, fontSize: 11, mt: 1 }}>{t("ui_def.formulas.multilevel_hint")}</Typography>
      </LoadState>

      {editing && (
        <FormulaDialog key={editing.id || "new"} ctx={ctx} formula={editing} materials={materials} reloadMaterials={reloadMaterials}
          openFormula={(id) => setEditing({ id })} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); reloadMaterials(); notify(t("ui_e.formulas.saved"), "success"); }} />
      )}

      <ConfirmDialog ctx={ctx} open={!!del} danger busy={delBusy} error={delErr}
        title={t("ui_e.formulas.delete_title")} text={t("ui_e.formulas.delete_text", { name: del?.name })}
        confirmLabel={t("ui_def.common.delete")} onClose={() => setDel(null)} onConfirm={doDelete} />
    </Box>
  );
}
