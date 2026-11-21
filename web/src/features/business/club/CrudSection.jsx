import { useCallback, useEffect, useState } from "react";
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, MenuItem, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Typography,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/DeleteOutlineOutlined";
import { useRegisteredShortcuts, dialogBindings } from "@shared/common/shortcutKit";
import KbdHint from "@business/pos/common/KbdHint";
import { TableWrap } from "../accounting/common";
import { crud, errMsg } from "./api";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/** Value as shown in an input (dates trimmed, null -> ""). */
const toInput = (f, v) => {
  if (v == null) return f.type === "bool" ? false : f.type === "weekdays" ? [] : "";
  if (f.type === "date") return String(v).slice(0, 10);
  if (f.type === "datetime") return String(v).slice(0, 16);
  return v;
};

function FieldInput({ f, value, onChange, t, S, C }) {
  const label = t(f.label);
  if (f.type === "bool") {
    return (
      <FormControlLabel control={<Switch checked={!!value} onChange={(e) => onChange(e.target.checked)} />}
        label={<Typography sx={{ color: C.text }}>{label}</Typography>} />
    );
  }
  if (f.type === "weekdays") {
    const set = new Set(value || []);
    return (
      <Box>
        <Typography sx={{ color: C.sub, fontSize: 13 }}>{label}</Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap" }}>
          {WEEKDAYS.map((d) => (
            <FormControlLabel key={d} sx={{ color: C.text, mr: 1 }} label={t(`ui_club2.weekday.${d}`)}
              control={<Checkbox size="small" checked={set.has(d)} onChange={(e) => {
                const n = new Set(set);
                if (e.target.checked) n.add(d); else n.delete(d);
                onChange([...n].sort());
              }} />} />
          ))}
        </Box>
      </Box>
    );
  }
  if (f.type === "select") {
    return (
      <TextField select size="small" label={label} value={value ?? ""} sx={S.field}
        helperText={f.hint ? t(f.hint) : undefined} onChange={(e) => onChange(e.target.value)}>
        {f.options.map((o) => (
          <MenuItem key={String(o.value)} value={o.value}>{o.label ?? t(o.labelKey)}</MenuItem>
        ))}
      </TextField>
    );
  }
  const type = { number: "number", date: "date", datetime: "datetime-local" }[f.type] || "text";
  return (
    <TextField size="small" type={type} label={label} value={value ?? ""} sx={S.field}
      multiline={f.type === "multiline"} minRows={f.type === "multiline" ? 2 : undefined}
      helperText={f.hint ? t(f.hint) : undefined} onChange={(e) => onChange(e.target.value)}
      slotProps={{
        inputLabel: ["date", "datetime"].includes(f.type) ? { shrink: true } : undefined,
        htmlInput: f.type === "number" ? { dir: "ltr", min: 0, step: f.step || 1 } : f.ltr ? { dir: "ltr" } : undefined,
      }} />
  );
}

function Editor({ ctx, kind, fields, row, defaults, onClose, onSaved }) {
  const { t, S, C, fullScreen } = ctx;
  const [form, setForm] = useState(() => {
    const base = { ...defaults, ...(row || {}) };
    return Object.fromEntries(fields.map((f) => [f.key, toInput(f, base[f.key])]));
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    const body = {};
    fields.forEach((f) => {
      if (f.createOnly && row) return;
      let v = form[f.key];
      if (f.type === "datetime" && v) v = new Date(v).toISOString();
      body[f.key] = v === "" && f.type !== "text" && f.type !== "multiline" ? null : v;
    });
    try {
      const api = crud(kind);
      await (row ? api.update(row.id, body) : api.create(body));
      onSaved();
    } catch (e) {
      setError(errMsg(e, t("ui_club.err.generic")));
    } finally {
      setBusy(false);
    }
  };

  useRegisteredShortcuts(
    dialogBindings(t, { onConfirm: save, onClose: () => !busy && onClose(), confirmLabel: t("ui_club2.save") }),
    { enabled: true },
  );

  const visible = fields.filter((f) => !(f.createOnly && row) && (!f.when || f.when(form)));
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth
      slotProps={{ paper: { sx: S.dialogPaper } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{row ? t("ui_club2.edit") : t("ui_club2.add")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {visible.map((f) => (
            <FieldInput key={f.key} f={f} value={form[f.key]} t={t} S={S} C={C}
              onChange={(v) => setForm((s) => ({ ...s, [f.key]: v }))} />
          ))}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="outlined" sx={S.ghost} onClick={onClose} disabled={busy}>{t("ui_club.close")}</Button>
        <Button sx={S.btn} onClick={save} disabled={busy}>
          {busy ? <CircularProgress size={18} color="inherit" /> : <>{t("ui_club2.save")}<KbdHint>Ctrl+D</KbdHint></>}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * List + add/edit/delete for one club catalogue (`kind`).
 * `columns`: [{label, render(row), num}], `fields`: editor spec, `actions(row, reload)`: extra row buttons.
 */
export default function CrudSection({ ctx, kind, title, hint, fields, columns, defaults = {}, actions, onChanged }) {
  const { t, C, S, notify } = ctx;
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | row

  const load = useCallback(() => {
    crud(kind).list().then((d) => { setRows(Array.isArray(d) ? d : []); setError(""); })
      .catch((e) => setError(errMsg(e, t("ui_club.err.generic"))));
  }, [kind, t]);
  useEffect(() => { load(); }, [load]);

  const remove = async (row) => {
    if (!window.confirm(t("ui_club2.confirm_delete"))) return;
    try {
      await crud(kind).remove(row.id);
      notify(t("ui_club2.deleted"));
      load();
      onChanged?.();
    } catch (e) {
      notify(errMsg(e, t("ui_club.err.generic")), "error");
    }
  };

  return (
    <Box sx={{ ...S.card, mb: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 1 }}>
        <Typography sx={{ color: C.text, fontWeight: 800, flex: 1 }}>{title}</Typography>
        <Button sx={S.btn} onClick={() => setEditing("new")}>{t("ui_club2.add")}</Button>
      </Box>
      {hint && <Typography sx={{ color: C.muted, fontSize: 12, mb: 1 }}>{hint}</Typography>}
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      {rows == null ? (
        <Box sx={{ textAlign: "center", py: 3 }}><CircularProgress size={24} /></Box>
      ) : rows.length === 0 ? (
        <Typography sx={{ color: C.muted, py: 2, textAlign: "center" }}>{t("ui_club2.none")}</Typography>
      ) : (
        <TableWrap C={C}>
          <Table size="small" sx={{ minWidth: 480 }}>
            <TableHead>
              <TableRow>
                {columns.map((c) => <TableCell key={c.label} sx={c.num ? S.thNum : S.th}>{c.label}</TableCell>)}
                <TableCell sx={S.th} />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} hover>
                  {columns.map((c) => <TableCell key={c.label} sx={c.num ? S.tdNum : S.td}>{c.render(r)}</TableCell>)}
                  <TableCell sx={{ ...S.td, whiteSpace: "nowrap" }}>
                    {actions?.(r, load)}
                    <IconButton size="small" aria-label={t("ui_club2.edit")} onClick={() => setEditing(r)}
                      sx={{ color: C.sub }}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" aria-label={t("ui_club2.delete")} onClick={() => remove(r)}
                      sx={{ color: C.danger }}><DeleteIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
      )}
      {editing && (
        <Editor ctx={ctx} kind={kind} fields={fields} defaults={defaults} row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); notify(t("ui_club2.saved")); load(); onChanged?.(); }} />
      )}
    </Box>
  );
}
