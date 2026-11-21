import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box, Typography, Button, Tabs, Tab, Table, TableHead, TableBody, TableRow, TableCell,
  TextField, MenuItem, Alert, CircularProgress, Chip, GlobalStyles, FormControlLabel, Checkbox,
} from "@mui/material";
import {
  TableWrap, Money, ReportActions, accName, fmtDate, fmtInt, monthStartISO, todayISO, jalaliPresets,
} from "../common";
import {
  fetchIncomeStatement, fetchBalanceSheet, fetchTrialBalanceExt, fetchJournalBook, fetchCashFlow, fetchAging,
  fetchPartyBalances, fetchVatReport, errMsg,
} from "../api";

const SUBS = ["trial", "income", "balance", "journal_book", "cash_flow", "parties", "aging", "vat"];
const PRINT_ID = "acc-print-area";
const RANGE_SUBS = new Set(["trial", "income", "journal_book", "cash_flow", "vat"]);
const ASOF_SUBS = new Set(["balance", "parties", "aging"]);

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

const n = (v) => Number(v || 0);

/** Every financial report with date filters, print, CSV and Excel export. */
export default function ReportsTab(ctx) {
  const { t, C, S, lang, refreshKey, accByCode, isRtl } = ctx;
  const [sub, setSub] = useState("trial");
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [asOf, setAsOf] = useState(todayISO());
  const [cols, setCols] = useState(6);
  const [level, setLevel] = useState("subsidiary");
  const [beforeClosing, setBeforeClosing] = useState(false);
  const [side, setSide] = useState("receivable");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true); setData(null);
    const p = { from, to };
    const req = {
      trial: () => fetchTrialBalanceExt({ ...p, level, exclude_closing: beforeClosing ? "1" : "" }),
      income: () => fetchIncomeStatement(p),
      balance: () => fetchBalanceSheet({ as_of: asOf }),
      journal_book: () => fetchJournalBook(p),
      cash_flow: () => fetchCashFlow(p),
      parties: () => fetchPartyBalances({ side, as_of: asOf }),
      aging: () => fetchAging({ side, as_of: asOf }),
      vat: () => fetchVatReport(p),
    }[sub];
    req().then((d) => { setData(d); setError(""); })
      .catch((e) => setError(errMsg(e, t("ui_i.common.load_failed"))))
      .finally(() => setLoading(false));
  }, [sub, from, to, asOf, level, beforeClosing, side, t]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const nm = useCallback((r) => (accByCode[r.code] ? accName(accByCode[r.code], lang) : r.name), [accByCode, lang]);
  const subLabel = (k) => (["trial", "income", "balance"].includes(k) ? t(`ui_i.reports.${k}`) : t(`acc2.reports.${k}`));
  const period = ASOF_SUBS.has(sub)
    ? `${t("ui_i.reports.as_of")} ${fmtDate(asOf, lang)}`
    : `${fmtDate(from, lang)} — ${fmtDate(to, lang)}`;
  const presets = useMemo(() => jalaliPresets(todayISO()), []);

  const getRows = () => exportRows(sub, data, { t, nm, cols });
  const stamp = ASOF_SUBS.has(sub) ? asOf : `${from}_${to}`;

  const dateField = (label, value, set) => (
    <TextField type="date" size="small" label={label} value={value} sx={{ ...S.field, width: { xs: "calc(50% - 6px)", sm: 160 } }}
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
          {SUBS.map((k) => <Tab key={k} value={k} label={subLabel(k)} />)}
        </Tabs>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
          {ASOF_SUBS.has(sub)
            ? dateField(t("ui_i.reports.as_of"), asOf, setAsOf)
            : <>{dateField(t("ui_i.common.from"), from, setFrom)}{dateField(t("ui_i.common.to"), to, setTo)}</>}
          {RANGE_SUBS.has(sub) && lang === "fa" && (
            <Box sx={{ display: "flex", gap: 0.5 }}>
              {["month", "season", "year"].map((k) => (
                <Chip key={k} clickable label={t(`acc2.reports.preset_${k}`)} onClick={() => { setFrom(presets[k]); setTo(todayISO()); }}
                  sx={{ height: 32 }} />
              ))}
            </Box>
          )}
          {sub === "trial" && (
            <>
              <TextField select size="small" label={t("acc2.reports.columns")} value={cols} onChange={(e) => setCols(Number(e.target.value))} sx={{ ...S.field, width: 130 }}>
                {[2, 4, 6].map((c) => <MenuItem key={c} value={c}>{t("acc2.reports.n_columns", { n: fmtInt(c, lang) })}</MenuItem>)}
              </TextField>
              <TextField select size="small" label={t("acc2.reports.level")} value={level} onChange={(e) => setLevel(e.target.value)} sx={{ ...S.field, width: 150 }}>
                {["group", "ledger", "subsidiary", "detail"].map((l) => <MenuItem key={l} value={l}>{t(`acc2.levels.${l}`)}</MenuItem>)}
              </TextField>
              <FormControlLabel control={<Checkbox checked={beforeClosing} onChange={(e) => setBeforeClosing(e.target.checked)} />}
                label={t("acc2.reports.before_closing")} sx={{ color: C.sub }} />
            </>
          )}
          {(sub === "parties" || sub === "aging") && (
            <TextField select size="small" value={side} onChange={(e) => setSide(e.target.value)} sx={{ ...S.field, width: 170 }}>
              <MenuItem value="receivable">{t("acc2.reports.receivable")}</MenuItem>
              <MenuItem value="payable">{t("acc2.reports.payable")}</MenuItem>
            </TextField>
          )}
          <Box sx={{ flex: 1 }} />
          <ReportActions ctx={ctx} getRows={getRows} filename={`accounting-${sub}-${stamp}`} disabled={!data} />
        </Box>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      </Box>

      {loading ? (
        <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress size={28} /></Box>
      ) : data && (
        <Box id={PRINT_ID} dir={isRtl ? "rtl" : "ltr"}>
          <Typography sx={{ color: C.text, fontWeight: 800, fontSize: 18 }}>{subLabel(sub)}</Typography>
          <Typography sx={{ color: C.sub, fontSize: 13, mb: 1.5 }}>{period}</Typography>
          {sub === "trial" && <Trial data={data} ctx={ctx} nm={nm} cols={cols} />}
          {sub === "income" && <Income data={data} ctx={ctx} nm={nm} />}
          {sub === "balance" && <Balance data={data} ctx={ctx} nm={nm} />}
          {sub === "journal_book" && <JournalBook data={data} ctx={ctx} />}
          {sub === "cash_flow" && <CashFlow data={data} ctx={ctx} nm={nm} />}
          {sub === "parties" && <Parties data={data} ctx={ctx} />}
          {sub === "aging" && <Aging data={data} ctx={ctx} />}
          {sub === "vat" && <Vat data={data} ctx={ctx} />}
        </Box>
      )}
    </Box>
  );
}

// ── export (CSV / Excel share the same rows; numbers stay numeric) ──────────────
function exportRows(sub, data, { t, nm, cols }) {
  if (!data) return [];
  const D = t("ui_i.common.debit"), Cr = t("ui_i.common.credit");
  const out = [];
  if (sub === "trial") {
    const head = [t("ui_i.common.code"), t("ui_i.common.name")];
    if (data.level === "detail") head.push(t("acc2.details.detail"));
    const keys = trialKeys(cols);
    const group = (k) => (k.startsWith("opening") ? "opening" : k.startsWith("balance") ? "closing" : "turnover");
    keys.forEach((k) => head.push(`${t(`acc2.reports.col_${group(k)}`)} ${k.endsWith("debit") ? D : Cr}`));
    out.push(head);
    data.rows.forEach((r) => out.push([r.code, nm(r), ...(data.level === "detail" ? [r.detail_name] : []), ...keys.map((k) => n(r[k]))]));
    out.push([t("ui_i.common.total"), "", ...(data.level === "detail" ? [""] : []), ...keys.map((k) => n(data.totals[k]))]);
  } else if (sub === "income") {
    out.push([t("ui_i.common.code"), t("ui_i.common.name"), t("ui_i.common.amount")]);
    out.push([t("ui_i.reports.sec_income"), "", ""]);
    data.income.forEach((r) => out.push([r.code, nm(r), n(r.amount)]));
    out.push([t("ui_i.reports.total_income"), "", n(data.total_income)]);
    out.push([t("acc2.reports.gross_profit"), "", n(data.gross_profit)]);
    out.push([t("ui_i.reports.sec_expense"), "", ""]);
    data.expense.forEach((r) => out.push([r.code, nm(r), n(r.amount)]));
    out.push([t("ui_i.reports.total_expense"), "", n(data.total_expense)]);
    out.push([t("ui_i.reports.net_profit"), "", n(data.net_profit)]);
  } else if (sub === "balance") {
    out.push([t("ui_i.common.code"), t("ui_i.common.name"), t("ui_i.common.amount")]);
    [["assets", data.assets, data.total_assets], ["liabilities", data.liabilities, data.total_liabilities],
      ["equity", data.equity, data.total_equity]].forEach(([k, list, total]) => {
      out.push([t(`ui_i.reports.${k}`), "", ""]);
      list.forEach((r) => out.push([r.code, nm(r), n(r.amount)]));
      if (k === "equity") out.push(["", t("ui_i.reports.current_earnings"), n(data.current_earnings)]);
      out.push([t(`ui_i.reports.total_${k}`), "", n(total)]);
    });
  } else if (sub === "journal_book") {
    out.push([t("ui_i.common.number"), t("ui_i.common.date"), t("ui_i.common.code"), t("ui_i.common.account"), t("acc2.details.detail"), t("ui_i.common.memo"), D, Cr]);
    data.entries.forEach((e) => {
      e.lines.forEach((l, i) => out.push([i === 0 ? e.number : "", i === 0 ? e.date : "", l.code, l.account, l.detail, l.memo || (i === 0 ? e.description : ""), n(l.debit), n(l.credit)]));
    });
    out.push([t("ui_i.common.total"), "", "", "", "", "", n(data.total_debit), n(data.total_credit)]);
  } else if (sub === "cash_flow") {
    out.push([t("ui_i.common.code"), t("ui_i.common.name"), t("ui_i.common.amount")]);
    out.push([t("acc2.reports.cash_opening"), "", n(data.opening)]);
    ["operating", "investing", "financing"].forEach((k) => {
      out.push([t(`acc2.reports.cf_${k}`), "", ""]);
      data.sections[k].rows.forEach((r) => out.push([r.code, nm(r), n(r.amount)]));
      out.push([t("ui_i.common.total"), "", n(data.sections[k].total)]);
    });
    out.push([t("acc2.reports.net_change"), "", n(data.net_change)]);
    out.push([t("acc2.reports.cash_closing"), "", n(data.closing)]);
  } else if (sub === "parties") {
    out.push([t("ui_i.common.code"), t("ui_i.common.name"), t("acc2.reports.open_balance"), t("acc2.reports.in_cheques"), t("ui_i.common.balance")]);
    data.rows.forEach((r) => out.push([r.code, r.name || t("acc2.reports.no_detail"), n(r.open), n(r.cheques), n(r.balance)]));
    out.push([t("ui_i.common.total"), "", "", "", n(data.total)]);
  } else if (sub === "aging") {
    out.push([t("ui_i.common.code"), t("ui_i.common.name"), ...data.labels.map((l) => `${l} ${t("acc2.reports.days")}`), t("ui_i.common.balance")]);
    data.rows.forEach((r) => out.push([r.code, r.name || t("acc2.reports.no_detail"), ...r.buckets.map(n), n(r.balance)]));
    out.push([t("ui_i.common.total"), "", ...data.totals.map(n), n(data.total)]);
  } else if (sub === "vat") {
    out.push([t("ui_i.common.date"), t("ui_i.common.number"), t("ui_i.common.description"), t("acc2.cheques.party"), t("acc2.vat.base"), t("acc2.vat.tax")]);
    [["sales", data.sales], ["purchases", data.purchases]].forEach(([k, s]) => {
      out.push([t(`acc2.vat.${k}`), "", "", "", "", ""]);
      s.rows.forEach((r) => out.push([r.date, r.number, r.description, r.party, n(r.base), n(r.tax)]));
      out.push([t("ui_i.common.total"), "", "", "", n(s.base), n(s.tax)]);
    });
    out.push([t("acc2.vat.payable"), "", "", "", "", n(data.payable)]);
  }
  return out;
}

function trialKeys(cols) {
  const turnover = ["debit", "credit"], closing = ["balance_debit", "balance_credit"];
  if (cols === 2) return closing;
  if (cols === 4) return [...turnover, ...closing];
  return ["opening_debit", "opening_credit", ...turnover, ...closing];
}

function BalancedChip({ ok, ctx }) {
  const { t, C } = ctx;
  return (
    <Chip size="small" label={ok ? t("ui_i.overview.balanced") : t("ui_i.overview.not_balanced")}
      sx={{ bgcolor: ok ? C.successBg : C.dangerBg, color: ok ? C.success : C.danger, fontWeight: 700, mb: 1.5 }} />
  );
}

function Trial({ data, ctx, nm, cols }) {
  const { t, C, S, lang } = ctx;
  const keys = trialKeys(cols);
  const groups = cols === 2 ? ["closing"] : cols === 4 ? ["turnover", "closing"] : ["opening", "turnover", "closing"];
  const isDetail = data.level === "detail";
  const x = data.totals || {};
  return (
    <>
      <BalancedChip ok={!!data.balanced} ctx={ctx} />
      <TableWrap C={C}>
        <Table size="small" sx={{ minWidth: 420 + cols * 110 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={S.th} rowSpan={2}>{t("ui_i.common.code")}</TableCell>
              <TableCell sx={S.th} rowSpan={2}>{t("ui_i.common.name")}</TableCell>
              {isDetail && <TableCell sx={S.th} rowSpan={2}>{t("acc2.details.detail")}</TableCell>}
              {groups.map((g) => <TableCell key={g} sx={{ ...S.thNum, textAlign: "center" }} colSpan={2}>{t(`acc2.reports.col_${g}`)}</TableCell>)}
            </TableRow>
            <TableRow>
              {groups.map((g) => [
                <TableCell key={`${g}d`} sx={S.thNum}>{t("ui_i.common.debit")}</TableCell>,
                <TableCell key={`${g}c`} sx={S.thNum}>{t("ui_i.common.credit")}</TableCell>,
              ])}
            </TableRow>
          </TableHead>
          <TableBody>
            {data.rows.map((r) => (
              <TableRow key={`${r.account_id}-${r.detail_id || ""}`}>
                <TableCell sx={S.td}><Box component="span" dir="ltr">{r.code}</Box></TableCell>
                <TableCell sx={{ ...S.td, fontWeight: r.level === "group" ? 700 : 400 }}>{nm(r)}</TableCell>
                {isDetail && <TableCell sx={S.td}>{r.detail_name || "—"}</TableCell>}
                {keys.map((k) => <TableCell key={k} sx={S.tdNum}><Money v={r[k]} lang={lang} C={C} zeroDash /></TableCell>)}
              </TableRow>
            ))}
            <TableRow>
              <TableCell sx={{ ...S.td, fontWeight: 800 }} colSpan={isDetail ? 3 : 2}>{t("ui_i.common.total")}</TableCell>
              {keys.map((k) => <TableCell key={k} sx={{ ...S.tdNum, fontWeight: 800 }}><Money v={x[k]} lang={lang} C={C} /></TableCell>)}
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

function TotalBar({ label, v, ctx }) {
  const { C, lang } = ctx;
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, p: 1.5, mb: 1.5, borderRadius: 2, bgcolor: C.primarySubtle }}>
      <Typography sx={{ color: C.text, fontWeight: 800 }}>{label}</Typography>
      <Typography sx={{ color: C.text, fontWeight: 800 }}><Money v={v} lang={lang} C={C} /></Typography>
    </Box>
  );
}

function Income({ data, ctx, nm }) {
  const { t } = ctx;
  return (
    <>
      <Section ctx={ctx} nm={nm} title={t("ui_i.reports.sec_income")} list={data.income} total={data.total_income} totalLabel={t("ui_i.reports.total_income")} />
      {n(data.cost_of_sales) > 0 && <TotalBar ctx={ctx} label={t("acc2.reports.gross_profit")} v={data.gross_profit} />}
      <Section ctx={ctx} nm={nm} title={t("ui_i.reports.sec_expense")} list={data.expense} total={data.total_expense} totalLabel={t("ui_i.reports.total_expense")} />
      <TotalBar ctx={ctx} label={t("ui_i.reports.net_profit")} v={data.net_profit} />
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

function JournalBook({ data, ctx }) {
  const { t, C, S, lang, openDetail } = ctx;
  return (
    <>
      {data.truncated && <Alert severity="info" sx={{ mb: 1.5 }}>{t("acc2.reports.truncated")}</Alert>}
      <TableWrap C={C}>
        <Table size="small" sx={{ minWidth: 820 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={S.th}>{t("ui_i.common.number")}</TableCell>
              <TableCell sx={S.th}>{t("ui_i.common.date")}</TableCell>
              <TableCell sx={S.th}>{t("ui_i.common.account")}</TableCell>
              <TableCell sx={S.th}>{t("acc2.details.detail")}</TableCell>
              <TableCell sx={S.th}>{t("ui_i.common.memo")}</TableCell>
              <TableCell sx={S.thNum}>{t("ui_i.common.debit")}</TableCell>
              <TableCell sx={S.thNum}>{t("ui_i.common.credit")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.entries.map((e) => e.lines.map((l, i) => (
              <TableRow key={`${e.id}-${i}`} hover onClick={() => openDetail(e.id)} sx={{ cursor: "pointer", ...(i === 0 ? { "& td": { borderTop: `2px solid ${C.divider}` } } : {}) }}>
                <TableCell sx={{ ...S.td, fontWeight: 700 }}>{i === 0 ? fmtInt(e.number, lang) : ""}</TableCell>
                <TableCell sx={S.td}>{i === 0 ? fmtDate(e.date, lang) : ""}</TableCell>
                <TableCell sx={{ ...S.td, paddingInlineStart: l.credit > 0 ? 4 : 2 }}>
                  <Box component="span" dir="ltr" sx={{ color: C.muted, marginInlineEnd: 1 }}>{l.code}</Box>{l.account}
                </TableCell>
                <TableCell sx={S.td}>{l.detail || ""}</TableCell>
                <TableCell sx={S.td}>{l.memo || (i === 0 ? e.description : "")}</TableCell>
                <TableCell sx={S.tdNum}><Money v={l.debit} lang={lang} C={C} zeroDash /></TableCell>
                <TableCell sx={S.tdNum}><Money v={l.credit} lang={lang} C={C} zeroDash /></TableCell>
              </TableRow>
            )))}
            <TableRow>
              <TableCell sx={{ ...S.td, fontWeight: 800 }} colSpan={5}>{t("ui_i.common.total")}</TableCell>
              <TableCell sx={{ ...S.tdNum, fontWeight: 800 }}><Money v={data.total_debit} lang={lang} C={C} /></TableCell>
              <TableCell sx={{ ...S.tdNum, fontWeight: 800 }}><Money v={data.total_credit} lang={lang} C={C} /></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableWrap>
    </>
  );
}

function CashFlow({ data, ctx, nm }) {
  const { t } = ctx;
  return (
    <>
      <TotalBar ctx={ctx} label={t("acc2.reports.cash_opening")} v={data.opening} />
      {["operating", "investing", "financing"].map((k) => (
        <Section key={k} ctx={ctx} nm={nm} title={t(`acc2.reports.cf_${k}`)} list={data.sections[k].rows}
          total={data.sections[k].total} totalLabel={t("ui_i.common.total")} />
      ))}
      <TotalBar ctx={ctx} label={t("acc2.reports.net_change")} v={data.net_change} />
      <TotalBar ctx={ctx} label={t("acc2.reports.cash_closing")} v={data.closing} />
    </>
  );
}

function Parties({ data, ctx }) {
  const { t, C, S, lang } = ctx;
  return (
    <TableWrap C={C}>
      <Table size="small" sx={{ minWidth: 600 }}>
        <TableHead>
          <TableRow>
            <TableCell sx={S.th}>{t("ui_i.common.code")}</TableCell>
            <TableCell sx={S.th}>{t("ui_i.common.name")}</TableCell>
            <TableCell sx={S.thNum}>{t("acc2.reports.open_balance")}</TableCell>
            <TableCell sx={S.thNum}>{t("acc2.reports.in_cheques")}</TableCell>
            <TableCell sx={S.thNum}>{t("ui_i.common.balance")}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.rows.map((r) => (
            <TableRow key={r.detail_id || "none"}>
              <TableCell sx={S.td}><Box component="span" dir="ltr">{r.code || "—"}</Box></TableCell>
              <TableCell sx={S.td}>
                {r.name || t("acc2.reports.no_detail")}
                {r.over_limit && <Chip size="small" label={t("acc2.reports.over_limit")} sx={{ marginInlineStart: 1, color: C.danger, bgcolor: C.dangerBg }} />}
              </TableCell>
              <TableCell sx={S.tdNum}><Money v={r.open} lang={lang} C={C} zeroDash /></TableCell>
              <TableCell sx={S.tdNum}><Money v={r.cheques} lang={lang} C={C} zeroDash /></TableCell>
              <TableCell sx={{ ...S.tdNum, fontWeight: 700 }}><Money v={r.balance} lang={lang} C={C} /></TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell sx={{ ...S.td, fontWeight: 800 }} colSpan={4}>{t("ui_i.common.total")}</TableCell>
            <TableCell sx={{ ...S.tdNum, fontWeight: 800 }}><Money v={data.total} lang={lang} C={C} /></TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableWrap>
  );
}

function Aging({ data, ctx }) {
  const { t, C, S, lang } = ctx;
  return (
    <TableWrap C={C}>
      <Table size="small" sx={{ minWidth: 700 }}>
        <TableHead>
          <TableRow>
            <TableCell sx={S.th}>{t("ui_i.common.name")}</TableCell>
            {data.labels.map((l) => <TableCell key={l} sx={S.thNum}><Box component="span" dir="ltr">{l}</Box> {t("acc2.reports.days")}</TableCell>)}
            <TableCell sx={S.thNum}>{t("ui_i.common.balance")}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.rows.map((r) => (
            <TableRow key={r.detail_id || "none"}>
              <TableCell sx={S.td}>{r.name || t("acc2.reports.no_detail")}</TableCell>
              {r.buckets.map((b, i) => (
                <TableCell key={i} sx={{ ...S.tdNum, color: i >= 2 && n(b) > 0 ? C.danger : C.text }}><Money v={b} lang={lang} C={C} zeroDash /></TableCell>
              ))}
              <TableCell sx={{ ...S.tdNum, fontWeight: 700 }}><Money v={r.balance} lang={lang} C={C} /></TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell sx={{ ...S.td, fontWeight: 800 }}>{t("ui_i.common.total")}</TableCell>
            {data.totals.map((b, i) => <TableCell key={i} sx={{ ...S.tdNum, fontWeight: 800 }}><Money v={b} lang={lang} C={C} /></TableCell>)}
            <TableCell sx={{ ...S.tdNum, fontWeight: 800 }}><Money v={data.total} lang={lang} C={C} /></TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableWrap>
  );
}

function Vat({ data, ctx }) {
  const { t, C, S, lang, openDetail, openVatDocument } = ctx;
  const block = (k, s) => (
    <Box key={k} sx={{ mb: 2.5 }}>
      <TableWrap C={C}>
        <Table size="small" sx={{ minWidth: 640 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={S.th} colSpan={4}>{t(`acc2.vat.${k}`)}</TableCell>
              <TableCell sx={S.thNum}>{t("acc2.vat.base")}</TableCell>
              <TableCell sx={S.thNum}>{t("acc2.vat.tax")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {s.rows.map((r, i) => (
              <TableRow key={i} hover onClick={() => openDetail(r.entry_id)} sx={{ cursor: "pointer" }}>
                <TableCell sx={S.td}>{fmtDate(r.date, lang)}</TableCell>
                <TableCell sx={S.td}>{fmtInt(r.number, lang)}</TableCell>
                <TableCell sx={S.td}>{r.description}</TableCell>
                <TableCell sx={S.td}>{r.party || "—"}</TableCell>
                <TableCell sx={S.tdNum}><Money v={r.base} lang={lang} C={C} zeroDash /></TableCell>
                <TableCell sx={S.tdNum}><Money v={r.tax} lang={lang} C={C} /></TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell sx={{ ...S.td, fontWeight: 800 }} colSpan={4}>{t("ui_i.common.total")}</TableCell>
              <TableCell sx={{ ...S.tdNum, fontWeight: 800 }}><Money v={s.base} lang={lang} C={C} /></TableCell>
              <TableCell sx={{ ...S.tdNum, fontWeight: 800 }}><Money v={s.tax} lang={lang} C={C} /></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableWrap>
    </Box>
  );
  return (
    <>
      <Box className="no-print" sx={{ mb: 1.5 }}>
        <Button variant="outlined" sx={S.ghost} onClick={openVatDocument}>{t("acc2.vat.new_doc")}</Button>
      </Box>
      {block("sales", data.sales)}
      {block("purchases", data.purchases)}
      <TotalBar ctx={ctx} label={t("acc2.vat.payable")} v={data.payable} />
    </>
  );
}
