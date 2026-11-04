import { useState, useMemo, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Box, Typography, Button, Tabs, Tab, Table, TableHead, TableBody, TableRow,
  TableCell, Chip, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, IconButton, Alert, Snackbar, CircularProgress,
  useMediaQuery, useTheme, Switch,
} from "@mui/material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import { buildColors } from "@shared/palette";
import useShortcuts from "@shared/common/useShortcuts";
import ShortcutsHelpDialog from "@shared/common/ShortcutsHelpDialog";
import KbdHint from "@business/pos/common/KbdHint";
import {
  num, fmt, fmtDate, STATUSES, newKey, useStyles, TableWrap, ConfirmDialog, enterIsNative,
  TypeBadge, StatusCell, SubFormulaButton, ReadyBanner, RequirementsTable, lineStatus,
} from "./common";
import {
  fetchMaterials, fetchFormulas, fetchFormula, createFormula, updateFormula, deleteFormula,
  fetchOrders, fetchOrder, createOrder, startOrder, completeOrder, cancelOrder,
  errMsg,
} from "./api";

/* ───────── page ───────── */
export default function ProductionPage() {
  const { t } = useTranslation();
  const { mode } = useThemeMode();
  const { isRtl, lang } = useLang();
  const isDark = mode === "dark";
  const C = useMemo(() => buildColors(isDark), [isDark]);
  const S = useStyles(C);
  const muiTheme = useTheme();
  const fullScreen = useMediaQuery(muiTheme.breakpoints.down("sm"));

  const [tab, setTab] = useState(0);
  const [materials, setMaterials] = useState([]);
  const [toast, setToast] = useState({ open: false, msg: "", sev: "success" });
  const notify = useCallback((msg, sev = "success") => setToast({ open: true, msg, sev }), []);

  useEffect(() => {
    let alive = true;
    fetchMaterials()
      .then((list) => { if (alive) setMaterials(Array.isArray(list) ? [...list] : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // jump from an order to the formula of a semi-finished input
  const [jump, setJump] = useState(null);
  const goFormula = useCallback((id) => { setJump({ id }); setTab(0); }, []);
  const selectTab = (v) => { setJump(null); setTab(v); };
  const ctx = { t, C, S, isRtl, lang, fullScreen, materials, notify, goFormula };

  // ── میان‌برها: F1 راهنما · Alt+1/2 تب‌ها (F2 در هر تب ثبت می‌شود) ──
  const [helpOpen, setHelpOpen] = useState(false);
  const pageShortcuts = [
    { combo: "F1", label: t("shortcuts.help"), handler: () => setHelpOpen(true) },
    { combo: "Alt+1", label: `${t("shortcuts.tab_n", { n: 1 })} — ${t("ui_e.tabs.formulas")}`, handler: () => selectTab(0) },
    { combo: "Alt+2", label: `${t("shortcuts.tab_n", { n: 2 })} — ${t("ui_e.tabs.orders")}`, handler: () => selectTab(1) },
  ];
  useShortcuts(pageShortcuts);
  const helpItems = [
    ...pageShortcuts,
    { combo: "F2", label: tab === 0 ? t("ui_g.prod.new_formula") : t("ui_g.prod.new_order") },
    { combo: "Ctrl+D", label: t("shortcuts.save") },
    { combo: "F3", label: t("ui_g.prod.new_line") },
    { combo: "Enter", label: t("shortcuts.confirm") },
    { combo: "Escape", label: t("shortcuts.close_dialog") },
  ];

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ p: { xs: 1, sm: 2 }, maxWidth: 1200, mx: "auto" }}>
      <Typography sx={{ color: C.text, fontWeight: 800, fontSize: { xs: 18, sm: 22 }, mb: 0.5 }}>
        {t("ui_e.page.title")}
      </Typography>
      <Typography sx={{ color: C.sub, fontSize: 13, mb: 2 }}>{t("ui_e.page.subtitle")}</Typography>

      <Tabs
        value={tab} onChange={(_, v) => selectTab(v)} variant="scrollable" scrollButtons="auto"
        sx={{
          mb: 2, minHeight: 40,
          "& .MuiTab-root": { color: C.sub, textTransform: "none", fontWeight: 600, minHeight: 40 },
          "& .Mui-selected": { color: `${C.primary} !important` },
          "& .MuiTabs-indicator": { bgcolor: C.primary },
        }}
      >
        <Tab label={t("ui_e.tabs.formulas")} />
        <Tab label={t("ui_e.tabs.orders")} />
      </Tabs>

      {tab === 0 ? <FormulasTab {...ctx} jump={jump} /> : <OrdersTab {...ctx} />}

      <ShortcutsHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} items={helpItems} />

      <Snackbar
        open={toast.open} autoHideDuration={4500}
        onClose={() => setToast((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={toast.sev} variant="filled" onClose={() => setToast((s) => ({ ...s, open: false }))}>
          {toast.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}

/* ═══════════════════════════════════════════
   Formulations tab
═══════════════════════════════════════════ */
function FormulasTab(ctx) {
  const { t, C, S, notify, jump } = ctx;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(jump ? { id: jump.id } : null); // null | {} (new) | {id}
  const [del, setDel] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState("");

  useShortcuts([{ combo: "F2", label: t("ui_g.prod.new_formula"), handler: () => setEditing({}) }]);

  const load = useCallback(() => {
    setLoading(true);
    fetchFormulas()
      .then((d) => { setRows(Array.isArray(d) ? d : []); setError(""); })
      .catch((e) => setError(errMsg(e, t("ui_e.common.load_failed"))))
      .finally(() => setLoading(false));
  }, [t]);
  useEffect(() => { load(); }, [load]);

  const toggleActive = async (f) => {
    try {
      await updateFormula(f.id, { is_active: !f.is_active });
      load();
    } catch (e) { notify(errMsg(e, t("ui_e.common.save_failed")), "error"); }
  };

  const doDelete = async () => {
    setDelBusy(true); setDelErr("");
    try {
      await deleteFormula(del.id);
      notify(t("ui_e.formulas.deleted"));
      setDel(null); load();
    } catch (e) {
      setDelErr(errMsg(e, t("ui_e.common.save_failed")) + " — " + t("ui_e.formulas.delete_hint"));
    } finally { setDelBusy(false); }
  };

  return (
    <Box sx={S.card}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ color: C.text, fontWeight: 700 }}>{t("ui_e.formulas.list_title")}</Typography>
        <Button sx={S.btn} onClick={() => setEditing({})}>{t("ui_e.formulas.new")}<KbdHint>F2</KbdHint></Button>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading ? (
        <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress size={28} /></Box>
      ) : rows.length === 0 ? (
        <Typography sx={{ color: C.muted, textAlign: "center", py: 4 }}>{t("ui_e.formulas.empty")}</Typography>
      ) : (
        <TableWrap C={C}>
          <Table size="small" sx={{ minWidth: 700 }}>
            <TableHead>
              <TableRow>
                {["name", "code", "output", "batch", "version", "active", "actions"].map((k) => (
                  <TableCell key={k} sx={S.th}>{t(`ui_e.formulas.col_${k}`)}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((f) => (
                <TableRow key={f.id} hover>
                  <TableCell sx={{ ...S.td, fontWeight: 600 }}>{f.name}</TableCell>
                  <TableCell sx={S.td}>{f.code || "—"}</TableCell>
                  <TableCell sx={S.td}>{f.output_material || "—"}</TableCell>
                  <TableCell sx={S.td}>{fmt(f.output_quantity)} {f.output_unit}</TableCell>
                  <TableCell sx={S.td}>{f.version}</TableCell>
                  <TableCell sx={S.td}>
                    <Switch size="small" checked={!!f.is_active} onChange={() => toggleActive(f)}
                      inputProps={{ "aria-label": t("ui_e.formulas.col_active") }} />
                  </TableCell>
                  <TableCell sx={{ ...S.td, whiteSpace: "nowrap" }}>
                    <Button size="small" sx={{ color: C.primary, textTransform: "none" }} onClick={() => setEditing(f)}>{t("ui_e.common.edit")}</Button>
                    <Button size="small" sx={{ color: C.danger, textTransform: "none" }} onClick={() => { setDelErr(""); setDel(f); }}>{t("ui_e.common.delete")}</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
      )}

      {editing && (
        <FormulaDialog key={editing.id || "new"} ctx={ctx} formula={editing}
          openFormula={(id) => setEditing({ id })} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); notify(t("ui_e.formulas.saved")); }} />
      )}

      <ConfirmDialog ctx={ctx} open={!!del} danger busy={delBusy} error={delErr}
        title={t("ui_e.formulas.delete_title")}
        text={t("ui_e.formulas.delete_text", { name: del?.name })}
        confirmLabel={t("ui_e.common.delete")}
        onClose={() => setDel(null)} onConfirm={doDelete} />
    </Box>
  );
}

function FormulaDialog({ ctx, formula, openFormula, onClose, onSaved }) {
  const { t, C, S, fullScreen, materials } = ctx;
  const isEdit = !!formula.id;
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [notes, setNotes] = useState("");
  const [outId, setOutId] = useState("");
  const [outQty, setOutQty] = useState("1");
  const [lines, setLines] = useState([{ key: newKey(), material_id: "", quantity: "", wastage: "0" }]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [jumpTo, setJumpTo] = useState(null);
  const [subs, setSubs] = useState({}); // output material id -> formula id (active formulas)

  useEffect(() => {
    let alive = true;
    fetchFormulas()
      .then((list) => {
        if (!alive) return;
        const m = {};
        (Array.isArray(list) ? list : []).forEach((f) => {
          if (f.is_active && f.id !== formula.id && !m[String(f.output_material_id)]) m[String(f.output_material_id)] = f.id;
        });
        setSubs(m);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [formula.id]);

  useEffect(() => {
    if (!isEdit) return;
    let alive = true;
    fetchFormula(formula.id)
      .then((f) => {
        if (!alive) return;
        setName(f.name || ""); setCode(f.code || ""); setNotes(f.notes || "");
        setOutId(String(f.output_material_id ?? "")); setOutQty(String(f.output_quantity ?? "1"));
        setLines((f.lines || []).map((l) => ({
          key: newKey(), material_id: String(l.material_id), quantity: String(l.quantity),
          wastage: String(l.wastage_percent ?? 0), notes: l.notes || "", unit_price: l.unit_price,
          unit: l.unit, material: l.material, material_type: l.material_type,
          stock: l.stock_quantity, sub_formula_id: l.sub_formula_id,
        })));
      })
      .catch((e) => alive && setError(errMsg(e, t("ui_e.common.load_failed"))))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [isEdit, formula.id, t]);

  const matById = useMemo(() => {
    const m = {};
    materials.forEach((x) => { m[String(x.id)] = x; });
    return m;
  }, [materials]);

  // include materials of loaded lines that might be missing from the picker list
  const options = useMemo(() => {
    const list = [...materials];
    lines.forEach((l) => {
      if (l.material_id && !matById[l.material_id]) {
        list.push({ id: l.material_id, name: l.material || `#${l.material_id}`, unit: l.unit, price: l.unit_price });
      }
    });
    return list;
  }, [materials, lines, matById]);

  const optById = (id) => matById[id] || options.find((o) => String(o.id) === id);
  const unitOf = (id) => optById(id)?.unit || "";
  const priceOf = (l) => {
    const p = num(optById(l.material_id)?.price);
    if (Number.isFinite(p)) return p;
    const q = num(l.unit_price);
    return Number.isFinite(q) ? q : 0;
  };

  const used = new Set(lines.map((l) => l.material_id).filter(Boolean));
  const batchCost = lines.reduce((s, l) => {
    const q = num(l.quantity), w = num(l.wastage);
    if (!(q > 0)) return s;
    return s + q * (1 + (Number.isFinite(w) ? w : 0) / 100) * priceOf(l);
  }, 0);

  const setLine = (key, patch) => { setDirty(true); setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l))); };

  // stock for a line: the material picker's current quantity, else the value loaded with the formula
  const stockOf = (l) => {
    const m = matById[l.material_id];
    const v = m ? Number(m.quantity) : Number(l.stock);
    return Number.isFinite(v) ? v : 0;
  };
  const needOf = (l) => {
    const q = num(l.quantity), w = num(l.wastage);
    return q > 0 ? q * (1 + (Number.isFinite(w) ? w : 0) / 100) : 0;
  };
  const typeOf = (l) => matById[l.material_id]?.material_type || l.material_type;
  const subOf = (l) => subs[l.material_id] || null;
  const filled = lines.filter((l) => l.material_id && needOf(l) > 0);
  const shortCount = filled.filter((l) => stockOf(l) < needOf(l)).length;
  const tryJump = (id) => { if (dirty) setJumpTo(id); else openFormula(id); };

  const lineErr = (l) => ({
    mat: !l.material_id,
    qty: !(num(l.quantity) > 0),
    waste: !(num(l.wastage) >= 0 && num(l.wastage) < 100),
  });
  const valid =
    name.trim() && outId && num(outQty) > 0 && lines.length > 0 &&
    lines.every((l) => { const e = lineErr(l); return !e.mat && !e.qty && !e.waste; });

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    setSaving(true); setError("");
    const body = {
      name: name.trim(), code: code.trim(), notes: notes.trim(),
      output_material_id: Number(outId), output_quantity: num(outQty),
      lines: lines.map((l) => ({
        material_id: Number(l.material_id), quantity: num(l.quantity),
        wastage_percent: num(l.wastage) || 0, notes: l.notes || "",
      })),
    };
    try {
      if (isEdit) await updateFormula(formula.id, body);
      else await createFormula(body);
      onSaved();
    } catch (e) {
      setError(errMsg(e, t("ui_e.common.save_failed")));
    } finally { setSaving(false); }
  };

  const addLine = () => { setDirty(true); setLines((ls) => [...ls, { key: newKey(), material_id: "", quantity: "", wastage: "0" }]); };

  useShortcuts([
    { combo: "Ctrl+D", label: t("ui_g.prod.save"), scope: "dialog", handler: () => { if (!saving && !loading) submit(); } },
    { combo: "Enter", label: t("shortcuts.confirm"), scope: "dialog", allowInInput: true,
      handler: (e) => (enterIsNative(e) || saving || loading ? false : submit()) },
    { combo: "F3", label: t("ui_g.prod.new_line"), scope: "dialog", handler: addLine },
  ]);

  const typeLabel = (m) => (m?.material_type ? ` · ${t(`ui_e.types.${m.material_type}`, { defaultValue: m.material_type })}` : "");

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullScreen={fullScreen} maxWidth="md" fullWidth PaperProps={{ sx: S.dialogPaper }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{isEdit ? t("ui_e.formulas.edit_title") : t("ui_e.formulas.new_title")}</DialogTitle>
      <DialogContent dividers sx={{ borderColor: C.divider }}>
        {loading ? <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress size={28} /></Box> : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 0.5 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr" } }}>
              <TextField label={t("ui_e.formulas.f_name")} value={name} onChange={(e) => setName(e.target.value)} size="small" sx={S.field}
                error={touched && !name.trim()} required />
              <TextField label={t("ui_e.formulas.f_code")} value={code} onChange={(e) => setCode(e.target.value)} size="small" sx={S.field} />
            </Box>
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr" } }}>
              <TextField select label={t("ui_e.formulas.f_output")} value={outId} onChange={(e) => setOutId(e.target.value)}
                size="small" sx={S.field} error={touched && !outId} required>
                {options.filter((m) => !used.has(String(m.id))).concat(outId && used.has(outId) ? [optById(outId)] : []).map((m) => (
                  <MenuItem key={m.id} value={String(m.id)}>{m.name}{typeLabel(m)}</MenuItem>
                ))}
              </TextField>
              <TextField label={t("ui_e.formulas.f_batch_qty")} value={outQty} onChange={(e) => setOutQty(e.target.value)}
                size="small" sx={S.field} type="number" inputProps={{ min: 0, step: "any", inputMode: "decimal" }}
                error={touched && !(num(outQty) > 0)}
                InputProps={{ endAdornment: <Typography sx={{ color: C.muted, fontSize: 12 }}>{unitOf(outId)}</Typography> }} />
            </Box>

            <Typography sx={{ color: C.text, fontWeight: 700, mt: 1 }}>{t("ui_e.formulas.lines_title")}</Typography>
            <TableWrap C={C}>
              <Table size="small" sx={{ minWidth: 820 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={S.th}>{t("ui_e.formulas.l_material")}</TableCell>
                    <TableCell sx={S.th}>{t("ui_prod.col_qty_batch")}</TableCell>
                    <TableCell sx={S.th}>{t("ui_prod.col_waste")}</TableCell>
                    <TableCell sx={S.th}>{t("ui_prod.col_stock")}</TableCell>
                    <TableCell sx={S.th}>{t("ui_prod.col_status")}</TableCell>
                    <TableCell sx={S.th} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lines.map((l) => {
                    const e = touched ? lineErr(l) : {};
                    return (
                      <TableRow key={l.key}>
                        <TableCell sx={{ ...S.td, minWidth: 200 }}>
                          <TextField select fullWidth size="small" value={l.material_id} sx={S.field}
                            onChange={(ev) => setLine(l.key, { material_id: ev.target.value })} error={!!e.mat}>
                            {options.filter((m) => !used.has(String(m.id)) || String(m.id) === l.material_id).map((m) => (
                              <MenuItem key={m.id} value={String(m.id)}>{m.name}{typeLabel(m)}</MenuItem>
                            ))}
                          </TextField>
                          {l.material_id && (
                            <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0.75, mt: 0.5 }}>
                              <TypeBadge t={t} C={C} type={typeOf(l)} />
                              {subOf(l) && (
                                <SubFormulaButton t={t} C={C} name={optById(l.material_id)?.name || l.material || ""}
                                  onOpen={() => tryJump(subOf(l))} />
                              )}
                            </Box>
                          )}
                        </TableCell>
                        <TableCell sx={{ ...S.td, minWidth: 140 }}>
                          <TextField size="small" type="number" value={l.quantity} sx={S.field} error={!!e.qty}
                            onChange={(ev) => setLine(l.key, { quantity: ev.target.value })}
                            inputProps={{ min: 0, step: "any", inputMode: "decimal" }}
                            InputProps={{ endAdornment: <Typography sx={{ color: C.muted, fontSize: 12, ms: 0.5 }}>{unitOf(l.material_id)}</Typography> }} />
                        </TableCell>
                        <TableCell sx={{ ...S.td, minWidth: 100 }}>
                          <TextField size="small" type="number" value={l.wastage} sx={S.field} error={!!e.waste}
                            onChange={(ev) => setLine(l.key, { wastage: ev.target.value })}
                            inputProps={{ min: 0, max: 99.99, step: "any", inputMode: "decimal" }}
                            InputProps={{ endAdornment: <Typography sx={{ color: C.muted, fontSize: 12 }}>%</Typography> }} />
                        </TableCell>
                        <TableCell sx={{ ...S.td, whiteSpace: "nowrap" }}>
                          {l.material_id ? `${fmt(stockOf(l))} ${unitOf(l.material_id)}` : "—"}
                        </TableCell>
                        <TableCell sx={{ ...S.td, whiteSpace: "nowrap" }}>
                          {l.material_id && needOf(l) > 0
                            ? <StatusCell t={t} C={C} status={lineStatus(stockOf(l), needOf(l))} />
                            : "—"}
                        </TableCell>
                        <TableCell sx={S.td}>
                          <IconButton size="small" aria-label={t("ui_e.common.remove")} disabled={lines.length === 1}
                            onClick={() => { setDirty(true); setLines((ls) => ls.filter((x) => x.key !== l.key)); }} sx={{ color: C.danger }}>✕</IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableWrap>
            {filled.length > 0 && (
              <ReadyBanner t={t} ready={shortCount === 0} count={shortCount}
                okText={t("ui_prod.formula_banner_ok")}
                shortText={t("ui_prod.formula_banner_short", { count: shortCount })} />
            )}
            <Typography sx={{ color: C.muted, fontSize: 12 }}>{t("ui_prod.formula_stock_hint")}</Typography>
            <Box>
              <Button variant="outlined" sx={S.ghost} onClick={addLine}>
                + {t("ui_e.formulas.add_line")}<KbdHint>F3</KbdHint>
              </Button>
            </Box>

            <TextField label={t("ui_e.formulas.f_notes")} value={notes} onChange={(e) => setNotes(e.target.value)}
              size="small" sx={S.field} multiline minRows={2} />

            <Box sx={{ bgcolor: C.infoBg, border: `1px solid ${C.glassBorder}`, borderRadius: 2, p: 1.5, display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
              <Typography sx={{ color: C.sub, fontSize: 13 }}>{t("ui_e.formulas.est_cost")}</Typography>
              <Typography sx={{ color: C.text, fontWeight: 800 }}>
                {fmt(batchCost)}
                {num(outQty) > 0 && (
                  <Box component="span" sx={{ color: C.sub, fontWeight: 500, fontSize: 12, ms: 1 }}>
                    {" "}({t("ui_e.formulas.per_unit")}: {fmt(batchCost / num(outQty))})
                  </Box>
                )}
              </Typography>
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="outlined" sx={S.ghost} onClick={onClose} disabled={saving}>{t("ui_e.common.cancel")}</Button>
        <Button sx={S.btn} onClick={submit} disabled={saving || loading}>
          {saving ? <CircularProgress size={18} color="inherit" /> : <>{t("ui_e.common.save")}<KbdHint>Ctrl+D</KbdHint></>}
        </Button>
      </DialogActions>
      <ConfirmDialog ctx={ctx} open={!!jumpTo} title={t("ui_prod.jump_confirm_title")}
        text={t("ui_prod.jump_confirm_text")} confirmLabel={t("ui_prod.jump_confirm")}
        onClose={() => setJumpTo(null)} onConfirm={() => openFormula(jumpTo)} />
    </Dialog>
  );
}

/* ═══════════════════════════════════════════
   Production line tab
═══════════════════════════════════════════ */
const orderRows = (o) => (o.lines || []).map((l) => ({
  key: l.material_id, material: l.material, type: l.material_type, unit: l.unit,
  required: l.required, available: l.available, missing: l.missing,
  subFormulaId: l.sub_formula_id,
}));

function OrdersTab(ctx) {
  const { t, C, S, lang, notify } = ctx;
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState(null); // {id, data?}
  const [action, setAction] = useState(null); // {type, order}
  const [actBusy, setActBusy] = useState(false);
  const [actErr, setActErr] = useState("");
  const [prodQty, setProdQty] = useState("");
  const [cRaw, setCDataRaw] = useState(null); // {id, data}: order with per-line stock, for the complete dialog

  useShortcuts([{ combo: "F2", label: t("ui_g.prod.new_order"), handler: () => setCreating(true) }]);

  const load = useCallback(() => {
    setLoading(true);
    fetchOrders(status)
      .then((d) => { setRows(Array.isArray(d) ? d : []); setError(""); })
      .catch((e) => setError(errMsg(e, t("ui_e.common.load_failed"))))
      .finally(() => setLoading(false));
  }, [status, t]);
  useEffect(() => { load(); }, [load]);

  const statusColor = (s) => ({
    planned: [C.info, C.infoBg], in_progress: [C.warning, C.warningBg],
    completed: [C.success, C.successBg], cancelled: [C.muted, C.divider],
  }[s] || [C.muted, C.divider]);

  const StatusChip = ({ s }) => {
    const [fg, bg] = statusColor(s);
    return <Chip size="small" label={t(`ui_e.status.${s}`, { defaultValue: s })} sx={{ color: fg, bgcolor: bg, fontWeight: 700 }} />;
  };

  const openAction = (type, order) => {
    setActErr(""); setProdQty(String(order.planned_quantity ?? "")); setAction({ type, order });
  };

  const runAction = async () => {
    const { type, order } = action;
    if (type === "complete" && !(num(prodQty) > 0)) { setActErr(t("ui_e.orders.qty_invalid")); return; }
    if (type === "complete" && !canComplete) return;
    setActBusy(true); setActErr("");
    try {
      const fn = type === "start" ? () => startOrder(order.id)
        : type === "cancel" ? () => cancelOrder(order.id)
        : () => completeOrder(order.id, num(prodQty));
      const updated = await fn();
      notify(t(`ui_e.orders.done_${type}`));
      setAction(null);
      if (detail?.id === order.id) setDetail({ id: order.id, data: updated, refresh: Date.now() });
      load();
    } catch (e) {
      setActErr(errMsg(e, t("ui_e.common.save_failed")));
    } finally { setActBusy(false); }
  };

  const completeOpen = !!action && action.type === "complete";
  const completeOrderId = completeOpen ? action.order.id : null;
  useEffect(() => {
    if (!completeOrderId) return undefined;
    let alive = true;
    fetchOrder(completeOrderId)
      .then((o) => alive && setCDataRaw({ id: completeOrderId, data: o }))
      .catch(() => alive && setCDataRaw({ id: completeOrderId, data: { loadError: true } }));
    return () => { alive = false; };
  }, [completeOrderId]);
  const cData = cRaw && cRaw.id === completeOrderId ? cRaw.data : null;
  // blocked only when stock is known to be short (a failed load leaves the decision to the server)
  const canComplete = !!cData && (cData.loadError || cData.ready !== false);
  useShortcuts([
    { combo: "Ctrl+D", label: t("shortcuts.confirm"), scope: "dialog",
      handler: () => { if (!actBusy && canComplete && num(prodQty) > 0) runAction(); } },
    { combo: "Enter", label: t("shortcuts.confirm"), scope: "dialog", allowInInput: true,
      handler: (e) => (enterIsNative(e) || actBusy || !canComplete || !(num(prodQty) > 0) ? false : runAction()) },
  ], { enabled: completeOpen });

  const rowActions = (o) => (
    <Box sx={{ whiteSpace: "nowrap" }}>
      <Button size="small" sx={{ color: C.primary, textTransform: "none" }} onClick={() => setDetail({ id: o.id })}>{t("ui_e.orders.details")}</Button>
      {o.status === "planned" && <Button size="small" sx={{ color: C.success, textTransform: "none" }} onClick={() => openAction("start", o)}>{t("ui_e.orders.start")}</Button>}
      {o.status === "in_progress" && <Button size="small" sx={{ color: C.success, textTransform: "none" }} onClick={() => openAction("complete", o)}>{t("ui_e.orders.complete")}</Button>}
      {(o.status === "planned" || o.status === "in_progress") && <Button size="small" sx={{ color: C.danger, textTransform: "none" }} onClick={() => openAction("cancel", o)}>{t("ui_e.orders.cancel")}</Button>}
    </Box>
  );

  return (
    <Box sx={S.card}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, gap: 1, flexWrap: "wrap" }}>
        <TextField select size="small" label={t("ui_e.orders.filter_status")} value={status}
          onChange={(e) => setStatus(e.target.value)} sx={{ ...S.field, minWidth: 180 }}>
          <MenuItem value="">{t("ui_e.orders.all")}</MenuItem>
          {STATUSES.map((s) => <MenuItem key={s} value={s}>{t(`ui_e.status.${s}`)}</MenuItem>)}
        </TextField>
        <Button sx={S.btn} onClick={() => setCreating(true)}>{t("ui_e.orders.new")}<KbdHint>F2</KbdHint></Button>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading ? (
        <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress size={28} /></Box>
      ) : rows.length === 0 ? (
        <Typography sx={{ color: C.muted, textAlign: "center", py: 4 }}>{t("ui_e.orders.empty")}</Typography>
      ) : (
        <TableWrap C={C}>
          <Table size="small" sx={{ minWidth: 820 }}>
            <TableHead>
              <TableRow>
                {["number", "formula", "product", "planned", "produced", "status", "unit_cost", "total_cost", "date", "actions"].map((k) => (
                  <TableCell key={k} sx={S.th}>{t(`ui_e.orders.col_${k}`)}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((o) => (
                <TableRow key={o.id} hover>
                  <TableCell sx={{ ...S.td, fontWeight: 600 }}>{o.number}</TableCell>
                  <TableCell sx={S.td}>{o.formula}</TableCell>
                  <TableCell sx={S.td}>{o.output_material}</TableCell>
                  <TableCell sx={S.td}>{fmt(o.planned_quantity)} {o.output_unit}</TableCell>
                  <TableCell sx={S.td}>{o.status === "completed" ? `${fmt(o.produced_quantity)} ${o.output_unit || ""}` : "—"}</TableCell>
                  <TableCell sx={S.td}><StatusChip s={o.status} /></TableCell>
                  <TableCell sx={S.td}>{o.status === "completed" ? fmt(o.unit_cost) : "—"}</TableCell>
                  <TableCell sx={S.td}>{o.status === "completed" ? fmt(o.total_cost) : "—"}</TableCell>
                  <TableCell sx={S.td}>{fmtDate(o.created_at, lang)}</TableCell>
                  <TableCell sx={S.td}>{rowActions(o)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
      )}

      {creating && (
        <OrderCreateDialog ctx={ctx} onClose={() => setCreating(false)}
          onCreated={(o) => { setCreating(false); load(); notify(t("ui_e.orders.created")); setDetail({ id: o.id, data: o }); }} />
      )}

      {detail && (
        <OrderDetailDialog ctx={ctx} detail={detail} StatusChip={StatusChip}
          onClose={() => setDetail(null)} openAction={openAction} actionOpen={!!action} />
      )}

      {/* start / cancel confirm */}
      <ConfirmDialog ctx={ctx} open={!!action && action.type !== "complete"} busy={actBusy} error={actErr}
        danger={action?.type === "cancel"}
        title={action ? t(`ui_e.orders.confirm_${action.type}_title`) : ""}
        text={action ? t(`ui_e.orders.confirm_${action.type}_text`, { number: action.order.number }) : ""}
        confirmLabel={action ? t(`ui_e.orders.${action.type}`) : ""}
        onClose={() => setAction(null)} onConfirm={runAction} />

      {/* complete dialog */}
      <Dialog open={!!action && action.type === "complete"} onClose={actBusy ? undefined : () => setAction(null)}
        fullScreen={ctx.fullScreen} maxWidth="md" fullWidth PaperProps={{ sx: S.dialogPaper }}>
        <DialogTitle sx={{ fontWeight: 700 }}>{t("ui_e.orders.confirm_complete_title")}</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: C.sub, fontSize: 14, mb: 2 }}>
            {t("ui_e.orders.confirm_complete_text", { number: action?.order.number })}
          </Typography>
          {!cData ? (
            <Box sx={{ textAlign: "center", py: 2 }}><CircularProgress size={22} /></Box>
          ) : cData.lines && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mb: 2 }}>
              <ReadyBanner t={t} ready={cData.ready} count={(cData.shortages || []).length} />
              <RequirementsTable ctx={ctx} rows={orderRows(cData)} onOpenFormula={ctx.goFormula} />
            </Box>
          )}
          <TextField fullWidth size="small" type="number" label={t("ui_e.orders.produced_qty")} value={prodQty}
            onChange={(e) => setProdQty(e.target.value)} sx={S.field}
            inputProps={{ min: 0, step: "any", inputMode: "decimal" }} error={!(num(prodQty) > 0)}
            InputProps={{ endAdornment: <Typography sx={{ color: C.muted, fontSize: 12 }}>{action?.order.output_unit}</Typography> }} />
          {actErr && <Alert severity="error" sx={{ mt: 2 }}>{actErr}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, flexWrap: "wrap", gap: 1 }}>
          {cData && !canComplete && (
            <Typography id="complete-blocked-reason" role="alert"
              sx={{ color: C.danger, fontSize: 13, fontWeight: 600, flex: "1 1 100%" }}>
              {t("ui_prod.complete_blocked_short", { count: (cData.shortages || []).length })}
            </Typography>
          )}
          <Button variant="outlined" sx={S.ghost} onClick={() => setAction(null)} disabled={actBusy}>{t("ui_e.common.cancel")}</Button>
          <Button sx={S.btn} onClick={runAction} disabled={actBusy || !canComplete || !(num(prodQty) > 0)}
            aria-describedby={cData && !canComplete ? "complete-blocked-reason" : undefined}>
            {actBusy ? <CircularProgress size={18} color="inherit" /> : <>{t("ui_e.orders.complete")}<KbdHint>Ctrl+D</KbdHint></>}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function OrderCreateDialog({ ctx, onClose, onCreated }) {
  const { t, C, S, fullScreen } = ctx;
  const [formulas, setFormulas] = useState([]);
  const [fid, setFid] = useState("");
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    fetchFormulas()
      .then((d) => setFormulas((Array.isArray(d) ? d : []).filter((f) => f.is_active)))
      .catch((e) => setError(errMsg(e, t("ui_e.common.load_failed"))));
  }, [t]);

  const sel = formulas.find((f) => String(f.id) === fid);
  const valid = fid && num(qty) > 0;

  // live preview: required vs stock for the chosen formula and quantity
  const [fullRaw, setFullRaw] = useState(null);
  useEffect(() => {
    if (!fid) return undefined;
    let alive = true;
    fetchFormula(fid).then((f) => alive && setFullRaw({ id: fid, data: f })).catch(() => {});
    return () => { alive = false; };
  }, [fid]);
  const full = fid && fullRaw && fullRaw.id === fid ? fullRaw.data : null;
  const previewRows = useMemo(() => {
    const q = num(qty);
    if (!full || !(q > 0) || !(Number(full.output_quantity) > 0)) return [];
    const scale = q / Number(full.output_quantity);
    return (full.lines || []).map((l) => {
      const required = Math.round(l.quantity * scale * (1 + l.wastage_percent / 100) * 1000) / 1000;
      const available = Number(l.stock_quantity) || 0;
      return {
        key: l.material_id, material: l.material, type: l.material_type, unit: l.unit,
        required, available, missing: Math.max(required - available, 0), subFormulaId: l.sub_formula_id,
      };
    });
  }, [full, qty]);
  const previewShort = previewRows.filter((r) => r.missing > 0).length;

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    setSaving(true); setError("");
    try {
      const o = await createOrder({ formula_id: Number(fid), planned_quantity: num(qty), notes: notes.trim() });
      onCreated(o);
    } catch (e) {
      setError(errMsg(e, t("ui_e.common.save_failed")));
    } finally { setSaving(false); }
  };

  useShortcuts([
    { combo: "Ctrl+D", label: t("ui_g.prod.create"), scope: "dialog", handler: () => { if (!saving) submit(); } },
    { combo: "Enter", label: t("shortcuts.confirm"), scope: "dialog", allowInInput: true,
      handler: (e) => (enterIsNative(e) || saving ? false : submit()) },
  ]);

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullScreen={fullScreen} maxWidth="md" fullWidth PaperProps={{ sx: S.dialogPaper }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{t("ui_e.orders.new_title")}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField select size="small" label={t("ui_e.orders.f_formula")} value={fid} sx={S.field}
            onChange={(e) => { setFid(e.target.value); const f = formulas.find((x) => String(x.id) === e.target.value); if (f && !qty) setQty(String(f.output_quantity)); }}
            error={touched && !fid} helperText={formulas.length === 0 ? t("ui_e.orders.no_active_formulas") : ""}>
            {formulas.map((f) => <MenuItem key={f.id} value={String(f.id)}>{f.name} — {f.output_material}</MenuItem>)}
          </TextField>
          <TextField size="small" type="number" label={t("ui_e.orders.f_planned")} value={qty} sx={S.field}
            onChange={(e) => setQty(e.target.value)} inputProps={{ min: 0, step: "any", inputMode: "decimal" }}
            error={touched && !(num(qty) > 0)}
            InputProps={{ endAdornment: <Typography sx={{ color: C.muted, fontSize: 12 }}>{sel?.output_unit}</Typography> }} />
          {fid && num(qty) > 0 && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              <Typography sx={{ color: C.text, fontWeight: 700 }}>{t("ui_prod.preview_title")}</Typography>
              {!full ? (
                <Typography sx={{ color: C.muted, fontSize: 13 }}>{t("ui_prod.preview_loading")}</Typography>
              ) : (
                <>
                  <ReadyBanner t={t} ready={previewShort === 0} count={previewShort} />
                  <RequirementsTable ctx={ctx} rows={previewRows} />
                  <Typography sx={{ color: C.muted, fontSize: 12 }}>{t("ui_prod.preview_hint")}</Typography>
                </>
              )}
            </Box>
          )}
          <TextField size="small" label={t("ui_e.orders.f_notes")} value={notes} sx={S.field}
            onChange={(e) => setNotes(e.target.value)} multiline minRows={2} />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="outlined" sx={S.ghost} onClick={onClose} disabled={saving}>{t("ui_e.common.cancel")}</Button>
        <Button sx={S.btn} onClick={submit} disabled={saving}>
          {saving ? <CircularProgress size={18} color="inherit" /> : <>{t("ui_e.orders.create")}<KbdHint>Ctrl+D</KbdHint></>}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function OrderDetailDialog({ ctx, detail, StatusChip, onClose, openAction, actionOpen }) {
  const { t, C, S, fullScreen, lang } = ctx;
  const [order, setOrder] = useState(detail.data || null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetchOrder(detail.id)
      .then((o) => alive && setOrder(o))
      .catch((e) => alive && setError(errMsg(e, t("ui_e.common.load_failed"))));
    return () => { alive = false; };
  }, [detail.id, detail.refresh, t]);

  const shortages = order?.shortages || [];
  const shortById = {};
  shortages.forEach((s) => { shortById[s.material_id] = s; });
  const active = order && (order.status === "planned" || order.status === "in_progress");

  // Ctrl+D = عمل اصلی (شروع / تکمیل)، وقتی دیالوگ تأیید روی آن باز نیست
  useShortcuts([
    { combo: "Ctrl+D", label: t("ui_g.prod.confirm"), scope: "dialog",
      handler: () => {
        if (order?.status === "planned") openAction("start", order);
        else if (order?.status === "in_progress" && order.ready !== false) openAction("complete", order);
        else return false;
        return true;
      } },
  ], { enabled: !actionOpen });

  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} maxWidth="md" fullWidth PaperProps={{ sx: S.dialogPaper }}>
      <DialogTitle sx={{ fontWeight: 700, display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
        {t("ui_e.orders.detail_title")} {order?.number}
        {order && <StatusChip s={order.status} />}
      </DialogTitle>
      <DialogContent dividers sx={{ borderColor: C.divider }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {!order ? <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress size={28} /></Box> : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" } }}>
              {[
                ["product", order.output_material],
                ["planned", `${fmt(order.planned_quantity)} ${order.output_unit || ""}`],
                ["produced", order.status === "completed" ? `${fmt(order.produced_quantity)} ${order.output_unit || ""}` : "—"],
                ["created", fmtDate(order.created_at, lang)],
                ["total_cost", order.status === "completed" ? fmt(order.total_cost) : "—"],
                ["unit_cost", order.status === "completed" ? fmt(order.unit_cost) : "—"],
              ].map(([k, v]) => (
                <Box key={k}>
                  <Typography sx={{ color: C.muted, fontSize: 11 }}>{t(`ui_e.orders.col_${k}`)}</Typography>
                  <Typography sx={{ color: C.text, fontWeight: 600, fontSize: 14 }}>{v}</Typography>
                </Box>
              ))}
            </Box>
            {order.notes && <Typography sx={{ color: C.sub, fontSize: 13 }}>{order.notes}</Typography>}

            {order.lines && active && (
              <>
                <Typography sx={{ color: C.text, fontWeight: 700 }}>{t("ui_e.orders.required_title")}</Typography>
                <ReadyBanner t={t} ready={order.ready} count={shortages.length} />
                <RequirementsTable ctx={ctx} rows={orderRows(order)} onOpenFormula={ctx.goFormula} />
              </>
            )}
            {order.required && !(order.lines && active) && (
              <>
                <Typography sx={{ color: C.text, fontWeight: 700 }}>{t("ui_e.orders.required_title")}</Typography>
                {shortages.length > 0 && active && (
                  <Alert severity="error">{t("ui_e.orders.shortage_warning", { count: shortages.length })}</Alert>
                )}
                <TableWrap C={C}>
                  <Table size="small" sx={{ minWidth: 480 }}>
                    <TableHead>
                      <TableRow>
                        {["material", "required", "available", "missing"].map((k) => (
                          <TableCell key={k} sx={S.th}>{t(`ui_e.orders.r_${k}`)}</TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {order.required.map((r) => {
                        const s = shortById[r.material_id];
                        return (
                          <TableRow key={r.material_id} sx={s ? { bgcolor: C.dangerBg } : undefined}>
                            <TableCell sx={{ ...S.td, color: s ? C.danger : C.text, fontWeight: s ? 700 : 400 }}>{r.material}</TableCell>
                            <TableCell sx={S.td}>{fmt(r.quantity)} {r.unit}</TableCell>
                            <TableCell sx={S.td}>{s ? `${fmt(s.available)} ${r.unit}` : "—"}</TableCell>
                            <TableCell sx={{ ...S.td, color: C.danger, fontWeight: 700 }}>{s ? `${fmt(s.missing)} ${r.unit}` : "—"}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableWrap>
              </>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, flexWrap: "wrap", gap: 1 }}>
        <Button variant="outlined" sx={S.ghost} onClick={onClose}>{t("ui_e.common.close")}</Button>
        {order?.status === "planned" && <Button sx={S.btn} onClick={() => openAction("start", order)}>{t("ui_e.orders.start")}<KbdHint>Ctrl+D</KbdHint></Button>}
        {order?.status === "in_progress" && order.ready === false && (
          <Typography id="detail-blocked-reason" role="alert"
            sx={{ color: C.danger, fontSize: 13, fontWeight: 600, flex: "1 1 100%" }}>
            {t("ui_prod.complete_blocked_short", { count: shortages.length })}
          </Typography>
        )}
        {order?.status === "in_progress" && (
          <Button sx={S.btn} disabled={order.ready === false} onClick={() => openAction("complete", order)}
            aria-describedby={order.ready === false ? "detail-blocked-reason" : undefined}>
            {t("ui_e.orders.complete")}<KbdHint>Ctrl+D</KbdHint>
          </Button>
        )}
        {active && <Button variant="outlined" sx={{ ...S.ghost, color: C.danger, borderColor: C.danger }} onClick={() => openAction("cancel", order)}>{t("ui_e.orders.cancel")}</Button>}
      </DialogActions>
    </Dialog>
  );
}
