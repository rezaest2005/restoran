import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Table, TableHead, TableBody, TableRow, TableCell, TextField, Alert,
  CircularProgress,
} from "@mui/material";
import { useRegisteredShortcuts, onEnter } from "@shared/common/shortcutKit";
import {
  TableWrap, Money, AccountPicker, accName, fmtDate, fmtInt, monthStartISO, todayISO,
  useRowCursor, cursorBindings, cursorProps,
} from "../common";
import { fetchLedger, errMsg } from "../api";

export default function LedgerTab(ctx) {
  const { t, C, S, lang, refreshKey, openDetail, accById } = ctx;
  const [account, setAccount] = useState(null);
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!account) { setData(null); return; }
    setLoading(true);
    fetchLedger({ account: account.id, from, to })
      .then((d) => { setData(d); setError(""); })
      .catch((e) => { setData(null); setError(errMsg(e, t("ui_i.common.load_failed"))); })
      .finally(() => setLoading(false));
  }, [account, from, to, t]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const rows = data?.rows || [];
  const cursor = useRowCursor(rows.length);
  useRegisteredShortcuts([
    ...cursorBindings(t, cursor),
    { combo: "Enter", label: t("ui_i.keys.open_row"),
      handler: onEnter(() => { const r = rows[cursor.index]; if (!r) return false; openDetail(r.entry_id); return true; }) },
  ]);

  const shown = data?.account ? (accById[data.account.id] || data.account) : null;

  return (
    <Box sx={S.card}>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "flex-start", mb: 2 }}>
        <Box sx={{ flex: 1, minWidth: { xs: "100%", sm: 280 } }}>
          <AccountPicker ctx={ctx} value={account} postableOnly={false} label={t("ui_i.common.account")}
            onChange={(a) => { setAccount(a); cursor.reset(); }} />
        </Box>
        <TextField type="date" slotProps={{ inputLabel: { shrink: true } }} size="small" label={t("ui_i.common.from")} value={from} sx={{ ...S.field, width: { xs: "calc(50% - 6px)", sm: 160 } }}
          onChange={(e) => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField type="date" slotProps={{ inputLabel: { shrink: true } }} size="small" label={t("ui_i.common.to")} value={to} sx={{ ...S.field, width: { xs: "calc(50% - 6px)", sm: 160 } }}
          onChange={(e) => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!account ? (
        <Typography sx={{ color: C.muted, textAlign: "center", py: 4 }}>{t("ui_i.ledger.pick")}</Typography>
      ) : loading ? (
        <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress size={28} /></Box>
      ) : data && (
        <>
          <Typography sx={{ color: C.text, fontWeight: 700, mb: 1 }}>
            <Box component="span" dir="ltr">{shown.code}</Box> — {accName(shown, lang)}
          </Typography>
          <TableWrap C={C}>
            <Table size="small" sx={{ minWidth: 760 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={S.th}>{t("ui_i.common.date")}</TableCell>
                  <TableCell sx={S.th}>{t("ui_i.common.number")}</TableCell>
                  <TableCell sx={S.th}>{t("ui_i.common.description")}</TableCell>
                  <TableCell sx={S.th}>{t("ui_i.common.cost_center")}</TableCell>
                  <TableCell sx={S.thNum}>{t("ui_i.common.debit")}</TableCell>
                  <TableCell sx={S.thNum}>{t("ui_i.common.credit")}</TableCell>
                  <TableCell sx={S.thNum}>{t("ui_i.common.balance")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow sx={{ bgcolor: C.primarySubtle }}>
                  <TableCell sx={{ ...S.td, fontWeight: 700 }} colSpan={6}>{t("ui_i.ledger.opening")}</TableCell>
                  <TableCell sx={{ ...S.tdNum, fontWeight: 700 }}><Money v={data.opening} lang={lang} C={C} /></TableCell>
                </TableRow>
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={7} sx={{ ...S.td, textAlign: "center", color: C.muted }}>{t("ui_i.ledger.empty")}</TableCell></TableRow>
                )}
                {rows.map((r, i) => {
                  const cp = cursorProps(C, i === cursor.index);
                  return (
                    <TableRow key={`${r.entry_id}-${i}`} hover onClick={() => openDetail(r.entry_id)} {...cp}
                      sx={{ cursor: "pointer", ...(cp.sx || {}) }}>
                      <TableCell sx={S.td}>{fmtDate(r.date, lang)}</TableCell>
                      <TableCell sx={S.td}>{fmtInt(r.number, lang)}</TableCell>
                      <TableCell sx={S.td}>{[r.description, r.memo].filter(Boolean).join(" — ") || "—"}</TableCell>
                      <TableCell sx={S.td}>{r.cost_center || "—"}</TableCell>
                      <TableCell sx={S.tdNum}><Money v={r.debit} lang={lang} C={C} zeroDash /></TableCell>
                      <TableCell sx={S.tdNum}><Money v={r.credit} lang={lang} C={C} zeroDash /></TableCell>
                      <TableCell sx={S.tdNum}><Money v={r.balance} lang={lang} C={C} /></TableCell>
                    </TableRow>
                  );
                })}
                <TableRow sx={{ bgcolor: C.primarySubtle }}>
                  <TableCell sx={{ ...S.td, fontWeight: 800 }} colSpan={6}>{t("ui_i.ledger.closing")}</TableCell>
                  <TableCell sx={{ ...S.tdNum, fontWeight: 800 }}><Money v={data.closing} lang={lang} C={C} /></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableWrap>
        </>
      )}
    </Box>
  );
}
