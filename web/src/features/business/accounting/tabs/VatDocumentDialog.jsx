import { useState, useEffect } from "react";
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  Alert, CircularProgress, ToggleButton, ToggleButtonGroup,
} from "@mui/material";
import { useRegisteredShortcuts, dialogBindings } from "@shared/common/shortcutKit";
import KbdHint from "@business/pos/common/KbdHint";
import { AccountPicker, DetailPicker, Money, num, round2, todayISO } from "../common";
import { createVatDocument, fetchMoneyAccounts, fetchAccSettings, errMsg } from "../api";

/**
 * Sale or purchase with VAT straight into the books — for businesses that use accounting alone
 * (no POS / inventory invoices). Net + VAT% → total; cash, bank or on credit to a party.
 */
export default function VatDocumentDialog({ ctx, onClose, onSaved }) {
  const { t, C, S, lang, fullScreen } = ctx;
  const [kind, setKind] = useState("sale");
  const [date, setDate] = useState(todayISO());
  const [party, setParty] = useState(null);
  const [account, setAccount] = useState(null);
  const [net, setNet] = useState("");
  const [rate, setRate] = useState("10");
  const [method, setMethod] = useState("credit");
  const [moneyId, setMoneyId] = useState("");
  const [moneyAccounts, setMoneyAccounts] = useState([]);
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchMoneyAccounts().then((d) => setMoneyAccounts((d?.accounts || []).filter((m) => m.is_active))).catch(() => {});
    fetchAccSettings().then((s) => { if (s?.vat_rate != null) setRate(String(Number(s.vat_rate))); }).catch(() => {});
  }, []);

  const n = num(net) > 0 ? num(net) : 0;
  const vat = round2((n * (num(rate) || 0)) / 100);
  const total = round2(n + vat);
  const valid = n > 0 && date && (method === "credit" ? !!party : !!moneyId);

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true); setError("");
    try {
      await createVatDocument({
        kind, date, net: n, vat_rate: num(rate) || 0, method, party_id: party?.id,
        money_account_id: method === "credit" ? undefined : Number(moneyId),
        account_id: account?.id, description: description.trim(), reference: reference.trim(),
      });
      onSaved();
    } catch (e) {
      setError(errMsg(e, t("ui_i.common.save_failed")));
    } finally { setSaving(false); }
  };

  useRegisteredShortcuts(dialogBindings(t, {
    confirmLabel: t("ui_i.entry.submit"), onConfirm: submit, onClose: () => { if (!saving) onClose(); }, enter: false,
  }));

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth slotProps={{ paper: { sx: S.dialogPaper } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{t("acc2.vat.new_doc")}</DialogTitle>
      <DialogContent dividers sx={{ borderColor: C.divider }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <ToggleButtonGroup exclusive value={kind} onChange={(_, v) => v && setKind(v)} fullWidth size="small">
            <ToggleButton value="sale" sx={{ minHeight: 40 }}>{t("acc2.vat.sale")}</ToggleButton>
            <ToggleButton value="purchase" sx={{ minHeight: 40 }}>{t("acc2.vat.purchase")}</ToggleButton>
          </ToggleButtonGroup>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
            <TextField type="date" size="small" label={t("ui_i.common.date")} value={date} sx={S.field}
              onChange={(e) => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" label={t("acc2.entry.reference")} value={reference} sx={S.field}
              onChange={(e) => setReference(e.target.value)} />
            <TextField size="small" label={t("acc2.vat.net")} value={net} sx={S.field} autoFocus
              onChange={(e) => setNet(e.target.value)}
              slotProps={{ htmlInput: { inputMode: "decimal", dir: "ltr" } }} />
            <TextField size="small" label={t("acc2.vat.rate")} value={rate} sx={S.field}
              onChange={(e) => setRate(e.target.value)}
              slotProps={{ htmlInput: { inputMode: "decimal", dir: "ltr" } }} />
            <TextField select size="small" label={t("acc2.vat.method")} value={method} sx={S.field}
              onChange={(e) => setMethod(e.target.value)}>
              <MenuItem value="credit">{t("acc2.vat.on_credit")}</MenuItem>
              <MenuItem value="paid">{t("acc2.vat.paid_now")}</MenuItem>
            </TextField>
            {method === "credit" ? (
              <DetailPicker ctx={ctx} value={party} onChange={setParty} label={t("acc2.cheques.party")} />
            ) : (
              <TextField select size="small" label={t("acc2.treasury.money_account")} value={moneyId} sx={S.field}
                onChange={(e) => setMoneyId(e.target.value)}>
                {moneyAccounts.map((m) => <MenuItem key={m.id} value={String(m.id)}>{m.name}</MenuItem>)}
              </TextField>
            )}
          </Box>
          {method !== "credit" && (
            <DetailPicker ctx={ctx} value={party} onChange={setParty} label={`${t("acc2.cheques.party")} (${t("acc2.common.optional")})`} />
          )}
          <AccountPicker ctx={ctx} value={account} onChange={setAccount}
            label={kind === "sale" ? t("acc2.vat.income_account") : t("acc2.vat.cost_account")} />
          <TextField size="small" label={t("ui_i.common.description")} value={description} sx={S.field}
            onChange={(e) => setDescription(e.target.value)} />
          {moneyAccounts.length === 0 && method !== "credit" && (
            <Alert severity="info">{t("acc2.treasury.none_yet")}</Alert>
          )}
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, p: 1.5, borderRadius: 2, bgcolor: C.infoBg }}>
            {[["acc2.vat.net", n], ["acc2.vat.tax", vat], ["ui_i.common.total", total]].map(([k, v]) => (
              <Box key={k}>
                <Typography sx={{ color: C.muted, fontSize: 11 }}>{t(k)}</Typography>
                <Typography sx={{ color: C.text, fontWeight: 800 }}><Money v={v} lang={lang} C={C} /></Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="outlined" sx={S.ghost} onClick={onClose} disabled={saving}>{t("ui_i.common.cancel")}</Button>
        <Button sx={S.btn} onClick={submit} disabled={saving || !valid}>
          {saving ? <CircularProgress size={18} color="inherit" /> : <>{t("ui_i.entry.submit")}<KbdHint>Ctrl+D</KbdHint></>}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
