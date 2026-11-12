import { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Typography, Button, Alert, CircularProgress, Chip, Switch, IconButton, ToggleButton, ToggleButtonGroup } from "@mui/material";
import Delete from "@mui/icons-material/Delete";
import { fmtMoney, fmtDate, ConfirmDialog } from "../common";
import { fetchRecurring, updateRecurring, deleteRecurring, errMsg } from "../api";
import { CategoryIcon, RecurringDialog } from "./QuickDialogs";

/**
 * Fixed monthly costs: rent, bills, and one line per employee for salaries.
 * Add them once; the system records them by itself every month (past months are caught up).
 */
export default function FixedTab(ctx) {
  const { t, C, S, lang, refreshKey, bump, notify } = ctx;
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [dialog, setDialog] = useState(null);       // "salary" | "cost"
  const [del, setDel] = useState(null);

  const load = useCallback(() => {
    fetchRecurring().then((d) => { setRows(d || []); setError(""); }).catch((e) => setError(errMsg(e, t("ui_i.common.load_failed"))));
  }, [t]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const shown = useMemo(() => (rows || []).filter((r) => filter === "all" || (filter === "payroll" ? r.category === "payroll" : r.category !== "payroll")), [rows, filter]);
  const monthly = useMemo(() => shown.filter((r) => r.is_active).reduce((a, r) => a + r.amount, 0), [shown]);
  const n = (v) => fmtMoney(v, lang);

  const done = (r) => {
    setDialog(null); load(); bump();
    notify(r?.posted_now ? t("ui_acc.fixed.saved_posted", { n: r.posted_now }) : t("ui_acc.dialog.saved"));
  };
  const toggle = async (r) => {
    try { await updateRecurring(r.id, { is_active: !r.is_active }); load(); bump(); } catch (e) { notify(errMsg(e, t("ui_acc.dialog.save_failed")), "error"); }
  };
  const remove = async () => {
    try { await deleteRecurring(del.id); setDel(null); load(); bump(); notify(t("ui_acc.quick.deleted")); }
    catch (e) { setDel(null); notify(errMsg(e, t("ui_acc.dialog.save_failed")), "error"); }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {error && <Alert severity="error">{error}</Alert>}
      <Alert severity="info" icon={false} sx={{ py: 0.5 }}>{t("ui_acc.fixed.intro")}</Alert>

      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
        <ToggleButtonGroup exclusive size="small" value={filter} onChange={(_, v) => v && setFilter(v)} aria-label={t("ui_acc.fixed.filter")}>
          <ToggleButton value="all">{t("ui_acc.fixed.f_all")}</ToggleButton>
          <ToggleButton value="payroll">{t("ui_acc.fixed.f_payroll")}</ToggleButton>
          <ToggleButton value="other">{t("ui_acc.fixed.f_costs")}</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" sx={S.ghost} onClick={() => setDialog("salary")}>+ {t("ui_acc.fixed.add_salary")}</Button>
        <Button sx={S.btn} onClick={() => setDialog("cost")}>+ {t("ui_acc.fixed.add_cost")}</Button>
      </Box>

      <Box sx={S.card}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1, flexWrap: "wrap", gap: 1 }}>
          <Typography sx={{ fontWeight: 800, color: C.text }}>{t("ui_acc.fixed.title")}</Typography>
          <Typography sx={{ color: C.sub, fontSize: 13 }}>{t("ui_acc.home.fixed_total")}: <b style={{ color: "var(--ink)" }}>{n(monthly)}</b></Typography>
        </Box>
        {rows === null && !error && <CircularProgress size={22} />}
        {rows !== null && shown.length === 0 && <Typography sx={{ color: C.muted, fontSize: 13 }}>{t("ui_acc.fixed.empty")}</Typography>}
        {shown.map((r) => (
          <Box key={r.id} sx={{ display: "grid", gridTemplateColumns: { xs: "28px 1fr auto auto", md: "28px 1fr 130px 90px 140px auto auto" }, gap: 1, alignItems: "center", py: 0.9, borderTop: `1px solid ${C.divider}`, opacity: r.is_active ? 1 : 0.55 }}>
            <CategoryIcon k={r.category} fontSize="small" sx={{ color: C.sub }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: C.text }}>{r.title}</Typography>
              <Typography sx={{ fontSize: 12, color: C.sub }}>{t(`ui_acc.categories.${r.category}`)} · {t(r.payment_method === "bank" ? "ui_acc.dialog.bank" : "ui_acc.dialog.cash")}</Typography>
            </Box>
            <Typography sx={{ fontSize: 14, fontWeight: 800, color: C.text, display: { xs: "none", md: "block" } }}>{n(r.amount)}</Typography>
            <Typography sx={{ fontSize: 12, color: C.sub, display: { xs: "none", md: "block" } }}>{t("ui_acc.fixed.each_month_day", { d: r.day_of_month })}</Typography>
            <Chip size="small" label={r.is_active ? `${t("ui_acc.home.next")}: ${fmtDate(r.next_due || r.start_date, lang)}` : t("ui_acc.fixed.paused")}
              sx={{ height: 22, fontSize: 11, display: { xs: "none", md: "inline-flex" }, justifySelf: "start" }} />
            <Switch size="small" checked={r.is_active} onChange={() => toggle(r)} slotProps={{ input: { "aria-label": t("ui_acc.fixed.active") } }} />
            <IconButton size="small" onClick={() => setDel(r)} aria-label={t("ui_acc.quick.delete")} sx={{ color: C.danger }}><Delete fontSize="small" /></IconButton>
          </Box>
        ))}
      </Box>

      {dialog && <RecurringDialog ctx={ctx} salary={dialog === "salary"} onClose={() => setDialog(null)} onSaved={done} />}
      <ConfirmDialog
        ctx={ctx} open={!!del} title={t("ui_acc.quick.delete")} text={t("ui_acc.fixed.confirm_delete", { title: del?.title || "" })}
        confirmLabel={t("ui_acc.quick.delete")} danger onClose={() => setDel(null)} onConfirm={remove}
      />
    </Box>
  );
}
