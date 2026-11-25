import { useEffect, useState } from "react";
import { Box, Typography, Button, TextField, MenuItem, Alert, CircularProgress } from "@mui/material";
import { fmt, fmtMinutes } from "@business/production/common";
import CategoriesDialog from "../CategoriesDialog";
import { fetchFormulaAnalysis, fetchCategories, createProduct, errMsg } from "../../api";

function Stat({ C, label, value, sub, tone }) {
  return (
    <Box sx={{ border: `1px solid ${C.glassBorder}`, borderRadius: 2, p: 1.25, minWidth: 0 }}>
      <Typography sx={{ color: C.muted, fontSize: 11 }}>{label}</Typography>
      <Typography sx={{ color: tone || C.text, fontWeight: 800, fontSize: 16, overflowWrap: "anywhere" }}>{value}</Typography>
      {sub && <Typography sx={{ color: C.sub, fontSize: 11 }}>{sub}</Typography>}
    </Box>
  );
}

/** One horizontal share bar; the percentage is also written, so it never relies on the bar alone. */
function ShareRow({ C, label, value, pct }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "minmax(90px, 1fr) 2fr auto", gap: 1, alignItems: "center" }}>
      <Typography sx={{ fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={label}>{label}</Typography>
      <Box sx={{ height: 8, bgcolor: C.divider, borderRadius: 4, overflow: "hidden" }} aria-hidden="true">
        <Box sx={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", bgcolor: C.primary }} />
      </Box>
      <Typography sx={{ fontSize: 12, color: C.sub, whiteSpace: "nowrap" }}>{fmt(value)} · {Math.round(pct)}%</Typography>
    </Box>
  );
}

/**
 * Review step: live estimate from the editor (est) + the saved formula's analysis
 * (selling price, margin, real yield / scrap, max producible) and a "sell it" shortcut.
 */
export default function FormulaReview({ ctx, est, formulaId, dirty, outputName, outputId, outputUnit }) {
  const { t, C, notify } = ctx;
  const [analysis, setAnalysis] = useState(null);
  const [aErr, setAErr] = useState("");
  const [reload, setReload] = useState(0);
  const unitText = outputUnit ? t(`ui_def.units.${outputUnit}`, { defaultValue: outputUnit }) : "";

  useEffect(() => {
    if (!formulaId) return undefined;
    let alive = true;
    fetchFormulaAnalysis(formulaId)
      .then((a) => alive && (setAnalysis(a), setAErr("")))
      .catch((e) => alive && setAErr(errMsg(e, t("ui_def.common.load_failed"))));
    return () => { alive = false; };
  }, [formulaId, reload, t]);

  const grossTotal = est.material + est.operation + est.overhead;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" } }}>
        <Stat C={C} label={t("ui_mrp.unit_cost")} value={fmt(est.unit)} sub={unitText ? t("ui_mrp.per_unit_of", { unit: unitText }) : ""} />
        <Stat C={C} label={t("ui_mrp.batch_cost")} value={fmt(est.net)} sub={t("ui_mrp.for_batch", { qty: fmt(est.batch) })} />
        <Stat C={C} label={t("ui_mrp.batch_time")} value={fmtMinutes(t, est.minutes)} />
        <Stat C={C} label={t("ui_mrp.bottleneck")} value={est.bottleneck ? est.bottleneck.name : "—"}
          sub={est.bottleneck ? fmtMinutes(t, est.bottleneck.minutes) : t("ui_mrp.no_stages")} />
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
        <Typography sx={{ fontWeight: 700, color: C.text, mb: 0.5 }}>{t("ui_mrp.cost_breakdown")}</Typography>
        {[
          ["materials", est.material], ["operations", est.operation], ["overhead", est.overhead],
        ].map(([k, v]) => (
          <ShareRow key={k} C={C} label={t(`ui_mrp.part_${k}`)} value={v} pct={grossTotal > 0 ? (v / grossTotal) * 100 : 0} />
        ))}
        {est.credit > 0 && (
          <Typography sx={{ fontSize: 12, color: C.sub }}>− {t("ui_mrp.byproduct_credit")}: {fmt(est.credit)}</Typography>
        )}
      </Box>

      {est.materials.length > 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
          <Typography sx={{ fontWeight: 700, color: C.text, mb: 0.5 }}>{t("ui_mrp.material_share")}</Typography>
          {est.materials.slice(0, 8).map((m) => (
            <ShareRow key={m.key} C={C} label={m.name} value={m.cost} pct={est.material > 0 ? (m.cost / est.material) * 100 : 0} />
          ))}
        </Box>
      )}

      {est.stages.length > 0 && (
        <Box>
          <Typography sx={{ fontWeight: 700, color: C.text, mb: 1 }}>{t("ui_mrp.line_title")}</Typography>
          <Box component="ol" sx={{ m: 0, paddingInlineStart: 2.5, display: "flex", flexDirection: "column", gap: 0.5 }}>
            {est.stages.map((s) => (
              <Typography component="li" key={s.key} sx={{ fontSize: 13, color: C.text }}>
                <b>{s.name}</b>{s.workstation ? ` · ${s.workstation}` : ""} — {fmtMinutes(t, s.minutes)}
                {s.cost > 0 ? ` · ${fmt(s.cost)}` : ""}
                {s.items.length > 0 && <Box component="span" sx={{ color: C.sub }}> · {s.items.join("، ")}</Box>}
                {s.quality_check && <Box component="span" sx={{ color: C.warning }}> · ✓ {s.quality_check}</Box>}
              </Typography>
            ))}
          </Box>
        </Box>
      )}

      {formulaId && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
          <Typography sx={{ fontWeight: 700, color: C.text }}>{t("ui_mrp.saved_analysis")}</Typography>
          {dirty && <Alert severity="warning">{t("ui_mrp.dirty_hint")}</Alert>}
          {aErr && <Alert severity="error">{aErr}</Alert>}
          {!analysis && !aErr ? <CircularProgress size={22} /> : analysis && (
            <>
              <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" } }}>
                <Stat C={C} label={t("ui_mrp.selling_price")} value={analysis.selling_price != null ? fmt(analysis.selling_price) : "—"} />
                <Stat C={C} label={t("ui_mrp.margin")}
                  value={analysis.margin != null ? fmt(analysis.margin) : "—"}
                  sub={analysis.margin_percent != null ? `${fmt(analysis.margin_percent)}%` : ""}
                  tone={analysis.margin != null ? (analysis.margin >= 0 ? C.success : C.danger) : undefined} />
                <Stat C={C} label={t("ui_mrp.max_producible")} value={analysis.max_producible != null ? `${fmt(analysis.max_producible)} ${unitText}` : "—"}
                  sub={t("ui_mrp.from_stock_now")} />
                <Stat C={C} label={t("ui_mrp.real_yield")}
                  value={analysis.history?.yield_percent != null ? `${fmt(analysis.history.yield_percent)}%` : "—"}
                  sub={analysis.history?.orders ? t("ui_mrp.from_orders", { count: analysis.history.orders, scrap: fmt(analysis.history.scrap_percent ?? 0) }) : t("ui_mrp.no_history")} />
              </Box>
              {analysis.history?.avg_actual_unit_cost != null && (
                <Typography sx={{ fontSize: 12, color: C.sub }}>
                  {t("ui_mrp.actual_vs_standard", { actual: fmt(analysis.history.avg_actual_unit_cost), standard: fmt(analysis.unit_cost) })}
                </Typography>
              )}
              <SellPanel ctx={ctx} analysis={analysis} outputName={outputName} outputId={outputId}
                onDone={() => { setReload((r) => r + 1); notify(t("ui_mrp.sell_done"), "success"); }} />
            </>
          )}
        </Box>
      )}
    </Box>
  );
}

/** Finished items are sold through a POS / catalogue product linked to the item. */
function SellPanel({ ctx, analysis, outputName, outputId, onDone }) {
  const { t, S } = ctx;
  const [open, setOpen] = useState(false);
  const [cats, setCats] = useState(null);
  const [cat, setCat] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [manage, setManage] = useState(false);

  const loadCats = () => fetchCategories()
    .then((d) => {
      const list = Array.isArray(d) ? d : d?.results || [];
      setCats(list);
      setCat((cur) => (list.some((c) => String(c.id) === cur) ? cur : list[0] ? String(list[0].id) : ""));
    })
    .catch(() => setCats([]));

  useEffect(() => {
    if (!open || cats) return;
    loadCats();
  }, [open, cats]);

  if (analysis.products?.length) {
    return (
      <Alert severity="success">
        {t("ui_mrp.sold_as", { names: analysis.products.map((p) => `${p.name} (${fmt(p.price)})`).join("، ") })}
      </Alert>
    );
  }
  const suggested = analysis.unit_cost > 0 ? Math.ceil(analysis.unit_cost * 1.3) : "";
  const submit = async () => {
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("name", outputName);
      fd.append("category_id", cat);
      fd.append("price", String(price || suggested || 0));
      fd.append("item_id", String(outputId));
      await createProduct(fd);
      setOpen(false);
      onDone();
    } catch (e) { setErr(errMsg(e, t("ui_def.common.save_failed"))); }
    finally { setBusy(false); }
  };

  return (
    <Box>
      {!open ? (
        <Button variant="outlined" sx={S.ghost} onClick={() => setOpen(true)}>{t("ui_mrp.sell_it")}</Button>
      ) : (
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr auto" }, alignItems: "start" }}>
          <TextField select size="small" label={t("ui_mrp.sell_category")} value={cat} onChange={(e) => setCat(e.target.value)} sx={S.field}
            helperText={cats && cats.length === 0 ? t("ui_mrp.sell_no_category") : ""}>
            {(cats || []).map((c) => <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>)}
          </TextField>
          <TextField size="small" type="number" label={t("ui_mrp.sell_price")} value={price} placeholder={String(suggested)}
            onChange={(e) => setPrice(e.target.value)} sx={S.field}
            helperText={suggested ? t("ui_mrp.sell_price_hint", { price: fmt(suggested) }) : ""}
            slotProps={{ htmlInput: { min: 0, step: "any", inputMode: "decimal" } }} />
          <Button sx={S.btn} onClick={submit} disabled={busy || !cat}>
            {busy ? <CircularProgress size={18} color="inherit" /> : t("ui_mrp.sell_create")}
          </Button>
          <Button variant="outlined" sx={{ ...S.ghost, justifySelf: "start" }} onClick={() => setManage(true)}>{t("ui_mrp.sell_categories")}</Button>
          {err && <Alert severity="error" sx={{ gridColumn: "1 / -1" }}>{err}</Alert>}
        </Box>
      )}
      {manage && <CategoriesDialog ctx={ctx} categories={cats || []} onClose={() => setManage(false)} onChanged={loadCats} />}
    </Box>
  );
}
