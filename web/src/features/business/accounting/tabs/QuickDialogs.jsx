import { useEffect, useState } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Button, TextField, Typography, MenuItem, ToggleButton,
  ToggleButtonGroup, Alert, CircularProgress,
} from "@mui/material";
import Groups from "@mui/icons-material/Groups";
import HomeWork from "@mui/icons-material/HomeWork";
import ElectricBolt from "@mui/icons-material/ElectricBolt";
import LocalGasStation from "@mui/icons-material/LocalGasStation";
import Build from "@mui/icons-material/Build";
import MoreHoriz from "@mui/icons-material/MoreHoriz";
import { useRegisteredShortcuts, dialogBindings } from "@shared/common/shortcutKit";
import KbdHint from "@business/pos/common/KbdHint";
import { fetchCustomers, fetchSuppliers } from "@business/dictionary/api";
import { CATEGORY_KEYS, todayISO, num } from "../common";
import { createExpense, createPayment, createRecurring, saveOpening, errMsg } from "../api";

const ICONS = { payroll: Groups, rent: HomeWork, utilities: ElectricBolt, fuel: LocalGasStation, maintenance: Build, other: MoreHoriz };

export function CategoryIcon({ k, ...rest }) {
  const Cmp = ICONS[k] || MoreHoriz;
  return <Cmp {...rest} />;
}

/** Shared frame: title, body, error line, cancel + save (Ctrl+D). */
function Frame({ ctx, title, children, onClose, onSubmit, saving, error, submitLabel }) {
  const { t, S, fullScreen } = ctx;
  useRegisteredShortcuts(dialogBindings(t, { confirmLabel: submitLabel, onConfirm: onSubmit, enter: false, onClose: () => { if (!saving) onClose(); } }));
  return (
    <Dialog open onClose={saving ? undefined : onClose} fullScreen={fullScreen} maxWidth="xs" fullWidth slotProps={{ paper: { sx: S.dialogPaper } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{title}</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: "grid", gap: 1.5, mt: 0.5 }}>{children}</Box>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="outlined" sx={S.ghost} onClick={onClose} disabled={saving}>{ctx.t("ui_acc.dialog.cancel")}</Button>
        <Button variant="contained" sx={S.btn} onClick={onSubmit} disabled={saving}>
          {saving ? <CircularProgress size={18} color="inherit" /> : <>{submitLabel}<KbdHint>Ctrl+D</KbdHint></>}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function useSave(onDone, fallback) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const run = async (fn) => {
    if (saving) return;
    setSaving(true); setError("");
    try { const r = await fn(); onDone(r); } catch (e) { setError(errMsg(e, fallback)); } finally { setSaving(false); }
  };
  return { saving, error, run, setError };
}

function MethodToggle({ ctx, value, onChange }) {
  const { t } = ctx;
  return (
    <ToggleButtonGroup exclusive size="small" value={value} onChange={(_, v) => v && onChange(v)} aria-label={t("ui_acc.dialog.method")}>
      <ToggleButton value="cash" sx={{ px: 2 }}>{t("ui_acc.dialog.cash")}</ToggleButton>
      <ToggleButton value="bank" sx={{ px: 2 }}>{t("ui_acc.dialog.bank")}</ToggleButton>
    </ToggleButtonGroup>
  );
}

function CategoryGrid({ ctx, value, onChange }) {
  const { t, C } = ctx;
  return (
    <Box role="radiogroup" aria-label={t("ui_acc.dialog.category")} sx={{ display: "grid", gap: 1, gridTemplateColumns: "repeat(3, 1fr)" }}>
      {CATEGORY_KEYS.map((k) => {
        const on = value === k;
        return (
          <Box
            key={k} role="radio" aria-checked={on} tabIndex={0}
            onClick={() => onChange(k)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(k); } }}
            sx={{
              cursor: "pointer", textAlign: "center", p: 1, borderRadius: "12px", userSelect: "none",
              border: `1px solid ${on ? C.primary : C.divider}`, bgcolor: on ? C.primarySubtle : "transparent", color: on ? C.primary : C.text,
            }}
          >
            <CategoryIcon k={k} fontSize="small" />
            <Typography sx={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.4 }}>{t(`ui_acc.categories.${k}`)}</Typography>
          </Box>
        );
      })}
    </Box>
  );
}

/** One-off expense: pick a category, type the amount. Everything else is done by the system. */
export function ExpenseDialog({ ctx, initial, onClose, onSaved }) {
  const { t, S } = ctx;
  const [f, setF] = useState({ category: initial?.category || "rent", amount: "", title: "", date: todayISO(), payment_method: "cash" });
  const { saving, error, run, setError } = useSave((r) => onSaved(r), t("ui_acc.dialog.save_failed"));
  const submit = () => {
    if (!(num(f.amount) > 0)) { setError(t("ui_acc.dialog.amount_required")); return; }
    run(() => createExpense({ ...f, amount: num(f.amount) }));
  };
  return (
    <Frame ctx={ctx} title={t("ui_acc.dialog.expense_title")} onClose={onClose} onSubmit={submit} saving={saving} error={error} submitLabel={t("ui_acc.dialog.save")}>
      <CategoryGrid ctx={ctx} value={f.category} onChange={(category) => setF((x) => ({ ...x, category }))} />
      <TextField autoFocus size="small" label={t("ui_acc.dialog.amount")} value={f.amount} onChange={(e) => setF((x) => ({ ...x, amount: e.target.value }))}
        sx={S.field} slotProps={{ htmlInput: { inputMode: "decimal", dir: "ltr" } }} />
      <TextField size="small" label={t("ui_acc.dialog.title_opt")} value={f.title} onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} sx={S.field} />
      <TextField size="small" type="date" label={t("ui_acc.dialog.date")} value={f.date} onChange={(e) => setF((x) => ({ ...x, date: e.target.value }))}
        sx={S.field} slotProps={{ inputLabel: { shrink: true } }} />
      <Box><Typography sx={{ fontSize: 12, mb: 0.5 }}>{t("ui_acc.dialog.paid_from")}</Typography><MethodToggle ctx={ctx} value={f.payment_method} onChange={(payment_method) => setF((x) => ({ ...x, payment_method }))} /></Box>
    </Frame>
  );
}

/** Money received from a customer ("in") or paid to a supplier ("out"). */
export function PaymentDialog({ ctx, kind, partyId, onClose, onSaved }) {
  const { t, S } = ctx;
  const incoming = kind === "in";
  const [parties, setParties] = useState([]);
  const [f, setF] = useState({ party: partyId || "", amount: "", date: todayISO(), method: "cash", note: "" });
  const { saving, error, run, setError } = useSave((r) => onSaved(r), t("ui_acc.dialog.save_failed"));

  useEffect(() => {
    let alive = true;
    (incoming ? fetchCustomers() : fetchSuppliers()).then((d) => alive && setParties(Array.isArray(d) ? d : [])).catch(() => {});
    return () => { alive = false; };
  }, [incoming]);

  const submit = () => {
    if (!f.party) { setError(t(incoming ? "ui_acc.dialog.pick_customer" : "ui_acc.dialog.pick_supplier")); return; }
    if (!(num(f.amount) > 0)) { setError(t("ui_acc.dialog.amount_required")); return; }
    run(() => createPayment({ kind, [incoming ? "customer_id" : "supplier_id"]: f.party, amount: num(f.amount), method: f.method, date: f.date, note: f.note }));
  };
  return (
    <Frame ctx={ctx} title={t(incoming ? "ui_acc.dialog.receipt_title" : "ui_acc.dialog.payout_title")} onClose={onClose} onSubmit={submit}
      saving={saving} error={error} submitLabel={t("ui_acc.dialog.save")}>
      <TextField select size="small" label={t(incoming ? "ui_acc.dialog.customer" : "ui_acc.dialog.supplier")} value={f.party}
        onChange={(e) => setF((x) => ({ ...x, party: e.target.value }))} sx={S.field}>
        {parties.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
      </TextField>
      <TextField autoFocus size="small" label={t("ui_acc.dialog.amount")} value={f.amount} onChange={(e) => setF((x) => ({ ...x, amount: e.target.value }))}
        sx={S.field} slotProps={{ htmlInput: { inputMode: "decimal", dir: "ltr" } }} />
      <TextField size="small" type="date" label={t("ui_acc.dialog.date")} value={f.date} onChange={(e) => setF((x) => ({ ...x, date: e.target.value }))}
        sx={S.field} slotProps={{ inputLabel: { shrink: true } }} />
      <Box><Typography sx={{ fontSize: 12, mb: 0.5 }}>{t(incoming ? "ui_acc.dialog.received_in" : "ui_acc.dialog.paid_from")}</Typography><MethodToggle ctx={ctx} value={f.method} onChange={(method) => setF((x) => ({ ...x, method }))} /></Box>
      <TextField size="small" label={t("ui_acc.dialog.note")} value={f.note} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} sx={S.field} />
    </Frame>
  );
}

/** A monthly cost the system records by itself: rent, a bill, or one employee's salary. */
export function RecurringDialog({ ctx, salary = false, onClose, onSaved }) {
  const { t, S } = ctx;
  const [f, setF] = useState({
    category: salary ? "payroll" : "rent", title: "", amount: "", day_of_month: "1", payment_method: "bank", start_date: todayISO(),
  });
  const { saving, error, run, setError } = useSave((r) => onSaved(r), t("ui_acc.dialog.save_failed"));
  const submit = () => {
    if (!f.title.trim()) { setError(t(salary ? "ui_acc.fixed.employee_required" : "ui_acc.fixed.title_required")); return; }
    if (!(num(f.amount) > 0)) { setError(t("ui_acc.dialog.amount_required")); return; }
    run(() => createRecurring({ ...f, amount: num(f.amount), day_of_month: Number(f.day_of_month) }));
  };
  return (
    <Frame ctx={ctx} title={t(salary ? "ui_acc.fixed.salary_title" : "ui_acc.fixed.cost_title")} onClose={onClose} onSubmit={submit}
      saving={saving} error={error} submitLabel={t("ui_acc.dialog.save")}>
      {!salary && <CategoryGrid ctx={ctx} value={f.category} onChange={(category) => setF((x) => ({ ...x, category }))} />}
      <TextField autoFocus size="small" label={t(salary ? "ui_acc.fixed.employee_name" : "ui_acc.fixed.cost_name")} value={f.title}
        onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} sx={S.field} />
      <TextField size="small" label={t(salary ? "ui_acc.fixed.monthly_salary" : "ui_acc.fixed.monthly_amount")} value={f.amount}
        onChange={(e) => setF((x) => ({ ...x, amount: e.target.value }))} sx={S.field} slotProps={{ htmlInput: { inputMode: "decimal", dir: "ltr" } }} />
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "1fr 1fr" }}>
        <TextField size="small" label={t("ui_acc.fixed.day")} value={f.day_of_month} onChange={(e) => setF((x) => ({ ...x, day_of_month: e.target.value }))}
          sx={S.field} helperText={t("ui_acc.fixed.day_hint")} slotProps={{ htmlInput: { inputMode: "numeric", dir: "ltr" } }} />
        <TextField size="small" type="date" label={t("ui_acc.fixed.start")} value={f.start_date} onChange={(e) => setF((x) => ({ ...x, start_date: e.target.value }))}
          sx={S.field} slotProps={{ inputLabel: { shrink: true } }} />
      </Box>
      <Box><Typography sx={{ fontSize: 12, mb: 0.5 }}>{t("ui_acc.dialog.paid_from")}</Typography><MethodToggle ctx={ctx} value={f.payment_method} onChange={(payment_method) => setF((x) => ({ ...x, payment_method }))} /></Box>
      <Typography sx={{ fontSize: 12, color: ctx.C.sub }}>{t("ui_acc.fixed.auto_note")}</Typography>
    </Frame>
  );
}

/** Cash and bank balance the business starts with — typed once. */
export function OpeningDialog({ ctx, current, onClose, onSaved }) {
  const { t, S } = ctx;
  const [f, setF] = useState({ cash: current?.cash ? String(current.cash) : "", bank: current?.bank ? String(current.bank) : "" });
  const { saving, error, run } = useSave((r) => onSaved(r), t("ui_acc.dialog.save_failed"));
  const submit = () => run(() => saveOpening({ cash: f.cash === "" ? 0 : num(f.cash), bank: f.bank === "" ? 0 : num(f.bank) }));
  return (
    <Frame ctx={ctx} title={t("ui_acc.opening.title")} onClose={onClose} onSubmit={submit} saving={saving} error={error} submitLabel={t("ui_acc.dialog.save")}>
      <Typography sx={{ fontSize: 13, color: ctx.C.sub }}>{t("ui_acc.opening.hint")}</Typography>
      <TextField autoFocus size="small" label={t("ui_acc.opening.cash")} value={f.cash} onChange={(e) => setF((x) => ({ ...x, cash: e.target.value }))}
        sx={S.field} slotProps={{ htmlInput: { inputMode: "decimal", dir: "ltr" } }} />
      <TextField size="small" label={t("ui_acc.opening.bank")} value={f.bank} onChange={(e) => setF((x) => ({ ...x, bank: e.target.value }))}
        sx={S.field} slotProps={{ htmlInput: { inputMode: "decimal", dir: "ltr" } }} />
    </Frame>
  );
}
