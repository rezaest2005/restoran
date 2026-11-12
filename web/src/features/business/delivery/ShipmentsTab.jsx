import { useState, useEffect, useCallback } from "react";
import { Box, Typography, Button, Chip, TextField, MenuItem, Alert, CircularProgress } from "@mui/material";
import { fmtInt } from "@business/accounting/common";
import { fetchTrips, errMsg, trackingUrl } from "./api";
import { TRIP_STATUSES, tripStatusColor, fmtDateTime } from "./common";
import CopyLink from "./CopyLink";

/**
 * Cargo-oriented view of the same trips: who owns the load, what it is, where it goes, who carries it
 * and a link the cargo owner can open to follow it. Sold on its own to haulage companies.
 */
export default function ShipmentsTab({ ctx, refreshKey, onNew, onOpen }) {
  const { t, C, S, lang } = ctx;
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetchTrips({ status })
      .then((d) => { setRows(d?.results || []); setError(""); })
      .catch((e) => setError(errMsg(e, t("ui_del.common.load_failed"))))
      .finally(() => setLoading(false));
  }, [status, t]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => !needle || [r.shipper_name, r.cargo_description, r.waybill, r.destination_name, r.origin_name, r.driver_name]
    .some((v) => String(v || "").toLowerCase().includes(needle)));

  return (
    <Box sx={S.card}>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center", mb: 1.5 }}>
        <Typography sx={{ fontWeight: 800, color: C.text, flex: 1 }}>{t("ui_del.ship.title")}</Typography>
        <TextField size="small" label={t("ui_del.ship.search")} value={q} onChange={(e) => setQ(e.target.value)} sx={{ ...S.field, minWidth: 200 }} />
        <TextField select size="small" label={t("ui_del.dispatch.status")} value={status} onChange={(e) => setStatus(e.target.value)} sx={{ ...S.field, minWidth: 150 }}>
          <MenuItem value="">{t("ui_del.common.all")}</MenuItem>
          {TRIP_STATUSES.map((s) => <MenuItem key={s} value={s}>{t(`ui_del.trip_status.${s}`)}</MenuItem>)}
        </TextField>
        <Button sx={S.btn} onClick={onNew}>+ {t("ui_del.ship.new")}</Button>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      {loading && <CircularProgress size={22} />}
      {!loading && shown.length === 0 && <Typography sx={{ color: C.muted, fontSize: 13 }}>{t("ui_del.ship.none")}</Typography>}
      <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" } }}>
        {shown.map((r) => {
          const col = tripStatusColor(C, r.status);
          return (
            <Box key={r.id} sx={{ border: `1px solid ${C.divider}`, borderRadius: 2, p: 1.5 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, mb: 0.5 }}>
                <Typography sx={{ fontWeight: 800, color: C.text }}>
                  TR-{fmtInt(r.number, lang)}{r.waybill ? ` · ${r.waybill}` : ""}
                </Typography>
                <Chip size="small" label={t(`ui_del.trip_status.${r.status}`)}
                  sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: "transparent", color: col, border: `1px solid ${col}` }} />
              </Box>
              <Typography sx={{ color: C.text, fontSize: 14, fontWeight: 700 }}>{r.cargo_description || "—"}</Typography>
              <Typography sx={{ color: C.sub, fontSize: 12.5, mt: 0.25 }}>
                {t("ui_del.ship.shipper")}: <b>{r.shipper_name || "—"}</b>
                {r.cargo_weight_kg != null && ` · ${fmtInt(r.cargo_weight_kg, lang)} kg`}
              </Typography>
              <Typography sx={{ color: C.sub, fontSize: 12.5 }}>
                {r.origin_name || "—"} ← → {r.destination_name || "—"}
              </Typography>
              <Typography sx={{ color: C.sub, fontSize: 12.5 }}>
                {t("ui_del.trip.driver")}: {r.driver_name || t("ui_del.trip.unassigned")} · {r.vehicle_name || "—"}
                {r.expected_arrival ? ` · ${t("ui_del.ship.expected")}: ${fmtDateTime(r.expected_arrival, lang)}` : ""}
              </Typography>
              <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                <Button size="small" onClick={() => onOpen(r.id)}>{t("ui_del.ship.open")}</Button>
                <CopyLink url={trackingUrl(r.tracking_token)} label={t("ui_del.ship.copy_link")} doneLabel={t("ui_del.ship.copied")} />
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
