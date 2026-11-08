import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Button, Chip, TextField, MenuItem, Alert, CircularProgress, Link as MuiLink,
} from "@mui/material";
import { useRegisteredShortcuts } from "@shared/common/shortcutKit";
import {
  fmtMoney, fmtInt, useRowCursor, cursorBindings, cursorProps, ConfirmDialog,
} from "@business/accounting/common";
import {
  fetchTrips, fetchTrip, assignTrip, setTripStatus, fetchMap, errMsg,
} from "./api";
import {
  TRIP_STATUSES, NEXT_TRIP, tripStatusColor, stopStatusColor, fmtTime, fmtDateTime,
} from "./common";
import LiveMap from "./LiveMap";

const MAP_POLL_MS = 15000;

function StatusChip({ color, label }) {
  return (
    <Chip
      size="small" label={label}
      sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: "transparent", color, border: `1px solid ${color}` }}
    />
  );
}

export default function DispatchTab({ ctx, drivers, vehicles, refreshKey, selectedId, onSelect }) {
  const { t, C, S, lang, notify } = ctx;
  const [status, setStatus] = useState("");
  const [driverId, setDriverId] = useState("");
  const [date, setDate] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailRaw, setDetail] = useState(null);
  const [points, setPoints] = useState([]);
  const [assign, setAssign] = useState({ driver_id: "", vehicle_id: "" });
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const loadList = useCallback(() => {
    fetchTrips({ status, driver_id: driverId, date })
      .then((d) => { setRows(d?.results || []); setError(""); })
      .catch((e) => setError(errMsg(e, t("ui_del.common.load_failed"))))
      .finally(() => setLoading(false));
  }, [status, driverId, date, t]);

  useEffect(() => { loadList(); }, [loadList, refreshKey]);

  const loadDetail = useCallback(() => {
    if (!selectedId) return;
    fetchTrip(selectedId)
      .then((d) => {
        setDetail(d);
        setAssign({ driver_id: d.driver_id || "", vehicle_id: d.vehicle_id || "" });
      })
      .catch(() => setDetail(null));
  }, [selectedId]);

  useEffect(() => { loadDetail(); }, [loadDetail, refreshKey]);

  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      fetchMap().then((d) => { if (alive) setPoints(d?.points || []); }).catch(() => {});
    };
    load();
    const id = setInterval(load, MAP_POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const detail = selectedId && detailRaw && detailRaw.id === selectedId ? detailRaw : null;
  const cursor = useRowCursor(rows.length);
  useRegisteredShortcuts([
    ...cursorBindings(t, cursor),
    { combo: "Enter", label: t("ui_del.keys.open_row"), allowInInput: false,
      handler: () => { if (cursor.index >= 0 && rows[cursor.index]) onSelect(rows[cursor.index].id); } },
  ]);

  const reload = () => { loadList(); loadDetail(); };

  const doAssign = async () => {
    if (!detail || !assign.driver_id) return;
    setBusy(true);
    try {
      await assignTrip(detail.id, { driver_id: assign.driver_id, vehicle_id: assign.vehicle_id || null });
      notify(t("ui_del.dispatch.assigned"));
      reload();
    } catch (e) {
      notify(errMsg(e, t("ui_del.common.save_failed")), "error");
    } finally { setBusy(false); }
  };

  const doStatus = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await setTripStatus(detail.id, confirm);
      notify(t("ui_del.dispatch.status_changed"));
      setConfirm(null);
      reload();
    } catch (e) {
      notify(errMsg(e, t("ui_del.common.save_failed")), "error");
      setConfirm(null);
    } finally { setBusy(false); }
  };

  const mapStops = (detail?.stops || []).map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, status: s.status }));
  const canAssign = detail && (detail.status === "planned" || detail.status === "assigned");
  const n = (v) => fmtMoney(v, lang);

  return (
    <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "minmax(260px, 1fr) minmax(320px, 1.4fr) minmax(280px, 1fr)" }, alignItems: "start" }}>
      {/* trips list */}
      <Box sx={S.card}>
        <Typography sx={{ fontWeight: 800, color: C.text, mb: 1.5 }}>{t("ui_del.dispatch.trips")}</Typography>
        <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "1fr 1fr", mb: 1.5 }}>
          <TextField select size="small" label={t("ui_del.dispatch.status")} value={status} onChange={(e) => setStatus(e.target.value)} sx={S.field}>
            <MenuItem value="">{t("ui_del.common.all")}</MenuItem>
            {TRIP_STATUSES.map((s) => <MenuItem key={s} value={s}>{t(`ui_del.trip_status.${s}`)}</MenuItem>)}
          </TextField>
          <TextField select size="small" label={t("ui_del.trip.driver")} value={driverId} onChange={(e) => setDriverId(e.target.value)} sx={S.field}>
            <MenuItem value="">{t("ui_del.common.all")}</MenuItem>
            {drivers.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
          </TextField>
          <TextField size="small" type="date" label={t("ui_del.dispatch.date")} value={date} onChange={(e) => setDate(e.target.value)} sx={{ ...S.field, gridColumn: "1 / -1" }} slotProps={{ inputLabel: { shrink: true } }} />
        </Box>
        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
        {loading && <CircularProgress size={22} />}
        {!loading && rows.length === 0 && <Typography sx={{ color: C.muted, fontSize: 13 }}>{t("ui_del.dispatch.no_trips")}</Typography>}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, maxHeight: { lg: 560 }, overflowY: "auto" }}>
          {rows.map((r, i) => (
            <Box
              key={r.id} role="button" tabIndex={0}
              onClick={() => { cursor.reset(); onSelect(r.id); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(r.id); } }}
              {...cursorProps(C, cursor.index === i)}
              sx={{
                cursor: "pointer", p: 1.25, borderRadius: 2, border: `1px solid ${selectedId === r.id ? C.primary : C.divider}`,
                bgcolor: selectedId === r.id ? C.primarySubtle : "transparent",
                ...(cursor.index === i ? { outline: `2px solid ${C.primary}`, outlineOffset: -2 } : {}),
              }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
                <Typography sx={{ fontWeight: 700, color: C.text, fontSize: 14 }}>TR-{fmtInt(r.number, lang)}</Typography>
                <StatusChip color={tripStatusColor(C, r.status)} label={t(`ui_del.trip_status.${r.status}`)} />
              </Box>
              <Typography sx={{ color: C.sub, fontSize: 12, mt: 0.5 }}>
                {r.driver_name || t("ui_del.trip.unassigned")} · {t("ui_del.dispatch.stops_progress", { done: fmtInt(r.stops_done, lang), total: fmtInt(r.stops_count, lang) })}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* trip detail */}
      <Box sx={S.card}>
        {!detail && <Typography sx={{ color: C.muted }}>{t("ui_del.dispatch.select_trip")}</Typography>}
        {detail && (
          <>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 1 }}>
              <Typography sx={{ fontWeight: 800, color: C.text, fontSize: 18 }}>TR-{fmtInt(detail.number, lang)}</Typography>
              <StatusChip color={tripStatusColor(C, detail.status)} label={t(`ui_del.trip_status.${detail.status}`)} />
            </Box>
            <Typography sx={{ color: C.sub, fontSize: 12, mb: 1.5 }}>
              {t("ui_del.dispatch.created_at", { v: fmtDateTime(detail.created_at, lang) })}
              {detail.waybill ? ` · ${t("ui_del.trip.waybill")}: ${detail.waybill}` : ""}
              {detail.carrier_name ? ` · ${detail.carrier_name}` : ""}
            </Typography>

            {canAssign && (
              <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "1fr 1fr auto", mb: 2, alignItems: "center" }}>
                <TextField select size="small" label={t("ui_del.trip.driver")} value={assign.driver_id} onChange={(e) => setAssign((a) => ({ ...a, driver_id: e.target.value }))} sx={S.field}>
                  {drivers.filter((d) => d.is_active).map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
                </TextField>
                <TextField select size="small" label={t("ui_del.trip.vehicle")} value={assign.vehicle_id} onChange={(e) => setAssign((a) => ({ ...a, vehicle_id: e.target.value }))} sx={S.field}>
                  <MenuItem value="">{t("ui_del.trip.auto")}</MenuItem>
                  {vehicles.filter((v) => v.is_active).map((v) => <MenuItem key={v.id} value={v.id}>{v.name}</MenuItem>)}
                </TextField>
                <Button sx={S.btn} disabled={busy || !assign.driver_id} onClick={doAssign}>{t("ui_del.dispatch.assign")}</Button>
              </Box>
            )}
            {!canAssign && (
              <Typography sx={{ color: C.sub, fontSize: 13, mb: 2 }}>
                {t("ui_del.trip.driver")}: <b>{detail.driver_name || "—"}</b> · {t("ui_del.trip.vehicle")}: <b>{detail.vehicle_name || "—"}</b>
              </Typography>
            )}

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mb: 2 }}>
              {detail.stops.map((s) => (
                <Box key={s.id} sx={{ border: `1px solid ${C.divider}`, borderRadius: 2, p: 1.25 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "center" }}>
                    <Typography sx={{ fontWeight: 700, color: C.text, fontSize: 13 }}>
                      {fmtInt(s.sequence, lang)}. {s.customer_name || s.address}
                    </Typography>
                    <StatusChip color={stopStatusColor(C, s.status)} label={t(`ui_del.stop_status.${s.status}`)} />
                  </Box>
                  {s.customer_name && <Typography sx={{ color: C.sub, fontSize: 12 }}>{s.address}</Typography>}
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, mt: 0.5, color: C.sub, fontSize: 12 }}>
                    <span>{t("ui_del.trip.amount_due")}: {n(s.amount_due)}</span>
                    <span>{t("ui_del.dispatch.collected")}: {n(s.collected_amount)}{s.collected_method ? ` (${t(`ui_del.method.${s.collected_method}`, { defaultValue: s.collected_method })})` : ""}</span>
                    {s.eta && s.status !== "delivered" && s.status !== "failed" && <span>{t("ui_del.dispatch.eta")}: {fmtTime(s.eta, lang)}</span>}
                    {s.delivered_at && <span>{t("ui_del.dispatch.delivered_at")}: {fmtTime(s.delivered_at, lang)}</span>}
                  </Box>
                  {s.failure_reason && <Typography sx={{ color: C.danger, fontSize: 12, mt: 0.5 }}>{s.failure_reason}</Typography>}
                  <MuiLink href={`/t/${s.tracking_token}`} target="_blank" rel="noreferrer" sx={{ fontSize: 11, color: C.primary }}>
                    {t("ui_del.dispatch.tracking_link")}
                  </MuiLink>
                </Box>
              ))}
            </Box>

            <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "repeat(2, 1fr)", bgcolor: C.infoBg, borderRadius: 2, p: 1.5, mb: 2, fontSize: 12, color: C.text }}>
              <span>{t("ui_del.totals.amount_due")}: <b>{n(detail.totals.amount_due)}</b></span>
              <span>{t("ui_del.totals.collected")}: <b>{n(detail.totals.collected)}</b></span>
              <span>{t("ui_del.totals.fee")}: <b>{n(detail.totals.delivery_fee)}</b></span>
              <span>{t("ui_del.totals.driver_pay")}: <b>{n(detail.totals.driver_pay)}</b></span>
              <span>{t("ui_del.totals.carrier_cost")}: <b>{n(detail.totals.carrier_cost)}</b></span>
            </Box>

            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {NEXT_TRIP[detail.status].map((s) => (
                <Button
                  key={s} variant={s === "cancelled" ? "outlined" : "contained"} disabled={busy}
                  sx={s === "cancelled" ? { ...S.ghost, color: C.danger, borderColor: C.danger } : S.btn}
                  onClick={() => setConfirm(s)}
                >
                  {t(`ui_del.dispatch.to_${s}`)}
                </Button>
              ))}
            </Box>
          </>
        )}
      </Box>

      {/* live map */}
      <Box sx={S.card}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
          <Typography sx={{ fontWeight: 800, color: C.text }}>{t("ui_del.map.title")}</Typography>
          <Typography sx={{ color: C.muted, fontSize: 11 }}>{t("ui_del.map.live_count", { n: fmtInt(points.length, lang) })}</Typography>
        </Box>
        <LiveMap ctx={ctx} points={points} stops={mapStops} />
        <Box sx={{ mt: 1.5, display: "flex", flexDirection: "column", gap: 0.5 }}>
          {points.map((p) => (
            <Typography key={`${p.type}${p.id}`} sx={{ color: C.sub, fontSize: 12 }}>
              {p.type === "vehicle" ? "🚚" : "🚴"} {p.name}
              {p.trip_number ? ` · TR-${fmtInt(p.trip_number, lang)} · ${t("ui_del.map.remaining", { n: fmtInt(p.stops_remaining ?? 0, lang) })}` : ""}
              {` · ${fmtTime(p.last_seen, lang)}`}
            </Typography>
          ))}
        </Box>
      </Box>

      <ConfirmDialog
        ctx={ctx} open={!!confirm} busy={busy} danger={confirm === "cancelled"}
        title={t("ui_del.dispatch.confirm_title")}
        text={confirm ? t("ui_del.dispatch.confirm_text", { status: t(`ui_del.trip_status.${confirm}`) }) : ""}
        confirmLabel={t("ui_del.common.confirm")} onClose={() => setConfirm(null)} onConfirm={doStatus}
      />
    </Box>
  );
}
