import { useEffect, useState } from "react";
import {
  Box, Typography, Button, TextField, MenuItem, IconButton, Alert, CircularProgress, FormControlLabel, Switch,
  Table, TableHead, TableBody, TableRow, TableCell,
} from "@mui/material";
import { num, fmt, newKey, TableWrap, ConfirmDialog, fmtMinutes } from "./common";
import { fetchFormulas, runPlan, errMsg } from "./api";

const blankRow = () => ({ key: newKey(), fid: "", qty: "" });

/**
 * "How many do I want?": targets → multi-level material needs vs stock, purchase list,
 * semi-finished items to make first (in order), stage times, cost and max producible.
 */
export default function PlannerTab({ ctx, onOrdersCreated }) {
  const { t, C, S, notify } = ctx;
  const [formulas, setFormulas] = useState([]);
  const [rows, setRows] = useState([blankRow()]);
  const [useStock, setUseStock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState(null);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    fetchFormulas()
      .then((d) => setFormulas((Array.isArray(d) ? d : []).filter((f) => f.is_active)))
      .catch((e) => setError(errMsg(e, t("ui_e.common.load_failed"))));
  }, [t]);

  const items = rows.filter((r) => r.fid && num(r.qty) > 0).map((r) => ({ formula_id: Number(r.fid), quantity: num(r.qty) }));
  const setRow = (key, patch) => { setPlan(null); setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r))); };
  const unit = (u) => (u ? t(`ui_def.units.${u}`, { defaultValue: u }) : "");

  const run = async (createOrders = false) => {
    if (!items.length) return;
    setBusy(true); setError("");
    try {
      const res = await runPlan({ items, use_stock: useStock, create_orders: createOrders });
      setPlan(res);
      if (createOrders) {
        setConfirm(false);
        notify(t("ui_mrp.orders_created", { count: res.created_orders?.length || 0 }));
        onOrdersCreated?.();
      }
    } catch (e) {
      setError(errMsg(e, t("ui_e.common.save_failed")));
    } finally { setBusy(false); }
  };

  return (
    <Box sx={S.card}>
      <Typography sx={{ color: C.text, fontWeight: 800, mb: 0.5 }}>{t("ui_mrp.plan_title")}</Typography>
      <Typography sx={{ color: C.sub, fontSize: 13, mb: 2 }}>{t("ui_mrp.plan_hint")}</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {formulas.length === 0 && !error && <Alert severity="info" sx={{ mb: 2 }}>{t("ui_e.orders.no_active_formulas")}</Alert>}

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
        {rows.map((r) => {
          const f = formulas.find((x) => String(x.id) === r.fid);
          return (
            <Box key={r.key} sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr auto", sm: "2fr 1fr auto" }, alignItems: "start" }}>
              <TextField select size="small" label={t("ui_mrp.product")} value={r.fid} sx={{ ...S.field, gridColumn: { xs: "1 / -1", sm: "auto" } }}
                onChange={(e) => setRow(r.key, { fid: e.target.value })}>
                {formulas.map((x) => <MenuItem key={x.id} value={String(x.id)}>{x.output_material} — {x.name}</MenuItem>)}
              </TextField>
              <TextField size="small" type="number" label={t("ui_mrp.how_many")} value={r.qty} sx={S.field}
                onChange={(e) => setRow(r.key, { qty: e.target.value })}
                slotProps={{ htmlInput: { min: 0, step: "any", inputMode: "decimal" }, input: { endAdornment: <Typography sx={{ color: C.muted, fontSize: 12 }}>{unit(f?.output_unit)}</Typography> } }} />
              <IconButton aria-label={t("ui_e.common.remove")} disabled={rows.length === 1} sx={{ color: C.danger }}
                onClick={() => { setPlan(null); setRows((rs) => rs.filter((x) => x.key !== r.key)); }}>✕</IconButton>
            </Box>
          );
        })}
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
          <Button variant="outlined" sx={S.ghost} onClick={() => setRows((rs) => [...rs, blankRow()])}>+ {t("ui_mrp.add_product")}</Button>
          <FormControlLabel control={<Switch checked={useStock} onChange={(e) => { setUseStock(e.target.checked); setPlan(null); }} />}
            label={<Typography sx={{ fontSize: 13 }}>{t("ui_mrp.use_stock")}</Typography>} />
          <Button sx={{ ...S.btn, marginInlineStart: "auto" }} onClick={() => run(false)} disabled={busy || !items.length}>
            {busy ? <CircularProgress size={18} color="inherit" /> : t("ui_mrp.calculate")}
          </Button>
        </Box>
      </Box>

      {plan && <PlanResult ctx={ctx} plan={plan} unit={unit} onCreate={() => setConfirm(true)} busy={busy} />}

      <ConfirmDialog ctx={ctx} open={confirm} busy={busy} error={error}
        title={t("ui_mrp.create_orders_title")}
        text={t("ui_mrp.create_orders_text", { count: plan?.make_steps?.length || 0 })}
        confirmLabel={t("ui_mrp.create_orders")} onClose={() => setConfirm(false)} onConfirm={() => run(true)} />
    </Box>
  );
}

function PlanResult({ ctx, plan, unit, onCreate, busy }) {
  const { t, C, S } = ctx;
  const card = { border: `1px solid ${C.glassBorder}`, borderRadius: 2, p: 1.5 };
  return (
    <Box sx={{ mt: 3, display: "flex", flexDirection: "column", gap: 2 }}>
      <Alert severity={plan.can_produce ? "success" : "warning"} role="status">
        {plan.can_produce ? t("ui_mrp.plan_ok") : t("ui_mrp.plan_short", { count: plan.purchase_list.length, cost: fmt(plan.purchase_cost) })}
      </Alert>

      <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)" } }}>
        {[
          [t("ui_mrp.total_cost"), fmt(plan.total_cost)],
          [t("ui_mrp.total_time"), fmtMinutes(t, plan.total_minutes)],
          [t("ui_mrp.bottleneck"), plan.bottleneck ? `${plan.bottleneck.name} · ${fmtMinutes(t, plan.bottleneck.minutes)}` : "—"],
        ].map(([k, v]) => (
          <Box key={k} sx={card}>
            <Typography sx={{ color: C.muted, fontSize: 11 }}>{k}</Typography>
            <Typography sx={{ color: C.text, fontWeight: 800 }}>{v}</Typography>
          </Box>
        ))}
      </Box>

      <TableWrap C={C}>
        <Table size="small" sx={{ minWidth: 640 }}>
          <TableHead>
            <TableRow>
              {["product", "how_many", "unit_cost", "total_cost", "max_producible"].map((k) => (
                <TableCell key={k} sx={S.th}>{t(`ui_mrp.${k}`)}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {plan.targets.map((r) => (
              <TableRow key={r.formula_id}>
                <TableCell sx={{ ...S.td, fontWeight: 700 }}>{r.material}</TableCell>
                <TableCell sx={S.td}>{fmt(r.quantity)} {unit(r.unit)}</TableCell>
                <TableCell sx={S.td}>{fmt(r.unit_cost)}</TableCell>
                <TableCell sx={S.td}>{fmt(r.total_cost)}</TableCell>
                <TableCell sx={S.td}>{r.max_producible != null ? `${fmt(r.max_producible)} ${unit(r.unit)}` : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableWrap>

      {plan.make_steps.length > 0 && (
        <Box sx={card}>
          <Typography sx={{ fontWeight: 700, color: C.text, mb: 1 }}>{t("ui_mrp.make_order")}</Typography>
          <Box component="ol" sx={{ m: 0, paddingInlineStart: 2.5, display: "flex", flexDirection: "column", gap: 1 }}>
            {plan.make_steps.map((s) => (
              <Box component="li" key={`${s.formula_id}-${s.material_id}`}>
                <Typography sx={{ fontSize: 14, color: C.text }}>
                  <b>{s.material}</b> — {fmt(s.quantity)} {unit(s.unit)}
                  {!s.is_target && <Box component="span" sx={{ color: C.warning }}> · {t("ui_mrp.semi_first")}</Box>}
                  {s.minutes > 0 && <Box component="span" sx={{ color: C.sub }}> · {fmtMinutes(t, s.minutes)}</Box>}
                </Typography>
                {s.stages.length > 0 && (
                  <Typography sx={{ fontSize: 12, color: C.sub }}>
                    {s.stages.map((st) => `${st.name} (${fmtMinutes(t, st.minutes)})`).join(" ← ")}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
          {plan.from_stock.length > 0 && (
            <Typography sx={{ fontSize: 12, color: C.sub, mt: 1 }}>
              {t("ui_mrp.from_stock_used")}: {plan.from_stock.map((x) => `${x.material} ${fmt(x.quantity)} ${unit(x.unit)}`).join("، ")}
            </Typography>
          )}
        </Box>
      )}

      <Box>
        <Typography sx={{ fontWeight: 700, color: C.text, mb: 1 }}>{t("ui_mrp.materials_needed")}</Typography>
        <TableWrap C={C}>
          <Table size="small" sx={{ minWidth: 640 }}>
            <TableHead>
              <TableRow>
                {["material", "required", "available", "missing"].map((k) => (
                  <TableCell key={k} sx={S.th}>{t(`ui_prod.col_${k}`)}</TableCell>
                ))}
                <TableCell sx={S.th}>{t("ui_mrp.purchase_cost")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {plan.materials.map((m) => (
                <TableRow key={m.material_id} sx={m.shortage > 0 ? { bgcolor: C.dangerBg } : undefined}>
                  <TableCell sx={{ ...S.td, fontWeight: m.shortage > 0 ? 700 : 400, color: m.shortage > 0 ? C.danger : C.text }}>
                    {m.shortage > 0 ? "✕ " : "✓ "}{m.material}
                  </TableCell>
                  <TableCell sx={S.td}>{fmt(m.required)} {unit(m.unit)}</TableCell>
                  <TableCell sx={S.td}>{fmt(m.available)} {unit(m.unit)}</TableCell>
                  <TableCell sx={{ ...S.td, color: m.shortage > 0 ? C.danger : C.muted, fontWeight: 700 }}>{m.shortage > 0 ? `${fmt(m.shortage)} ${unit(m.unit)}` : "—"}</TableCell>
                  <TableCell sx={S.td}>{m.shortage > 0 ? fmt(m.shortage_cost) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
      </Box>

      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
        <Typography sx={{ fontSize: 12, color: C.muted, flex: "1 1 240px" }}>{t("ui_mrp.create_orders_hint")}</Typography>
        <Button sx={S.btn} onClick={onCreate} disabled={busy || plan.make_steps.length === 0}>{t("ui_mrp.create_orders")}</Button>
      </Box>
    </Box>
  );
}
