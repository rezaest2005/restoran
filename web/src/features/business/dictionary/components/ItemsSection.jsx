import { useState } from "react";
import { Box, Typography, Button, Table, TableHead, TableBody, TableRow, TableCell, Chip, TablePagination } from "@mui/material";
import {
  SectionHeader, LoadState, TableWrap, ConfirmDialog, TypeBadge, useRegisteredShortcuts, useRowCursor, cursorAttrs,
  cursorSx, cursorBindings, onEnter, useDebounced, useLoader, fmtNum, fmtMoney, KINDS, } from "../common";
import { fetchItems, deleteItem, errMsg } from "../api";
import ItemDialog from "./ItemDialog";

const PAGE = 50;

export default function ItemsSection({ ctx }) {
  const { t, C, S, notify } = ctx;
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [pageState, setPageState] = useState({ key: "", page: 0 });
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState("");
  const dq = useDebounced(q.trim(), 300);
  const filterKey = `${dq}|${kind}`;
  const page = pageState.key === filterKey ? pageState.page : 0;
  const setPage = (p) => setPageState({ key: filterKey, page: p });
  const { data, loading, error, reload: load } = useLoader(() => {
    const params = { page: page + 1, page_size: PAGE };
    if (dq) params.q = dq;
    if (kind) params.material_type = kind;
    return fetchItems(params);
  }, `${filterKey}|${page}`, t("ui_def.common.load_failed"));
  const rows = data?.rows || [];
  const total = data?.total || 0;

  const cursor = useRowCursor(rows.length);
  const openNew = () => setEditing({});
  useRegisteredShortcuts([
    { combo: "F2", label: t("ui_def.items.new"), handler: openNew },
    ...cursorBindings(t, cursor),
    { combo: "Enter", label: t("ui_def.common.open_row"), handler: onEnter(() => { const r = rows[cursor.index]; if (!r) return false; setEditing(r); return true; }) },
  ]);

  const doDelete = async () => {
    setDelBusy(true); setDelErr("");
    try {
      await deleteItem(del.id);
      notify(t("ui_def.items.deleted", { name: del.name }), "success");
      setDel(null); load();
    } catch (e) { setDelErr(errMsg(e, t("ui_def.common.save_failed"))); } finally { setDelBusy(false); }
  };

  const unitLabel = (u) => t(`ui_def.units.${u}`, { defaultValue: u });

  return (
    <Box>
      <SectionHeader ctx={ctx} title={t("ui_def.items.title")} subtitle={t("ui_def.items.subtitle")}
        onNew={openNew} newLabel={t("ui_def.items.new")} search={q} onSearch={setQ}>
        <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }} role="group" aria-label={t("ui_def.items.f_kind")}>
          {["", ...KINDS].map((k) => (
            <Chip key={k || "all"} clickable onClick={() => setKind(k)} aria-pressed={kind === k}
              label={k ? t(`ui_def.kinds.${k}`) : t("ui_def.common.all")}
              sx={{
                fontWeight: kind === k ? 800 : 500,
                bgcolor: kind === k ? C.primarySubtle : "transparent", color: kind === k ? C.primary : C.sub,
                border: `1px solid ${kind === k ? C.primary : C.glassBorder}`,
              }} />
          ))}
        </Box>
      </SectionHeader>

      <LoadState ctx={ctx} loading={loading && rows.length === 0} error={error} onRetry={load}
        empty={!loading && rows.length === 0} emptyText={dq || kind ? t("ui_def.common.no_results") : t("ui_def.items.empty")}>
        <TableWrap C={C}>
          <Table size="small" sx={{ minWidth: 980, opacity: loading ? 0.6 : 1 }}>
            <TableHead>
              <TableRow>
                {["name", "kind", "unit", "cost", "min", "target", "stock", "formula", "barcode", "actions"].map((k) => (
                  <TableCell key={k} sx={S.th}>{t(`ui_def.items.col_${k}`)}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((it, i) => {
                const low = it.minimum_stock > 0 && it.stock < it.minimum_stock;
                return (
                  <TableRow key={it.id} hover {...cursorAttrs(cursor.isActive(i))} sx={{ ...cursorSx(C, cursor.isActive(i)), cursor: "pointer" }}
                    onDoubleClick={() => setEditing(it)}>
                    <TableCell sx={{ ...S.td, fontWeight: 700 }}>
                      {it.name}
                      {it.name_en && <Typography component="div" sx={{ color: C.muted, fontSize: 11 }} dir="ltr">{it.name_en}</Typography>}
                    </TableCell>
                    <TableCell sx={S.td}><TypeBadge t={t} C={C} type={it.material_type} /></TableCell>
                    <TableCell sx={S.td}>{unitLabel(it.unit)}</TableCell>
                    <TableCell sx={S.td}>{fmtMoney(it.price)}</TableCell>
                    <TableCell sx={S.td}>{fmtNum(it.minimum_stock)}</TableCell>
                    <TableCell sx={S.td}>{fmtNum(it.target_stock)}</TableCell>
                    <TableCell sx={{ ...S.td, color: low ? C.danger : C.text, fontWeight: low ? 800 : 500 }}>
                      {fmtNum(it.stock)}{low && <span aria-label={t("ui_def.items.low_stock")} title={t("ui_def.items.low_stock")}> ▼</span>}
                    </TableCell>
                    <TableCell sx={S.td}>
                      {it.has_formula
                        ? <Chip size="small" label={t("ui_def.items.has_formula")} sx={{ color: C.accent, bgcolor: C.accentSubtle, fontWeight: 700 }} />
                        : "—"}
                      {it.used_in_formulas > 0 && (
                        <Typography component="div" sx={{ color: C.muted, fontSize: 11 }}>{t("ui_def.items.used_in", { count: it.used_in_formulas })}</Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ ...S.td, direction: "ltr", textAlign: "start" }}>{it.barcode || "—"}</TableCell>
                    <TableCell sx={{ ...S.td, whiteSpace: "nowrap" }}>
                      <Button size="small" sx={{ color: C.primary, textTransform: "none" }} onClick={() => setEditing(it)}>{t("ui_def.common.edit")}</Button>
                      <Button size="small" sx={{ color: C.danger, textTransform: "none" }} onClick={() => { setDelErr(""); setDel(it); }}>{t("ui_def.common.delete")}</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableWrap>
        <TablePagination component="div" count={total} page={page} rowsPerPage={PAGE} rowsPerPageOptions={[PAGE]}
          onPageChange={(_, p) => setPage(p)} sx={{ color: C.sub, "& .MuiTablePagination-selectIcon": { color: C.sub } }} />
        <Typography sx={{ color: C.muted, fontSize: 11 }}>
          {t("ui_def.common.cursor_hint")}
        </Typography>
      </LoadState>

      {editing && (
        <ItemDialog ctx={ctx} item={editing.id ? editing : null} onClose={() => setEditing(null)}
          onSaved={(saved) => { notify(t("ui_def.items.saved", { name: saved?.name || "" }), "success"); setEditing(null); load(); }} />
      )}
      <ConfirmDialog ctx={ctx} open={!!del} danger busy={delBusy} error={delErr}
        title={t("ui_def.items.delete_title")} text={t("ui_def.items.delete_text", { name: del?.name })}
        confirmLabel={t("ui_def.common.delete")} onClose={() => setDel(null)} onConfirm={doDelete} />
    </Box>
  );
}
