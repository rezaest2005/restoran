import { useState, useEffect, useRef, useMemo } from "react";
import {
  Box, Typography, Button, TextField, MenuItem, Switch, FormControlLabel, Autocomplete, InputAdornment,
} from "@mui/material";
import { FormDialog, fmtNum } from "../common";
import { createProduct, updateProduct, createCategory, fetchItems, generateBarcodes, errMsg } from "../api";

const MAX_IMAGE = 5 * 1024 * 1024;
const NEW_CAT = "__new__";

/** Create / edit a sellable product (image, price, discount price, barcode, item link). */
export default function ProductDialog({ ctx, product, categories, canLink, onClose, onSaved, onCategoriesChanged }) {
  const { t, C, S } = ctx;
  const isEdit = !!product?.id;
  const [f, setF] = useState(() => ({
    name: product?.name || "", name_en: product?.name_en || "",
    category_id: product?.category_id ? String(product.category_id) : (categories.find((c) => c.is_active)?.id ? String(categories.find((c) => c.is_active).id) : ""),
    price: product ? String(product.price ?? "") : "",
    final_price: product && product.final_price !== product.price ? String(product.final_price ?? "") : "",
    barcode: product?.barcode || "", description: product?.description || "",
    is_available: product ? !!product.is_available : true,
    stock: product && !product.item_id ? String(product.stock ?? 0) : "0",
  }));
  const [item, setItem] = useState(product?.item ? { id: product.item.id, name: product.item.name, unit: product.item.unit, stock: product.item.sales_stock ?? product.item.total_stock } : null);
  const [items, setItems] = useState([]);
  const [itemsErr, setItemsErr] = useState("");
  const [image, setImage] = useState(null); // File
  const [removeImage, setRemoveImage] = useState(false);
  const [preview, setPreview] = useState("");
  const [extraCats, setExtraCats] = useState([]);
  const [newCat, setNewCat] = useState({ open: false, name: "", busy: false, error: "" });
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const fileRef = useRef(null);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    if (!canLink) return undefined;
    let alive = true;
    fetchItems({ page_size: 1000 })
      .then((r) => alive && setItems(r.rows))
      .catch((e) => alive && setItemsErr(errMsg(e, t("ui_def.common.load_failed"))));
    return () => { alive = false; };
  }, [canLink, t]);

  useEffect(() => {
    if (!image) { setPreview(""); return undefined; }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const unitLabel = (u) => t(`ui_def.units.${u}`, { defaultValue: u });
  const itemLabel = (it) => `${it.name} — ${fmtNum(it.stock ?? it.sales_stock)} ${unitLabel(it.unit)}`;
  const itemOptions = useMemo(() => {
    const list = items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, stock: i.stock, barcode: i.barcode }));
    if (item && !list.some((o) => o.id === item.id)) list.push(item);
    return list;
  }, [items, item]);

  const price = Number(f.price);
  const fin = f.final_price === "" ? null : Number(f.final_price);
  const errs = {
    name: !f.name.trim(),
    category: !f.category_id || f.category_id === NEW_CAT,
    price: !(f.price !== "" && price >= 0),
    final: fin !== null && (!(fin >= 0) || fin > price),
  };
  const invalid = Object.values(errs).some(Boolean);

  const pickFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { setError(t("ui_def.products.image_type")); return; }
    if (file.size > MAX_IMAGE) { setError(t("ui_def.products.image_big")); return; }
    setError(""); setImage(file); setRemoveImage(false);
  };

  const makeCategory = async () => {
    if (!newCat.name.trim()) { setNewCat((s) => ({ ...s, error: t("ui_def.categories.name_required") })); return; }
    setNewCat((s) => ({ ...s, busy: true, error: "" }));
    try {
      const c = await createCategory({ name: newCat.name.trim() });
      onCategoriesChanged();
      setExtraCats((l) => [...l, c]);
      set("category_id", String(c.id));
      setNewCat({ open: false, name: "", busy: false, error: "" });
    } catch (e) {
      setNewCat((s) => ({ ...s, busy: false, error: errMsg(e, t("ui_def.common.save_failed")) }));
    }
  };

  const generate = async () => {
    setGenBusy(true); setError("");
    try {
      const r = await generateBarcodes({ target: "product", count: 1 });
      if (r?.codes?.[0]) set("barcode", r.codes[0]);
    } catch (e) { setError(errMsg(e, t("ui_def.common.save_failed"))); } finally { setGenBusy(false); }
  };

  const submit = async () => {
    setTouched(true);
    if (invalid) return;
    setSaving(true); setError("");
    const fd = new FormData();
    fd.append("name", f.name.trim());
    fd.append("name_en", f.name_en.trim());
    fd.append("category_id", f.category_id);
    fd.append("price", String(price));
    fd.append("final_price", String(fin === null ? price : fin));
    fd.append("is_available", f.is_available ? "true" : "false");
    fd.append("barcode", f.barcode.trim());
    fd.append("description", f.description);
    if (canLink) fd.append("item_id", item ? String(item.id) : "");
    if (!item && f.stock !== "") fd.append("stock", String(Math.max(0, parseInt(f.stock, 10) || 0)));
    if (image) fd.append("image", image);
    else if (removeImage) fd.append("remove_image", "true");
    try {
      const saved = isEdit ? await updateProduct(product.id, fd) : await createProduct(fd);
      onSaved(saved);
    } catch (e) {
      setError(errMsg(e, t("ui_def.common.save_failed")));
    } finally { setSaving(false); }
  };

  const shownImage = preview || (!removeImage && product?.image) || "";

  return (
    <FormDialog ctx={ctx} maxWidth="md" saving={saving} error={error} onClose={onClose} onSave={submit}
      title={isEdit ? t("ui_def.products.edit_title", { name: product.name }) : t("ui_def.products.new_title")}>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
        <TextField label={t("ui_def.products.f_name")} value={f.name} onChange={(e) => set("name", e.target.value)}
          size="small" sx={S.field} required autoFocus error={touched && errs.name}
          helperText={touched && errs.name ? t("ui_def.common.required") : ""} />
        <TextField label={t("ui_def.products.f_name_en")} value={f.name_en} onChange={(e) => set("name_en", e.target.value)}
          size="small" sx={S.field} slotProps={{ htmlInput: { dir: "ltr" } }} />

        <TextField select label={t("ui_def.products.f_category")} value={newCat.open ? NEW_CAT : f.category_id} size="small" sx={S.field}
          required error={touched && errs.category} helperText={touched && errs.category ? t("ui_def.common.required") : ""}
          onChange={(e) => {
            if (e.target.value === NEW_CAT) setNewCat((s) => ({ ...s, open: true }));
            else { setNewCat((s) => ({ ...s, open: false })); set("category_id", e.target.value); }
          }}>
          {[...categories, ...extraCats.filter((x) => !categories.some((c) => c.id === x.id))].filter((c) => c.is_active || String(c.id) === f.category_id).map((c) => (
            <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>
          ))}
          <MenuItem value={NEW_CAT} sx={{ color: C.primary, fontWeight: 700 }}>+ {t("ui_def.products.new_category")}</MenuItem>
        </TextField>

        <FormControlLabel sx={{ color: C.text, m: 0 }}
          control={<Switch checked={f.is_available} onChange={(e) => set("is_available", e.target.checked)} />}
          label={f.is_available ? t("ui_def.products.available") : t("ui_def.products.unavailable")} />

        {newCat.open && (
          <Box sx={{ gridColumn: "1 / -1", display: "flex", gap: 1, flexWrap: "wrap", alignItems: "flex-start", p: 1.5, bgcolor: C.primarySubtle, borderRadius: 2 }}>
            <TextField size="small" label={t("ui_def.categories.name")} value={newCat.name} sx={{ ...S.field, flex: "1 1 200px" }}
              onChange={(e) => setNewCat((s) => ({ ...s, name: e.target.value }))} error={!!newCat.error} helperText={newCat.error} />
            <Button sx={S.btn} onClick={makeCategory} disabled={newCat.busy}>{t("ui_def.categories.add")}</Button>
            <Button sx={{ color: C.sub, textTransform: "none" }} onClick={() => setNewCat({ open: false, name: "", busy: false, error: "" })}>{t("ui_def.common.cancel")}</Button>
          </Box>
        )}

        <TextField label={t("ui_def.products.f_price")} type="number" value={f.price} onChange={(e) => set("price", e.target.value)}
          size="small" sx={S.field} required error={touched && errs.price}
          helperText={touched && errs.price ? t("ui_def.common.invalid_number") : ""}
          slotProps={{ htmlInput: { min: 0, step: "any", inputMode: "decimal" } }} />
        <TextField label={t("ui_def.products.f_final_price")} type="number" value={f.final_price} onChange={(e) => set("final_price", e.target.value)}
          size="small" sx={S.field} error={touched && errs.final}
          helperText={touched && errs.final ? t("ui_def.products.final_gt_price") : t("ui_def.products.final_hint")}
          slotProps={{ htmlInput: { min: 0, step: "any", inputMode: "decimal" } }} />

        <TextField label={t("ui_def.products.f_barcode")} value={f.barcode} onChange={(e) => set("barcode", e.target.value)}
          size="small" sx={S.field} slotProps={{
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

        {canLink ? (
          <Autocomplete size="small" options={itemOptions} value={item} onChange={(_, v) => setItem(v)}
            getOptionLabel={(o) => (o ? itemLabel(o) : "")} isOptionEqualToValue={(a, b) => a.id === b.id}
            noOptionsText={itemsErr || t("ui_def.products.no_items")}
            renderInput={(p) => (
              <TextField {...p} label={t("ui_def.products.f_item")} sx={S.field} helperText={itemsErr || t("ui_def.products.item_hint")} />
            )} />
        ) : (
          <TextField label={t("ui_def.products.f_stock")} type="number" value={f.stock} onChange={(e) => set("stock", e.target.value)}
            size="small" sx={S.field} slotProps={{ htmlInput: { min: 0, step: 1 } }} />
        )}
        {canLink && !item && (
          <TextField label={t("ui_def.products.f_stock")} type="number" value={f.stock} onChange={(e) => set("stock", e.target.value)}
            size="small" sx={S.field} slotProps={{ htmlInput: { min: 0, step: 1 } }} helperText={t("ui_def.products.stock_hint")} />
        )}
      </Box>

      <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
        <Box sx={{ width: 96, height: 96, borderRadius: 2, border: `1px dashed ${C.glassBorder}`, bgcolor: C.inputBg, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
          {shownImage
            ? <Box component="img" src={shownImage} alt="" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <Typography sx={{ color: C.muted, fontSize: 11, textAlign: "center", px: 1 }}>{t("ui_def.products.no_image")}</Typography>}
        </Box>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pickFile} />
          <Button variant="outlined" sx={S.ghost} onClick={() => fileRef.current?.click()}>{t("ui_def.products.choose_image")}</Button>
          {(shownImage) && (
            <Button size="small" sx={{ color: C.danger, textTransform: "none" }}
              onClick={() => { setImage(null); setRemoveImage(true); }}>{t("ui_def.products.remove_image")}</Button>
          )}
          <Typography sx={{ color: C.muted, fontSize: 11 }}>{t("ui_def.products.image_hint")}</Typography>
        </Box>
      </Box>

      <TextField label={t("ui_def.products.f_description")} value={f.description} onChange={(e) => set("description", e.target.value)}
        size="small" sx={S.field} multiline minRows={2} />
    </FormDialog>
  );
}
