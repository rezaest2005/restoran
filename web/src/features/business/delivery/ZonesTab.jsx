import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box, Typography, Button, TextField, MenuItem, Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  CircularProgress, Switch, FormControlLabel, Chip,
} from "@mui/material";
import { useRegisteredShortcuts, dialogBindings } from "@shared/common/shortcutKit";
import KbdHint from "@shared/common/KbdHint";
import { fmtMoney, fmtInt, num, ConfirmDialog } from "@business/accounting/common";
import { zonesApi, quoteZone, errMsg } from "./api";

const PALETTE = ["#2E7D32", "#1565C0", "#EF6C00", "#6A1B9A", "#C62828", "#00838F"];
const W = 360;
const H = 240;
const PAD = 16;

/** Ring of [lat, lng] for a zone: its polygon, or a 36-gon approximating its circle. */
function ring(z) {
  if (z.polygon?.length >= 3) return z.polygon;
  if (z.center_lat == null || z.center_lng == null || !z.radius_km) return [];
  const dLat = z.radius_km / 111.32;
  const dLng = z.radius_km / (111.32 * Math.max(0.1, Math.cos((z.center_lat * Math.PI) / 180)));
  return Array.from({ length: 36 }, (_, i) => {
    const a = (i / 36) * 2 * Math.PI;
    return [z.center_lat + dLat * Math.sin(a), z.center_lng + dLng * Math.cos(a)];
  });
}

/** Plain SVG preview of the zones (same no-provider approach as the live map). */
function ZonesMap({ C, t, zones, probe }) {
  const rings = zones.map((z, i) => ({ z, pts: ring(z), color: z.color || PALETTE[i % PALETTE.length] })).filter((r) => r.pts.length);
  const all = rings.flatMap((r) => r.pts).concat(probe ? [[probe.lat, probe.lng]] : []);
  if (!all.length) return null;
  const lats = all.map((p) => p[0]);
  const lngs = all.map((p) => p[1]);
  const minLat = Math.min(...lats); const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs); const maxLng = Math.max(...lngs);
  const k = Math.min((W - 2 * PAD) / Math.max(maxLng - minLng, 0.002), (H - 2 * PAD) / Math.max(maxLat - minLat, 0.002));
  const cx = (minLng + maxLng) / 2;
  const cy = (minLat + maxLat) / 2;
  const xy = (p) => [W / 2 + (p[1] - cx) * k, H / 2 - (p[0] - cy) * k];
  return (
    <Box sx={{ border: `1px solid ${C.divider}`, borderRadius: 2, bgcolor: C.inputBg, overflow: "hidden" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={t("dlv.zones.map")} style={{ display: "block" }}>
        {rings.map(({ z, pts, color }) => {
          const d = pts.map(xy);
          const [lx, ly] = d.reduce((a, b) => [a[0] + b[0] / d.length, a[1] + b[1] / d.length], [0, 0]);
          return (
            <g key={z.id} opacity={z.is_active ? 1 : 0.4}>
              <polygon points={d.map((p) => p.join(",")).join(" ")} fill={color} fillOpacity="0.15" stroke={color} strokeWidth="2" />
              <text x={lx} y={ly} textAnchor="middle" fontSize="11" fontWeight="700" fill={C.text}>{z.name}</text>
            </g>
          );
        })}
        {probe && (() => { const [x, y] = xy([probe.lat, probe.lng]); return <circle cx={x} cy={y} r="5" fill={C.primary} stroke={C.surface} strokeWidth="2" />; })()}
      </svg>
    </Box>
  );
}

const blank = { name: "", fee: "", free_over: "", eta_minutes: "", shape: "circle", center_lat: "", center_lng: "", radius_km: "", polygonText: "", sort_order: "0", color: "", is_active: true };

function parsePolygon(text) {
  const pts = text.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => l.split(/[,\s]+/).map(Number));
  if (pts.length < 3 || pts.some((p) => p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return null;
  return pts.map((p) => [p[0], p[1]]);
}

function ZoneDialog({ ctx, zone, onClose, onSaved }) {
  const { t, C, S, fullScreen } = ctx;
  const [f, setF] = useState(() => (zone ? {
    ...blank, ...Object.fromEntries(Object.entries(zone).map(([k, v]) => [k, v == null ? "" : v])),
    shape: zone.polygon?.length ? "polygon" : "circle",
    polygonText: (zone.polygon || []).map((p) => `${p[0]}, ${p[1]}`).join("\n"),
    sort_order: String(zone.sort_order ?? 0),
  } : blank));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const opt = (v) => (v === "" || v == null ? null : num(v));

  const submit = async () => {
    if (saving) return;
    setError("");
    let polygon = [];
    if (f.shape === "polygon") {
      polygon = parsePolygon(f.polygonText);
      if (!polygon) { setError(t("dlv.zones.polygon_invalid")); return; }
    }
    const body = {
      name: f.name.trim(), fee: opt(f.fee) ?? 0, free_over: opt(f.free_over), eta_minutes: opt(f.eta_minutes),
      sort_order: opt(f.sort_order) ?? 0, color: f.color || "", is_active: f.is_active, polygon,
      center_lat: f.shape === "circle" ? opt(f.center_lat) : null, center_lng: f.shape === "circle" ? opt(f.center_lng) : null,
      radius_km: f.shape === "circle" ? opt(f.radius_km) : null,
    };
    setSaving(true);
    try {
      const saved = zone ? await zonesApi.update(zone.id, body) : await zonesApi.create(body);
      onSaved(saved);
    } catch (e) {
      setError(errMsg(e, t("ui_del.common.save_failed")));
    } finally { setSaving(false); }
  };
  useRegisteredShortcuts(dialogBindings(t, { confirmLabel: t("ui_del.common.save"), onConfirm: submit, onClose: () => { if (!saving) onClose(); }, enter: false }));

  const ltr = { htmlInput: { dir: "ltr", inputMode: "decimal" } };
  return (
    <Dialog open onClose={saving ? undefined : onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth slotProps={{ paper: { sx: S.dialogPaper } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{zone ? t("dlv.zones.edit") : t("dlv.zones.new")}</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, mt: 0.5 }}>
          <TextField size="small" autoFocus required label={t("dlv.zones.name")} value={f.name} onChange={set("name")} sx={{ ...S.field, gridColumn: "1 / -1" }} />
          <TextField size="small" label={t("dlv.zones.fee")} value={f.fee} onChange={set("fee")} sx={S.field} slotProps={ltr} />
          <TextField size="small" label={t("dlv.zones.free_over")} value={f.free_over} onChange={set("free_over")} sx={S.field} slotProps={ltr} />
          <TextField size="small" label={t("dlv.zones.eta")} value={f.eta_minutes} onChange={set("eta_minutes")} sx={S.field} slotProps={{ htmlInput: { dir: "ltr", inputMode: "numeric" } }} />
          <TextField size="small" label={t("dlv.zones.order")} value={f.sort_order} onChange={set("sort_order")} sx={S.field} slotProps={{ htmlInput: { dir: "ltr", inputMode: "numeric" } }} />
          <TextField select size="small" label={t("dlv.zones.shape")} value={f.shape} onChange={set("shape")} sx={{ ...S.field, gridColumn: "1 / -1" }}>
            <MenuItem value="circle">{t("dlv.zones.shape_circle")}</MenuItem>
            <MenuItem value="polygon">{t("dlv.zones.shape_polygon")}</MenuItem>
          </TextField>
          {f.shape === "circle" ? (
            <>
              <TextField size="small" label={t("dlv.zones.center_lat")} value={f.center_lat} onChange={set("center_lat")} sx={S.field} slotProps={ltr} />
              <TextField size="small" label={t("dlv.zones.center_lng")} value={f.center_lng} onChange={set("center_lng")} sx={S.field} slotProps={ltr} />
              <TextField size="small" label={t("dlv.zones.radius")} value={f.radius_km} onChange={set("radius_km")} sx={S.field} slotProps={ltr} />
            </>
          ) : (
            <TextField size="small" multiline minRows={4} label={t("dlv.zones.polygon")} helperText={t("dlv.zones.polygon_help")}
              value={f.polygonText} onChange={set("polygonText")} sx={{ ...S.field, gridColumn: "1 / -1" }} slotProps={{ htmlInput: { dir: "ltr" } }} />
          )}
          <Box sx={{ display: "flex", gap: 0.75, alignItems: "center", flexWrap: "wrap", gridColumn: "1 / -1" }}>
            {PALETTE.map((c) => (
              <Box key={c} role="button" tabIndex={0} aria-label={c} onClick={() => setF((x) => ({ ...x, color: c }))}
                onKeyDown={(e) => { if (e.key === "Enter") setF((x) => ({ ...x, color: c })); }}
                sx={{ width: 26, height: 26, borderRadius: "50%", bgcolor: c, cursor: "pointer", outline: f.color === c ? `3px solid ${C.text}` : "none", outlineOffset: 2 }} />
            ))}
            <FormControlLabel sx={{ color: C.text, ms: "auto" }} control={<Switch checked={!!f.is_active} onChange={(e) => setF((x) => ({ ...x, is_active: e.target.checked }))} />} label={t("dlv.zones.active")} />
          </Box>
        </Box>
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="outlined" sx={S.ghost} onClick={onClose} disabled={saving}>{t("ui_del.common.cancel")}</Button>
        <Button variant="contained" sx={S.btn} onClick={submit} disabled={saving || !f.name.trim()}>
          {saving ? <CircularProgress size={18} color="inherit" /> : <>{t("ui_del.trip.submit")}<KbdHint>Ctrl+D</KbdHint></>}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Delivery zones with fees (polygon or circle), a point checker and an SVG preview. */
export default function ZonesTab({ ctx }) {
  const { t, C, S, lang, notify } = ctx;
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState(null);         // null | "new" | zone
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [probe, setProbe] = useState({ lat: "", lng: "", amount: "" });
  const [quote, setQuote] = useState(null);

  const load = useCallback(() => {
    zonesApi.list().then((d) => { setZones(Array.isArray(d) ? d : []); setError(""); })
      .catch((e) => setError(errMsg(e, t("ui_del.common.load_failed"))))
      .finally(() => setLoading(false));
  }, [t]);
  useEffect(() => { load(); }, [load]);

  useRegisteredShortcuts([{ combo: "F2", label: t("dlv.zones.new"), handler: () => setEdit("new") }], { enabled: !edit });

  const check = () => {
    setQuote(null);
    quoteZone({ lat: num(probe.lat), lng: num(probe.lng), amount: probe.amount === "" ? undefined : num(probe.amount) })
      .then((q) => setQuote({ ...q, lat: num(probe.lat), lng: num(probe.lng) }))
      .catch((e) => notify(errMsg(e, t("ui_del.common.load_failed")), "error"));
  };
  const doDelete = async () => {
    setBusy(true);
    try { await zonesApi.remove(del.id); notify(t("dlv.zones.deleted")); setDel(null); load(); }
    catch (e) { notify(errMsg(e, t("ui_del.common.save_failed")), "error"); }
    finally { setBusy(false); }
  };
  const probePoint = useMemo(() => (quote ? { lat: quote.lat, lng: quote.lng } : null), [quote]);

  return (
    <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1.3fr 1fr" }, alignItems: "start" }}>
      <Box sx={S.card}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
          <Typography sx={{ fontWeight: 800, color: C.text, flex: 1 }}>{t("dlv.zones.title")}</Typography>
          <Button sx={S.btn} onClick={() => setEdit("new")}>+ {t("dlv.zones.new")}<KbdHint>F2</KbdHint></Button>
        </Box>
        <Typography sx={{ color: C.sub, fontSize: 12.5, mb: 1.5 }}>{t("dlv.zones.intro")}</Typography>
        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
        {loading && <CircularProgress size={22} />}
        {!loading && zones.length === 0 && <Typography sx={{ color: C.muted, fontSize: 13 }}>{t("dlv.zones.empty")}</Typography>}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {zones.map((z, i) => (
            <Box key={z.id} sx={{ border: `1px solid ${C.divider}`, borderInlineStart: `4px solid ${z.color || PALETTE[i % PALETTE.length]}`, borderRadius: 2, p: 1.25, opacity: z.is_active ? 1 : 0.6 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                <Typography sx={{ fontWeight: 700, color: C.text, flex: 1 }}>{z.name}</Typography>
                {!z.is_active && <Chip size="small" label={t("ui_del.common.inactive")} sx={{ height: 20, fontSize: 11 }} />}
                <Button size="small" sx={S.link} onClick={() => setEdit(z)}>{t("dlv.zones.edit")}</Button>
                <Button size="small" sx={{ ...S.link, color: C.danger }} onClick={() => setDel(z)}>{t("dlv.zones.delete")}</Button>
              </Box>
              <Typography sx={{ color: C.sub, fontSize: 12.5 }}>
                {t("dlv.zones.fee")}: <b>{fmtMoney(z.fee, lang)}</b>
                {z.free_over != null ? ` · ${t("dlv.zones.free", { v: fmtMoney(z.free_over, lang) })}` : ""}
                {z.eta_minutes ? ` · ${t("dlv.zones.minutes", { n: fmtInt(z.eta_minutes, lang) })}` : ""}
                {` · ${z.shape === "polygon" ? t("dlv.zones.shape_polygon") : t("dlv.zones.shape_circle")}`}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={{ display: "grid", gap: 2 }}>
        <Box sx={S.card}>
          <Typography sx={{ fontWeight: 800, color: C.text, mb: 1.5 }}>{t("dlv.zones.quote_title")}</Typography>
          <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "1fr 1fr" }}>
            <TextField size="small" label={t("ui_del.trip.lat")} value={probe.lat} onChange={(e) => setProbe((p) => ({ ...p, lat: e.target.value }))} sx={S.field} slotProps={{ htmlInput: { dir: "ltr", inputMode: "decimal" } }} />
            <TextField size="small" label={t("ui_del.trip.lng")} value={probe.lng} onChange={(e) => setProbe((p) => ({ ...p, lng: e.target.value }))} sx={S.field} slotProps={{ htmlInput: { dir: "ltr", inputMode: "decimal" } }} />
            <TextField size="small" label={t("ui_del.trip.amount_due")} value={probe.amount} onChange={(e) => setProbe((p) => ({ ...p, amount: e.target.value }))} sx={S.field} slotProps={{ htmlInput: { dir: "ltr", inputMode: "decimal" } }} />
            <Button variant="outlined" sx={S.ghost} disabled={probe.lat === "" || probe.lng === ""} onClick={check}>{t("dlv.zones.quote_btn")}</Button>
          </Box>
          {quote && (
            <Typography sx={{ mt: 1, fontWeight: 700, color: quote.zone_id ? C.success : quote.deliverable ? C.sub : C.danger }}>
              {quote.zone_id ? t("dlv.zones.quote_result", { zone: quote.zone_name, fee: fmtMoney(quote.fee, lang) }) : t("dlv.zones.quote_none")}
            </Typography>
          )}
        </Box>
        {zones.length > 0 && (
          <Box sx={S.card}>
            <Typography sx={{ fontWeight: 800, color: C.text, mb: 1.5 }}>{t("dlv.zones.map")}</Typography>
            <ZonesMap C={C} t={t} zones={zones} probe={probePoint} />
          </Box>
        )}
      </Box>

      {edit && (
        <ZoneDialog ctx={ctx} zone={edit === "new" ? null : edit} onClose={() => setEdit(null)}
          onSaved={() => { setEdit(null); notify(t("dlv.zones.saved")); load(); }} />
      )}
      <ConfirmDialog ctx={ctx} open={!!del} busy={busy} danger title={t("dlv.zones.delete")}
        text={del ? t("dlv.zones.delete_confirm", { name: del.name }) : ""} confirmLabel={t("ui_del.common.confirm")}
        onClose={() => setDel(null)} onConfirm={doDelete} />
    </Box>
  );
}
