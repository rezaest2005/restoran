import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Button, Table, TableHead, TableBody, TableRow, TableCell, TextField, MenuItem, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert, CircularProgress, Tabs, Tab,
} from "@mui/material";
import { useRegisteredShortcuts, dialogBindings } from "@shared/common/shortcutKit";
import KbdHint from "@shared/common/KbdHint";
import { TableWrap, Money, fmtDate, fmtInt, num, todayISO, parseCsv } from "../common";
import {
  fetchMoneyAccounts, createMoneyAccount, updateMoneyAccount, fetchTransfers, createTransfer, cancelTransfer,
  fetchReconcile, importStatement, autoMatch, matchStatementLine, unmatchStatementLine, deleteStatementLine, errMsg,
} from "../api";

const subTabSx = (C) => ({
  mb: 2, minHeight: 40,
  "& .MuiTab-root": { color: C.sub, textTransform: "none", fontWeight: 600, minHeight: 40 },
  "& .Mui-selected": { color: `${C.primary} !important` },
  "& .MuiTabs-indicator": { bgcolor: C.primary },
});

/** Banks & cash boxes, transfers between them and bank reconciliation. */
export default function TreasuryTab(ctx) {
  const { t, C, S, refreshKey, bump } = ctx;
  const [sub, setSub] = useState("accounts");
  const [data, setData] = useState({ accounts: [], unassigned: {} });
  const [error, setError] = useState("");
  const load = useCallback(() => {
    fetchMoneyAccounts().then((d) => { setData(d || { accounts: [] }); setError(""); })
      .catch((e) => setError(errMsg(e, t("ui_i.common.load_failed"))));
  }, [t]);
  useEffect(() => { load(); }, [load, refreshKey]);
  const reload = () => { load(); bump(); };

  return (
    <Box sx={S.card}>
      <Tabs value={sub} onChange={(_, v) => setSub(v)} variant="scrollable" scrollButtons="auto" sx={subTabSx(C)}>
        <Tab value="accounts" label={t("acc2.treasury.accounts")} />
        <Tab value="transfers" label={t("acc2.treasury.transfers")} />
        <Tab value="reconcile" label={t("acc2.treasury.reconcile")} />
      </Tabs>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {sub === "accounts" && <AccountsList ctx={ctx} data={data} reload={reload} />}
      {sub === "transfers" && <Transfers ctx={ctx} accounts={data.accounts} reload={reload} />}
      {sub === "reconcile" && <Reconcile ctx={ctx} accounts={data.accounts.filter((a) => a.kind === "bank")} />}
    </Box>
  );
}

function AccountsList({ ctx, data, reload }) {
  const { t, C, S, lang, notify } = ctx;
  const [edit, setEdit] = useState(null);
  useRegisteredShortcuts([{ combo: "F2", label: t("acc2.treasury.new"), handler: () => setEdit({}) }], { enabled: !edit });
  const un = data.unassigned || {};
  return (
    <>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap", mb: 2 }}>
        <Typography sx={{ color: C.sub, fontSize: 13, flex: 1, minWidth: 200 }}>{t("acc2.treasury.intro")}</Typography>
        <Button sx={S.btn} onClick={() => setEdit({})}>{t("acc2.treasury.new")}<KbdHint>F2</KbdHint></Button>
      </Box>
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" } }}>
        {data.accounts.map((m) => (
          <Box key={m.id} onClick={() => setEdit(m)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") setEdit(m); }}
            sx={{ p: 2, borderRadius: 2, border: `1px solid ${C.glassBorder}`, cursor: "pointer", opacity: m.is_active ? 1 : 0.55,
              "&:hover, &:focus-visible": { borderColor: C.primary, outline: "none" } }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
              <Typography sx={{ color: C.text, fontWeight: 700 }}>{m.name}</Typography>
              <Chip size="small" label={t(`acc2.treasury.kind_${m.kind}`)} />
            </Box>
            <Typography sx={{ color: C.muted, fontSize: 12, minHeight: 18 }} dir="ltr">
              {[m.bank_name, m.account_number, m.iban].filter(Boolean).join(" · ")}
            </Typography>
            <Typography sx={{ color: C.text, fontWeight: 800, fontSize: 20, mt: 1 }}>
              <Money v={m.balance} lang={lang} C={C} />
            </Typography>
          </Box>
        ))}
      </Box>
      {data.accounts.length === 0 && (
        <Typography sx={{ color: C.muted, textAlign: "center", py: 3 }}>{t("acc2.treasury.none_yet")}</Typography>
      )}
      {(Number(un.cash) || Number(un.bank)) ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          {t("acc2.treasury.unassigned")}{" "}
          {t("acc2.treasury.kind_cash")}: <Money v={un.cash} lang={lang} C={C} /> — {t("acc2.treasury.kind_bank")}: <Money v={un.bank} lang={lang} C={C} />
        </Alert>
      ) : null}
      {edit && (
        <MoneyAccountDialog ctx={ctx} item={edit} onClose={() => setEdit(null)}
          onSaved={() => { setEdit(null); reload(); notify(t("ui_i.entry.saved")); }} />
      )}
    </>
  );
}

function MoneyAccountDialog({ ctx, item, onClose, onSaved }) {
  const { t, C, S, fullScreen } = ctx;
  const isNew = !item.id;
  const [f, setF] = useState({
    kind: item.kind || "bank", name: item.name || "", bank_name: item.bank_name || "", branch: item.branch || "",
    account_number: item.account_number || "", iban: item.iban || "", card_number: item.card_number || "",
    opening_balance: "", opening_date: todayISO(), is_active: item.is_active !== false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const save = async () => {
    if (!f.name.trim() || busy) return;
    setBusy(true); setError("");
    try {
      if (isNew) await createMoneyAccount({ ...f, opening_balance: num(f.opening_balance) || 0 });
      else await updateMoneyAccount(item.id, f);
      onSaved();
    } catch (e) { setError(errMsg(e, t("ui_i.common.save_failed"))); } finally { setBusy(false); }
  };
  useRegisteredShortcuts(dialogBindings(t, { confirmLabel: t("ui_i.common.save"), onConfirm: save, onClose, enter: false }));
  const bank = f.kind === "bank";
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth slotProps={{ paper: { sx: S.dialogPaper } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{isNew ? t("acc2.treasury.new") : item.name}</DialogTitle>
      <DialogContent dividers sx={{ borderColor: C.divider }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
          <TextField select size="small" label={t("acc2.details.kind")} value={f.kind} onChange={set("kind")} sx={S.field} disabled={!isNew}>
            <MenuItem value="bank">{t("acc2.treasury.kind_bank")}</MenuItem>
            <MenuItem value="cash">{t("acc2.treasury.kind_cash")}</MenuItem>
          </TextField>
          <TextField size="small" label={t("ui_i.common.name")} value={f.name} onChange={set("name")} sx={S.field} autoFocus required />
          {bank && <>
            <TextField size="small" label={t("acc2.treasury.bank_name")} value={f.bank_name} onChange={set("bank_name")} sx={S.field} />
            <TextField size="small" label={t("acc2.treasury.branch")} value={f.branch} onChange={set("branch")} sx={S.field} />
            <TextField size="small" label={t("acc2.treasury.account_number")} value={f.account_number} onChange={set("account_number")} sx={S.field} slotProps={{ htmlInput: { dir: "ltr" } }} />
            <TextField size="small" label={t("acc2.treasury.iban")} value={f.iban} onChange={set("iban")} sx={S.field} slotProps={{ htmlInput: { dir: "ltr" } }} />
            <TextField size="small" label={t("acc2.treasury.card_number")} value={f.card_number} onChange={set("card_number")} sx={S.field} slotProps={{ htmlInput: { dir: "ltr" } }} />
          </>}
          {isNew && <>
            <TextField size="small" label={t("acc2.treasury.opening_balance")} value={f.opening_balance} onChange={set("opening_balance")} sx={S.field} slotProps={{ htmlInput: { dir: "ltr", inputMode: "decimal" } }} />
            <TextField type="date" size="small" label={t("ui_i.common.date")} value={f.opening_date} onChange={set("opening_date")} sx={S.field} slotProps={{ inputLabel: { shrink: true } }} />
          </>}
          {!isNew && (
            <TextField select size="small" label={t("acc2.common.status")} value={f.is_active ? "1" : "0"} sx={S.field}
              onChange={(e) => setF((s) => ({ ...s, is_active: e.target.value === "1" }))}>
              <MenuItem value="1">{t("acc2.common.active")}</MenuItem>
              <MenuItem value="0">{t("acc2.common.inactive")}</MenuItem>
            </TextField>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="outlined" sx={S.ghost} onClick={onClose} disabled={busy}>{t("ui_i.common.cancel")}</Button>
        <Button sx={S.btn} onClick={save} disabled={busy || !f.name.trim()}>
          {busy ? <CircularProgress size={18} color="inherit" /> : <>{t("ui_i.common.save")}<KbdHint>Ctrl+D</KbdHint></>}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function Transfers({ ctx, accounts, reload }) {
  const { t, C, S, lang, notify, refreshKey, openDetail } = ctx;
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ source_id: "", target_id: "", amount: "", fee: "", date: todayISO(), reference: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => { fetchTransfers().then((d) => setRows(d || [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load, refreshKey]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const active = accounts.filter((a) => a.is_active);
  const valid = f.source_id && f.target_id && f.source_id !== f.target_id && num(f.amount) > 0;
  const save = async () => {
    if (!valid || busy) return;
    setBusy(true); setError("");
    try {
      await createTransfer({ ...f, amount: num(f.amount), fee: num(f.fee) || 0 });
      setF((s) => ({ ...s, amount: "", fee: "", reference: "", note: "" }));
      notify(t("ui_i.entry.saved")); load(); reload();
    } catch (e) { setError(errMsg(e, t("ui_i.common.save_failed"))); } finally { setBusy(false); }
  };
  const cancel = async (id) => {
    try { await cancelTransfer(id); notify(t("acc2.treasury.cancelled")); load(); reload(); } catch (e) {
      notify(errMsg(e, t("ui_i.common.save_failed")), "error");
    }
  };
  useRegisteredShortcuts([{ combo: "Ctrl+D", label: t("acc2.treasury.do_transfer"), handler: save }]);
  return (
    <>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, mb: 2 }}>
        <TextField select size="small" label={t("acc2.treasury.from")} value={f.source_id} onChange={set("source_id")} sx={S.field}>
          {active.map((a) => <MenuItem key={a.id} value={String(a.id)}>{a.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label={t("acc2.treasury.to")} value={f.target_id} onChange={set("target_id")} sx={S.field}>
          {active.filter((a) => String(a.id) !== f.source_id).map((a) => <MenuItem key={a.id} value={String(a.id)}>{a.name}</MenuItem>)}
        </TextField>
        <TextField size="small" label={t("ui_i.common.amount")} value={f.amount} onChange={set("amount")} sx={S.field} slotProps={{ htmlInput: { dir: "ltr", inputMode: "decimal" } }} />
        <TextField size="small" label={t("acc2.treasury.fee")} value={f.fee} onChange={set("fee")} sx={S.field} slotProps={{ htmlInput: { dir: "ltr", inputMode: "decimal" } }} />
        <TextField type="date" size="small" label={t("ui_i.common.date")} value={f.date} onChange={set("date")} sx={S.field} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" label={t("acc2.entry.reference")} value={f.reference} onChange={set("reference")} sx={S.field} />
        <TextField size="small" label={t("ui_i.common.memo")} value={f.note} onChange={set("note")} sx={S.field} />
        <Button sx={S.btn} onClick={save} disabled={!valid || busy}>{t("acc2.treasury.do_transfer")}<KbdHint>Ctrl+D</KbdHint></Button>
      </Box>
      <TableWrap C={C}>
        <Table size="small" sx={{ minWidth: 640 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={S.th}>{t("ui_i.common.date")}</TableCell>
              <TableCell sx={S.th}>{t("acc2.treasury.from")}</TableCell>
              <TableCell sx={S.th}>{t("acc2.treasury.to")}</TableCell>
              <TableCell sx={S.thNum}>{t("ui_i.common.amount")}</TableCell>
              <TableCell sx={S.thNum}>{t("acc2.treasury.fee")}</TableCell>
              <TableCell sx={S.th} />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} sx={{ opacity: r.cancelled ? 0.5 : 1 }}>
                <TableCell sx={S.td}>{fmtDate(r.date, lang)}</TableCell>
                <TableCell sx={S.td}>{r.source}</TableCell>
                <TableCell sx={S.td}>{r.target}</TableCell>
                <TableCell sx={S.tdNum}><Money v={r.amount} lang={lang} C={C} /></TableCell>
                <TableCell sx={S.tdNum}><Money v={r.fee} lang={lang} C={C} zeroDash /></TableCell>
                <TableCell sx={S.td}>
                  {r.entry_id && <Button size="small" sx={S.link} onClick={() => openDetail(r.entry_id)}>{t("ui_i.entry.details")}</Button>}
                  {r.cancelled ? t("acc2.treasury.cancelled") : (
                    <Button size="small" sx={{ ...S.link, color: C.danger }} onClick={() => cancel(r.id)}>{t("acc2.treasury.cancel")}</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={6} sx={{ ...S.td, textAlign: "center", color: C.muted }}>{t("acc2.common.empty")}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableWrap>
    </>
  );
}

/** Bank reconciliation: paste/upload the statement, auto-match by amount ±5 days, match the rest by hand. */
function Reconcile({ ctx, accounts }) {
  const { t, C, S, lang, notify, openDetail } = ctx;
  const [maId, setMaId] = useState(accounts[0] ? String(accounts[0].id) : "");
  const [stmtBal, setStmtBal] = useState("");
  const [data, setData] = useState(null);
  const [paste, setPaste] = useState("");
  const [pick, setPick] = useState(null); // statement line being matched
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!maId) return;
    fetchReconcile(maId, { statement_balance: stmtBal === "" ? undefined : num(stmtBal) })
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError(errMsg(e, t("ui_i.common.load_failed"))));
  }, [maId, stmtBal, t]);
  useEffect(() => { load(); }, [load]);

  const doImport = async () => {
    // columns: date, amount (+ deposit / − withdrawal), description, reference — header row optional
    const rows = parseCsv(paste).filter((r) => /\d{4}-\d{2}-\d{2}/.test(r[0] || "")).map((r) => ({
      date: r[0].trim().slice(0, 10), amount: String(r[1] || "").replace(/,/g, "").trim(),
      description: (r[2] || "").trim(), reference: (r[3] || "").trim(),
    }));
    if (!rows.length) { setError(t("acc2.treasury.import_none")); return; }
    setBusy(true); setError("");
    try {
      const res = await importStatement(maId, rows);
      notify(t("acc2.treasury.imported", { n: res.imported, m: res.matched }));
      setPaste(""); load();
    } catch (e) { setError(errMsg(e, t("ui_i.common.save_failed"))); } finally { setBusy(false); }
  };
  const run = async (fn, okMsg) => {
    setBusy(true); setError("");
    try { await fn(); if (okMsg) notify(okMsg); load(); } catch (e) { setError(errMsg(e, t("ui_i.common.save_failed"))); } finally { setBusy(false); }
  };
  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => setPaste(String(r.result || ""));
    r.readAsText(file);
  };

  if (!accounts.length) return <Typography sx={{ color: C.muted, textAlign: "center", py: 3 }}>{t("acc2.treasury.no_bank")}</Typography>;
  const unmatchedStmt = (data?.statement_rows || []).filter((s) => !s.matched_line_id);
  const candidates = pick ? (data?.unmatched_book || []).filter((b) => Number(b.amount) === Number(pick.amount)) : [];

  return (
    <>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
        <TextField select size="small" label={t("acc2.treasury.kind_bank")} value={maId} onChange={(e) => setMaId(e.target.value)} sx={{ ...S.field, minWidth: 200 }}>
          {accounts.map((a) => <MenuItem key={a.id} value={String(a.id)}>{a.name}</MenuItem>)}
        </TextField>
        <TextField size="small" label={t("acc2.treasury.statement_balance")} value={stmtBal} onChange={(e) => setStmtBal(e.target.value)}
          sx={{ ...S.field, width: 200 }} slotProps={{ htmlInput: { dir: "ltr", inputMode: "decimal" } }} />
        <Button variant="outlined" sx={S.ghost} disabled={busy} onClick={() => run(() => autoMatch(maId), t("acc2.treasury.matched"))}>
          {t("acc2.treasury.auto_match")}
        </Button>
      </Box>
      {data && (
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, mb: 2 }}>
          {[["acc2.treasury.book_balance", data.book_balance], ["acc2.treasury.unmatched_book", data.unmatched_book_total],
            ["acc2.treasury.unmatched_statement", data.unmatched_statement_total],
            ["acc2.treasury.difference", data.difference]].map(([k, v]) => (
            <Box key={k} sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${C.glassBorder}` }}>
              <Typography sx={{ color: C.muted, fontSize: 11 }}>{t(k)}</Typography>
              <Typography sx={{ color: k.endsWith("difference") && v != null && Number(v) !== 0 ? C.danger : C.text, fontWeight: 800 }}>
                {v == null ? "—" : <Money v={v} lang={lang} C={C} />}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
      <Box sx={{ mb: 2 }}>
        <Typography sx={{ color: C.text, fontWeight: 700, mb: 0.5 }}>{t("acc2.treasury.import_title")}</Typography>
        <Typography sx={{ color: C.muted, fontSize: 12, mb: 1 }}>{t("acc2.treasury.import_hint")}</Typography>
        <TextField multiline minRows={3} fullWidth value={paste} onChange={(e) => setPaste(e.target.value)} sx={S.field}
          placeholder="2026-04-01,1500000,واریز,123" slotProps={{ htmlInput: { dir: "ltr" } }} />
        <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
          <Button variant="outlined" component="label" sx={S.ghost}>
            {t("acc2.treasury.choose_file")}<input type="file" accept=".csv,.txt" hidden onChange={onFile} />
          </Button>
          <Button sx={S.btn} onClick={doImport} disabled={busy || !paste.trim()}>{t("acc2.treasury.import")}</Button>
        </Box>
      </Box>
      <Typography sx={{ color: C.text, fontWeight: 700, mb: 1 }}>{t("acc2.treasury.statement_lines")}</Typography>
      <TableWrap C={C}>
        <Table size="small" sx={{ minWidth: 640 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={S.th}>{t("ui_i.common.date")}</TableCell>
              <TableCell sx={S.th}>{t("ui_i.common.description")}</TableCell>
              <TableCell sx={S.thNum}>{t("ui_i.common.amount")}</TableCell>
              <TableCell sx={S.th}>{t("acc2.treasury.match")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(data?.statement_rows || []).map((s) => (
              <TableRow key={s.id}>
                <TableCell sx={S.td}>{fmtDate(s.date, lang)}</TableCell>
                <TableCell sx={S.td}>{s.description || "—"}</TableCell>
                <TableCell sx={S.tdNum}><Money v={s.amount} lang={lang} C={C} /></TableCell>
                <TableCell sx={S.td}>
                  {s.matched_line_id ? (
                    <>
                      <Chip size="small" label={`${t("acc2.treasury.matched_to")} ${fmtInt(s.matched_number, lang)}`} sx={{ color: C.success, bgcolor: C.successBg }} />
                      <Button size="small" sx={S.link} onClick={() => run(() => unmatchStatementLine(s.id))}>{t("acc2.treasury.unmatch")}</Button>
                    </>
                  ) : (
                    <>
                      <Button size="small" sx={S.link} onClick={() => setPick(s)}>{t("acc2.treasury.match")}</Button>
                      <Button size="small" sx={{ ...S.link, color: C.danger }} onClick={() => run(() => deleteStatementLine(s.id))}>{t("ui_i.common.remove")}</Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!(data?.statement_rows || []).length && (
              <TableRow><TableCell colSpan={4} sx={{ ...S.td, textAlign: "center", color: C.muted }}>{t("acc2.common.empty")}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableWrap>
      <Typography sx={{ color: C.text, fontWeight: 700, mt: 2, mb: 1 }}>
        {t("acc2.treasury.unmatched_book")} ({fmtInt((data?.unmatched_book || []).length, lang)})
      </Typography>
      <TableWrap C={C}>
        <Table size="small" sx={{ minWidth: 560 }}>
          <TableBody>
            {(data?.unmatched_book || []).map((b) => (
              <TableRow key={b.id} hover onClick={() => openDetail(b.entry_id)} sx={{ cursor: "pointer" }}>
                <TableCell sx={S.td}>{fmtDate(b.date, lang)}</TableCell>
                <TableCell sx={S.td}>{fmtInt(b.number, lang)}</TableCell>
                <TableCell sx={S.td}>{b.description || "—"}</TableCell>
                <TableCell sx={S.tdNum}><Money v={b.amount} lang={lang} C={C} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableWrap>
      {pick && (
        <Dialog open onClose={() => setPick(null)} maxWidth="sm" fullWidth slotProps={{ paper: { sx: S.dialogPaper } }}>
          <DialogTitle sx={{ fontWeight: 700 }}>{t("acc2.treasury.match")} — <Money v={pick.amount} lang={lang} C={C} /></DialogTitle>
          <DialogContent dividers sx={{ borderColor: C.divider }}>
            {candidates.length === 0 ? (
              <Typography sx={{ color: C.muted }}>{t("acc2.treasury.no_candidates")}</Typography>
            ) : candidates.map((b) => (
              <Button key={b.id} fullWidth variant="outlined" sx={{ ...S.ghost, justifyContent: "space-between", mb: 1 }}
                onClick={() => { setPick(null); run(() => matchStatementLine(pick.id, b.id), t("acc2.treasury.matched")); }}>
                <span>{fmtDate(b.date, lang)} · {fmtInt(b.number, lang)} · {b.description}</span>
                <Money v={b.amount} lang={lang} C={C} />
              </Button>
            ))}
          </DialogContent>
          <DialogActions><Button sx={S.ghost} onClick={() => setPick(null)}>{t("ui_i.common.close")}</Button></DialogActions>
        </Dialog>
      )}
      {unmatchedStmt.length > 0 && <Box sx={{ height: 4 }} />}
    </>
  );
}
