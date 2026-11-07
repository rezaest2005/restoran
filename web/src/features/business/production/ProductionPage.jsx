import { useState, useMemo, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Box, Typography, Button, Table, TableHead, TableBody, TableRow,
  TableCell, Chip, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Alert, Snackbar, CircularProgress,
  useMediaQuery, useTheme,
} from "@mui/material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import { buildColors } from "@shared/palette";
import useShortcuts from "@shared/common/useShortcuts";
import ShortcutsHelpDialog from "@shared/common/ShortcutsHelpDialog";
import { moduleEnabled, hasTab } from "@business/dashboard/access";
import KbdHint from "@business/pos/common/KbdHint";
import { blurFocused } from "@business/pos/common/focus";
import {
  num, fmt, fmtDate, STATUSES, useStyles, TableWrap, ConfirmDialog, enterIsNative,
  ReadyBanner, RequirementsTable,
} from "./common";
import {
  fetchFormulas, fetchFormula,
  fetchOrders, fetchOrder, createOrder, startOrder, completeOrder, cancelOrder,
  errMsg,
} from "./api";

/* ───────── page ─────────
   Production only MAKES things: orders are created from formulas defined in
   Definitions (تعاریف → فرمول‌ها). Formulas are never edited here. */
export default function ProductionPage() {
  const { t } = useTranslation();
  const { mode } = useThemeMode();
  const { isRtl, lang } = useLang();
  const isDark = mode === "dark";
  const C = useMemo(() => buildColors(isDark), [isDark]);
  const S = useStyles(C);
  const muiTheme = useTheme();
  const navigate = useNavigate();
  const fullScreen = useMediaQuery(muiTheme.breakpoints.down("sm"));
  const [toast, setToast] = useState({ open: false, msg: "", sev: "success" });
  const notify = useCallback((msg, sev = "success") => setToast({ open: true, msg, sev }), []);

  // relative to the layout route: …/app/production -> …/app/dictionary
  const canDefine = moduleEnabled("production") && hasTab("dictionary_recipe");
  const definitionsPath = "../dictionary?tab=formulas";
  // jump from an order to the definition of a semi-finished input's formula
  const goFormula = useCallback((id) => navigate(`../dictionary?tab=formulas&formula=${id}`), [navigate]);
  const ctx = { t, C, S, isRtl, lang, fullScreen, notify, goFormula, canDefine, definitionsPath };

  // ── میان‌برها: F1 راهنما (F2 در جدول ثبت می‌شود) ──
  const [helpOpen, setHelpOpen] = useState(false);
  const pageShortcuts = [{ combo: "F1", label: t("shortcuts.help"), handler: () => setHelpOpen(true) }];
  useShortcuts(pageShortcuts);
  const helpItems = [
    ...pageShortcuts,
    { combo: "F2", label: t("ui_g.prod.new_order") },
    { combo: "Ctrl+D", label: t("shortcuts.save") },
    { combo: "Enter", label: t("shortcuts.confirm") },
    { combo: "Escape", label: t("shortcuts.close_dialog") },
  ];

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ p: { xs: 1, sm: 2 }, maxWidth: 1200, mx: "auto" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ color: C.text, fontWeight: 800, fontSize: { xs: 18, sm: 22 }, mb: 0.5 }}>
            {t("ui_def.prod.title")}
          </Typography>
          <Typography sx={{ color: C.sub, fontSize: 13 }}>{t("ui_def.prod.subtitle")}</Typography>
        </Box>
        {canDefine && (
          <Button component={Link} to={definitionsPath} variant="outlined" sx={S.ghost}>
            {t("ui_def.prod.define_link")}
          </Button>
        )}
      </Box>

      <OrdersTab {...ctx} />

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
          onChange={(e) => { setLoading(true); setStatus(e.target.value); }} sx={{ ...S.field, minWidth: 180 }}>
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
        fullScreen={ctx.fullScreen} maxWidth="md" fullWidth slotProps={{ paper: { sx: S.dialogPaper }, transition: { onExit: blurFocused } }}>
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
            slotProps={{ htmlInput: { min: 0, step: "any", inputMode: "decimal" }, input: { endAdornment: <Typography sx={{ color: C.muted, fontSize: 12 }}>{action?.order.output_unit}</Typography> } }} error={!(num(prodQty) > 0)}
             />
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
    <Dialog open onClose={saving ? undefined : onClose} fullScreen={fullScreen} maxWidth="md" fullWidth slotProps={{ paper: { sx: S.dialogPaper }, transition: { onExit: blurFocused } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{t("ui_e.orders.new_title")}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField select size="small" label={t("ui_e.orders.f_formula")} value={fid} sx={S.field}
            onChange={(e) => { setFid(e.target.value); const f = formulas.find((x) => String(x.id) === e.target.value); if (f && !qty) setQty(String(f.output_quantity)); }}
            error={touched && !fid} helperText={formulas.length === 0 ? t("ui_e.orders.no_active_formulas") : ""}>
            {formulas.map((f) => <MenuItem key={f.id} value={String(f.id)}>{f.name} — {f.output_material}</MenuItem>)}
          </TextField>
          {formulas.length === 0 && ctx.canDefine && (
            <Button component={Link} to={ctx.definitionsPath} variant="outlined" sx={{ ...S.ghost, alignSelf: "flex-start" }}>
              {t("ui_def.prod.define_link")}
            </Button>
          )}
          <TextField size="small" type="number" label={t("ui_e.orders.f_planned")} value={qty} sx={S.field}
            onChange={(e) => setQty(e.target.value)} slotProps={{ htmlInput: { min: 0, step: "any", inputMode: "decimal" }, input: { endAdornment: <Typography sx={{ color: C.muted, fontSize: 12 }}>{sel?.output_unit}</Typography> } }}
            error={touched && !(num(qty) > 0)}
             />
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
    <Dialog open onClose={onClose} fullScreen={fullScreen} maxWidth="md" fullWidth slotProps={{ paper: { sx: S.dialogPaper }, transition: { onExit: blurFocused } }}>
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
