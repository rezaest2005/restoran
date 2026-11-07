import { useState } from "react";
import {
  Box, Typography, Button, TextField, IconButton, Switch, Alert, Dialog, DialogTitle,
  DialogContent, DialogActions, CircularProgress,
} from "@mui/material";
import { useRegisteredShortcuts } from "../common";
import { blurFocused } from "../common";
import { createCategory, updateCategory, deleteCategory, errMsg } from "../api";

/** Manage product categories: add, rename, reorder (order field), enable/disable, delete. */
export default function CategoriesDialog({ ctx, categories, onClose, onChanged }) {
  const { t, C, S, fullScreen } = ctx;
  const [draft, setDraft] = useState({ name: "", name_en: "" });
  const [edit, setEdit] = useState(null); // { id, name, name_en, order }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (fn) => {
    setBusy(true); setError("");
    try { await fn(); await onChanged(); } catch (e) { setError(errMsg(e, t("ui_def.common.save_failed"))); } finally { setBusy(false); }
  };

  const add = () => {
    if (!draft.name.trim()) { setError(t("ui_def.categories.name_required")); return; }
    run(async () => {
      await createCategory({ name: draft.name.trim(), name_en: draft.name_en.trim(), order: categories.length + 1 });
      setDraft({ name: "", name_en: "" });
    });
  };
  const saveEdit = () => {
    if (!edit.name.trim()) { setError(t("ui_def.categories.name_required")); return; }
    run(async () => {
      await updateCategory(edit.id, { name: edit.name.trim(), name_en: edit.name_en.trim(), order: Number(edit.order) || 0 });
      setEdit(null);
    });
  };
  const remove = (c) => {
    if (!window.confirm(t("ui_def.categories.confirm_delete", { name: c.name }))) return;
    run(() => deleteCategory(c.id));
  };
  const toggle = (c) => run(() => updateCategory(c.id, { is_active: !c.is_active }));

  useRegisteredShortcuts([
    { combo: "Ctrl+D", label: t("ui_def.categories.add"), scope: "dialog", handler: () => (edit ? saveEdit() : add()) },
  ]);

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth
      slotProps={{ paper: { sx: S.dialogPaper }, transition: { onExit: blurFocused } }}>
      <DialogTitle sx={{ fontWeight: 800 }}>{t("ui_def.categories.title")}</DialogTitle>
      <DialogContent dividers sx={{ borderColor: C.divider }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
          <TextField size="small" label={t("ui_def.categories.name")} value={draft.name} sx={{ ...S.field, flex: "1 1 160px" }}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <TextField size="small" label={t("ui_def.categories.name_en")} value={draft.name_en} sx={{ ...S.field, flex: "1 1 140px" }}
            onChange={(e) => setDraft({ ...draft, name_en: e.target.value })} slotProps={{ htmlInput: { dir: "ltr" } }} />
          <Button sx={S.btn} onClick={add} disabled={busy}>{t("ui_def.categories.add")}</Button>
        </Box>
        {categories.length === 0 ? (
          <Typography sx={{ color: C.muted, textAlign: "center", py: 3 }}>{t("ui_def.categories.empty")}</Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {categories.map((c) => (
              <Box key={c.id} sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", p: 1, border: `1px solid ${C.divider}`, borderRadius: 2, opacity: c.is_active ? 1 : 0.6 }}>
                {edit?.id === c.id ? (
                  <>
                    <TextField size="small" value={edit.name} sx={{ ...S.field, flex: "1 1 130px" }}
                      onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                    <TextField size="small" value={edit.name_en} sx={{ ...S.field, flex: "1 1 110px" }}
                      onChange={(e) => setEdit({ ...edit, name_en: e.target.value })} slotProps={{ htmlInput: { dir: "ltr" } }} />
                    <TextField size="small" type="number" value={edit.order} sx={{ ...S.field, width: 80 }}
                      label={t("ui_def.categories.order")} onChange={(e) => setEdit({ ...edit, order: e.target.value })} />
                    <Button size="small" sx={{ color: C.primary, textTransform: "none" }} onClick={saveEdit} disabled={busy}>{t("ui_def.common.save")}</Button>
                    <Button size="small" sx={{ color: C.sub, textTransform: "none" }} onClick={() => setEdit(null)}>{t("ui_def.common.cancel")}</Button>
                  </>
                ) : (
                  <>
                    <Box sx={{ flex: 1, minWidth: 120 }}>
                      <Typography sx={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{c.name}</Typography>
                      <Typography sx={{ color: C.muted, fontSize: 11 }}>
                        {c.name_en ? `${c.name_en} · ` : ""}{t("ui_def.categories.count", { count: c.product_count })}
                      </Typography>
                    </Box>
                    <Switch size="small" checked={!!c.is_active} onChange={() => toggle(c)} disabled={busy}
                      slotProps={{ input: { "aria-label": t("ui_def.categories.active") } }} />
                    <Button size="small" sx={{ color: C.primary, textTransform: "none" }}
                      onClick={() => setEdit({ id: c.id, name: c.name, name_en: c.name_en || "", order: c.order })}>{t("ui_def.common.edit")}</Button>
                    <IconButton size="small" aria-label={t("ui_def.common.delete")} sx={{ color: C.danger }} onClick={() => remove(c)} disabled={busy}>✕</IconButton>
                  </>
                )}
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        {busy && <CircularProgress size={18} />}
        <Button variant="outlined" sx={S.ghost} onClick={onClose}>{t("ui_def.common.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}
