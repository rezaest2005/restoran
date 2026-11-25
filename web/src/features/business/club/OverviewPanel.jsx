import { useEffect, useState } from "react";
import { Alert, Box, CircularProgress, MenuItem, TextField, Typography } from "@mui/material";
import { fmtInt } from "../accounting/common";
import { fetchReport, errMsg } from "./api";

const RANGES = [7, 30, 90, 365];
const SEGMENTS = ["new", "loyal", "regular", "at_risk", "lost"];
const RFM = ["champions", "loyal_accounts", "promising", "potential_loyalist", "new_active", "low_spenders",
  "need_attention", "about_to_sleep", "at_risk", "lost"];

function Stat({ label, value, sub, C }) {
  return (
    <Box sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${C.glassBorder}`, bgcolor: C.inputBg, minWidth: 0 }}>
      <Typography sx={{ color: C.muted, fontSize: 12 }} noWrap>{label}</Typography>
      <Typography sx={{ color: C.text, fontWeight: 800, fontSize: 20, fontVariantNumeric: "tabular-nums" }} noWrap>
        {value}
      </Typography>
      {sub && <Typography sx={{ color: C.sub, fontSize: 11 }} noWrap>{sub}</Typography>}
    </Box>
  );
}

/** Horizontal bars: one row per bucket, value at the end. Click a row to filter members. */
function Bars({ rows, C, onPick }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Box sx={{ display: "grid", gap: 0.75 }}>
      {rows.map((r) => (
        <Box key={r.key} onClick={onPick ? () => onPick(r.key) : undefined}
          sx={{ display: "grid", gridTemplateColumns: "minmax(90px, 140px) 1fr auto", gap: 1, alignItems: "center",
            cursor: onPick ? "pointer" : "default" }}>
          <Typography sx={{ color: C.sub, fontSize: 13 }} noWrap>{r.label}</Typography>
          <Box sx={{ height: 10, borderRadius: 5, bgcolor: C.divider, overflow: "hidden" }}>
            <Box sx={{ width: `${(r.value / max) * 100}%`, height: "100%", bgcolor: r.color || C.primary, borderRadius: 5 }} />
          </Box>
          <Typography sx={{ color: C.text, fontSize: 13, fontWeight: 700, minWidth: 28, textAlign: "end" }}>{r.text}</Typography>
        </Box>
      ))}
    </Box>
  );
}

/** Club report: activity, points economy, liability, retention, segments, RFM, tiers, top members. */
export default function OverviewPanel({ ctx, onSegment }) {
  const { t, C, S, lang } = ctx;
  const [days, setDays] = useState(30);
  const [d, setD] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetchReport(days).then((r) => { if (alive) { setD(r); setError(""); } })
      .catch((e) => alive && setError(errMsg(e, t("ui_club.err.generic"))));
    return () => { alive = false; };
  }, [days, t]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!d) return <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress size={28} /></Box>;
  const n = (v) => fmtInt(v, lang);
  const pct = (v) => (v == null ? "—" : `${n(v)}%`);
  const segColor = { new: C.info, loyal: C.success, regular: C.primary, at_risk: C.warning, lost: C.danger };

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1.5 }}>
        <TextField select size="small" value={days} onChange={(e) => setDays(Number(e.target.value))}
          label={t("ui_club2.ov.range")} sx={{ ...S.field, minWidth: 160 }}>
          {RANGES.map((r) => <MenuItem key={r} value={r}>{t("ui_club2.ov.last_days", { n: r })}</MenuItem>)}
        </TextField>
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)", lg: "repeat(6, 1fr)" }, gap: 1.5, mb: 2 }}>
        <Stat C={C} label={t("ui_club2.ov.members")} value={n(d.members_total)} sub={t("ui_club2.ov.new_n", { n: n(d.members_new) })} />
        <Stat C={C} label={t("ui_club2.ov.active")} value={n(d.members_active)} sub={t("ui_club2.ov.purchases_n", { n: n(d.purchases) })} />
        <Stat C={C} label={t("ui_club2.ov.revenue")} value={n(d.revenue)} sub={`${t("ui_club2.ov.avg_basket")}: ${n(d.avg_basket)}`} />
        <Stat C={C} label={t("ui_club2.ov.retention")} value={pct(d.retention_rate)} sub={`${t("ui_club2.ov.repeat")}: ${pct(d.repeat_rate)}`} />
        <Stat C={C} label={t("ui_club2.ov.issued")} value={n(d.points_issued)}
          sub={`${t("ui_club2.ov.redeemed")}: ${n(d.points_redeemed)} · ${t("ui_club2.ov.expired")}: ${n(d.points_expired)}`} />
        <Stat C={C} label={t("ui_club2.ov.liability")} value={n(d.liability)}
          sub={`${n(d.points_outstanding)} ${t("ui_club2.points")}${d.wallet_liability ? ` · ${t("ui_club2.wallet")}: ${n(d.wallet_liability)}` : ""}`} />
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
        <Box sx={S.card}>
          <Typography sx={{ color: C.text, fontWeight: 800, mb: 1.5 }}>{t("ui_club2.ov.segments")}</Typography>
          <Bars C={C} onPick={onSegment} rows={SEGMENTS.map((s) => ({
            key: s, label: t(`ui_club2.seg.${s}`), value: d.segments[s] || 0, text: n(d.segments[s] || 0), color: segColor[s],
          }))} />
        </Box>
        <Box sx={S.card}>
          <Typography sx={{ color: C.text, fontWeight: 800, mb: 0.5 }}>{t("ui_club2.ov.rfm")}</Typography>
          <Bars C={C} rows={RFM.filter((k) => d.rfm[k]).map((k) => ({
            key: k, label: t(`ui_club2.rfm.${k}`), value: d.rfm[k], text: n(d.rfm[k]),
          }))} />
          {!RFM.some((k) => d.rfm[k]) && <Typography sx={{ color: C.muted }}>{t("ui_club2.none")}</Typography>}
        </Box>
        <Box sx={S.card}>
          <Typography sx={{ color: C.text, fontWeight: 800, mb: 1.5 }}>{t("ui_club2.ov.tiers")}</Typography>
          {d.tiers.length === 0 ? <Typography sx={{ color: C.muted }}>{t("ui_club2.ov.no_tiers")}</Typography>
            : <Bars C={C} rows={d.tiers.map((x) => ({ key: x.id, label: x.name, value: x.count, text: n(x.count), color: x.color || undefined }))} />}
        </Box>
        <Box sx={S.card}>
          <Typography sx={{ color: C.text, fontWeight: 800, mb: 1.5 }}>{t("ui_club2.ov.top")}</Typography>
          {d.top_members.length === 0 ? <Typography sx={{ color: C.muted }}>{t("ui_club2.none")}</Typography>
            : d.top_members.map((m, i) => (
              <Box key={m.id} sx={{ display: "flex", gap: 1, py: 0.5, borderBottom: `1px solid ${C.divider}` }}>
                <Typography sx={{ color: C.muted, width: 20 }}>{n(i + 1)}</Typography>
                <Typography sx={{ color: C.text, flex: 1, minWidth: 0 }} noWrap>{m.name || <span dir="ltr">{m.phone}</span>}</Typography>
                <Typography sx={{ color: C.text, fontWeight: 700 }}>{n(m.spent)}</Typography>
              </Box>
            ))}
        </Box>
      </Box>
    </Box>
  );
}
