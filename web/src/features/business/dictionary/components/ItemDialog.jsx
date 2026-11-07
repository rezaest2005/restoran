import { useState } from "react";
import { Box, TextField, MenuItem, InputAdornment, Button } from "@mui/material";
import { FormDialog, UNIT_KEYS, KINDS } from "../common";
import { createItem, updateItem, generateBarcodes, errMsg } from "../api";

/**
 * Create / edit an item (raw, semi-finished, packaging or finished good).
 * `quick` hides the stock/price/barcode fields (used for creating an item from a formula).
 */
export default function ItemDialog({ ctx, item, presetName = "", presetKind = "raw", quick = false, kinds = KINDS, shortcuts = true, onClose, onSaved }) {
  const { t, C, S } = ctx;
  const isEdit = !!item?.id;
  const [f, setF] = useState(() => ({
    name: item?.name || presetName, name_en: item?.name_en || "",
    material_type: item?.material_type || presetKind, unit: item?.unit || "kg",
    price: item ? String(item.price ?? "") : "", minimum_stock: item ? String(item.minimum_stock ?? "") : "",
    target_stock: item ? String(item.target_stock ?? "") : "", barcode: item?.barcode || "",
    description: item?.description || "",
  }));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const nonNeg = (v) => v === "" || Number(v) >= 0;
  const errs = { name: !f.name.trim(), price: !nonNeg(f.price), min: !nonNeg(f.minimum_stock), target: !nonNeg(f.target_stock) };
  const invalid = Object.values(errs).some(Boolean);

  const generate = async () => {
    setGenBusy(true); setError("");
    try {
      const r = await generateBarcodes({ target: "item", count: 1 });
      if (r?.codes?.[0]) set("barcode", r.codes[0]);
    } catch (e) { setError(errMsg(e, t("ui_def.common.save_failed"))); } finally { setGenBusy(false); }
  };

  const submit = async () => {
    setTouched(true);
    if (invalid) return;
    setSaving(true); setError("");
    const body = { name: f.name.trim(), name_en: f.name_en.trim(), material_type: f.material_type, unit: f.unit };
    if (!quick) {
      Object.assign(body, {
        price: f.price === "" ? 0 : Number(f.price), minimum_stock: f.minimum_stock === "" ? 0 : Number(f.minimum_stock),
        target_stock: f.target_stock === "" ? 0 : Number(f.target_stock), barcode: f.barcode.trim(), description: f.description,
      });
    }
    try {
      const saved = isEdit ? await updateItem(item.id, body) : await createItem(body);
      onSaved(saved);
    } catch (e) { setError(errMsg(e, t("ui_def.common.save_failed"))); } finally { setSaving(false); }
  };

  const num = (k, label, err, adorn) => (
    <TextField label={label} type="number" value={f[k]} onChange={(e) => set(k, e.target.value)} size="small" sx={S.field}
      error={touched && err} helperText={touched && err ? t("ui_def.common.invalid_number") : ""}
      slotProps={{ htmlInput: { min: 0, step: "any", inputMode: "decimal" }, input: adorn ? { endAdornment: <InputAdornment position="end">{adorn}</InputAdornment> } : undefined }} />
  );
  const unitText = t(`ui_def.units.${f.unit}`, { defaultValue: f.unit });

  return (
    <FormDialog ctx={ctx} maxWidth={quick ? "xs" : "md"} saving={saving} error={error} onClose={onClose} onSave={submit} shortcuts={shortcuts}
      title={isEdit ? t("ui_def.items.edit_title", { name: item.name }) : t("ui_def.items.new_title")}>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: quick ? "1fr" : "1fr 1fr" } }}>
        <TextField label={t("ui_def.items.f_name")} value={f.name} onChange={(e) => set("name", e.target.value)} size="small" sx={S.field}
          required autoFocus error={touched && errs.name} helperText={touched && errs.name ? t("ui_def.common.required") : ""} />
        {!quick && (
          <TextField label={t("ui_def.items.f_name_en")} value={f.name_en} onChange={(e) => set("name_en", e.target.value)} size="small" sx={S.field}
            slotProps={{ htmlInput: { dir: "ltr" } }} />
        )}
        <TextField select label={t("ui_def.items.f_kind")} value={f.material_type} onChange={(e) => set("material_type", e.target.value)} size="small" sx={S.field}>
          {kinds.map((k) => <MenuItem key={k} value={k}>{t(`ui_def.kinds.${k}`)}</MenuItem>)}
        </TextField>
        <TextField select label={t("ui_def.items.f_unit")} value={f.unit} onChange={(e) => set("unit", e.target.value)} size="small" sx={S.field}>
          {UNIT_KEYS.map((u) => <MenuItem key={u} value={u}>{t(`ui_def.units.${u}`)}</MenuItem>)}
        </TextField>
        {!quick && (
          <>
            {num("price", t("ui_def.items.f_cost", { unit: unitText }), errs.price)}
            {num("minimum_stock", t("ui_def.items.f_min"), errs.min, unitText)}
            {num("target_stock", t("ui_def.items.f_target"), errs.target, unitText)}
            <TextField label={t("ui_def.items.f_barcode")} value={f.barcode} onChange={(e) => set("barcode", e.target.value)} size="small" sx={S.field}
              slotProps={{
                htmlInput: { dir: "ltr", inputMode: "numeric" },
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <Button size="small" onClick={generate} disabled={genBusy} sx={{ color: C.primary, textTransform: "none", fontWeight: 700 }}>
                        {t("ui_def.products.generate")}
                      </Button>
                    </InputAdornment>
                  ),
                },
              }} />
            <TextField label={t("ui_def.items.f_description")} value={f.description} onChange={(e) => set("description", e.target.value)} size="small" sx={{ ...S.field, gridColumn: "1 / -1" }}
              multiline minRows={2} />
          </>
        )}
      </Box>
    </FormDialog>
  );
}
