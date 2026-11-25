import { useState, useMemo } from "react";
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, IconButton, Alert, CircularProgress, Table, TableHead, TableBody,
  TableRow, TableCell,
} from "@mui/material";
import { useRegisteredShortcuts, dialogBindings } from "@shared/common/shortcutKit";
import { AccountPicker, DetailPicker, TableWrap, Money, num, round2, newKey, todayISO } from "../common";
import { createEntry, updateDraft, errMsg } from "../api";

const blankLine = () => ({ key: newKey(), account: null, detail: null, debit: "", credit: "", memo: "", cc: "" });

/**
 * Manual journal voucher: dynamic lines (account + optional detail account + cost center), live totals.
 * "Post" (Ctrl+D) needs a balanced voucher; "Save draft" (Ctrl+S) keeps an unfinished one editable.
 * `draft`: an existing draft entry (with lines) to edit.
 */
export default function EntryDialog({ ctx, onClose, onSaved, draft = null }) {
  const { t, C, S, lang, fullScreen, costCenters, accById, details = [] } = ctx;
  const detById = useMemo(() => Object.fromEntries(details.map((d) => [d.id, d])), [details]);
  const [date, setDate] = useState(draft?.date || todayISO());
  const [description, setDescription] = useState(draft?.description || "");
  const [reference, setReference] = useState(draft?.reference || "");
  const [lines, setLines] = useState(() => {
    if (!draft?.lines?.length) return [blankLine(), blankLine()];
    return draft.lines.map((l) => ({
      key: newKey(), account: accById[l.account_id] || null, detail: detById[l.detail_id] || null,
      debit: Number(l.debit) > 0 ? String(l.debit) : "", credit: Number(l.credit) > 0 ? String(l.credit) : "",
      memo: l.memo || "", cc: l.cost_center_id ? String(l.cost_center_id) : "",
    }));
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);

  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, blankLine()]);
  // fill the remaining difference on the last line (keyboard friendly: F4)
  const balanceLast = () => setLines((ls) => {
    const used = ls.slice(0, -1);
    const diff = round2(used.reduce((s, l) => s + (num(l.debit) > 0 ? num(l.debit) : 0) - (num(l.credit) > 0 ? num(l.credit) : 0), 0));
    if (!diff) return ls;
    const last = ls[ls.length - 1];
    return [...used, { ...last, debit: diff < 0 ? String(-diff) : "", credit: diff > 0 ? String(diff) : "" }];
  });

  const info = useMemo(() => {
    let debit = 0, credit = 0, used = 0, bad = false;
    const perLine = {};
    lines.forEach((l) => {
      const d = num(l.debit), c = num(l.credit);
      const hasD = d > 0, hasC = c > 0;
      const touchedLine = l.account || l.debit !== "" || l.credit !== "";
      if (!touchedLine) return;
      const err = { acc: !l.account, amt: !(hasD || hasC) };
      perLine[l.key] = err;
      if (err.acc || err.amt) bad = true;
      else used += 1;
      if (hasD) debit += d;
      if (hasC) credit += c;
    });
    debit = round2(debit); credit = round2(credit);
    const diff = round2(debit - credit);
    return { debit, credit, diff, used, bad, perLine, balanced: diff === 0 && debit > 0 };
  }, [lines]);

  const canDraft = !!date && !info.bad && info.used >= 2;
  const valid = canDraft && info.balanced;

  const body = (status) => ({
    date, description: description.trim(), reference: reference.trim(), status,
    lines: lines.filter((l) => l.account && (num(l.debit) > 0 || num(l.credit) > 0)).map((l) => {
      const o = { account_id: l.account.id };
      if (num(l.debit) > 0) o.debit = round2(num(l.debit)); else o.credit = round2(num(l.credit));
      if (l.memo.trim()) o.memo = l.memo.trim();
      if (l.cc) o.cost_center_id = Number(l.cc);
      if (l.detail) o.detail_id = l.detail.id;
      return o;
    }),
  });

  const submit = async (asDraft) => {
    setTouched(true);
    if (saving || !(asDraft ? canDraft : valid)) return;
    setSaving(true); setError("");
    try {
      if (draft) await updateDraft(draft.id, { ...body("draft"), post: !asDraft });
      else await createEntry(body(asDraft ? "draft" : "posted"));
      onSaved(asDraft ? t("acc2.entry.draft_saved") : t("ui_i.entry.saved"));
    } catch (e) {
      setError(errMsg(e, t("ui_i.common.save_failed")));
    } finally { setSaving(false); }
  };

  useRegisteredShortcuts([
    ...dialogBindings(t, {
      confirmLabel: t("ui_i.entry.submit"),
      onConfirm: () => submit(false),
      onClose: () => { if (!saving) onClose(); },
    }),
    { combo: "Ctrl+S", label: t("acc2.entry.save_draft"), handler: () => submit(true), scope: "dialog" },
    { combo: "F3", label: t("ui_i.keys.add_line"), handler: addLine, scope: "dialog" },
    { combo: "F4", label: t("acc2.entry.balance_last"), handler: balanceLast, scope: "dialog" },
  ]);

  const diffColor = info.diff === 0 ? C.success : C.danger;

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullScreen={fullScreen} maxWidth="xl" fullWidth slotProps={{ paper: { sx: S.dialogPaper } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{draft ? t("acc2.entry.edit_draft") : t("ui_i.entry.new_title")}</DialogTitle>
      <DialogContent dividers sx={{ borderColor: C.divider }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 0.5 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 3fr" } }}>
            <TextField
              type="date" size="small" label={t("ui_i.common.date")} value={date} sx={S.field}
              onChange={(e) => setDate(e.target.value)}
              error={touched && !date} required slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" label={t("acc2.entry.reference")} value={reference} sx={S.field}
              onChange={(e) => setReference(e.target.value)} />
            <TextField
              size="small" label={t("ui_i.common.description")} value={description} sx={S.field}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Box>

          <TableWrap C={C}>
            <Table size="small" sx={{ minWidth: 1040 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={S.th}>{t("ui_i.common.account")}</TableCell>
                  <TableCell sx={S.th}>{t("acc2.details.detail")}</TableCell>
                  <TableCell sx={S.th}>{t("ui_i.common.cost_center")}</TableCell>
                  <TableCell sx={S.th}>{t("ui_i.common.memo")}</TableCell>
                  <TableCell sx={S.thNum}>{t("ui_i.common.debit")}</TableCell>
                  <TableCell sx={S.thNum}>{t("ui_i.common.credit")}</TableCell>
                  <TableCell sx={S.th} />
                </TableRow>
              </TableHead>
              <TableBody>
                {lines.map((l) => {
                  const e = (touched || info.perLine[l.key]) && info.perLine[l.key] ? info.perLine[l.key] : {};
                  return (
                    <TableRow key={l.key}>
                      <TableCell sx={{ ...S.td, minWidth: 230 }}>
                        <AccountPicker ctx={ctx} value={l.account} error={touched && e.acc}
                          onChange={(a) => setLine(l.key, { account: a })} />
                      </TableCell>
                      <TableCell sx={{ ...S.td, minWidth: 190 }}>
                        <DetailPicker ctx={ctx} value={l.detail} onChange={(dv) => setLine(l.key, { detail: dv })} />
                      </TableCell>
                      <TableCell sx={{ ...S.td, minWidth: 130 }}>
                        <TextField select size="small" fullWidth value={l.cc} sx={S.field}
                          onChange={(ev) => setLine(l.key, { cc: ev.target.value })} slotProps={{ select: { displayEmpty: true } }}>
                          <MenuItem value="">{t("ui_i.common.none")}</MenuItem>
                          {costCenters.map((c) => <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>)}
                        </TextField>
                      </TableCell>
                      <TableCell sx={{ ...S.td, minWidth: 140 }}>
                        <TextField size="small" fullWidth value={l.memo} sx={S.field}
                          onChange={(ev) => setLine(l.key, { memo: ev.target.value })} />
                      </TableCell>
                      <TableCell sx={{ ...S.td, minWidth: 120 }}>
                        <TextField size="small" value={l.debit} sx={S.field} error={touched && e.amt}
                          aria-label={t("ui_i.common.debit")}
                          onChange={(ev) => setLine(l.key, num(ev.target.value) > 0 ? { debit: ev.target.value, credit: "" } : { debit: ev.target.value })} slotProps={{ htmlInput: { inputMode: "decimal", dir: "ltr", style: { textAlign: "end" } } }} />
                      </TableCell>
                      <TableCell sx={{ ...S.td, minWidth: 120 }}>
                        <TextField size="small" value={l.credit} sx={S.field} error={touched && e.amt}
                          aria-label={t("ui_i.common.credit")}
                          onChange={(ev) => setLine(l.key, num(ev.target.value) > 0 ? { credit: ev.target.value, debit: "" } : { credit: ev.target.value })} slotProps={{ htmlInput: { inputMode: "decimal", dir: "ltr", style: { textAlign: "end" } } }} />
                      </TableCell>
                      <TableCell sx={S.td}>
                        <IconButton aria-label={t("ui_i.common.remove")} disabled={lines.length <= 2}
                          onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                          sx={{ color: C.danger, width: 40, height: 40 }}>✕</IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableWrap>

          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button variant="outlined" sx={S.ghost} onClick={addLine}>
              + {t("ui_i.entry.add_line")}
            </Button>
            <Button variant="outlined" sx={S.ghost} onClick={balanceLast} disabled={info.diff === 0}>
              {t("acc2.entry.balance_last")}
            </Button>
          </Box>

          <Box sx={{
            bgcolor: C.infoBg, border: `1px solid ${C.glassBorder}`, borderRadius: 2, p: 1.5,
            display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)" },
          }}>
            <Box>
              <Typography sx={{ color: C.muted, fontSize: 11 }}>{t("ui_i.common.total_debit")}</Typography>
              <Typography sx={{ color: C.text, fontWeight: 800 }}><Money v={info.debit} lang={lang} C={C} /></Typography>
            </Box>
            <Box>
              <Typography sx={{ color: C.muted, fontSize: 11 }}>{t("ui_i.common.total_credit")}</Typography>
              <Typography sx={{ color: C.text, fontWeight: 800 }}><Money v={info.credit} lang={lang} C={C} /></Typography>
            </Box>
            <Box sx={{ gridColumn: { xs: "1 / -1", sm: "auto" } }}>
              <Typography sx={{ color: C.muted, fontSize: 11 }}>{t("ui_i.common.difference")}</Typography>
              <Typography sx={{ color: diffColor, fontWeight: 800 }}>
                <Money v={Math.abs(info.diff)} lang={lang} C={C} color={diffColor} />{" "}
                <Box component="span" sx={{ fontSize: 12, fontWeight: 600 }}>
                  {info.balanced ? t("ui_i.entry.is_balanced") : t("ui_i.entry.not_balanced")}
                </Box>
              </Typography>
            </Box>
          </Box>
          {touched && info.used < 2 && (
            <Typography sx={{ color: C.danger, fontSize: 12 }}>{t("ui_i.entry.min_lines")}</Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, flexWrap: "wrap", gap: 1 }}>
        <Button variant="outlined" sx={S.ghost} onClick={onClose} disabled={saving}>{t("ui_i.common.cancel")}</Button>
        <Button variant="outlined" sx={S.ghost} onClick={() => submit(true)} disabled={saving || !canDraft}>
          {t("acc2.entry.save_draft")}
        </Button>
        <Button sx={S.btn} onClick={() => submit(false)} disabled={saving || !valid}>
          {saving ? <CircularProgress size={18} color="inherit" /> : <>{t("ui_i.entry.submit")}</>}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
