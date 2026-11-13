import { useState, useEffect, useCallback } from "react";
import { Box, Typography, TextField, MenuItem, Chip, Alert, CircularProgress, Collapse } from "@mui/material";
import client from "../api/client";
import { fmtMoney } from "@business/accounting/common";
import { fmtDateTime, stopStatusColor } from "./common";

const unwrap = (r) => r.data?.data ?? r.data;
const W = 520;
const H = 260;
const PAD = 20;

/** The path the courier really drove (GPS samples) with the stops on it — plain SVG, no map provider. */
function RouteView({ ctx, trip }) {
  const { t, C } = ctx;
  const [data, setData] = useState(null);
  useEffect(() => {
    client.get(`/api/delivery/history/trips/${trip.id}/route/`).then(unwrap).then(setData).catch(() => setData({ points: [], stops: [] }));
  }, [trip.id]);
  if (!data) return <CircularProgress size={20} />;
  const all = [...data.points, ...data.stops].filter((p) => p.lat != null && p.lng != null);
  if (!all.length) return <Typography sx={{ color: C.muted, fontSize: 12 }}>{t("ui_del.hist.no_route")}</Typography>;
  const lats = all.map((p) => p.lat);
  const lngs = all.map((p) => p.lng);
  const minLat = Math.min(...lats); const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs); const maxLng = Math.max(...lngs);
  const s = Math.min((W - 2 * PAD) / Math.max(maxLng - minLng, 0.003), (H - 2 * PAD) / Math.max(maxLat - minLat, 0.003));
  const cx = (minLng + maxLng) / 2; const cy = (minLat + maxLat) / 2;
  const P = (p) => [W / 2 + (p.lng - cx) * s, H / 2 - (p.lat - cy) * s];
  const line = data.points.map((p) => P(p).join(",")).join(" ");
  const first = data.points[0];
  const last = data.points[data.points.length - 1];
  return (
    <Box>
      <Box sx={{ border: `1px solid ${C.divider}`, borderRadius: 2, bgcolor: C.inputBg, overflow: "hidden" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
          {data.points.length > 1 && <polyline points={line} fill="none" stroke={C.primary} strokeWidth="3" strokeLinejoin="round" />}
          {first && <circle cx={P(first)[0]} cy={P(first)[1]} r="6" fill={C.success} />}
          {data.points.length > 1 && <circle cx={P(last)[0]} cy={P(last)[1]} r="6" fill={C.danger} />}
          {data.stops.filter((x) => x.lat != null && x.lng != null).map((x) => {
            const [px, py] = P(x);
            return (
              <g key={x.sequence}>
                <rect x={px - 8} y={py - 8} width="16" height="16" rx="3" fill={C.surface} stroke={stopStatusColor(C, x.status)} strokeWidth="2.5" />
                <text x={px} y={py + 4} textAnchor="middle" fontSize="10" fill={C.text}>{x.sequence}</text>
              </g>
            );
          })}
        </svg>
      </Box>
      <Typography sx={{ color: C.muted, fontSize: 11, mt: 0.5 }}>
        {t("ui_del.hist.route_note", { km: data.distance_km, n: data.total_points })}
      </Typography>
    </Box>
  );
}

export default function HistoryTab({ ctx, drivers }) {
  const { t, C, S, lang } = ctx;
  const [f, setF] = useState(() => ({
    driver_id: "", from: new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10),
  }));
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);

  const load = useCallback(() => {
    setError("");
    client.get("/api/delivery/history/", { params: Object.fromEntries(Object.entries(f).filter(([, v]) => v)) })
      .then(unwrap).then(setD).catch(() => setError(t("ui_del.common.load_failed")));
  }, [f, t]);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const tot = d?.totals;
  return (
    <Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "2fr 1fr 1fr" }, gap: 1, mb: 2 }}>
        <TextField size="small" select label={t("ui_del.hist.courier")} value={f.driver_id} onChange={set("driver_id")} sx={{ ...S.field, gridColumn: { xs: "1 / -1", md: "auto" } }}>
          <MenuItem value="">{t("ui_del.common.all")}</MenuItem>
          {drivers.map((x) => <MenuItem key={x.id} value={x.id}>{x.number ? `${x.number} — ` : ""}{x.name}</MenuItem>)}
        </TextField>
        <TextField size="small" type="date" label={t("ui_act.from")} value={f.from} onChange={set("from")} sx={S.field} InputLabelProps={{ shrink: true }} />
        <TextField size="small" type="date" label={t("ui_act.to")} value={f.to} onChange={set("to")} sx={S.field} InputLabelProps={{ shrink: true }} />
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      {tot && (
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
          <Chip label={`${t("ui_del.hist.trips")}: ${tot.trips}`} />
          <Chip color="success" label={`${t("ui_del.hist.delivered")}: ${tot.stops_delivered}`} />
          <Chip color={tot.stops_failed ? "error" : "default"} label={`${t("ui_del.hist.failed")}: ${tot.stops_failed}`} />
          <Chip label={`${t("ui_del.hist.collected")}: ${fmtMoney(tot.collected, lang)}`} />
          <Chip label={`${t("ui_del.hist.km")}: ${tot.distance_km}`} />
        </Box>
      )}
      {d && !d.trips.length && <Alert severity="info">{t("ui_del.hist.empty")}</Alert>}
      <Box sx={{ display: "grid", gap: 1 }}>
        {(d?.trips || []).map((tr) => (
          <Box key={tr.id} sx={{ bgcolor: C.surface, border: `1px solid ${C.divider}`, borderRadius: 2, p: 1.5 }}>
            <Box onClick={() => setOpen(open === tr.id ? null : tr.id)} sx={{ cursor: "pointer", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
              <Typography sx={{ color: C.text, fontWeight: 700 }}>
                #{tr.number || tr.id} — {tr.driver_name || t("ui_del.hist.no_courier")} <Chip size="small" label={tr.status_display} sx={{ mx: 1 }} />
              </Typography>
              <Typography sx={{ color: C.sub, fontSize: 12 }}>
                {fmtDateTime(tr.started_at || tr.created_at, lang)} → {fmtDateTime(tr.completed_at, lang)} · {tr.distance_km} {t("ui_del.hist.km")} · {fmtMoney(tr.collected, lang)}
              </Typography>
            </Box>
            <Collapse in={open === tr.id} unmountOnExit>
              <Box sx={{ mt: 1.5, display: "grid", gap: 1 }}>
                {tr.stops.map((s) => (
                  <Box key={s.sequence} sx={{ borderInlineStart: `4px solid ${stopStatusColor(C, s.status)}`, paddingInlineStart: 1.25 }}>
                    <Typography sx={{ color: C.text, fontSize: 13, fontWeight: 600 }}>
                      {s.sequence}. {s.customer_name || "—"} — {s.address}
                    </Typography>
                    <Typography sx={{ color: C.sub, fontSize: 12 }}>
                      {t("ui_del.hist.cargo")}: {s.cargo || "—"} · {s.status_display}
                      {s.delivered_at ? ` · ${fmtDateTime(s.delivered_at, lang)}` : ""}
                      {s.collected ? ` · ${t("ui_del.hist.collected")}: ${fmtMoney(s.collected, lang)}` : ""}
                      {s.failure_reason ? ` · ${s.failure_reason}` : ""}
                    </Typography>
                  </Box>
                ))}
                <RouteView ctx={ctx} trip={tr} />
              </Box>
            </Collapse>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
