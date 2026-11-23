import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Button, Table, TableHead, TableBody, TableRow, TableCell, TextField, MenuItem, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert, CircularProgress, ToggleButton, ToggleButtonGroup,
} from "@mui/material";
import { useRegisteredShortcuts, dialogBindings, onEnter } from "@shared/common/shortcutKit";
import KbdHint from "@shared/common/KbdHint";
import {
  TableWrap, Money, DetailPicker, CHEQUE_STATUSES, fmtDate, num, todayISO, useRowCursor, cursorBindings, cursorProps,
} from "../common";
import {
  fetchCheques, createCheque, fetchCheque, chequeStatus, chequeUndo, fetchMoneyAccounts, errMsg,
} from "../api";

// allowed next states (mirrors the backend rules)
const NEXT = {
  received: {
    in_hand: ["deposited", "cleared", "bounced", "endorsed", "returned"],
    deposited: ["cleared", "bounced"],
    bounced: ["deposited", "cleared", "returned"],
  },
  issued: { in_hand: ["cleared", "bounced", "returned"], bounced: ["cleared", "returned"] },
};

const statusColor = (C, s) => ({
  in_hand: [C.info, C.infoBg], deposited: [C.accent, C.accentSubtle], cleared: [C.success, C.successBg],
  bounced: [C.danger, C.dangerBg], returned: [C.muted, C.divider], endorsed: [C.warning, C.warningBg],
}[s] || [C.text, C.divider]);

/** Received and issued cheques with their full lifecycle; each step posts its own voucher. */
export default function ChequesTab(ctx) {
  const { t, C, S, lang, refreshKey, bump, notify } = ctx;
  const [direction, setDirection] = useState("received");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [moneyAccounts, setMoneyAccounts] = useState([]);

  const load = useCallback(() => {
    fetchCheques({ direction, status, q: q.trim() })
      .then((d) => { setRows(d || []); setError(""); })
      .catch((e) => setError(errMsg(e, t("ui_i.common.load_failed"))))
      .finally(() => setLoading(false));
  }, [direction, status, q, t]);
  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => {
    fetchMoneyAccounts().then((d) => setMoneyAccounts((d?.accounts || []).filter((m) => m.is_active))).catch(() => {});
  }, [refreshKey]);

  const cursor = useRowCursor(rows.length);
  useRegisteredShortcuts([
    { combo: "F2", label: t("acc2.cheques.new"), handler: () => setNewOpen(true) },
    ...cursorBindings(t, cursor),
    { combo: "Enter", label: t("ui_i.keys.open_row"),
      handler: onEnter(() => { const r = rows[cursor.index]; if (!r) return false; setOpenId(r.id); return true; }) },
  ], { enabled: !newOpen && !openId });

  const today = todayISO();
  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const changed = () => { load(); bump(); };

  return (
    <Box sx={S.card}>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
        <ToggleButtonGroup exclusive size="small" value={direction} onChange={(_, v) => { if (v) { setDirection(v); setStatus(""); cursor.reset(); } }}>
          <ToggleButton value="received" sx={{ minHeight: 40, px: 2 }}>{t("acc2.cheques.received")}</ToggleButton>
          <ToggleButton value="issued" sx={{ minHeight: 40, px: 2 }}>{t("acc2.cheques.issued")}</ToggleButton>
        </ToggleButtonGroup>
        <TextField select size="small" label={t("acc2.common.status")} value={status} onChange={(e) => setStatus(e.target.value)}
          sx={{ ...S.field, width: { xs: "100%", sm: 180 } }}>
          <MenuItem value="">{t("ui_i.common.all")}</MenuItem>
          {CHEQUE_STATUSES.map((s) => <MenuItem key={s} value={s}>{t(`acc2.cheque_status.${direction}_${s}`, { defaultValue: t(`acc2.cheque_status.${s}`) })}</MenuItem>)}
        </TextField>
        <TextField size="small" label={t("ui_i.common.search")} value={q} onChange={(e) => setQ(e.target.value)}
          sx={{ ...S.field, flex: 1, minWidth: { xs: "100%", sm: 200 } }} />
        <Button sx={S.btn} onClick={() => setNewOpen(true)}>{t("acc2.cheques.new")}<KbdHint>F2</KbdHint></Button>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading ? <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress size={28} /></Box> : (
        <TableWrap C={C}>
          <Table size="small" sx={{ minWidth: 760 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={S.th}>{t("acc2.cheques.number")}</TableCell>
                <TableCell sx={S.th}>{t("acc2.cheques.party")}</TableCell>
                <TableCell sx={S.th}>{t("acc2.treasury.bank_name")}</TableCell>
                <TableCell sx={S.th}>{t("acc2.cheques.due_date")}</TableCell>
                <TableCell sx={S.thNum}>{t("ui_i.common.amount")}</TableCell>
                <TableCell sx={S.th}>{t("acc2.common.status")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r, i) => {
                const [fg, bg] = statusColor(C, r.status);
                const overdue = r.due_date <= today && ["in_hand", "deposited"].includes(r.status);
                const cp = cursorProps(C, i === cursor.index);
                return (
                  <TableRow key={r.id} hover {...cp} onClick={() => setOpenId(r.id)} sx={{ cursor: "pointer", ...(cp.sx || {}) }}>
                    <TableCell sx={S.td}><Box component="span" dir="ltr">{r.number}</Box></TableCell>
                    <TableCell sx={{ ...S.td, fontWeight: 600 }}>{r.party}</TableCell>
                    <TableCell sx={S.td}>{r.bank_name || "—"}</TableCell>
                    <TableCell sx={{ ...S.td, color: overdue ? C.danger : C.text, fontWeight: overdue ? 700 : 400 }}>{fmtDate(r.due_date, lang)}</TableCell>
                    <TableCell sx={S.tdNum}><Money v={r.amount} lang={lang} C={C} /></TableCell>
                    <TableCell sx={S.td}><Chip size="small" label={t(`acc2.cheque_status.${r.status}`)} sx={{ color: fg, bgcolor: bg, fontWeight: 700 }} /></TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} sx={{ ...S.td, textAlign: "center", color: C.muted }}>{t("acc2.common.empty")}</TableCell></TableRow>
              ) : (
                <TableRow>
                  <TableCell colSpan={4} sx={{ ...S.td, fontWeight: 800 }}>{t("ui_i.common.total")}</TableCell>
                  <TableCell sx={{ ...S.tdNum, fontWeight: 800 }}><Money v={total} lang={lang} C={C} /></TableCell>
                  <TableCell sx={S.td} />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableWrap>
      )}
      {newOpen && (
        <NewChequeDialog ctx={ctx} direction={direction} moneyAccounts={moneyAccounts} onClose={() => setNewOpen(false)}
          onSaved={() => { setNewOpen(false); changed(); notify(t("ui_i.entry.saved")); }} />
      )}
      {openId && (
        <ChequeDialog ctx={ctx} id={openId} moneyAccounts={moneyAccounts} onClose={() => setOpenId(null)} onChanged={changed} />
      )}
    </Box>
  );
}

function NewChequeDialog({ ctx, direction, moneyAccounts, onClose, onSaved }) {
  const { t, C, S, fullScreen } = ctx;
  const [party, setParty] = useState(null);
  const [f, setF] = useState({ number: "", sayad_id: "", bank_name: "", branch: "", amount: "", issue_date: todayISO(),
    due_date: todayISO(), money_account_id: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const banks = moneyAccounts.filter((m) => m.kind === "bank");
  const valid = party && f.number.trim() && num(f.amount) > 0 && f.due_date && (direction === "received" || f.money_account_id);
  const save = async () => {
    if (!valid || busy) return;
    setBusy(true); setError("");
    try {
      await createCheque({ ...f, direction, party_id: party.id, amount: num(f.amount),
        money_account_id: f.money_account_id || undefined });
      onSaved();
    } catch (e) { setError(errMsg(e, t("ui_i.common.save_failed"))); } finally { setBusy(false); }
  };
  useRegisteredShortcuts(dialogBindings(t, { confirmLabel: t("ui_i.common.save"), onConfirm: save, onClose, enter: false }));
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth slotProps={{ paper: { sx: S.dialogPaper } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{direction === "received" ? t("acc2.cheques.new_received") : t("acc2.cheques.new_issued")}</DialogTitle>
      <DialogContent dividers sx={{ borderColor: C.divider }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
          <Box sx={{ gridColumn: "1 / -1" }}>
            <DetailPicker ctx={ctx} value={party} onChange={setParty} label={t("acc2.cheques.party")} autoFocus />
          </Box>
          <TextField size="small" label={t("acc2.cheques.number")} value={f.number} onChange={set("number")} sx={S.field} slotProps={{ htmlInput: { dir: "ltr" } }} />
          <TextField size="small" label={t("ui_i.common.amount")} value={f.amount} onChange={set("amount")} sx={S.field} slotProps={{ htmlInput: { dir: "ltr", inputMode: "decimal" } }} />
          <TextField type="date" size="small" label={direction === "received" ? t("acc2.cheques.received_on") : t("acc2.cheques.issued_on")} value={f.issue_date} onChange={set("issue_date")} sx={S.field} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField type="date" size="small" label={t("acc2.cheques.due_date")} value={f.due_date} onChange={set("due_date")} sx={S.field} slotProps={{ inputLabel: { shrink: true } }} />
          {direction === "issued" ? (
            <TextField select size="small" label={t("acc2.cheques.from_bank")} value={f.money_account_id} onChange={set("money_account_id")} sx={S.field}>
              {banks.map((m) => <MenuItem key={m.id} value={String(m.id)}>{m.name}</MenuItem>)}
            </TextField>
          ) : (
            <TextField size="small" label={t("acc2.treasury.bank_name")} value={f.bank_name} onChange={set("bank_name")} sx={S.field} />
          )}
          <TextField size="small" label={t("acc2.cheques.sayad")} value={f.sayad_id} onChange={set("sayad_id")} sx={S.field}
            slotProps={{ htmlInput: { dir: "ltr", inputMode: "numeric", maxLength: 16 } }} />
          <TextField size="small" label={t("ui_i.common.memo")} value={f.note} onChange={set("note")} sx={{ ...S.field, gridColumn: "1 / -1" }} />
          {direction === "issued" && banks.length === 0 && <Alert severity="info" sx={{ gridColumn: "1 / -1" }}>{t("acc2.treasury.no_bank")}</Alert>}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="outlined" sx={S.ghost} onClick={onClose} disabled={busy}>{t("ui_i.common.cancel")}</Button>
        <Button sx={S.btn} onClick={save} disabled={busy || !valid}>
          {busy ? <CircularProgress size={18} color="inherit" /> : <>{t("ui_i.common.save")}<KbdHint>Ctrl+D</KbdHint></>}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ChequeDialog({ ctx, id, moneyAccounts, onClose, onChanged }) {
  const { t, C, S, lang, fullScreen, openDetail, notify } = ctx;
  const [ch, setCh] = useState(null);
  const [to, setTo] = useState("");
  const [date, setDate] = useState(todayISO());
  const [maId, setMaId] = useState("");
  const [endorsee, setEndorsee] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    fetchCheque(id).then((c) => { setCh(c); setMaId(c.money_account_id ? String(c.money_account_id) : ""); })
      .catch((e) => setError(errMsg(e, t("ui_i.common.load_failed"))));
  }, [id, t]);
  useEffect(() => { load(); }, [load]);

  const next = ch ? (NEXT[ch.direction][ch.status] || []) : [];
  const needsBank = ["deposited", "cleared"].includes(to);
  const apply = async () => {
    if (!to || busy) return;
    setBusy(true); setError("");
    try {
      await chequeStatus(id, { to_status: to, date, money_account_id: needsBank ? maId : undefined, endorsed_to_id: endorsee?.id });
      notify(t("acc2.cheques.status_changed")); setTo(""); load(); onChanged();
    } catch (e) { setError(errMsg(e, t("ui_i.common.save_failed"))); } finally { setBusy(false); }
  };
  const undo = async () => {
    setBusy(true); setError("");
    try { await chequeUndo(id); notify(t("acc2.cheques.undone")); load(); onChanged(); } catch (e) {
      setError(errMsg(e, t("ui_i.common.save_failed")));
    } finally { setBusy(false); }
  };
  useRegisteredShortcuts(dialogBindings(t, { confirmLabel: t("acc2.cheques.apply"), onConfirm: apply, onClose, enter: false }));
  const label = (s) => t(`acc2.cheque_status.${s}`);
  const canUndo = ch && (ch.events || []).length > 1;

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth slotProps={{ paper: { sx: S.dialogPaper } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{t("acc2.cheques.cheque")} {ch ? ch.number : ""}</DialogTitle>
      <DialogContent dividers sx={{ borderColor: C.divider }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {!ch ? <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress size={28} /></Box> : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "1fr 1fr" }}>
              {[["acc2.cheques.party", ch.party], ["ui_i.common.amount", <Money key="m" v={ch.amount} lang={lang} C={C} />],
                ["acc2.cheques.due_date", fmtDate(ch.due_date, lang)], ["acc2.common.status", label(ch.status)],
                ["acc2.treasury.bank_name", ch.bank_name || ch.money_account || "—"], ["acc2.cheques.sayad", ch.sayad_id || "—"]]
                .map(([k, v]) => (
                  <Box key={k}>
                    <Typography sx={{ color: C.muted, fontSize: 11 }}>{t(k)}</Typography>
                    <Typography sx={{ color: C.text, fontWeight: 600 }}>{v}</Typography>
                  </Box>
                ))}
            </Box>
            {next.length > 0 && (
              <Box sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${C.glassBorder}`, display: "grid", gap: 1.5,
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
                <TextField select size="small" label={t("acc2.cheques.change_to")} value={to} onChange={(e) => setTo(e.target.value)} sx={S.field}>
                  {next.map((s) => <MenuItem key={s} value={s}>{label(s)}</MenuItem>)}
                </TextField>
                <TextField type="date" size="small" label={t("ui_i.common.date")} value={date} onChange={(e) => setDate(e.target.value)} sx={S.field} slotProps={{ inputLabel: { shrink: true } }} />
                {needsBank && (
                  <TextField select size="small" label={t("acc2.treasury.money_account")} value={maId} onChange={(e) => setMaId(e.target.value)} sx={S.field}>
                    {moneyAccounts.map((m) => <MenuItem key={m.id} value={String(m.id)}>{m.name}</MenuItem>)}
                  </TextField>
                )}
                {to === "endorsed" && <DetailPicker ctx={ctx} value={endorsee} onChange={setEndorsee} label={t("acc2.cheques.endorse_to")} />}
                <Button sx={S.btn} onClick={apply} disabled={busy || !to || (needsBank && !maId) || (to === "endorsed" && !endorsee)}>
                  {t("acc2.cheques.apply")}<KbdHint>Ctrl+D</KbdHint>
                </Button>
              </Box>
            )}
            <Typography sx={{ color: C.text, fontWeight: 700 }}>{t("acc2.cheques.history")}</Typography>
            {(ch.events || []).map((e) => (
              <Box key={e.id} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", fontSize: 13, color: C.sub }}>
                <span>{fmtDate(e.date, lang)}</span>
                <span>{e.from_status ? `${label(e.from_status)} ← ` : ""}{label(e.to_status)}</span>
                {e.note && <span>· {e.note}</span>}
                {e.entry_id && <Button size="small" sx={S.link} onClick={() => openDetail(e.entry_id)}>{t("ui_i.entry.details")}</Button>}
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        {canUndo && <Button sx={{ ...S.ghost, color: C.danger }} onClick={undo} disabled={busy}>{t("acc2.cheques.undo")}</Button>}
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" sx={S.ghost} onClick={onClose}>{t("ui_i.common.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}
