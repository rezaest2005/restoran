import { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Typography, Button, Alert, CircularProgress, Chip, IconButton } from "@mui/material";
import Delete from "@mui/icons-material/Delete";
import { fmtMoney, fmtDate, ConfirmDialog } from "../common";
import { fetchExpenses, fetchPayments, deleteExpense, deletePayment, errMsg } from "../api";
import { CategoryIcon, ExpenseDialog, PaymentDialog } from "./QuickDialogs";

/** Quick entry: three big buttons and the latest entries (so a mistake can be undone in one click). */
export default function QuickTab(ctx) {
  const { t, C, S, lang, refreshKey, bump, notify } = ctx;
  const [expenses, setExpenses] = useState(null);
  const [payments, setPayments] = useState(null);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(null);
  const [del, setDel] = useState(null);

  const load = useCallback(() => {
    Promise.all([fetchExpenses(), fetchPayments()])
      .then(([e, p]) => { setExpenses(e || []); setPayments(p || []); setError(""); })
      .catch((e) => setError(errMsg(e, t("ui_i.common.load_failed"))));
  }, [t]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const rows = useMemo(() => [
    ...(expenses || []).map((e) => ({ key: `e${e.id}`, type: "expense", id: e.id, date: e.date, title: e.title, category: e.category, amount: e.amount, auto: e.auto })),
    ...(payments || []).map((p) => ({ key: `p${p.id}`, type: p.kind, id: p.id, date: p.date, title: p.party, amount: p.amount })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 60), [expenses, payments]);

  const done = () => { setDialog(null); notify(t("ui_acc.dialog.saved")); load(); bump(); };
  const remove = async () => {
    try {
      await (del.type === "expense" ? deleteExpense(del.id) : deletePayment(del.id));
      setDel(null); load(); bump(); notify(t("ui_acc.quick.deleted"));
    } catch (e) { setDel(null); notify(errMsg(e, t("ui_acc.dialog.save_failed")), "error"); }
  };

  const big = [
    { key: "expense", label: t("ui_acc.actions.expense"), hint: t("ui_acc.quick.hint_expense"), color: C.danger },
    { key: "in", label: t("ui_acc.actions.receipt"), hint: t("ui_acc.quick.hint_in"), color: C.success },
    { key: "out", label: t("ui_acc.actions.payout"), hint: t("ui_acc.quick.hint_out"), color: C.warning },
  ];
  const kindLabel = { expense: t("ui_acc.quick.kind_expense"), in: t("ui_acc.quick.kind_in"), out: t("ui_acc.quick.kind_out") };
  const kindColor = { expense: C.danger, in: C.success, out: C.warning };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {error && <Alert severity="error">{error}</Alert>}
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" } }}>
        {big.map((b) => (
          <Button key={b.key} onClick={() => setDialog(b.key)} variant="outlined"
            sx={{ ...S.ghost, flexDirection: "column", alignItems: "flex-start", textAlign: "start", p: 2, minHeight: 96, borderColor: b.color, gap: 0.5 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 16, color: b.color }}>+ {b.label}</Typography>
            <Typography sx={{ fontSize: 12, color: C.sub, fontWeight: 400, lineHeight: 1.7 }}>{b.hint}</Typography>
          </Button>
        ))}
      </Box>

      <Box sx={S.card}>
        <Typography sx={{ fontWeight: 800, color: C.text, mb: 1 }}>{t("ui_acc.quick.recent")}</Typography>
        {(expenses === null || payments === null) && !error && <CircularProgress size={22} />}
        {rows.length === 0 && expenses !== null && <Typography sx={{ color: C.muted, fontSize: 13 }}>{t("ui_acc.quick.empty")}</Typography>}
        {rows.map((r) => (
          <Box key={r.key} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr auto auto", sm: "90px 110px 1fr auto auto" }, gap: 1, alignItems: "center", py: 0.75, borderTop: `1px solid ${C.divider}` }}>
            <Typography sx={{ fontSize: 12, color: C.sub, display: { xs: "none", sm: "block" } }}>{fmtDate(r.date, lang)}</Typography>
            <Chip size="small" label={kindLabel[r.type]} sx={{ height: 22, fontSize: 11, color: kindColor[r.type], bgcolor: "transparent", border: `1px solid ${kindColor[r.type]}`, justifySelf: "start", display: { xs: "none", sm: "inline-flex" } }} />
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
              {r.type === "expense" && <CategoryIcon k={r.category} fontSize="small" sx={{ color: C.sub }} />}
              <Typography sx={{ fontSize: 13, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</Typography>
              {r.auto && <Chip size="small" label={t("ui_acc.quick.auto_badge")} sx={{ height: 18, fontSize: 10 }} />}
            </Box>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fmtMoney(r.amount, lang)}</Typography>
            <IconButton size="small" onClick={() => setDel(r)} aria-label={t("ui_acc.quick.delete")} sx={{ color: C.danger }}><Delete fontSize="small" /></IconButton>
          </Box>
        ))}
      </Box>

      {dialog === "expense" && <ExpenseDialog ctx={ctx} onClose={() => setDialog(null)} onSaved={done} />}
      {(dialog === "in" || dialog === "out") && <PaymentDialog ctx={ctx} kind={dialog} onClose={() => setDialog(null)} onSaved={done} />}
      <ConfirmDialog
        ctx={ctx} open={!!del} title={t("ui_acc.quick.delete")} text={t("ui_acc.quick.confirm_delete", { title: del?.title || "" })}
        confirmLabel={t("ui_acc.quick.delete")} danger onClose={() => setDel(null)} onConfirm={remove}
      />
    </Box>
  );
}
