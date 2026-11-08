import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, Button, FormControlLabel, IconButton, Stack, Switch, TextField, Typography } from "@mui/material";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import AddIcon from "@mui/icons-material/Add";
import { useRegisteredShortcuts } from "@shared/common/shortcutKit";
import KbdHint from "@business/pos/common/KbdHint";
import { uploadImage, errMsg } from "./api";
import { useBusinessId } from "./BusinessContext";

/**
 * Generic form built from the server-provided field schema.
 * `spec` = { t: "text|long|url|image|phone|time|bool|int|num|list", ... }
 */

function ImageField({ label, value, onChange }) {
  const { t } = useTranslation();
  const bid = useBusinessId();
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const a = await uploadImage(bid, file);
      onChange(a.url);
    } catch (ex) {
      setErr(errMsg(ex, t("ui_k.error")));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box>
      <TextField size="small" fullWidth label={label} value={value || ""} onChange={(e) => onChange(e.target.value)}
         error={!!err} helperText={err} slotProps={{ htmlInput: { dir: "ltr" } }} />
      <Stack direction="row" spacing={1} sx={{ mt: 0.5, alignItems: "center" }}>
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pick} />
        <Button size="small" disabled={busy} onClick={() => ref.current?.click()}>
          {busy ? t("ui_k.uploading") : t("ui_k.upload")}
        </Button>
        {value && <Button size="small" color="inherit" onClick={() => onChange("")}>{t("ui_k.clear")}</Button>}
        {value && <Box component="img" src={value} alt="" loading="lazy" sx={{ height: 36, borderRadius: 1 }} />}
      </Stack>
    </Box>
  );
}

function Scalar({ name, spec, value, onChange, label }) {
  const { t } = useTranslation();
  const lbl = label || t(`ui_k.field.${name}`, name);
  switch (spec.t) {
    case "bool":
      return <FormControlLabel control={<Switch checked={!!value} onChange={(e) => onChange(e.target.checked)} />} label={lbl} />;
    case "image":
      return <ImageField label={lbl} value={value} onChange={onChange} />;
    case "int":
    case "num":
      return (
        <TextField size="small" type="number" fullWidth label={lbl} value={value ?? ""}

          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} slotProps={{ htmlInput: { min: spec.min, max: spec.max, step: spec.t === "int" ? 1 : "any", dir: "ltr" } }} />
      );
    case "long":
      return (
        <TextField size="small" fullWidth multiline minRows={3} label={lbl} value={value || ""}
           onChange={(e) => onChange(e.target.value)}
          helperText={`${(value || "").length}/${spec.max}`} slotProps={{ htmlInput: { maxLength: spec.max } }} />
      );
    case "url":
    case "phone":
    case "time":
      return (
        <TextField size="small" fullWidth label={lbl} value={value || ""}
          placeholder={spec.t === "time" ? "09:00" : undefined} onChange={(e) => onChange(e.target.value)} slotProps={{ htmlInput: { dir: "ltr" } }} />
      );
    default:
      return (
        <TextField size="small" fullWidth label={lbl} value={value || ""}
          required={!!spec.req} onChange={(e) => onChange(e.target.value)} slotProps={{ htmlInput: { maxLength: spec.max } }} />
      );
  }
}

function ListField({ name, spec, value, onChange, primary }) {
  const { t } = useTranslation();
  const items = value || [];
  const setItem = (i, patch) => onChange(items.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  const blank = () => {
    const o = {};
    Object.entries(spec.item).forEach(([k, s]) => {
      if (s.t === "bool") o[k] = false;
      else if (s.t === "int") o[k] = s.min ?? 0;
      else if (s.req || s.t === "text" || s.t === "url" || s.t === "image") o[k] = "";
    });
    if (name === "days") o.day = items.length;
    return o;
  };
  const canAdd = items.length < spec.max;
  // F3 = add an item to the first list field of the section
  useRegisteredShortcuts([
    { combo: "F3", label: t("ui_l.store.add_list_item"), handler: () => onChange([...items, blank()]) },
  ], { enabled: !!primary && canAdd });
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>{t(`ui_k.field.${name}`, name)}</Typography>
      <Stack spacing={1.5}>
        {items.map((it, i) => (
          <Box key={i} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
            <Stack spacing={1.2}>
              {Object.entries(spec.item).map(([k, s]) => (
                <Scalar key={k} name={k} spec={s} value={it[k]} onChange={(v) => setItem(i, { [k]: v })}
                  label={name === "days" && k === "day" ? t("ui_k.weekday", { returnObjects: true })[it.day] : undefined} />
              ))}
              <Box>
                <IconButton size="small" aria-label={t("ui_k.remove_item")} onClick={() => onChange(items.filter((_, k) => k !== i))}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            </Stack>
          </Box>
        ))}
        {items.length < spec.max && (
          <Button size="small" startIcon={<AddIcon />} onClick={() => onChange([...items, blank()])}>{t("ui_k.add_item")}{primary && <></>}</Button>
        )}
      </Stack>
    </Box>
  );
}

export default function FieldEditor({ fields, data, onChange }) {
  const set = (k, v) => {
    const next = { ...data };
    if (v === undefined) delete next[k]; else next[k] = v;
    onChange(next);
  };
  const firstList = Object.keys(fields).find((k) => fields[k].t === "list");
  return (
    <Stack spacing={2}>
      {Object.entries(fields).map(([name, spec]) =>
        spec.t === "list" ? (
          <ListField key={name} name={name} spec={spec} value={data[name]} primary={name === firstList}
            onChange={(v) => set(name, v)} />
        ) : (
          <Scalar key={name} name={name} spec={spec} value={data[name]} onChange={(v) => set(name, v)} />
        ),
      )}
    </Stack>
  );
}
