import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert, Autocomplete, Box, Button, Chip, GlobalStyles, MenuItem, Switch, TextField, Typography,
} from "@mui/material";
import { QRCodeSVG } from "qrcode.react";
import superClient from "@super/api/super_client";

const LAST_KEY = "super_qr_business";
const BASE_KEY = "super_qr_base";
const KINDS = ["menu", "storefront", "custom"];
const kindKey = (k) => (k === "menu" ? "ordering" : k);
const unwrap = (r) => r.data?.data ?? r.data;
const errText = (e, fb) => e?.response?.data?.error || e?.response?.data?.message || fb;
const read = (k) => { try { return sessionStorage.getItem(k) || localStorage.getItem(k) || ""; } catch { return ""; } };

const dateText = (iso, fa) => (iso ? new Date(iso).toLocaleString(fa ? "fa-IR" : "en-GB", { dateStyle: "short", timeStyle: "short" }) : "—");

function downloadSvg(id, name) {
  const svg = document.getElementById(id);
  if (!svg) return;
  const xml = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${name}.svg`; a.click();
  URL.revokeObjectURL(url);
}

/**
 * Super admin: QR codes of a business. Each QR holds a short permanent link (/q/<code>);
 * the page it opens is set here and can be changed any time without reprinting.
 */
export default function QrPanel({ tenants, C }) {
  const { t, i18n } = useTranslation();
  const fa = i18n.language !== "en";
  const businesses = useMemo(() => tenants.filter((x) => x.business_id), [tenants]);
  const [bid, setBid] = useState(() => Number(read(LAST_KEY)) || null);
  const [base, setBase] = useState(() => read(BASE_KEY) || window.location.origin);
  const [rows, setRows] = useState([]);
  const [edits, setEdits] = useState({});          // id -> unsaved changes
  const [msg, setMsg] = useState(null);
  const [form, setForm] = useState({ label: "", kind: "menu", custom_url: "", table_number: "" });
  const [bulk, setBulk] = useState({ n: "10", kind: "menu", custom_url: "" });
  const selected = businesses.find((b) => b.business_id === bid) || null;
  const cleanBase = base.trim().replace(/\/+$/, "");

  useEffect(() => { try { if (bid) sessionStorage.setItem(LAST_KEY, String(bid)); } catch { /* ignore */ } }, [bid]);
  useEffect(() => { try { localStorage.setItem(BASE_KEY, base); } catch { /* ignore */ } }, [base]);

  const load = useCallback(() => {
    if (!bid) return;
    superClient.get("/api/super/qr/", { params: { business_id: bid } })
      .then((r) => { setRows(unwrap(r)); setEdits({}); })
      .catch((e) => setMsg({ type: "error", text: errText(e, t("ui_qr.load_failed")) }));
  }, [bid, t]);
  useEffect(() => { load(); }, [load]);

  const flash = (type, text) => setMsg({ type, text });
  const cur = (r) => ({ ...r, ...(edits[r.id] || {}) });
  const setEdit = (id, patch) => setEdits((e) => ({ ...e, [id]: { ...(e[id] || {}), ...patch } }));

  const create = async (body) => {
    try {
      await superClient.post("/api/super/qr/", { business_id: bid, ...body });
      flash("success", t("ui_qr.created"));
      load();
      return true;
    } catch (e) { flash("error", errText(e, t("ui_qr.save_failed"))); return false; }
  };

  const save = async (r) => {
    const ch = edits[r.id];
    if (!ch) return;
    try {
      await superClient.put(`/api/super/qr/${r.id}/`, ch);
      flash("success", t("ui_qr.saved"));
      load();
    } catch (e) { flash("error", errText(e, t("ui_qr.save_failed"))); }
  };

  const remove = async (r) => {
    if (!window.confirm(t("ui_qr.confirm_delete", { label: r.label || r.code }))) return;
    try { await superClient.delete(`/api/super/qr/${r.id}/`); load(); } catch (e) { flash("error", errText(e, t("ui_qr.save_failed"))); }
  };

  const link = (r) => `${cleanBase}${r.path}`;
  const copy = async (r) => {
    try { await navigator.clipboard.writeText(link(r)); flash("success", t("ui_qr.copied")); } catch { window.prompt(t("ui_qr.copy"), link(r)); }
  };

  const box = { border: `1px solid ${C.glassBorder}`, borderRadius: "12px", p: 1.5, bgcolor: C.surface };
  const activeRows = rows.filter((r) => r.is_active);

  return (
    <Box>
      <GlobalStyles styles={{
        "@media print": {
          "body *": { visibility: "hidden" },
          "#qr-print-sheet, #qr-print-sheet *": { visibility: "visible" },
          "#qr-print-sheet": { position: "absolute", left: 0, top: 0, width: "100%" },
        },
      }} />
      <Typography sx={{ fontWeight: 800, fontSize: 18, color: C.text, mb: 0.5 }}>{t("ui_qr.title")}</Typography>
      <Typography sx={{ color: C.sub, fontSize: 13, mb: 2 }}>{t("ui_qr.intro")}</Typography>
      {msg && <Alert severity={msg.type} sx={{ mb: 2 }} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
        <Autocomplete
          size="small" sx={{ minWidth: 280 }} options={businesses} value={selected}
          getOptionLabel={(b) => `${b.name} (${b.slug})`}
          isOptionEqualToValue={(a, b) => a.business_id === b.business_id}
          onChange={(_, v) => { setRows([]); setEdits({}); setBid(v ? v.business_id : null); }}
          renderInput={(p) => <TextField {...p} label={t("ui_qr.pick_business")} />}
        />
        <TextField
          size="small" sx={{ minWidth: 300, flex: 1 }} label={t("ui_qr.base_url")} value={base}
          onChange={(e) => setBase(e.target.value)} helperText={t("ui_qr.base_hint")}
          slotProps={{ htmlInput: { dir: "ltr" } }}
        />
      </Box>

      {!selected && <Alert severity="info">{t("ui_qr.pick_hint")}</Alert>}

      {selected && (
        <>
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, mb: 3 }}>
            <Box sx={box}>
              <Typography sx={{ fontWeight: 700, color: C.text, mb: 1 }}>{t("ui_qr.new_one")}</Typography>
              <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "1fr 1fr" }}>
                <TextField size="small" label={t("ui_qr.label")} value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
                <TextField size="small" label={t("ui_qr.table")} value={form.table_number} onChange={(e) => setForm((f) => ({ ...f, table_number: e.target.value }))} />
                <TextField select size="small" label={t("ui_qr.opens")} value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
                  {KINDS.map((k) => <MenuItem key={k} value={k}>{t(`ui_qr.kind.${kindKey(k)}`)}</MenuItem>)}
                </TextField>
                {form.kind === "custom" && (
                  <TextField size="small" label={t("ui_qr.url")} value={form.custom_url} placeholder="https://"
                    onChange={(e) => setForm((f) => ({ ...f, custom_url: e.target.value }))} slotProps={{ htmlInput: { dir: "ltr" } }} />
                )}
              </Box>
              <Button sx={{ mt: 1.5 }} variant="contained" onClick={async () => { if (await create(form)) setForm((f) => ({ ...f, label: "", table_number: "" })); }}>
                {t("ui_qr.create")}
              </Button>
            </Box>

            <Box sx={box}>
              <Typography sx={{ fontWeight: 700, color: C.text, mb: 1 }}>{t("ui_qr.bulk_title")}</Typography>
              <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "1fr 1fr" }}>
                <TextField size="small" type="number" label={t("ui_qr.bulk_n")} value={bulk.n} onChange={(e) => setBulk((b) => ({ ...b, n: e.target.value }))}
                  slotProps={{ htmlInput: { min: 1, max: 200 } }} />
                <TextField select size="small" label={t("ui_qr.opens")} value={bulk.kind} onChange={(e) => setBulk((b) => ({ ...b, kind: e.target.value }))}>
                  {KINDS.map((k) => <MenuItem key={k} value={k}>{t(`ui_qr.kind.${kindKey(k)}`)}</MenuItem>)}
                </TextField>
                {bulk.kind === "custom" && (
                  <TextField size="small" sx={{ gridColumn: "1 / -1" }} label={t("ui_qr.url")} value={bulk.custom_url} placeholder="https://"
                    onChange={(e) => setBulk((b) => ({ ...b, custom_url: e.target.value }))} slotProps={{ htmlInput: { dir: "ltr" } }} />
                )}
              </Box>
              <Button sx={{ mt: 1.5 }} variant="outlined" onClick={() => create({ tables: Number(bulk.n), kind: bulk.kind, custom_url: bulk.custom_url })}>
                {t("ui_qr.bulk_create")}
              </Button>
            </Box>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, flexWrap: "wrap" }}>
            <Typography sx={{ fontWeight: 700, color: C.text }}>{t("ui_qr.list_title", { n: rows.length })}</Typography>
            <Button size="small" variant="outlined" disabled={activeRows.length === 0} onClick={() => window.print()} sx={{ marginInlineStart: "auto" }}>
              {t("ui_qr.print_all")}
            </Button>
          </Box>
          {rows.length === 0 && <Typography sx={{ color: C.muted, fontSize: 13 }}>{t("ui_qr.none")}</Typography>}

          <Box sx={{ display: "grid", gap: 1.25 }}>
            {rows.map((r0) => {
              const r = cur(r0);
              const dirty = !!edits[r0.id];
              return (
                <Box key={r0.id} sx={{ ...box, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "auto 1fr auto" }, alignItems: "center" }}>
                  <Box sx={{ bgcolor: "#fff", p: 0.75, borderRadius: 1, width: 96, height: 96, justifySelf: "center" }}>
                    <QRCodeSVG id={`qr-svg-${r0.id}`} value={link(r0)} size={128} level="M" marginSize={1} style={{ width: "100%", height: "100%" }}
                      role="img" aria-label={r0.label || r0.code} />
                  </Box>

                  <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" }, minWidth: 0 }}>
                    <TextField size="small" label={t("ui_qr.label")} value={r.label} onChange={(e) => setEdit(r0.id, { label: e.target.value })} />
                    <TextField size="small" label={t("ui_qr.table")} value={r.table_number} onChange={(e) => setEdit(r0.id, { table_number: e.target.value })} />
                    <TextField select size="small" label={t("ui_qr.opens")} value={r.kind} onChange={(e) => setEdit(r0.id, { kind: e.target.value })}
                      sx={{ gridColumn: { xs: "1 / -1", sm: "span 2" } }}>
                      {KINDS.map((k) => <MenuItem key={k} value={k}>{t(`ui_qr.kind.${kindKey(k)}`)}</MenuItem>)}
                    </TextField>
                    {r.kind === "custom" && (
                      <TextField size="small" sx={{ gridColumn: "1 / -1" }} label={t("ui_qr.url")} value={r.custom_url} placeholder="https://"
                        onChange={(e) => setEdit(r0.id, { custom_url: e.target.value })} slotProps={{ htmlInput: { dir: "ltr" } }} />
                    )}
                    <Box sx={{ gridColumn: "1 / -1", display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                      <Typography dir="ltr" sx={{ color: C.sub, fontSize: 12, wordBreak: "break-all" }}>{link(r0)}</Typography>
                      <Chip size="small" label={r0.target ? t("ui_qr.ok") : t("ui_qr.unavailable")}
                        sx={{ bgcolor: r0.target ? C.successBg : C.warningBg, color: r0.target ? C.success : C.warning }} />
                      <Typography sx={{ color: C.sub, fontSize: 12 }}>
                        {t("ui_qr.scans", { n: r0.scans })} · {t("ui_qr.last_scan")}: {dateText(r0.last_scan_at, fa)}
                      </Typography>
                    </Box>
                  </Box>

                  <Box sx={{ display: "flex", flexDirection: { xs: "row", md: "column" }, gap: 0.75, alignItems: "stretch", flexWrap: "wrap" }}>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                      <Typography sx={{ fontSize: 12, color: C.sub }}>{t("ui_qr.active")}</Typography>
                      <Switch size="small" checked={!!r.is_active} onChange={(e) => setEdit(r0.id, { is_active: e.target.checked })} slotProps={{ input: { "aria-label": t("ui_qr.active") } }} />
                    </Box>
                    <Button size="small" variant="contained" disabled={!dirty} onClick={() => save(r0)}>{t("ui_qr.save")}</Button>
                    <Button size="small" variant="outlined" onClick={() => copy(r0)}>{t("ui_qr.copy")}</Button>
                    <Button size="small" variant="outlined" onClick={() => downloadSvg(`qr-svg-${r0.id}`, r0.label || r0.code)}>{t("ui_qr.download")}</Button>
                    <Button size="small" color="error" onClick={() => remove(r0)}>{t("ui_qr.delete")}</Button>
                  </Box>
                </Box>
              );
            })}
          </Box>

          {/* print sheet: only active codes, only on paper */}
          <Box id="qr-print-sheet" sx={{ display: "none", "@media print": { display: "grid" }, gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
            {activeRows.map((r) => (
              <Box key={r.id} sx={{ textAlign: "center", p: 1.5, border: "1px solid #999", borderRadius: 2, breakInside: "avoid" }}>
                <QRCodeSVG value={link(r)} size={160} level="M" marginSize={1} style={{ width: "100%", height: "auto" }} />
                <Typography sx={{ fontWeight: 700, mt: 0.5, color: "#000" }}>{r.label || r.code}</Typography>
                <Typography sx={{ fontSize: 11, color: "#444" }}>{selected.name}</Typography>
              </Box>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}
