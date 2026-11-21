import { useState, useMemo, useEffect } from "react";
import {
  Box, Typography, Button, Table, TableHead, TableBody, TableRow, TableCell, TextField, IconButton, CircularProgress,
  Stepper, Step, StepButton, MenuItem, FormControlLabel, Switch,
} from "@mui/material";
import {
  num, fmt, newKey, TypeBadge, StatusCell, SubFormulaButton, ReadyBanner, lineStatus,
  compatibleUnits, convertQty, lineNeed, stageMinutes, stageCost,
} from "@business/production/common";
import { FormDialog, TableWrap, ConfirmDialog, useRegisteredShortcuts, KINDS } from "../../common";
import { fetchFormulas, fetchFormula, createFormula, updateFormula, errMsg } from "../../api";
import ItemDialog from "../ItemDialog";
import ItemPicker from "./ItemPicker";
import StagesEditor from "./StagesEditor";
import FormulaReview from "./FormulaReview";
import { TemplateDialog, ProcessDialog } from "./FormulaStarters";
import { TEMPLATES, matchItem } from "./templates";

const blankLine = () => ({ key: newKey(), material_id: "", quantity: "", unit: "", wastage: "0", setup: "", rounding: "", stageKey: "" });
const blankStage = () => ({ key: newKey(), name: "", workstation: "", setup_minutes: "", run_minutes: "", capacity: "", labour_rate: "", overhead_rate: "", instructions: "", quality_check: "" });
const OUTPUT_KINDS = KINDS.filter((k) => k !== "raw");
const STEPS = ["product", "components", "stages", "review"];
const INDUSTRIES = ["", ...TEMPLATES.map((x) => x.key), "other"];

/**
 * Formula editor as four steps: Product → Components → Production line → Review.
 * Components may be other semi-finished items (multi-level); each line can be written in a
 * convertible unit, with waste %, a fixed setup amount, rounding and the stage that consumes it.
 */
export default function FormulaDialog({ ctx, formula, materials, reloadMaterials, openFormula, onClose, onSaved }) {
  const { t, C, S } = ctx;
  const isEdit = !!formula.id;
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [notes, setNotes] = useState("");
  const [industry, setIndustry] = useState("");
  const [overhead, setOverhead] = useState("0");
  const [outId, setOutId] = useState("");
  const [outQty, setOutQty] = useState("1");
  const [lines, setLines] = useState([blankLine()]);
  const [stages, setStagesRaw] = useState([]);
  const [byps, setByps] = useState([]);
  const [advanced, setAdvanced] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [jumpTo, setJumpTo] = useState(null);
  const [quick, setQuick] = useState(null); // { name, kind, target: "out" | line key | "byp:"+key }
  const [starter, setStarter] = useState(null); // "template" | "process"
  const [extra, setExtra] = useState([]); // items created from this dialog (until the list reloads)
  const [subs, setSubs] = useState({}); // output item id -> active formula id

  const setStages = (fn) => { setDirty(true); setStagesRaw(fn); };

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
        setIndustry(f.industry || ""); setOverhead(String(f.overhead_percent ?? 0));
        setOutId(String(f.output_material_id ?? "")); setOutQty(String(f.output_quantity ?? "1"));
        const st = (f.stages || []).map((s) => ({
          key: newKey(), name: s.name || "", workstation: s.workstation || "",
          setup_minutes: String(s.setup_minutes || ""), run_minutes: String(s.run_minutes || ""),
          capacity: String(s.capacity || ""), labour_rate: String(s.labour_rate || ""),
          overhead_rate: String(s.overhead_rate || ""), instructions: s.instructions || "",
          quality_check: s.quality_check || "",
        }));
        setStagesRaw(st);
        const ls = f.lines || [];
        setLines(ls.map((l) => ({
          key: newKey(), material_id: String(l.material_id), quantity: String(l.quantity),
          unit: l.line_unit && l.line_unit !== l.unit ? l.line_unit : "",
          wastage: String(l.wastage_percent ?? 0), setup: l.setup_quantity ? String(l.setup_quantity) : "",
          rounding: l.rounding_multiple ? String(l.rounding_multiple) : "",
          stageKey: l.stage_index != null && st[l.stage_index] ? st[l.stage_index].key : "",
          notes: l.notes || "", unit_price: l.unit_price,
          matUnit: l.unit, material: l.material, material_type: l.material_type,
          stock: l.stock_quantity, sub_formula_id: l.sub_formula_id,
        })));
        if (ls.some((l) => l.setup_quantity || l.rounding_multiple)) setAdvanced(true);
        setByps((f.byproducts || []).map((b) => ({
          key: newKey(), material_id: String(b.material_id), quantity: String(b.quantity),
          share: String(b.cost_share_percent ?? 0), material: b.material, matUnit: b.unit,
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
    [...lines, ...byps].forEach((l) => {
      if (l.material_id && !matById[l.material_id] && !list.some((o) => String(o.id) === l.material_id)) {
        list.push({ id: l.material_id, name: l.material || `#${l.material_id}`, unit: l.matUnit, price: l.unit_price, quantity: l.stock, material_type: l.material_type });
      }
    });
    return list;
  }, [allMaterials, lines, byps, matById]);

  const optById = (id) => matById[id] || options.find((o) => String(o.id) === String(id));
  const unitOf = (id) => optById(id)?.unit || "";
  const unitLabel = (u) => (u ? t(`ui_def.units.${u}`, { defaultValue: u }) : "");
  const lineUnit = (l) => l.unit || unitOf(l.material_id);
  const priceOf = (l) => {
    const p = num(optById(l.material_id)?.price);
    if (Number.isFinite(p)) return p;
    const q = num(l.unit_price);
    return Number.isFinite(q) ? q : 0;
  };
  const matName = (l) => optById(l.material_id)?.name || l.material || l.pendingName || "";

  const setLine = (key, patch) => { setDirty(true); setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l))); };
  const setByp = (key, patch) => { setDirty(true); setByps((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l))); };
  const stockOf = (l) => {
    const m = matById[l.material_id];
    const v = m ? Number(m.quantity) : Number(l.stock);
    return Number.isFinite(v) ? v : 0;
  };
  /** Need for one batch, in the item's own unit. */
  const needOf = (l) => {
    const q = num(l.quantity);
    if (!(q > 0)) return 0;
    return lineNeed(convertQty(q, lineUnit(l), unitOf(l.material_id)), l.wastage, l.setup, l.rounding, 1);
  };
  const typeOf = (l) => matById[l.material_id]?.material_type || l.material_type;
  const subOf = (l) => subs[l.material_id] || null;
  const used = new Set(lines.map((l) => l.material_id).filter(Boolean));
  const filled = lines.filter((l) => l.material_id && needOf(l) > 0);
  const shortCount = filled.filter((l) => stockOf(l) < needOf(l)).length;
  const tryJump = (id) => { if (dirty) setJumpTo(id); else openFormula(id); };

  const outOptions = options.filter((m) => m.material_type !== "raw" || String(m.id) === outId).filter((m) => !used.has(String(m.id)));
  const lineErr = (l) => ({ mat: !l.material_id, qty: !(num(l.quantity) > 0), waste: !(num(l.wastage) >= 0 && num(l.wastage) < 100) });
  const bypErr = (b) => !b.material_id || !(num(b.quantity) > 0) || !(num(b.share || 0) >= 0);
  const shareSum = byps.reduce((s, b) => s + (num(b.share) || 0), 0);
  const stepValid = [
    !!(name.trim() && outId && num(outQty) > 0 && num(overhead || 0) >= 0),
    lines.length > 0 && lines.every((l) => { const e = lineErr(l); return !e.mat && !e.qty && !e.waste; })
      && byps.every((b) => !bypErr(b)) && shareSum < 100,
    stages.every((s) => s.name.trim()),
    true,
  ];

  // ── live estimate for the review step ──
  const est = useMemo(() => {
    const batch = num(outQty) > 0 ? num(outQty) : 0;
    const mats = lines.filter((l) => l.material_id).map((l) => ({ key: l.key, name: matName(l), cost: needOf(l) * priceOf(l) }))
      .sort((a, b) => b.cost - a.cost);
    const material = mats.reduce((s, m) => s + m.cost, 0);
    const st = stages.map((s) => {
      const minutes = stageMinutes(s, batch, batch);
      return {
        key: s.key, name: s.name || "—", workstation: s.workstation, quality_check: s.quality_check,
        minutes, cost: stageCost(s, minutes),
        items: lines.filter((l) => l.stageKey === s.key && l.material_id).map(matName),
      };
    });
    const operation = st.reduce((s, x) => s + x.cost, 0);
    const minutes = st.reduce((s, x) => s + x.minutes, 0);
    const ov = material * (num(overhead) || 0) / 100;
    const gross = material + operation + ov;
    const credit = gross * (shareSum < 100 ? shareSum : 0) / 100;
    const net = gross - credit;
    const bottleneck = st.length ? st.reduce((a, b) => (b.minutes > a.minutes ? b : a)) : null;
    return {
      batch, material, operation, overhead: ov, credit, net, unit: batch > 0 ? net / batch : 0,
      minutes, stages: st, materials: mats, bottleneck: bottleneck && bottleneck.minutes > 0 ? bottleneck : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, stages, outQty, overhead, shareSum, matById, options]);

  const submit = async () => {
    setTouched(true);
    const bad = stepValid.findIndex((v) => !v);
    if (bad !== -1) { setStep(bad); return; }
    setSaving(true); setError("");
    const stageIdx = {};
    stages.forEach((s, i) => { stageIdx[s.key] = i; });
    const body = {
      name: name.trim(), code: code.trim(), notes: notes.trim(), industry,
      overhead_percent: num(overhead) || 0,
      output_material_id: Number(outId), output_quantity: num(outQty),
      stages: stages.map((s) => ({
        name: s.name.trim(), workstation: s.workstation.trim(),
        setup_minutes: num(s.setup_minutes) || 0, run_minutes: num(s.run_minutes) || 0,
        capacity: num(s.capacity) || 0, labour_rate: num(s.labour_rate) || 0,
        overhead_rate: num(s.overhead_rate) || 0, instructions: s.instructions, quality_check: s.quality_check,
      })),
      lines: lines.map((l) => ({
        material_id: Number(l.material_id), quantity: num(l.quantity), unit: l.unit || "",
        wastage_percent: num(l.wastage) || 0, setup_quantity: num(l.setup) || 0,
        rounding_multiple: num(l.rounding) || 0, notes: l.notes || "",
        stage_index: l.stageKey && stageIdx[l.stageKey] !== undefined ? stageIdx[l.stageKey] : null,
      })),
      byproducts: byps.map((b) => ({ material_id: Number(b.material_id), quantity: num(b.quantity), cost_share_percent: num(b.share) || 0 })),
    };
    try {
      if (isEdit) await updateFormula(formula.id, body);
      else await createFormula(body);
      onSaved();
    } catch (e) {
      setError(errMsg(e, t("ui_def.common.save_failed")));
    } finally { setSaving(false); }
  };

  const addLine = () => { setDirty(true); setLines((ls) => [...ls.filter((l) => l.material_id || l.quantity || l.pendingName), blankLine()]); };
  const nested = !!jumpTo || !!quick || !!starter;
  useRegisteredShortcuts([
    { combo: "F3", label: t("ui_g.prod.new_line"), scope: "dialog", handler: () => { if (step === 1) addLine(); else if (step === 2) setStages((s) => [...s, blankStage()]); else return false; return true; } },
  ], { enabled: !nested });

  /** Apply a template / parsed description: replaces stages, appends components (matched by name). */
  const applyDraft = (draft) => {
    setStarter(null);
    setDirty(true);
    if (draft.industry) setIndustry(draft.industry);
    if (draft.batch && !isEdit && (outQty === "1" || !outQty)) setOutQty(String(draft.batch));
    const st = (draft.stages || []).map((s) => ({
      ...blankStage(), ...s,
      setup_minutes: s.setup_minutes ? String(s.setup_minutes) : "", run_minutes: s.run_minutes ? String(s.run_minutes) : "",
      capacity: s.capacity ? String(s.capacity) : "",
    }));
    setStagesRaw(st);
    setLines((ls) => {
      const kept = ls.filter((l) => l.material_id || l.pendingName);
      const have = new Set(kept.map((l) => l.material_id).filter(Boolean));
      (draft.components || []).forEach((c) => {
        const m = (c.material_id && optById(c.material_id)) ||
          [c.name, ...(c.altNames || [])].reduce((found, n) => found || matchItem(n, allMaterials), null);
        if (m && (have.has(String(m.id)) || String(m.id) === outId)) return;
        if (m) have.add(String(m.id));
        const mUnit = m?.unit || "";
        const unit = m && c.unit && compatibleUnits(mUnit).includes(c.unit) && c.unit !== mUnit ? c.unit : "";
        const qty = m && c.unit && !unit && c.unit !== mUnit ? "" : String(c.quantity ?? "");
        kept.push({
          ...blankLine(), material_id: m ? String(m.id) : "", quantity: qty, unit,
          stageKey: c.stageIndex != null && st[c.stageIndex] ? st[c.stageIndex].key : "",
          pendingName: m ? "" : c.name, pendingType: c.type || "raw", pendingUnit: c.unit,
        });
      });
      return kept.length ? kept : [blankLine()];
    });
    setStep(1);
  };

  const onItemCreated = async (item) => {
    const target = quick.target;
    setQuick(null);
    setExtra((l) => [...l, { id: item.id, name: item.name, unit: item.unit, price: item.price ?? 0, quantity: 0, material_type: item.material_type }]);
    reloadMaterials();
    setDirty(true);
    if (target === "out") setOutId(String(item.id));
    else if (String(target).startsWith("byp:")) setByp(target.slice(4), { material_id: String(item.id) });
    else {
      setLines((ls) => ls.map((l) => {
        if (l.key !== target) return l;
        const unit = l.pendingUnit && compatibleUnits(item.unit).includes(l.pendingUnit) && l.pendingUnit !== item.unit ? l.pendingUnit : "";
        return { ...l, material_id: String(item.id), pendingName: "", unit };
      }));
    }
  };

  const numInput = (value, onChange, opts = {}) => (
    <TextField size="small" type="number" value={value} sx={S.field} error={!!opts.error} label={opts.label}
      onChange={(ev) => onChange(ev.target.value)} aria-label={opts.aria}
      slotProps={{ htmlInput: { min: 0, step: "any", inputMode: "decimal", ...(opts.max ? { max: opts.max } : {}) }, input: opts.end ? { endAdornment: opts.end } : undefined }} />
  );
  const adorn = (txt) => <Typography sx={{ color: C.muted, fontSize: 12 }}>{txt}</Typography>;

  // ── step bodies ──
  const productStep = (
    <>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button variant="outlined" sx={S.ghost} onClick={() => setStarter("template")}>{t("ui_mrp.start_template")}</Button>
        <Button variant="outlined" sx={S.ghost} onClick={() => setStarter("process")}>{t("ui_mrp.describe_btn")}</Button>
      </Box>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr" } }}>
        <TextField label={t("ui_e.formulas.f_name")} value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} size="small" sx={S.field}
          error={touched && !name.trim()} required autoFocus />
        <TextField label={t("ui_e.formulas.f_code")} value={code} onChange={(e) => { setCode(e.target.value); setDirty(true); }} size="small" sx={S.field} />
      </Box>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr" } }}>
        <Box>
          <ItemPicker ctx={ctx} options={outOptions} value={outId} label={t("ui_e.formulas.f_output")}
            onChange={(id) => { setOutId(id); setDirty(true); }}
            onCreate={(n) => setQuick({ name: n, kind: "finished", target: "out" })}
            error={touched && !outId} />
          <Typography sx={{ color: C.muted, fontSize: 11, mt: 0.5 }}>{t("ui_mrp.output_hint")}</Typography>
        </Box>
        <Box>
          {numInput(outQty, (v) => { setOutQty(v); setDirty(true); }, { label: t("ui_e.formulas.f_batch_qty"), error: touched && !(num(outQty) > 0), end: adorn(unitLabel(unitOf(outId))) })}
          <Typography sx={{ color: C.muted, fontSize: 11, mt: 0.5 }}>{t("ui_mrp.batch_hint")}</Typography>
        </Box>
      </Box>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
        <TextField select size="small" label={t("ui_mrp.industry")} value={industry} sx={S.field}
          onChange={(e) => { setIndustry(e.target.value); setDirty(true); }}>
          {INDUSTRIES.map((k) => <MenuItem key={k || "none"} value={k}>{k ? t(`ui_mrp.tpl_${k}`) : "—"}</MenuItem>)}
        </TextField>
        <Box>
          {numInput(overhead, (v) => { setOverhead(v); setDirty(true); }, { label: t("ui_mrp.overhead_percent"), error: touched && !(num(overhead || 0) >= 0), end: adorn("%") })}
          <Typography sx={{ color: C.muted, fontSize: 11, mt: 0.5 }}>{t("ui_mrp.overhead_hint")}</Typography>
        </Box>
      </Box>
      <TextField label={t("ui_e.formulas.f_notes")} value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
        size="small" sx={S.field} multiline minRows={2} />
    </>
  );

  const componentsStep = (
    <>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ color: C.text, fontWeight: 700 }}>{t("ui_mrp.components_for", { qty: fmt(num(outQty)), unit: unitLabel(unitOf(outId)) })}</Typography>
        <FormControlLabel control={<Switch size="small" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />}
          label={<Typography sx={{ fontSize: 13 }}>{t("ui_mrp.advanced")}</Typography>} />
      </Box>
      <TableWrap C={C}>
        <Table size="small" sx={{ minWidth: advanced ? 1100 : 900 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={S.th}>{t("ui_e.formulas.l_material")}</TableCell>
              <TableCell sx={S.th}>{t("ui_prod.col_qty_batch")}</TableCell>
              <TableCell sx={S.th}>{t("ui_prod.col_waste")}</TableCell>
              {advanced && <TableCell sx={S.th}>{t("ui_mrp.setup_qty")}</TableCell>}
              {advanced && <TableCell sx={S.th}>{t("ui_mrp.rounding")}</TableCell>}
              <TableCell sx={S.th}>{t("ui_mrp.used_in_stage")}</TableCell>
              <TableCell sx={S.th}>{t("ui_prod.col_stock")}</TableCell>
              <TableCell sx={S.th}>{t("ui_prod.col_status")}</TableCell>
              <TableCell sx={S.th} />
            </TableRow>
          </TableHead>
          <TableBody>
            {lines.map((l) => {
              const e = touched ? lineErr(l) : {};
              const mUnit = unitOf(l.material_id);
              const units = compatibleUnits(mUnit);
              return (
                <TableRow key={l.key}>
                  <TableCell sx={{ ...S.td, minWidth: 230 }}>
                    <ItemPicker ctx={ctx} options={options.filter((m) => (!used.has(String(m.id)) || String(m.id) === l.material_id) && String(m.id) !== outId)}
                      value={l.material_id} label={t("ui_e.formulas.l_material")} error={!!e.mat}
                      onChange={(id) => setLine(l.key, { material_id: id, unit: "", pendingName: "" })}
                      onCreate={(n) => setQuick({ name: n, kind: "raw", target: l.key })} />
                    {!l.material_id && l.pendingName && (
                      <Button size="small" sx={{ textTransform: "none", mt: 0.5, color: C.warning }}
                        onClick={() => setQuick({ name: l.pendingName, kind: l.pendingType || "raw", target: l.key })}>
                        + {t("ui_def.formulas.create_item", { name: l.pendingName })}
                      </Button>
                    )}
                    {l.material_id && (
                      <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0.75, mt: 0.5 }}>
                        <TypeBadge t={t} C={C} type={typeOf(l)} />
                        {subOf(l) && (
                          <SubFormulaButton t={t} C={C} name={matName(l)} onOpen={() => tryJump(subOf(l))} />
                        )}
                      </Box>
                    )}
                  </TableCell>
                  <TableCell sx={{ ...S.td, minWidth: 190 }}>
                    <Box sx={{ display: "flex", gap: 0.5 }}>
                      {numInput(l.quantity, (v) => setLine(l.key, { quantity: v }), { error: e.qty, aria: t("ui_prod.col_qty_batch") })}
                      {units.length > 1 ? (
                        <TextField select size="small" value={l.unit || mUnit} sx={{ ...S.field, minWidth: 84 }} aria-label={t("ui_mrp.unit")}
                          onChange={(ev) => setLine(l.key, { unit: ev.target.value === mUnit ? "" : ev.target.value })}>
                          {units.map((u) => <MenuItem key={u} value={u}>{unitLabel(u)}</MenuItem>)}
                        </TextField>
                      ) : (
                        <Typography sx={{ color: C.muted, fontSize: 12, alignSelf: "center", whiteSpace: "nowrap" }}>{unitLabel(mUnit)}</Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell sx={{ ...S.td, minWidth: 96 }}>
                    {numInput(l.wastage, (v) => setLine(l.key, { wastage: v }), { error: e.waste, max: 99.99, end: adorn("%"), aria: t("ui_prod.col_waste") })}
                  </TableCell>
                  {advanced && (
                    <TableCell sx={{ ...S.td, minWidth: 110 }}>
                      {numInput(l.setup, (v) => setLine(l.key, { setup: v }), { end: adorn(unitLabel(mUnit)), aria: t("ui_mrp.setup_qty") })}
                    </TableCell>
                  )}
                  {advanced && (
                    <TableCell sx={{ ...S.td, minWidth: 110 }}>
                      {numInput(l.rounding, (v) => setLine(l.key, { rounding: v }), { end: adorn(unitLabel(mUnit)), aria: t("ui_mrp.rounding") })}
                    </TableCell>
                  )}
                  <TableCell sx={{ ...S.td, minWidth: 140 }}>
                    <TextField select size="small" value={l.stageKey} sx={S.field} aria-label={t("ui_mrp.used_in_stage")} disabled={stages.length === 0}
                      onChange={(ev) => setLine(l.key, { stageKey: ev.target.value })}>
                      <MenuItem value="">—</MenuItem>
                      {stages.map((s, i) => <MenuItem key={s.key} value={s.key}>{i + 1}. {s.name || "…"}</MenuItem>)}
                    </TextField>
                  </TableCell>
                  <TableCell sx={{ ...S.td, whiteSpace: "nowrap" }}>
                    {l.material_id ? `${fmt(stockOf(l))} ${unitLabel(mUnit)}` : "—"}
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
      {advanced && <Typography sx={{ color: C.muted, fontSize: 11 }}>{t("ui_mrp.advanced_hint")}</Typography>}
      {filled.length > 0 && (
        <ReadyBanner t={t} ready={shortCount === 0} count={shortCount}
          okText={t("ui_prod.formula_banner_ok")} shortText={t("ui_prod.formula_banner_short", { count: shortCount })} />
      )}
      <Typography sx={{ color: C.muted, fontSize: 12 }}>{t("ui_mrp.multilevel_hint")}</Typography>
      <Box>
        <Button variant="outlined" sx={S.ghost} onClick={addLine}>+ {t("ui_e.formulas.add_line")}</Button>
      </Box>

      <Box sx={{ borderTop: `1px solid ${C.divider}`, pt: 2, display: "flex", flexDirection: "column", gap: 1.25 }}>
        <Typography sx={{ color: C.text, fontWeight: 700 }}>{t("ui_mrp.byproducts")}</Typography>
        <Typography sx={{ color: C.muted, fontSize: 12 }}>{t("ui_mrp.byproducts_hint")}</Typography>
        {byps.map((b) => (
          <Box key={b.key} sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr 1fr", sm: "2fr 1fr 1fr auto" }, alignItems: "start" }}>
            <Box sx={{ gridColumn: { xs: "1 / -1", sm: "auto" } }}>
              <ItemPicker ctx={ctx} options={options.filter((m) => String(m.id) !== outId)} value={b.material_id}
                label={t("ui_mrp.byproduct")} error={touched && !b.material_id}
                onChange={(id) => setByp(b.key, { material_id: id })}
                onCreate={(n) => setQuick({ name: n, kind: "semi_finished", target: `byp:${b.key}` })} />
            </Box>
            {numInput(b.quantity, (v) => setByp(b.key, { quantity: v }), { label: t("ui_mrp.qty_per_batch"), error: touched && !(num(b.quantity) > 0), end: adorn(unitLabel(unitOf(b.material_id))) })}
            {numInput(b.share, (v) => setByp(b.key, { share: v }), { label: t("ui_mrp.cost_share"), error: touched && shareSum >= 100, end: adorn("%") })}
            <IconButton size="small" aria-label={t("ui_e.common.remove")} sx={{ color: C.danger }}
              onClick={() => { setDirty(true); setByps((x) => x.filter((y) => y.key !== b.key)); }}>✕</IconButton>
          </Box>
        ))}
        {touched && shareSum >= 100 && <Typography sx={{ color: C.danger, fontSize: 12 }}>{t("ui_mrp.share_too_high")}</Typography>}
        <Box>
          <Button size="small" variant="outlined" sx={S.ghost}
            onClick={() => { setDirty(true); setByps((x) => [...x, { key: newKey(), material_id: "", quantity: "", share: "0" }]); }}>
            + {t("ui_mrp.add_byproduct")}
          </Button>
        </Box>
      </Box>
    </>
  );

  const stagesStep = (
    <>
      <Typography sx={{ color: C.sub, fontSize: 13 }}>{t("ui_mrp.stages_hint")}</Typography>
      <StagesEditor ctx={ctx} stages={stages} setStages={setStages} lines={lines} matName={matName} batch={outQty} touched={touched} />
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button variant="outlined" sx={S.ghost} onClick={() => setStages((s) => [...s, blankStage()])}>+ {t("ui_mrp.add_stage")}</Button>
        {stages.length === 0 && (
          <Button variant="outlined" sx={S.ghost} onClick={() => setStarter("template")}>{t("ui_mrp.start_template")}</Button>
        )}
      </Box>
    </>
  );

  const reviewStep = (
    <FormulaReview ctx={ctx} est={est} formulaId={isEdit ? formula.id : null} dirty={dirty}
      outputName={optById(outId)?.name || name} outputId={outId} outputUnit={unitOf(outId)} />
  );

  const navActions = (
    <Box sx={{ display: "flex", gap: 1, marginInlineEnd: "auto" }}>
      <Button variant="outlined" sx={S.ghost} disabled={step === 0} onClick={() => setStep((s) => s - 1)}>{t("ui_mrp.back")}</Button>
      {step < STEPS.length - 1 && (
        <Button variant="outlined" sx={S.ghost} onClick={() => { if (!stepValid[step]) { setTouched(true); return; } setStep((s) => s + 1); }}>
          {t("ui_mrp.next")}
        </Button>
      )}
    </Box>
  );

  return (
    <>
      <FormDialog ctx={ctx} maxWidth="lg" saving={saving} error={error} disabled={loading} shortcuts={!nested}
        onClose={onClose} onSave={submit} extraActions={navActions}
        title={isEdit ? t("ui_e.formulas.edit_title") : t("ui_e.formulas.new_title")}>
        {loading ? <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress size={28} /></Box> : (
          <>
            <Stepper nonLinear activeStep={step} alternativeLabel sx={{ mb: 1, "& .MuiStepLabel-label": { fontSize: { xs: 11, sm: 13 } } }}>
              {STEPS.map((k, i) => (
                <Step key={k} completed={i < step && stepValid[i]}>
                  <StepButton onClick={() => setStep(i)} aria-current={i === step ? "step" : undefined}
                    optional={touched && !stepValid[i] ? <Typography sx={{ color: C.danger, fontSize: 11 }}>{t("ui_mrp.step_has_errors")}</Typography> : undefined}>
                    {t(`ui_mrp.step_${k}`)}
                  </StepButton>
                </Step>
              ))}
            </Stepper>
            {step === 0 && productStep}
            {step === 1 && componentsStep}
            {step === 2 && stagesStep}
            {step === 3 && reviewStep}
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
      {starter === "template" && <TemplateDialog ctx={ctx} onClose={() => setStarter(null)} onApply={applyDraft} />}
      {starter === "process" && <ProcessDialog ctx={ctx} onClose={() => setStarter(null)} onApply={applyDraft} />}
    </>
  );
}
