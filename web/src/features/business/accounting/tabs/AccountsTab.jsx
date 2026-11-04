import { useState, useMemo } from "react";
import {
  Box, Typography, Button, Chip, Table, TableHead, TableBody, TableRow, TableCell, TextField,
  MenuItem, Switch, FormControlLabel, Dialog, DialogTitle, DialogContent, DialogActions, Alert,
  CircularProgress,
} from "@mui/material";
import { useRegisteredShortcuts, dialogBindings, onEnter } from "@shared/common/shortcutKit";
import KbdHint from "@business/pos/common/KbdHint";
import {
  TableWrap, ConfirmDialog, accName, ACCOUNT_TYPES, fmtInt, useRowCursor, cursorBindings, cursorProps,
} from "../common";
import { createAccount, updateAccount, deleteAccount, errMsg } from "../api";

/** Order accounts type -> parent/child (DFS by code); returns [{a, depth}]. */
function buildTree(accounts) {
  const byParent = {};
  const ids = new Set(accounts.map((a) => a.id));
  accounts.forEach((a) => {
    const p = a.parent_id && ids.has(a.parent_id) ? a.parent_id : 0;
    (byParent[p] ||= []).push(a);
  });
  const cmp = (x, y) => String(x.code).localeCompare(String(y.code), "en", { numeric: true });
  Object.values(byParent).forEach((l) => l.sort(cmp));
  const out = [];
  const walk = (parent, depth, seen) => {
    (byParent[parent] || []).forEach((a) => {
      if (seen.has(a.id)) return;
      out.push({ a, depth });
      walk(a.id, depth + 1, new Set(seen).add(a.id));
    });
  };
  walk(0, 0, new Set());
  return out;
}

export default function AccountsTab(ctx) {
  const { t, C, S, lang, accounts, reloadAccounts, notify } = ctx;
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null); // {} new | account
  const [del, setDel] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState("");

  const tree = useMemo(() => buildTree(accounts), [accounts]);
  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return ACCOUNT_TYPES.map((type) => ({
      type,
      rows: tree.filter(({ a }) => a.type === type && (!ql ||
        String(a.code).toLowerCase().includes(ql) ||
        String(a.name).toLowerCase().includes(ql) ||
        String(a.name_en || "").toLowerCase().includes(ql))),
    })).filter((g) => g.rows.length > 0);
  }, [tree, q]);
  const flat = useMemo(() => groups.flatMap((g) => g.rows.map((r) => r.a)), [groups]);
  const cursor = useRowCursor(flat.length);

  useRegisteredShortcuts([
    { combo: "F2", label: t("ui_i.keys.new_account"), handler: () => setEditing({}) },
    ...cursorBindings(t, cursor),
    { combo: "Enter", label: t("ui_i.keys.open_row"), allowInInput: false,
      handler: onEnter(() => { const a = flat[cursor.index]; if (!a) return false; setEditing(a); return true; }) },
  ]);

  const doDelete = async () => {
    setDelBusy(true); setDelErr("");
    try {
      await deleteAccount(del.id);
      notify(t("ui_i.accounts.deleted"));
      setDel(null); reloadAccounts();
    } catch (e) {
      setDelErr(errMsg(e, t("ui_i.common.save_failed")));
    } finally { setDelBusy(false); }
  };

  const idxOf = new Map(flat.map((a, i) => [a.id, i]));
  return (
    <Box sx={S.card}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, gap: 1, flexWrap: "wrap" }}>
        <TextField size="small" value={q} onChange={(e) => { setQ(e.target.value); cursor.reset(); }}
          placeholder={t("ui_i.accounts.search")} sx={{ ...S.field, minWidth: { xs: "100%", sm: 260 } }} />
        <Button sx={S.btn} onClick={() => setEditing({})}>{t("ui_i.accounts.new")}<KbdHint>F2</KbdHint></Button>
      </Box>

      {groups.length === 0 ? (
        <Typography sx={{ color: C.muted, textAlign: "center", py: 4 }}>{t("ui_i.accounts.empty")}</Typography>
      ) : (
        <TableWrap C={C}>
          <Table size="small" sx={{ minWidth: 640 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={S.th}>{t("ui_i.common.code")}</TableCell>
                <TableCell sx={S.th}>{t("ui_i.common.name")}</TableCell>
                <TableCell sx={S.th}>{t("ui_i.accounts.kind")}</TableCell>
                <TableCell sx={S.th}>{t("ui_i.common.status")}</TableCell>
                <TableCell sx={S.th}>{t("ui_i.common.actions")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {groups.map((g) => (
                <GroupRows key={g.type}>
                  <TableRow>
                    <TableCell colSpan={5} sx={{ ...S.td, bgcolor: C.primarySubtle, color: C.primary, fontWeight: 800 }}>
                      {t(`ui_i.types.${g.type}`)}
                    </TableCell>
                  </TableRow>
                  {g.rows.map(({ a, depth }) => {
                    const cp = cursorProps(C, idxOf.get(a.id) === cursor.index);
                    return (
                      <TableRow key={a.id} hover {...cp} sx={{ ...(cp.sx || {}), opacity: a.is_active ? 1 : 0.55 }}>
                        <TableCell sx={S.td}><Box component="span" dir="ltr">{fmtInt(a.code, lang)}</Box></TableCell>
                        <TableCell sx={{ ...S.td, paddingInlineStart: `${12 + depth * 20}px`, fontWeight: a.is_postable ? 400 : 700 }}>
                          {accName(a, lang)}
                        </TableCell>
                        <TableCell sx={S.td}>
                          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                            {!a.is_postable && <Chip size="small" label={t("ui_i.accounts.group")} sx={{ bgcolor: C.infoBg, color: C.info, fontWeight: 700 }} />}
                            {a.is_system && <Chip size="small" label={t("ui_i.accounts.system")} sx={{ bgcolor: C.accentSubtle, color: C.accent, fontWeight: 700 }} />}
                          </Box>
                        </TableCell>
                        <TableCell sx={S.td}>
                          <Chip size="small" label={a.is_active ? t("ui_i.common.active") : t("ui_i.common.inactive")}
                            sx={{ bgcolor: a.is_active ? C.successBg : C.divider, color: a.is_active ? C.success : C.muted, fontWeight: 700 }} />
                        </TableCell>
                        <TableCell sx={{ ...S.td, whiteSpace: "nowrap" }}>
                          <Button size="small" sx={S.link} onClick={() => setEditing(a)}>{t("ui_i.common.edit")}</Button>
                          {!a.is_system && (
                            <Button size="small" sx={{ ...S.link, color: C.danger }} onClick={() => { setDelErr(""); setDel(a); }}>
                              {t("ui_i.common.delete")}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </GroupRows>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
      )}

      {editing && (
        <AccountDialog ctx={ctx} account={editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reloadAccounts(); notify(t("ui_i.accounts.saved")); }} />
      )}

      <ConfirmDialog ctx={ctx} open={!!del} danger busy={delBusy} error={delErr}
        title={t("ui_i.accounts.delete_title")}
        text={t("ui_i.accounts.delete_text", { name: del ? accName(del, lang) : "" })}
        confirmLabel={t("ui_i.common.delete")}
        onClose={() => setDel(null)} onConfirm={doDelete} />
    </Box>
  );
}

const GroupRows = ({ children }) => <>{children}</>;

function AccountDialog({ ctx, account, onClose, onSaved }) {
  const { t, C, S, lang, fullScreen, accounts } = ctx;
  const isEdit = !!account.id;
  const [code, setCode] = useState(account.code || "");
  const [name, setName] = useState(account.name || "");
  const [nameEn, setNameEn] = useState(account.name_en || "");
  const [type, setType] = useState(account.type || "asset");
  const [parentId, setParentId] = useState(account.parent_id ? String(account.parent_id) : "");
  const [postable, setPostable] = useState(account.id ? !!account.is_postable : true);
  const [active, setActive] = useState(account.id ? !!account.is_active : true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);

  const parents = accounts
    .filter((a) => a.type === type && !a.is_postable && a.id !== account.id)
    .sort((a, b) => String(a.code).localeCompare(String(b.code), "en", { numeric: true }));

  const valid = name.trim() && (isEdit || code.trim());

  const submit = async () => {
    setTouched(true);
    if (!valid || saving) return;
    setSaving(true); setError("");
    try {
      if (isEdit) {
        await updateAccount(account.id, { name: name.trim(), name_en: nameEn.trim(), is_active: active });
      } else {
        const body = { code: code.trim(), name: name.trim(), type, is_postable: postable };
        if (nameEn.trim()) body.name_en = nameEn.trim();
        if (parentId) body.parent_id = Number(parentId);
        await createAccount(body);
      }
      onSaved();
    } catch (e) {
      setError(errMsg(e, t("ui_i.common.save_failed")));
    } finally { setSaving(false); }
  };

  useRegisteredShortcuts(dialogBindings(t, {
    confirmLabel: t("shortcuts.save"), onConfirm: submit, onClose: () => { if (!saving) onClose(); },
  }));

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth PaperProps={{ sx: S.dialogPaper }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{isEdit ? t("ui_i.accounts.edit_title") : t("ui_i.accounts.new_title")}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {isEdit && account.is_system && <Alert severity="info">{t("ui_i.accounts.system_hint")}</Alert>}
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 2fr" } }}>
            <TextField size="small" label={t("ui_i.common.code")} value={code} sx={S.field} disabled={isEdit}
              onChange={(e) => setCode(e.target.value)} error={touched && !isEdit && !code.trim()} required
              inputProps={{ dir: "ltr" }} />
            <TextField size="small" label={t("ui_i.common.name")} value={name} sx={S.field} autoFocus
              onChange={(e) => setName(e.target.value)} error={touched && !name.trim()} required />
          </Box>
          <TextField size="small" label={t("ui_i.accounts.name_en")} value={nameEn} sx={S.field}
            onChange={(e) => setNameEn(e.target.value)} inputProps={{ dir: "ltr" }} />
          {!isEdit && (
            <>
              <TextField select size="small" label={t("ui_i.common.type")} value={type} sx={S.field}
                onChange={(e) => { setType(e.target.value); setParentId(""); }}>
                {ACCOUNT_TYPES.map((x) => <MenuItem key={x} value={x}>{t(`ui_i.types.${x}`)}</MenuItem>)}
              </TextField>
              <TextField select size="small" label={t("ui_i.accounts.parent")} value={parentId} sx={S.field}
                onChange={(e) => setParentId(e.target.value)} SelectProps={{ displayEmpty: true }}
                helperText={t("ui_i.accounts.parent_hint")}>
                <MenuItem value="">{t("ui_i.common.none")}</MenuItem>
                {parents.map((p) => (
                  <MenuItem key={p.id} value={String(p.id)}>{p.code} — {accName(p, lang)}</MenuItem>
                ))}
              </TextField>
              <FormControlLabel
                control={<Switch checked={postable} onChange={(e) => setPostable(e.target.checked)} />}
                label={<Box>
                  <Typography sx={{ color: C.text, fontSize: 14 }}>{t("ui_i.accounts.postable")}</Typography>
                  <Typography sx={{ color: C.muted, fontSize: 12 }}>{t("ui_i.accounts.postable_hint")}</Typography>
                </Box>}
              />
            </>
          )}
          {isEdit && (
            <FormControlLabel
              control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />}
              label={<Typography sx={{ color: C.text, fontSize: 14 }}>{t("ui_i.common.active")}</Typography>}
            />
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="outlined" sx={S.ghost} onClick={onClose} disabled={saving}>{t("ui_i.common.cancel")}</Button>
        <Button sx={S.btn} onClick={submit} disabled={saving}>
          {saving ? <CircularProgress size={18} color="inherit" /> : <>{t("ui_i.common.save")}<KbdHint>Ctrl+D</KbdHint></>}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
