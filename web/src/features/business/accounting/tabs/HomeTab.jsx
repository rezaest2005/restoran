import { useState, useEffect, useCallback } from "react";
import { Box, Typography, Button, Alert, CircularProgress, Chip } from "@mui/material";
import { fmtMoney, fmtDate } from "../common";
import { fetchAutopilot, errMsg } from "../api";
import { CategoryIcon, ExpenseDialog, OpeningDialog, PaymentDialog, RecurringDialog } from "./QuickDialogs";

/**
 * The accounting home page for people who are not accountants. Everything is grouped into plain sections
 * (your money · this month · who owes you · who you owe · fixed monthly costs) and the four things a
 * business owner actually does are one click away. The books are kept by the system.
 */
export default function HomeTab(ctx) {
  const { t, C, S, lang, refreshKey, bump, notify, goTab } = ctx;
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(null);       // { type: "expense" | "in" | "out" | "fixed", partyId? }

  const load = useCallback(() => {
    fetchAutopilot().then((d) => { setData(d); setError(""); }).catch((e) => setError(errMsg(e, t("ui_i.common.load_failed"))));
  }, [t]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const done = () => { setDialog(null); notify(t("ui_acc.dialog.saved")); load(); bump(); };
  const n = (v) => fmtMoney(v, lang);

  if (!data && !error) return <Box sx={{ textAlign: "center", py: 6 }}><CircularProgress size={28} /></Box>;
  if (!data) return <Alert severity="error">{error}</Alert>;

  const maxCat = Math.max(1, ...data.month.expenses_by_category.map((c) => c.amount));
  const section = (title, children, sx) => (
    <Box sx={{ ...S.card, ...sx }}>
      <Typography sx={{ fontWeight: 800, color: C.text, mb: 1.25 }}>{title}</Typography>
      {children}
    </Box>
  );
  const stat = (label, value, color) => (
    <Box sx={{ flex: 1, minWidth: 130 }}>
      <Typography sx={{ color: C.sub, fontSize: 12 }}>{label}</Typography>
      <Typography sx={{ color: color || C.text, fontWeight: 800, fontSize: 20 }}>{n(value)}</Typography>
    </Box>
  );
  const actions = [
    { key: "expense", label: t("ui_acc.actions.expense"), color: C.danger },
    { key: "in", label: t("ui_acc.actions.receipt"), color: C.success },
    { key: "out", label: t("ui_acc.actions.payout"), color: C.warning },
    { key: "fixed", label: t("ui_acc.actions.fixed"), color: C.primary },
  ];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Alert severity="info" icon={false} sx={{ py: 0.5 }}>{t("ui_acc.home.auto_note")}</Alert>
      {!data.balanced && <Alert severity="warning">{t("ui_acc.home.unbalanced")}</Alert>}

      <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" } }}>
        {actions.map((a) => (
          <Button key={a.key} variant="outlined" onClick={() => setDialog({ type: a.key })}
            sx={{ ...S.ghost, minHeight: 56, fontWeight: 700, borderColor: a.color, color: a.color }}>
            + {a.label}
          </Button>
        ))}
      </Box>

      {section(t("ui_acc.home.money"), (
        <>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            {stat(t("ui_acc.home.cash"), data.money.cash, data.money.cash < 0 ? C.danger : undefined)}
            {stat(t("ui_acc.home.bank"), data.money.bank, data.money.bank < 0 ? C.danger : undefined)}
            {stat(t("ui_acc.home.inventory"), data.money.inventory)}
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mt: 1 }}>
            {(data.money.cash < 0 || data.money.bank < 0) && (
              <Typography sx={{ color: C.warning, fontSize: 12.5 }}>{t("ui_acc.opening.negative")}</Typography>
            )}
            <Button size="small" onClick={() => setDialog({ type: "opening" })}>{t("ui_acc.opening.button")}</Button>
          </Box>
        </>
      ))}

      {section(t("ui_acc.home.month"), (
        <>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 1.5 }}>
            {stat(t("ui_acc.home.income"), data.month.income, C.success)}
            {stat(t("ui_acc.home.expense"), data.month.expense, C.danger)}
            {stat(t("ui_acc.home.profit"), data.month.profit, data.month.profit >= 0 ? C.success : C.danger)}
          </Box>
          <Typography sx={{ color: C.sub, fontSize: 12, mb: 0.75 }}>{t("ui_acc.home.by_category")}</Typography>
          {data.month.expenses_by_category.length === 0 && <Typography sx={{ color: C.muted, fontSize: 13 }}>{t("ui_acc.home.none_spent")}</Typography>}
          {data.month.expenses_by_category.map((c) => (
            <Box key={c.key} sx={{ display: "grid", gridTemplateColumns: "28px 130px 1fr auto", gap: 1, alignItems: "center", py: 0.5 }}>
              <CategoryIcon k={c.key} fontSize="small" sx={{ color: C.sub }} />
              <Typography sx={{ fontSize: 13, color: C.text }}>{t(`ui_acc.categories.${c.key}`)}</Typography>
              <Box sx={{ height: 8, borderRadius: 4, bgcolor: "var(--surface-sunken)" }}>
                <Box sx={{ height: 8, borderRadius: 4, bgcolor: C.primary, width: `${Math.max(3, (c.amount / maxCat) * 100)}%` }} />
              </Box>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text }}>{n(c.amount)}</Typography>
            </Box>
          ))}
        </>
      ))}

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
        {section(t("ui_acc.home.owed_to_you"), (
          <>
            <Typography sx={{ color: C.success, fontWeight: 800, fontSize: 20, mb: 1 }}>{n(data.receivable.total)}</Typography>
            {data.receivable.customers.length === 0 && <Typography sx={{ color: C.muted, fontSize: 13 }}>{t("ui_acc.home.nobody_owes")}</Typography>}
            {data.receivable.customers.slice(0, 6).map((c) => (
              <Box key={c.id} sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.5, borderTop: `1px solid ${C.divider}` }}>
                <Typography sx={{ flex: 1, fontSize: 13, color: C.text }}>{c.name}</Typography>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text }}>{n(c.amount)}</Typography>
                <Button size="small" onClick={() => setDialog({ type: "in", partyId: c.id })}>{t("ui_acc.home.record_receipt")}</Button>
              </Box>
            ))}
          </>
        ))}
        {section(t("ui_acc.home.you_owe"), (
          <>
            <Typography sx={{ color: C.warning, fontWeight: 800, fontSize: 20, mb: 1 }}>{n(data.payable.total)}</Typography>
            {data.payable.suppliers.length === 0 && <Typography sx={{ color: C.muted, fontSize: 13 }}>{t("ui_acc.home.nobody_owed")}</Typography>}
            {data.payable.suppliers.slice(0, 6).map((s) => (
              <Box key={s.id} sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.5, borderTop: `1px solid ${C.divider}` }}>
                <Typography sx={{ flex: 1, fontSize: 13, color: C.text }}>{s.name}</Typography>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text }}>{n(s.amount)}</Typography>
                <Button size="small" onClick={() => setDialog({ type: "out", partyId: s.id })}>{t("ui_acc.home.record_payout")}</Button>
              </Box>
            ))}
          </>
        ))}
      </Box>

      {section(t("ui_acc.home.fixed_title"), (
        <>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1, mb: 0.5 }}>
            <Typography sx={{ color: C.sub, fontSize: 13 }}>{t("ui_acc.home.fixed_total")}: <b style={{ color: "var(--ink)" }}>{n(data.recurring_monthly_total)}</b></Typography>
            <Button size="small" onClick={() => goTab("fixed")}>{t("ui_acc.home.manage")}</Button>
          </Box>
          {data.recurring.filter((r) => r.is_active).length === 0 && <Typography sx={{ color: C.muted, fontSize: 13 }}>{t("ui_acc.home.no_fixed")}</Typography>}
          {data.recurring.filter((r) => r.is_active).slice(0, 8).map((r) => (
            <Box key={r.id} sx={{ display: "grid", gridTemplateColumns: "28px 1fr auto auto", gap: 1, alignItems: "center", py: 0.5, borderTop: `1px solid ${C.divider}` }}>
              <CategoryIcon k={r.category} fontSize="small" sx={{ color: C.sub }} />
              <Typography sx={{ fontSize: 13, color: C.text }}>{r.title}</Typography>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text }}>{n(r.amount)}</Typography>
              <Chip size="small" label={`${t("ui_acc.home.next")}: ${fmtDate(r.next_due, lang)}`} sx={{ height: 22, fontSize: 11 }} />
            </Box>
          ))}
        </>
      ))}

      {dialog?.type === "expense" && <ExpenseDialog ctx={ctx} onClose={() => setDialog(null)} onSaved={done} />}
      {(dialog?.type === "in" || dialog?.type === "out") && <PaymentDialog ctx={ctx} kind={dialog.type} partyId={dialog.partyId} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.type === "opening" && <OpeningDialog ctx={ctx} current={data.opening} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.type === "fixed" && <RecurringDialog ctx={ctx} onClose={() => setDialog(null)} onSaved={done} />}
    </Box>
  );
}
