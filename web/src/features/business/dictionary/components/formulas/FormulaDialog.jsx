import { useState, useMemo, useEffect } from "react";
import {
  Box, Typography, Button, Table, TableHead, TableBody, TableRow, TableCell, TextField, IconButton, CircularProgress,
} from "@mui/material";
import { num, fmt, newKey, TypeBadge, StatusCell, SubFormulaButton, ReadyBanner, lineStatus } from "@business/production/common";
import { FormDialog, TableWrap, ConfirmDialog, useRegisteredShortcuts, KINDS } from "../../common";
import { fetchFormulas, fetchFormula, createFormula, updateFormula, errMsg } from "../../api";
import ItemDialog from "../ItemDialog";
import ItemPicker from "./ItemPicker";

const blankLine = () => ({ key: newKey(), material_id: "", quantity: "", wastage: "0" });
const OUTPUT_KINDS = KINDS.filter((k) => k !== "raw");

/**
 * Formula editor: output item (any kind except raw) + batch quantity + input lines.
 * Lines whose item has its own formula show a button that opens that formula.
 */
export default function FormulaDialog({ ctx, formula, materials, reloadMaterials, openFormula, onClose, onSaved }) {
  const { t, C, S } = ctx;
  const isEdit = !!formula.id;
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [notes, setNotes] = useState("");
  const [outId, setOutId] = useState("");
  const [outQty, setOutQty] = useState("1");
  const [lines, setLines] = useState([blankLine()]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [jumpTo, setJumpTo] = useState(null);
  const [quick, setQuick] = useState(null); // { name, kind, target: "out" | line key }
  const [extra, setExtra] = useState([]); // items created from this dialog (until the list reloads)
  const [subs, setSubs] = useState({}); // output item id -> active formula id

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
    if (!isEdit) return undefined;
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
      .catch((e) => alive && setError(errMsg(e, t("ui_def.common.load_failed"))))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [isEdit, formula.id, t]);

  const allMaterials = useMemo(
    () => [...materials, ...extra.filter((x) => !materials.some((m) => m.id === x.id))],
    [materials, extra],
  );
  const matById = useMemo(() => {
    const m = {};
    allMaterials.forEach((x) => { m[String(x.id)] = x; });
    return m;
  }, [allMaterials]);

  // keep items of loaded lines that the picker list may not contain
  const options = useMemo(() => {
    const list = [...allMaterials];
    lines.forEach((l) => {
      if (l.material_id && !matById[l.material_id]) {
        list.push({ id: l.material_id, name: l.material || `#${l.material_id}`, unit: l.unit, price: l.unit_price, quantity: l.stock, material_type: l.material_type });
      }
    });
    return list;
  }, [allMaterials, lines, matById]);

  const optById = (id) => matById[id] || options.find((o) => String(o.id) === id);
  const unitOf = (id) => optById(id)?.unit || "";
  const unitText = (id) => (unitOf(id) ? t(`ui_def.units.${unitOf(id)}`, { defaultValue: unitOf(id) }) : "");
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

  const outOptions = options.filter((m) => m.material_type !== "raw" || String(m.id) === outId).filter((m) => !used.has(String(m.id)));
  const lineErr = (l) => ({ mat: !l.material_id, qty: !(num(l.quantity) > 0), waste: !(num(l.wastage) >= 0 && num(l.wastage) < 100) });
  const valid = name.trim() && outId && num(outQty) > 0 && lines.length > 0 &&
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
      setError(errMsg(e, t("ui_def.common.save_failed")));
    } finally { setSaving(false); }
  };

  const addLine = () => { setDirty(true); setLines((ls) => [...ls, blankLine()]); };
  const nested = !!jumpTo || !!quick;
  useRegisteredShortcuts([
    { combo: "F3", label: t("ui_g.prod.new_line"), scope: "dialog", handler: addLine },
  ], { enabled: !nested });

  const onItemCreated = async (item) => {
    const target = quick.target;
    setQuick(null);
    setExtra((l) => [...l, { id: item.id, name: item.name, unit: item.unit, price: item.price ?? 0, quantity: 0, material_type: item.material_type }]);
    reloadMaterials();
    setDirty(true);
    if (target === "out") setOutId(String(item.id));
    else setLine(target, { material_id: String(item.id) });
  };

  return (
    <>
      <FormDialog ctx={ctx} maxWidth="md" saving={saving} error={error} disabled={loading} shortcuts={!nested}
        onClose={onClose} onSave={submit}
        title={isEdit ? t("ui_e.formulas.edit_title") : t("ui_e.formulas.new_title")}>
        {loading ? <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress size={28} /></Box> : (
          <>
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr" } }}>
              <TextField label={t("ui_e.formulas.f_name")} value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} size="small" sx={S.field}
                error={touched && !name.trim()} required autoFocus />
              <TextField label={t("ui_e.formulas.f_code")} value={code} onChange={(e) => { setCode(e.target.value); setDirty(true); }} size="small" sx={S.field} />
            </Box>
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr" } }}>
              <Box>
                <ItemPicker ctx={ctx} options={outOptions} value={outId} label={t("ui_e.formulas.f_output")}
                  onChange={(id) => { setOutId(id); setDirty(true); }}
                  onCreate={(n) => setQuick({ name: n, kind: "semi_finished", target: "out" })}
                  error={touched && !outId} />
                <Typography sx={{ color: C.muted, fontSize: 11, mt: 0.5 }}>{t("ui_def.formulas.output_hint")}</Typography>
              </Box>
              <TextField label={t("ui_e.formulas.f_batch_qty")} value={outQty} onChange={(e) => { setOutQty(e.target.value); setDirty(true); }}
                size="small" sx={S.field} type="number" error={touched && !(num(outQty) > 0)}
                slotProps={{ htmlInput: { min: 0, step: "any", inputMode: "decimal" }, input: { endAdornment: <Typography sx={{ color: C.muted, fontSize: 12 }}>{unitText(outId)}</Typography> } }} />
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
                        <TableCell sx={{ ...S.td, minWidth: 230 }}>
                          <ItemPicker ctx={ctx} options={options.filter((m) => (!used.has(String(m.id)) || String(m.id) === l.material_id) && String(m.id) !== outId)}
                            value={l.material_id} label={t("ui_e.formulas.l_material")} error={!!e.mat}
                            onChange={(id) => setLine(l.key, { material_id: id })}
                            onCreate={(n) => setQuick({ name: n, kind: "raw", target: l.key })} />
                          {l.material_id && (
                            <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0.75, mt: 0.5 }}>
                              <TypeBadge t={t} C={C} type={typeOf(l)} />
                              {subOf(l) && (
                                <SubFormulaButton t={t} C={C} name={optById(l.material_id)?.name || l.material || ""} onOpen={() => tryJump(subOf(l))} />
                              )}
                            </Box>
                          )}
                        </TableCell>
                        <TableCell sx={{ ...S.td, minWidth: 140 }}>
                          <TextField size="small" type="number" value={l.quantity} sx={S.field} error={!!e.qty}
                            onChange={(ev) => setLine(l.key, { quantity: ev.target.value })}
                            slotProps={{ htmlInput: { min: 0, step: "any", inputMode: "decimal" }, input: { endAdornment: <Typography sx={{ color: C.muted, fontSize: 12 }}>{unitText(l.material_id)}</Typography> } }} />
                        </TableCell>
                        <TableCell sx={{ ...S.td, minWidth: 100 }}>
                          <TextField size="small" type="number" value={l.wastage} sx={S.field} error={!!e.waste}
                            onChange={(ev) => setLine(l.key, { wastage: ev.target.value })}
                            slotProps={{ htmlInput: { min: 0, max: 99.99, step: "any", inputMode: "decimal" }, input: { endAdornment: <Typography sx={{ color: C.muted, fontSize: 12 }}>%</Typography> } }} />
                        </TableCell>
                        <TableCell sx={{ ...S.td, whiteSpace: "nowrap" }}>
                          {l.material_id ? `${fmt(stockOf(l))} ${unitText(l.material_id)}` : "—"}
                        </TableCell>
                        <TableCell sx={{ ...S.td, whiteSpace: "nowrap" }}>
                          {l.material_id && needOf(l) > 0 ? <StatusCell t={t} C={C} status={lineStatus(stockOf(l), needOf(l))} /> : "—"}
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
                okText={t("ui_prod.formula_banner_ok")} shortText={t("ui_prod.formula_banner_short", { count: shortCount })} />
            )}
            <Typography sx={{ color: C.muted, fontSize: 12 }}>{t("ui_prod.formula_stock_hint")}</Typography>
            <Box>
              <Button variant="outlined" sx={S.ghost} onClick={addLine}>+ {t("ui_e.formulas.add_line")}</Button>
            </Box>

            <TextField label={t("ui_e.formulas.f_notes")} value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
              size="small" sx={S.field} multiline minRows={2} />

            <Box sx={{ bgcolor: C.infoBg, border: `1px solid ${C.glassBorder}`, borderRadius: 2, p: 1.5, display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
              <Typography sx={{ color: C.sub, fontSize: 13 }}>{t("ui_e.formulas.est_cost")}</Typography>
              <Typography sx={{ color: C.text, fontWeight: 800 }}>
                {fmt(batchCost)}
                {num(outQty) > 0 && (
                  <Box component="span" sx={{ color: C.sub, fontWeight: 500, fontSize: 12 }}>
                    {" "}({t("ui_e.formulas.per_unit")}: {fmt(batchCost / num(outQty))})
                  </Box>
                )}
              </Typography>
            </Box>
          </>
        )}
      </FormDialog>

      <ConfirmDialog ctx={ctx} open={!!jumpTo} title={t("ui_prod.jump_confirm_title")} text={t("ui_prod.jump_confirm_text")}
        confirmLabel={t("ui_prod.jump_confirm")} onClose={() => setJumpTo(null)} onConfirm={() => openFormula(jumpTo)} />

      {quick && (
        <ItemDialog ctx={ctx} quick presetName={quick.name} presetKind={quick.kind}
          kinds={quick.target === "out" ? OUTPUT_KINDS : KINDS}
          onClose={() => setQuick(null)} onSaved={onItemCreated} />
      )}
    </>
  );
}
