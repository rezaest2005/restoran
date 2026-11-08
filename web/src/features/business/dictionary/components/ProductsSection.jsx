import { useState, useMemo } from "react";
import {
  Box, Typography, Button, Table, TableHead, TableBody, TableRow, TableCell, Chip, MenuItem, TextField,
  TablePagination,
} from "@mui/material";
import {
  SectionHeader, LoadState, TableWrap, ConfirmDialog, useRegisteredShortcuts, useRowCursor, cursorAttrs,
  cursorSx, cursorBindings, onEnter, useDebounced, useLoader, fmtNum, fmtMoney, KbdHint,
} from "../common";
import { fetchProducts, fetchCategories, deleteProduct, errMsg } from "../api";
import ProductDialog from "./ProductDialog";
import CategoriesDialog from "./CategoriesDialog";

const PAGE = 50;

export default function ProductsSection({ ctx, canLink }) {
  const { t, C, S, notify } = ctx;
  const [pageState, setPageState] = useState({ key: "", page: 0 });
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [linked, setLinked] = useState("");
  const [editing, setEditing] = useState(null); // null | {} | product
  const [catOpen, setCatOpen] = useState(false);
  const [del, setDel] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState("");
  const dq = useDebounced(q.trim(), 300);
  const filterKey = `${dq}|${category}|${status}|${linked}`;
  const page = pageState.key === filterKey ? pageState.page : 0;
  const setPage = (p) => setPageState({ key: filterKey, page: p });
  const { data, loading, error, reload: load } = useLoader(() => {
    const params = { page: page + 1, page_size: PAGE };
    if (dq) params.q = dq;
    if (category) params.category = category;
    if (status) params.active = status === "active";
    if (linked) params.linked = linked === "linked";
    return fetchProducts(params);
  }, `${filterKey}|${page}`, t("ui_def.common.load_failed"));
  const rows = data?.rows || [];
  const total = data?.total || 0;

  const { data: catData, reload: loadCategories } = useLoader(fetchCategories, "cats");
  const categories = Array.isArray(catData) ? catData : [];

  const cursor = useRowCursor(rows.length);
  const openNew = () => setEditing({});
  useRegisteredShortcuts([
    { combo: "F2", label: t("ui_def.products.new"), handler: openNew },
    ...cursorBindings(t, cursor),
    { combo: "Enter", label: t("ui_def.common.open_row"), handler: onEnter(() => { const r = rows[cursor.index]; if (!r) return false; setEditing(r); return true; }) },
  ], { enabled: !editing && !catOpen && !del });

  const doDelete = async () => {
    setDelBusy(true); setDelErr("");
    try {
      await deleteProduct(del.id);
      notify(t("ui_def.products.deleted", { name: del.name }), "success");
      setDel(null); load(); loadCategories();
    } catch (e) { setDelErr(errMsg(e, t("ui_def.common.save_failed"))); } finally { setDelBusy(false); }
  };

  const catName = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c.name])), [categories]);
  const unitLabel = (u) => t(`ui_def.units.${u}`, { defaultValue: u });

  return (
    <Box>
      <SectionHeader ctx={ctx} title={t("ui_def.products.title")} subtitle={t("ui_def.products.subtitle")}
        onNew={openNew} newLabel={t("ui_def.products.new")} search={q} onSearch={setQ}>
        <TextField select size="small" value={category} onChange={(e) => setCategory(e.target.value)} sx={{ ...S.field, minWidth: 150 }}
          label={t("ui_def.products.f_category")}>
          <MenuItem value="">{t("ui_def.common.all")}</MenuItem>
          {categories.map((c) => <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ ...S.field, minWidth: 130 }}
          label={t("ui_def.products.col_status")}>
          <MenuItem value="">{t("ui_def.common.all")}</MenuItem>
          <MenuItem value="active">{t("ui_def.products.available")}</MenuItem>
          <MenuItem value="inactive">{t("ui_def.products.unavailable")}</MenuItem>
        </TextField>
        {canLink && (
          <TextField select size="small" value={linked} onChange={(e) => setLinked(e.target.value)} sx={{ ...S.field, minWidth: 140 }}
            label={t("ui_def.products.col_item")}>
            <MenuItem value="">{t("ui_def.common.all")}</MenuItem>
            <MenuItem value="linked">{t("ui_def.products.linked")}</MenuItem>
            <MenuItem value="unlinked">{t("ui_def.products.unlinked")}</MenuItem>
          </TextField>
        )}
        <Button variant="outlined" sx={S.ghost} onClick={() => setCatOpen(true)}>{t("ui_def.products.manage_categories")}</Button>
      </SectionHeader>

      <LoadState ctx={ctx} loading={loading && rows.length === 0} error={error} onRetry={load}
        empty={!loading && rows.length === 0} emptyText={dq || category || status || linked ? t("ui_def.common.no_results") : t("ui_def.products.empty")}>
        <TableWrap C={C}>
          <Table size="small" sx={{ minWidth: 900, opacity: loading ? 0.6 : 1 }}>
            <TableHead>
              <TableRow>
                {["image", "name", "category", "price", "final", "barcode", "item", "status", "actions"].map((k) => (
                  <TableCell key={k} sx={S.th}>{t(`ui_def.products.col_${k}`)}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((p, i) => {
                const low = p.linked && p.stock <= 0;
                return (
                  <TableRow key={p.id} hover {...cursorAttrs(cursor.isActive(i))} sx={{ ...cursorSx(C, cursor.isActive(i)), cursor: "pointer" }}
                    onDoubleClick={() => setEditing(p)}>
                    <TableCell sx={S.td}>
                      <Box sx={{ width: 40, height: 40, borderRadius: 1.5, bgcolor: C.inputBg, border: `1px solid ${C.divider}`, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {p.image ? <Box component="img" src={p.image} alt="" loading="lazy" sx={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span aria-hidden="true">🖼</span>}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ ...S.td, fontWeight: 700 }}>
                      {p.name}
                      {p.name_en && <Typography component="div" sx={{ color: C.muted, fontSize: 11 }} dir="ltr">{p.name_en}</Typography>}
                    </TableCell>
                    <TableCell sx={S.td}>{p.category_id ? (p.category || catName[p.category_id]) : "—"}</TableCell>
                    <TableCell sx={S.td}>{fmtMoney(p.price)}</TableCell>
                    <TableCell sx={S.td}>{p.final_price !== p.price ? <Box component="span" sx={{ color: C.success, fontWeight: 700 }}>{fmtMoney(p.final_price)}</Box> : "—"}</TableCell>
                    <TableCell sx={{ ...S.td, direction: "ltr", textAlign: "start" }}>{p.barcode || "—"}</TableCell>
                    <TableCell sx={S.td}>
                      {p.linked && p.item ? (
                        <Box>
                          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{p.item.name}</Typography>
                          <Typography sx={{ fontSize: 12, color: low ? C.danger : C.sub, fontWeight: low ? 700 : 400 }}>
                            {t("ui_def.products.stock_line", { qty: fmtNum(p.stock), unit: unitLabel(p.item.unit) })}
                          </Typography>
                        </Box>
                      ) : (
                        <Typography sx={{ fontSize: 12, color: C.muted }}>{t("ui_def.products.not_linked")} · {fmtNum(p.stock)}</Typography>
                      )}
                    </TableCell>
                    <TableCell sx={S.td}>
                      <Chip size="small" label={p.is_available ? t("ui_def.products.available") : t("ui_def.products.unavailable")}
                        sx={{ color: p.is_available ? C.success : C.muted, bgcolor: p.is_available ? C.successBg : C.divider, fontWeight: 700 }} />
                    </TableCell>
                    <TableCell sx={{ ...S.td, whiteSpace: "nowrap" }}>
                      <Button size="small" sx={{ color: C.primary, textTransform: "none" }} onClick={() => setEditing(p)}>{t("ui_def.common.edit")}</Button>
                      <Button size="small" sx={{ color: C.danger, textTransform: "none" }} onClick={() => { setDelErr(""); setDel(p); }}>{t("ui_def.common.delete")}</Button>
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
        <ProductDialog ctx={ctx} product={editing.id ? editing : null} categories={categories} canLink={canLink}
          onClose={() => setEditing(null)} onCategoriesChanged={loadCategories}
          onSaved={(saved) => {
            notify(t("ui_def.products.saved", { name: saved?.name || "" }), "success");
            setEditing(null); load(); loadCategories();
          }} />
      )}
      {catOpen && (
        <CategoriesDialog ctx={ctx} categories={categories} onClose={() => { setCatOpen(false); load(); }} onChanged={loadCategories} />
      )}
      <ConfirmDialog ctx={ctx} open={!!del} danger busy={delBusy} error={delErr}
        title={t("ui_def.products.delete_title")} text={t("ui_def.products.delete_text", { name: del?.name })}
        confirmLabel={t("ui_def.common.delete")} onClose={() => setDel(null)} onConfirm={doDelete} />
    </Box>
  );
}
