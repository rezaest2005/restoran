import { useState, useEffect, useMemo } from "react";
import {
  Box, Typography, Button, TextField, MenuItem, Checkbox, Alert, CircularProgress, ToggleButton, ToggleButtonGroup,
  FormControlLabel, Switch, Chip,
} from "@mui/material";
import {
  useRegisteredShortcuts, useDebounced, useLoader, fmtMoney, fmtNum,
} from "../../common";
import { fetchProducts, fetchItems, generateBarcodes, fetchBarcodeLabels, errMsg } from "../../api";
import { Label, PrintRoot } from "./labels";
import { PRESETS } from "./presets";

const PREVIEW_LIMIT = 24;
const LIST_LIMIT = 1000;
const NO_LABELS = { rows: [], missing: [] };

const card = (C, S) => ({ ...S.card, display: "flex", flexDirection: "column", gap: 1.5 });

/** Barcodes & labels: bulk generate, reserve spare codes, pick products/items and print labels. */
export default function BarcodeSection({ ctx, canProducts, canItems }) {
  const { t, C, S, notify } = ctx;
  const targets = [canProducts && "product", canItems && "item"].filter(Boolean);
  const [target, setTarget] = useState(targets[0]);

  /* ── (a) generate for everything that lacks a code ── */
  const [genBusy, setGenBusy] = useState(null);
  const [genResult, setGenResult] = useState(null); // { target, count }
  const [genErr, setGenErr] = useState("");
  const generateMissing = async (tgt) => {
    setGenBusy(tgt); setGenErr(""); setGenResult(null);
    try {
      const r = await generateBarcodes({ target: tgt, only_missing: true });
      const count = r?.assigned?.length || 0;
      setGenResult({ target: tgt, count });
      notify(t("ui_def.barcodes.generated", { count }), count ? "success" : "info");
      loadList();
    } catch (e) { setGenErr(errMsg(e, t("ui_def.common.save_failed"))); } finally { setGenBusy(null); }
  };

  /* ── (b) reserve spare codes ── */
  const [spareCount, setSpareCount] = useState("10");
  const [spare, setSpare] = useState([]);
  const [spareBusy, setSpareBusy] = useState(false);
  const [spareErr, setSpareErr] = useState("");
  const reserve = async () => {
    const n = parseInt(spareCount, 10);
    if (!(n >= 1 && n <= 2000)) { setSpareErr(t("ui_def.barcodes.spare_range")); return; }
    setSpareBusy(true); setSpareErr("");
    try {
      const r = await generateBarcodes({ target: target || "product", count: n });
      setSpare(r?.codes || []);
    } catch (e) { setSpareErr(errMsg(e, t("ui_def.common.save_failed"))); } finally { setSpareBusy(false); }
  };
  const copySpare = async () => {
    try { await navigator.clipboard.writeText(spare.join("\n")); notify(t("ui_def.barcodes.copied"), "success"); }
    catch { notify(t("ui_def.barcodes.copy_failed"), "error"); }
  };
  const downloadSpare = () => {
    const url = URL.createObjectURL(new Blob([spare.join("\n") + "\n"], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url; a.download = "barcodes.txt"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /* ── (c) pick + print ── */
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim().toLowerCase(), 200);
  const [selected, setSelected] = useState(() => new Set());
  const [copies, setCopies] = useState("1");
  const [preset, setPreset] = useState("50x30");
  const [showName, setShowName] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [printing, setPrinting] = useState(false);

  const { data: listData, loading: listLoading, error: listErr, reload: loadList } = useLoader(
    () => (target === "product" ? fetchProducts : fetchItems)({ page_size: LIST_LIMIT }), target || "none", t("ui_def.common.load_failed"));
  const list = listData?.rows || [];
  const listTotal = listData?.total || 0;
  const changeTarget = (v) => { setTarget(v); setSelected(new Set()); };

  const filtered = useMemo(() => {
    if (!dq) return list;
    return list.filter((r) => `${r.name} ${r.name_en || ""} ${r.barcode || ""}`.toLowerCase().includes(dq));
  }, [list, dq]);

  const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allShown = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected((s) => {
    const n = new Set(s);
    if (allShown) filtered.forEach((r) => n.delete(r.id)); else filtered.forEach((r) => n.add(r.id));
    return n;
  });

  const copiesN = Math.min(500, Math.max(1, parseInt(copies, 10) || 1));
  const idsKey = useMemo(() => [...selected].sort((a, b) => a - b).join(","), [selected]);
  const debKey = useDebounced(`${target}|${idsKey}|${copiesN}`, 400);

  const hasIds = !!idsKey;
  const { data: labelData, loading: labelLoading, error: labelErr, reload: reloadLabels } = useLoader(() => {
    const [tgt, ids, c] = debKey.split("|");
    return ids ? fetchBarcodeLabels({ target: tgt, ids, copies: c }) : Promise.resolve(NO_LABELS);
  }, debKey, t("ui_def.common.load_failed"));
  const labels = hasIds && labelData ? labelData : NO_LABELS;
  const labelBusy = hasIds && labelLoading;

  const assignSelected = async () => {
    if (!labels.missing.length) return;
    try {
      const r = await generateBarcodes({ target, ids: labels.missing, only_missing: true });
      notify(t("ui_def.barcodes.generated", { count: r?.assigned?.length || 0 }), "success");
      loadList();
      reloadLabels();
    } catch (e) { notify(errMsg(e, t("ui_def.common.save_failed")), "error"); }
  };

  const priceText = fmtMoney;
  const size = PRESETS[preset];
  const perSheet = size.a4 ? size.cols * size.rows : 1;
  const sheets = Math.ceil(labels.rows.length / perSheet);

  const startPrint = () => {
    if (!labels.rows.length) { notify(t("ui_def.barcodes.nothing_to_print"), "warning"); return; }
    setPrinting(true);
  };

  useEffect(() => {
    if (!printing) return undefined;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    const id = setTimeout(() => window.print(), 150); // let the print root paint first
    return () => { clearTimeout(id); window.removeEventListener("afterprint", done); };
  }, [printing]);

  useRegisteredShortcuts([
    { combo: "Ctrl+P", label: t("ui_def.barcodes.print_shortcut"), handler: startPrint },
  ]);

  const unitOf = (r) => t(`ui_def.units.${r.unit}`, { defaultValue: r.unit || "" });

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box>
        <Typography sx={{ fontSize: { xs: 16, sm: 18 }, fontWeight: 800, color: C.text }}>{t("ui_def.barcodes.title")}</Typography>
        <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.3 }}>{t("ui_def.barcodes.subtitle")}</Typography>
      </Box>

      {/* (a) generate for all missing */}
      <Box sx={card(C, S)}>
        <Typography sx={{ color: C.text, fontWeight: 800 }}>{t("ui_def.barcodes.gen_title")}</Typography>
        <Typography sx={{ color: C.sub, fontSize: 13 }}>{t("ui_def.barcodes.gen_text")}</Typography>
        {genErr && <Alert severity="error">{genErr}</Alert>}
        {genResult && (
          <Alert severity={genResult.count ? "success" : "info"} role="status">
            {genResult.count
              ? t(genResult.target === "product" ? "ui_def.barcodes.gen_done_products" : "ui_def.barcodes.gen_done_items", { count: genResult.count })
              : t("ui_def.barcodes.gen_none")}
          </Alert>
        )}
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {canProducts && (
            <Button sx={S.btn} onClick={() => generateMissing("product")} disabled={!!genBusy}>
              {genBusy === "product" ? <CircularProgress size={18} color="inherit" /> : t("ui_def.barcodes.gen_products")}
            </Button>
          )}
          {canItems && (
            <Button sx={S.btn} onClick={() => generateMissing("item")} disabled={!!genBusy}>
              {genBusy === "item" ? <CircularProgress size={18} color="inherit" /> : t("ui_def.barcodes.gen_items")}
            </Button>
          )}
        </Box>
      </Box>

      {/* (b) spare codes */}
      <Box sx={card(C, S)}>
        <Typography sx={{ color: C.text, fontWeight: 800 }}>{t("ui_def.barcodes.spare_title")}</Typography>
        <Typography sx={{ color: C.sub, fontSize: 13 }}>{t("ui_def.barcodes.spare_text")}</Typography>
        {spareErr && <Alert severity="error">{spareErr}</Alert>}
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
          <TextField size="small" type="number" label={t("ui_def.barcodes.spare_count")} value={spareCount} sx={{ ...S.field, width: 140 }}
            onChange={(e) => setSpareCount(e.target.value)} slotProps={{ htmlInput: { min: 1, max: 2000 } }} />
          <Button sx={S.btn} onClick={reserve} disabled={spareBusy}>
            {spareBusy ? <CircularProgress size={18} color="inherit" /> : t("ui_def.barcodes.spare_btn")}
          </Button>
          {spare.length > 0 && (
            <>
              <Button variant="outlined" sx={S.ghost} onClick={copySpare}>{t("ui_def.barcodes.copy")}</Button>
              <Button variant="outlined" sx={S.ghost} onClick={downloadSpare}>{t("ui_def.barcodes.download")}</Button>
            </>
          )}
        </Box>
        {spare.length > 0 && (
          <Box sx={{ maxHeight: 160, overflow: "auto", p: 1, bgcolor: C.inputBg, border: `1px solid ${C.divider}`, borderRadius: 2, direction: "ltr", fontFamily: "monospace", fontSize: 13, color: C.text }}>
            {spare.map((c) => <div key={c}>{c}</div>)}
          </Box>
        )}
      </Box>

      {/* (c) labels */}
      <Box sx={card(C, S)}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Typography sx={{ color: C.text, fontWeight: 800 }}>{t("ui_def.barcodes.labels_title")}</Typography>
          {targets.length > 1 && (
            <ToggleButtonGroup exclusive size="small" value={target} onChange={(_, v) => v && changeTarget(v)} aria-label={t("ui_def.barcodes.target")}>
              <ToggleButton value="product" sx={{ textTransform: "none", color: C.sub }}>{t("ui_def.barcodes.products")}</ToggleButton>
              <ToggleButton value="item" sx={{ textTransform: "none", color: C.sub }}>{t("ui_def.barcodes.items")}</ToggleButton>
            </ToggleButtonGroup>
          )}
        </Box>

        <TextField size="small" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ui_def.common.search")} sx={{ ...S.field, maxWidth: 360 }} />
        {listErr && <Alert severity="error" action={<Button color="inherit" size="small" onClick={loadList}>{t("ui_def.common.retry")}</Button>}>{listErr}</Alert>}
        {listTotal > LIST_LIMIT && <Alert severity="info">{t("ui_def.barcodes.list_limited", { count: LIST_LIMIT, total: listTotal })}</Alert>}

        <Box sx={{ border: `1px solid ${C.divider}`, borderRadius: 2, maxHeight: 280, overflow: "auto" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1, py: 0.5, borderBottom: `1px solid ${C.divider}`, bgcolor: C.tableHeaderBg, position: "sticky", top: 0, zIndex: 1 }}>
            <Checkbox size="small" checked={allShown} indeterminate={!allShown && filtered.some((r) => selected.has(r.id))} onChange={toggleAll}
              disabled={filtered.length === 0} slotProps={{ input: { "aria-label": t("ui_def.barcodes.select_all") } }} />
            <Typography sx={{ fontSize: 12, color: C.sub }}>{t("ui_def.barcodes.selected", { count: selected.size })}</Typography>
            {selected.size > 0 && <Button size="small" sx={{ textTransform: "none", color: C.primary }} onClick={() => setSelected(new Set())}>{t("ui_def.barcodes.clear")}</Button>}
          </Box>
          {listLoading ? (
            <Box sx={{ textAlign: "center", py: 3 }}><CircularProgress size={22} /></Box>
          ) : filtered.length === 0 ? (
            <Typography sx={{ color: C.muted, textAlign: "center", py: 3 }}>{dq ? t("ui_def.common.no_results") : t("ui_def.barcodes.list_empty")}</Typography>
          ) : filtered.map((r) => (
            <Box key={r.id} component="label" sx={{ display: "flex", alignItems: "center", gap: 1, px: 1, py: 0.25, cursor: "pointer", "&:hover": { bgcolor: C.tableRowHover } }}>
              <Checkbox size="small" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{r.name}</Typography>
                <Typography sx={{ fontSize: 11, color: C.muted, direction: "ltr", textAlign: "start" }}>
                  {r.barcode || t("ui_def.barcodes.no_code")}
                  {target === "item" ? ` · ${unitOf(r)}` : ""}
                </Typography>
              </Box>
              {!r.barcode && <Chip size="small" label={t("ui_def.barcodes.no_code")} sx={{ color: C.warning, bgcolor: C.warningBg, fontWeight: 700 }} />}
              <Typography sx={{ fontSize: 12, color: C.sub }}>{fmtMoney(target === "product" ? r.final_price : r.price)}</Typography>
            </Box>
          ))}
        </Box>

        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
          <TextField size="small" type="number" label={t("ui_def.barcodes.copies")} value={copies} sx={{ ...S.field, width: 120 }}
            onChange={(e) => setCopies(e.target.value)} slotProps={{ htmlInput: { min: 1, max: 500 } }} />
          <TextField select size="small" label={t("ui_def.barcodes.size")} value={preset} sx={{ ...S.field, minWidth: 190 }}
            onChange={(e) => setPreset(e.target.value)}>
            {Object.keys(PRESETS).map((k) => <MenuItem key={k} value={k}>{t(`ui_def.barcodes.preset_${k}`)}</MenuItem>)}
          </TextField>
          <FormControlLabel sx={{ color: C.text, m: 0 }} control={<Switch size="small" checked={showName} onChange={(e) => setShowName(e.target.checked)} />} label={t("ui_def.barcodes.show_name")} />
          <FormControlLabel sx={{ color: C.text, m: 0 }} control={<Switch size="small" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />} label={t("ui_def.barcodes.show_price")} />
          <Button sx={S.btn} onClick={startPrint} disabled={labels.rows.length === 0 || labelBusy || printing}>
            {t("ui_def.barcodes.print")}
          </Button>
        </Box>

        {labelErr && <Alert severity="error">{labelErr}</Alert>}
        {labels.missing.length > 0 && (
          <Alert severity="warning" action={<Button color="inherit" size="small" onClick={assignSelected} sx={{ textTransform: "none" }}>{t("ui_def.barcodes.assign_missing")}</Button>}>
            {t("ui_def.barcodes.missing_selected", { count: labels.missing.length })}
          </Alert>
        )}

        {labelBusy && <CircularProgress size={20} />}
        {labels.rows.length > 0 && (
          <Box>
            <Typography sx={{ color: C.sub, fontSize: 12, mb: 1 }}>
              {t("ui_def.barcodes.preview_info", { labels: fmtNum(labels.rows.length), sheets: fmtNum(sheets) })}
              {labels.rows.length > PREVIEW_LIMIT ? ` — ${t("ui_def.barcodes.preview_first", { count: PREVIEW_LIMIT })}` : ""}
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, p: 1.5, bgcolor: C.inputBg, border: `1px solid ${C.divider}`, borderRadius: 2, maxHeight: 420, overflow: "auto", direction: "ltr" }}>
              {labels.rows.slice(0, PREVIEW_LIMIT).map((r, i) => (
                <Box key={`${r.id}-${i}`} sx={{ boxShadow: C.cardShadow, flexShrink: 0 }}>
                  <Label row={r} size={size.a4 ? { w: 70, h: 37 } : size} showName={showName} showPrice={showPrice} priceText={priceText} />
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Box>

      {printing && <PrintRoot rows={labels.rows} preset={preset} showName={showName} showPrice={showPrice} priceText={priceText} />}
    </Box>
  );
}
