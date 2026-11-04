import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Button, Tabs, Tab, Table, TableHead, TableBody, TableRow, TableCell,
  TextField, Alert, CircularProgress, Chip, GlobalStyles,
} from "@mui/material";
import {
  TableWrap, Money, accName, fmtDate, monthStartISO, todayISO, downloadCsv,
} from "../common";
import { useRegisteredShortcuts } from "@shared/common/shortcutKit";
import {
  fetchTrialBalance, fetchIncomeStatement, fetchBalanceSheet, errMsg,
} from "../api";

const SUBS = ["trial", "income", "balance"];
const PRINT_ID = "acc-print-area";

const printCss = {
  "@media print": {
    "body *": { visibility: "hidden" },
    [`#${PRINT_ID}, #${PRINT_ID} *`]: { visibility: "visible" },
    [`#${PRINT_ID}`]: {
      position: "absolute", insetInlineStart: 0, top: 0, width: "100%",
      background: "white", color: "black", padding: "12px", border: "none", boxShadow: "none",
    },
    [`#${PRINT_ID} *`]: { color: "black !important", background: "transparent !important" },
    ".no-print": { display: "none !important" },
  },
};

export default function ReportsTab(ctx) {
  const { t, C, S, lang, refreshKey, accByCode, notify } = ctx;
  const [sub, setSub] = useState("trial");
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [asOf, setAsOf] = useState(todayISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true); setData(null);
    const req = sub === "trial" ? fetchTrialBalance({ from, to })
      : sub === "income" ? fetchIncomeStatement({ from, to })
      : fetchBalanceSheet({ as_of: asOf });
    req.then((d) => { setData(d); setError(""); })
      .catch((e) => setError(errMsg(e, t("ui_i.common.load_failed"))))
      .finally(() => setLoading(false));
  }, [sub, from, to, asOf, t]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const nm = (r) => (accByCode[r.code] ? accName(accByCode[r.code], lang) : r.name);
  const period = sub === "balance"
    ? `${t("ui_i.reports.as_of")} ${fmtDate(asOf, lang)}`
    : `${fmtDate(from, lang)} — ${fmtDate(to, lang)}`;

  const exportCsv = () => {
    if (!data) return;
    const D = t("ui_i.common.debit"), Cr = t("ui_i.common.credit");
    let rows = [];
    if (sub === "trial") {
      rows = [[t("ui_i.common.code"), t("ui_i.common.name"), D, Cr, `${t("ui_i.common.balance")} ${D}`, `${t("ui_i.common.balance")} ${Cr}`]];
      (data.rows || []).forEach((r) => rows.push([r.code, nm(r), r.debit, r.credit, r.balance_debit, r.balance_credit]));
      const x = data.totals || {};
      rows.push([t("ui_i.common.total"), "", x.debit, x.credit, x.balance_debit, x.balance_credit]);
    } else if (sub === "income") {
      rows = [[t("ui_i.common.code"), t("ui_i.common.name"), t("ui_i.common.amount")]];
      rows.push([t("ui_i.reports.sec_income"), "", ""]);
      (data.income || []).forEach((r) => rows.push([r.code, nm(r), r.amount]));
      rows.push([t("ui_i.reports.total_income"), "", data.total_income]);
      rows.push([t("ui_i.reports.sec_expense"), "", ""]);
      (data.expense || []).forEach((r) => rows.push([r.code, nm(r), r.amount]));
      rows.push([t("ui_i.reports.total_expense"), "", data.total_expense]);
      rows.push([t("ui_i.reports.net_profit"), "", data.net_profit]);
    } else {
      rows = [[t("ui_i.common.code"), t("ui_i.common.name"), t("ui_i.common.amount")]];
      [["assets", data.assets, data.total_assets], ["liabilities", data.liabilities, data.total_liabilities],
        ["equity", data.equity, data.total_equity]].forEach(([k, list, total]) => {
        rows.push([t(`ui_i.reports.${k}`), "", ""]);
        (list || []).forEach((r) => rows.push([r.code, nm(r), r.amount]));
        if (k === "equity") rows.push(["", t("ui_i.reports.current_earnings"), data.current_earnings]);
        rows.push([t(`ui_i.reports.total_${k}`), "", total]);
      });
    }
    const stamp = sub === "balance" ? asOf : `${from}_${to}`;
    if (!downloadCsv(`accounting-${sub}-${stamp}.csv`, rows)) notify(t("ui_i.reports.export_failed"), "error");
  };

  const doPrint = () => { try { window.print(); } catch { notify(t("ui_i.reports.print_failed"), "error"); } };
  useRegisteredShortcuts([
    { combo: "Alt+P", label: t("ui_i.reports.print"), handler: () => (data ? doPrint() : false) },
    { combo: "Alt+E", label: t("ui_i.reports.export_csv"), handler: () => (data ? exportCsv() : false) },
  ]);

  const dateField = (label, value, set, w = 160) => (
    <TextField type="date" size="small" label={label} value={value} sx={{ ...S.field, width: { xs: "calc(50% - 6px)", sm: w } }}
      onChange={(e) => set(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
  );

  return (
    <Box sx={S.card}>
      <GlobalStyles styles={printCss} />
      <Box className="no-print">
        <Tabs value={sub} onChange={(_, v) => setSub(v)} variant="scrollable" scrollButtons="auto"
          sx={{
            mb: 2, minHeight: 40,
            "& .MuiTab-root": { color: C.sub, textTransform: "none", fontWeight: 600, minHeight: 40 },
            "& .Mui-selected": { color: `${C.primary} !important` },
            "& .MuiTabs-indicator": { bgcolor: C.primary },
          }}>
          {SUBS.map((k) => <Tab key={k} value={k} label={t(`ui_i.reports.${k}`)} />)}
        </Tabs>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
          {sub === "balance"
            ? dateField(t("ui_i.reports.as_of"), asOf, setAsOf)
            : <>{dateField(t("ui_i.common.from"), from, setFrom)}{dateField(t("ui_i.common.to"), to, setTo)}</>}
          <Box sx={{ flex: 1 }} />
          <Button variant="outlined" sx={S.ghost} onClick={doPrint} disabled={!data}>{t("ui_i.reports.print")}</Button>
          <Button variant="outlined" sx={S.ghost} onClick={exportCsv} disabled={!data}>{t("ui_i.reports.export_csv")}</Button>
        </Box>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      </Box>

      {loading ? (
        <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress size={28} /></Box>
      ) : data && (
        <Box id={PRINT_ID}>
          <Typography sx={{ color: C.text, fontWeight: 800, fontSize: 18 }}>{t(`ui_i.reports.${sub}`)}</Typography>
          <Typography sx={{ color: C.sub, fontSize: 13, mb: 1.5 }}>{period}</Typography>
          {sub === "trial" && <Trial data={data} ctx={ctx} nm={nm} />}
          {sub === "income" && <Income data={data} ctx={ctx} nm={nm} />}
          {sub === "balance" && <Balance data={data} ctx={ctx} nm={nm} />}
        </Box>
      )}
    </Box>
  );
}

function BalancedChip({ ok, ctx }) {
  const { t, C } = ctx;
  return (
    <Chip size="small" label={ok ? t("ui_i.overview.balanced") : t("ui_i.overview.not_balanced")}
      sx={{ bgcolor: ok ? C.successBg : C.dangerBg, color: ok ? C.success : C.danger, fontWeight: 700, mb: 1.5 }} />
  );
}

function Trial({ data, ctx, nm }) {
  const { t, C, S, lang } = ctx;
  const x = data.totals || {};
  return (
    <>
      <BalancedChip ok={!!data.balanced} ctx={ctx} />
      <TableWrap C={C}>
        <Table size="small" sx={{ minWidth: 720 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={S.th} rowSpan={2}>{t("ui_i.common.code")}</TableCell>
              <TableCell sx={S.th} rowSpan={2}>{t("ui_i.common.name")}</TableCell>
              <TableCell sx={{ ...S.thNum, textAlign: "center" }} colSpan={2}>{t("ui_i.reports.turnover")}</TableCell>
              <TableCell sx={{ ...S.thNum, textAlign: "center" }} colSpan={2}>{t("ui_i.common.balance")}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell sx={S.thNum}>{t("ui_i.common.debit")}</TableCell>
              <TableCell sx={S.thNum}>{t("ui_i.common.credit")}</TableCell>
              <TableCell sx={S.thNum}>{t("ui_i.common.debit")}</TableCell>
              <TableCell sx={S.thNum}>{t("ui_i.common.credit")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(data.rows || []).map((r) => (
              <TableRow key={r.account_id}>
                <TableCell sx={S.td}><Box component="span" dir="ltr">{r.code}</Box></TableCell>
                <TableCell sx={S.td}>{nm(r)}</TableCell>
                <TableCell sx={S.tdNum}><Money v={r.debit} lang={lang} C={C} zeroDash /></TableCell>
                <TableCell sx={S.tdNum}><Money v={r.credit} lang={lang} C={C} zeroDash /></TableCell>
                <TableCell sx={S.tdNum}><Money v={r.balance_debit} lang={lang} C={C} zeroDash /></TableCell>
                <TableCell sx={S.tdNum}><Money v={r.balance_credit} lang={lang} C={C} zeroDash /></TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell sx={{ ...S.td, fontWeight: 800 }} colSpan={2}>{t("ui_i.common.total")}</TableCell>
              {["debit", "credit", "balance_debit", "balance_credit"].map((k) => (
                <TableCell key={k} sx={{ ...S.tdNum, fontWeight: 800 }}><Money v={x[k]} lang={lang} C={C} /></TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </TableWrap>
    </>
  );
}

function Section({ title, list, total, totalLabel, ctx, nm, extra }) {
  const { t, C, S, lang } = ctx;
  return (
    <Box sx={{ mb: 2.5 }}>
      <TableWrap C={C}>
        <Table size="small" sx={{ minWidth: 420 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={S.th} colSpan={2}>{title}</TableCell>
              <TableCell sx={S.thNum}>{t("ui_i.common.amount")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(list || []).map((r) => (
              <TableRow key={r.code}>
                <TableCell sx={S.td}><Box component="span" dir="ltr">{r.code}</Box></TableCell>
                <TableCell sx={S.td}>{nm(r)}</TableCell>
                <TableCell sx={S.tdNum}><Money v={r.amount} lang={lang} C={C} /></TableCell>
              </TableRow>
            ))}
            {extra}
            <TableRow>
              <TableCell sx={{ ...S.td, fontWeight: 800 }} colSpan={2}>{totalLabel}</TableCell>
              <TableCell sx={{ ...S.tdNum, fontWeight: 800 }}><Money v={total} lang={lang} C={C} /></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableWrap>
    </Box>
  );
}

function Income({ data, ctx, nm }) {
  const { t, C, lang } = ctx;
  return (
    <>
      <Section ctx={ctx} nm={nm} title={t("ui_i.reports.sec_income")} list={data.income} total={data.total_income} totalLabel={t("ui_i.reports.total_income")} />
      <Section ctx={ctx} nm={nm} title={t("ui_i.reports.sec_expense")} list={data.expense} total={data.total_expense} totalLabel={t("ui_i.reports.total_expense")} />
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, p: 1.5, borderRadius: 2, bgcolor: C.primarySubtle }}>
        <Typography sx={{ color: C.text, fontWeight: 800 }}>{t("ui_i.reports.net_profit")}</Typography>
        <Typography sx={{ color: C.text, fontWeight: 800 }}><Money v={data.net_profit} lang={lang} C={C} /></Typography>
      </Box>
    </>
  );
}

function Balance({ data, ctx, nm }) {
  const { t, C, S, lang } = ctx;
  return (
    <>
      <BalancedChip ok={!!data.balanced} ctx={ctx} />
      <Section ctx={ctx} nm={nm} title={t("ui_i.reports.assets")} list={data.assets} total={data.total_assets} totalLabel={t("ui_i.reports.total_assets")} />
      <Section ctx={ctx} nm={nm} title={t("ui_i.reports.liabilities")} list={data.liabilities} total={data.total_liabilities} totalLabel={t("ui_i.reports.total_liabilities")} />
      <Section ctx={ctx} nm={nm} title={t("ui_i.reports.equity")} list={data.equity} total={data.total_equity} totalLabel={t("ui_i.reports.total_equity")}
        extra={(
          <TableRow>
            <TableCell sx={S.td} colSpan={2}>{t("ui_i.reports.current_earnings")}</TableCell>
            <TableCell sx={S.tdNum}><Money v={data.current_earnings} lang={lang} C={C} /></TableCell>
          </TableRow>
        )} />
    </>
  );
}
