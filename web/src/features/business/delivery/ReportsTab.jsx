import { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, TextField, Alert, CircularProgress, Table, TableHead, TableBody, TableRow, TableCell,
} from "@mui/material";
import { TableWrap, fmtMoney, fmtInt } from "@business/accounting/common";
import { fetchReport, errMsg } from "./api";

const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

function Tile({ C, label, value, hint, color }) {
  return (
    <Box sx={{ border: `1px solid ${C.divider}`, borderRadius: 2, p: 1.5, minWidth: 0 }}>
      <Typography sx={{ color: C.sub, fontSize: 12 }}>{label}</Typography>
      <Typography sx={{ color: color || C.text, fontWeight: 800, fontSize: { xs: 18, sm: 22 }, lineHeight: 1.4 }}>{value}</Typography>
      {hint && <Typography sx={{ color: C.muted, fontSize: 11 }}>{hint}</Typography>}
    </Box>
  );
}

/** Horizontal bar list: label, bar proportional to the largest value, value text. */
function Bars({ C, rows, color, fmt }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Box sx={{ display: "grid", gap: 0.75 }}>
      {rows.map((r) => (
        <Box key={r.key} sx={{ display: "grid", gridTemplateColumns: "minmax(90px, 40%) 1fr auto", gap: 1, alignItems: "center" }}>
          <Typography sx={{ color: C.text, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</Typography>
          <Box sx={{ height: 10, borderRadius: 5, bgcolor: C.inputBg, overflow: "hidden" }}>
            <Box sx={{ width: `${(100 * r.value) / max}%`, height: "100%", bgcolor: color, borderRadius: 5 }} />
          </Box>
          <Typography sx={{ color: C.sub, fontSize: 12, fontWeight: 700 }}>{r.text ?? fmt(r.value)}</Typography>
        </Box>
      ))}
    </Box>
  );
}

/** Delivery KPIs for a date range: success, on-time, speed, money, per courier, failure reasons, zones. */
export default function ReportsTab({ ctx }) {
  const { t, C, S, lang } = ctx;
  const [from, setFrom] = useState(() => daysAgo(6));
  const [to, setTo] = useState(() => iso(new Date()));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetchReport({ from, to })
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError(errMsg(e, t("ui_del.common.load_failed"))))
      .finally(() => setLoading(false));
  }, [from, to, t]);
  useEffect(() => { load(); }, [load]);

  const pct = (v) => (v == null ? "—" : `${Number(v).toLocaleString(lang === "fa" ? "fa-IR" : "en-US")}${lang === "fa" ? "٪" : "%"}`);
  const n = (v) => fmtInt(v, lang);
  const m = (v) => fmtMoney(v, lang);
  const tot = data?.totals;

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Box sx={{ ...S.card, display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
        <Typography sx={{ fontWeight: 800, color: C.text, flex: 1, minWidth: 160 }}>{t("dlv.reports.title")}</Typography>
        <TextField size="small" type="date" label={t("dlv.reports.from")} value={from} onChange={(e) => setFrom(e.target.value)} sx={S.field} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" type="date" label={t("dlv.reports.to")} value={to} onChange={(e) => setTo(e.target.value)} sx={S.field} slotProps={{ inputLabel: { shrink: true } }} />
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      {loading && !data && <CircularProgress size={22} />}
      {tot && tot.stops === 0 && <Alert severity="info">{t("dlv.reports.none")}</Alert>}
      {tot && tot.stops > 0 && (
        <>
          <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)", lg: "repeat(6, 1fr)" } }}>
            <Tile C={C} label={t("dlv.reports.stops")} value={n(tot.stops)} hint={`${t("dlv.reports.open")}: ${n(tot.open)}`} />
            <Tile C={C} label={t("dlv.reports.success")} value={pct(tot.success_pct)} hint={`${n(tot.delivered)} / ${n(tot.failed)}`} color={C.success} />
            <Tile C={C} label={t("dlv.reports.on_time")} value={pct(tot.on_time_pct)} />
            <Tile C={C} label={t("dlv.reports.avg_minutes")} value={tot.avg_minutes == null ? "—" : t("dlv.reports.minutes", { n: n(tot.avg_minutes) })} />
            <Tile C={C} label={t("dlv.reports.collected")} value={m(tot.collected)} hint={`${t("dlv.reports.cash")}: ${m(tot.cash_collected)}`} />
            <Tile C={C} label={t("dlv.reports.unsettled")} value={m(tot.unsettled_cash)} color={tot.unsettled_cash > 0 ? C.warning : C.text} />
          </Box>

          <Box sx={S.card}>
            <Typography sx={{ fontWeight: 800, color: C.text, mb: 1.5 }}>{t("dlv.reports.per_driver")}</Typography>
            <TableWrap C={C}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={S.th}>{t("dlv.reports.driver")}</TableCell>
                    <TableCell sx={S.thNum}>{t("dlv.reports.delivered")}</TableCell>
                    <TableCell sx={S.thNum}>{t("dlv.reports.failed")}</TableCell>
                    <TableCell sx={S.thNum}>{t("dlv.reports.success")}</TableCell>
                    <TableCell sx={S.thNum}>{t("dlv.reports.on_time")}</TableCell>
                    <TableCell sx={S.thNum}>{t("dlv.reports.avg_minutes")}</TableCell>
                    <TableCell sx={S.thNum}>{t("dlv.reports.collected")}</TableCell>
                    <TableCell sx={S.thNum}>{t("dlv.reports.unsettled")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.drivers.map((r) => (
                    <TableRow key={r.driver_id ?? "none"}>
                      <TableCell sx={S.td}>{r.driver_name || t("dlv.reports.unassigned")}</TableCell>
                      <TableCell sx={S.tdNum}>{n(r.delivered)}</TableCell>
                      <TableCell sx={{ ...S.tdNum, color: r.failed ? C.danger : undefined }}>{n(r.failed)}</TableCell>
                      <TableCell sx={S.tdNum}>{pct(r.success_pct)}</TableCell>
                      <TableCell sx={S.tdNum}>{pct(r.on_time_pct)}</TableCell>
                      <TableCell sx={S.tdNum}>{r.avg_minutes == null ? "—" : n(r.avg_minutes)}</TableCell>
                      <TableCell sx={S.tdNum}>{m(r.collected)}</TableCell>
                      <TableCell sx={{ ...S.tdNum, color: r.unsettled_cash > 0 ? C.warning : undefined }}>{m(r.unsettled_cash)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrap>
          </Box>

          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, alignItems: "start" }}>
            <Box sx={S.card}>
              <Typography sx={{ fontWeight: 800, color: C.text, mb: 1.5 }}>{t("dlv.reports.failed_reasons")}</Typography>
              {data.failure_reasons.length === 0
                ? <Typography sx={{ color: C.muted, fontSize: 13 }}>{t("ui_del.common.empty")}</Typography>
                : <Bars C={C} fmt={n} color={C.danger} rows={data.failure_reasons.map((r) => ({ key: r.code, label: t(`dlv.fail.${r.code}`, { defaultValue: r.code }), value: r.count }))} />}
            </Box>
            <Box sx={S.card}>
              <Typography sx={{ fontWeight: 800, color: C.text, mb: 1.5 }}>{t("dlv.reports.by_method")}</Typography>
              {data.methods.length === 0
                ? <Typography sx={{ color: C.muted, fontSize: 13 }}>{t("ui_del.common.empty")}</Typography>
                : <Bars C={C} fmt={n} color={C.primary} rows={data.methods.map((r) => ({ key: r.method, label: t(`ui_del.method.${r.method}`, { defaultValue: r.method }), value: r.amount, text: m(r.amount) }))} />}
            </Box>
            <Box sx={S.card}>
              <Typography sx={{ fontWeight: 800, color: C.text, mb: 1.5 }}>{t("dlv.reports.by_zone")}</Typography>
              <Bars C={C} fmt={n} color={C.info} rows={data.zones.map((r) => ({ key: r.zone || "-", label: r.zone || t("dlv.reports.no_zone"), value: r.stops }))} />
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
}
