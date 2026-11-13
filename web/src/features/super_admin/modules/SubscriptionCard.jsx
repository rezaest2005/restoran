import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Box, Button, Chip, MenuItem, TextField, Typography } from "@mui/material";
import superClient from "@super/api/super_client";

const unwrap = (r) => r.data?.data ?? r.data;
const PLANS = ["unlimited", "monthly", "quarterly", "semiannual", "yearly", "custom"];
const DAY = 86400;

function leftText(sec, fa, t) {
  const nf = new Intl.NumberFormat(fa ? "fa-IR" : "en", { minimumIntegerDigits: 2, useGrouping: false });
  const d = Math.floor(sec / DAY);
  const r = sec % DAY;
  const hms = [Math.floor(r / 3600), Math.floor((r % 3600) / 60), r % 60].map((n) => nf.format(n)).join(":");
  return d > 0 ? `${new Intl.NumberFormat(fa ? "fa-IR" : "en").format(d)} ${t("ui_sub.days")} ${t("ui_sub.and")} ${hms}` : hms;
}

/** Whole-dashboard subscription of the selected business: fixed periods or an exact date/time, set or extend. */
export default function SubscriptionCard({ bid, C }) {
  const { t, i18n } = useTranslation();
  const fa = i18n.language !== "en";
  const [state, setState] = useState(null);
  const [plan, setPlan] = useState("monthly");
  const [mode, setMode] = useState("set");
  const [custom, setCustom] = useState("");
  const [msg, setMsg] = useState(null);
  const [tick, setTick] = useState(() => Date.now());
  const [loadedAt, setLoadedAt] = useState(() => Date.now());

  const adopt = useCallback((d) => { setState(d); setLoadedAt(Date.now()); setTick(Date.now()); }, []);

  useEffect(() => {
    if (bid == null) return undefined;
    let alive = true;
    superClient.get(`/api/super/businesses/${bid}/subscription/`).then((r) => { if (alive) adopt(unwrap(r)); }).catch(() => {});
    return () => { alive = false; };
  }, [bid, adopt]);

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const apply = async () => {
    const body = { plan, mode };
    if (plan === "custom") {
      if (!custom) { setMsg({ type: "error", text: t("ui_sub.need_date") }); return; }
      body.ends_at = new Date(custom).toISOString();
    }
    try {
      const r = await superClient.post(`/api/super/businesses/${bid}/subscription/`, body);
      adopt(unwrap(r));
      setMsg({ type: "success", text: t("ui_sub.saved") });
    } catch (e) {
      setMsg({ type: "error", text: e.response?.data?.error || t("ui_k.error") });
    }
  };

  const secondsLeft = state && !state.unlimited ? Math.max(0, state.seconds_left - Math.floor((tick - loadedAt) / 1000)) : null;
  const ends = state?.ends_at ? new Date(state.ends_at).toLocaleString(fa ? "fa-IR" : "en-GB", { dateStyle: "medium", timeStyle: "medium" }) : "";

  return (
    <Box sx={{ border: `1px solid ${C.glassBorder}`, borderRadius: "12px", p: 2, mb: 3 }}>
      <Typography sx={{ fontWeight: 800, color: C.text, mb: 1 }}>{t("ui_sub.title")}</Typography>
      {msg && <Alert severity={msg.type} sx={{ mb: 1.5 }} onClose={() => setMsg(null)}>{msg.text}</Alert>}
      {state && (
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mb: 2, color: C.text }}>
          <Chip size="small" label={state.plan_display || t(`ui_sub.plan.${state.plan}`)} />
          {state.unlimited ? (
            <Typography sx={{ fontSize: 13 }}>{t("ui_sub.no_end")}</Typography>
          ) : state.expired || secondsLeft === 0 ? (
            <Chip size="small" color="error" label={`${t("ui_sub.expired")} — ${ends}`} />
          ) : (
            <>
              <Typography dir="ltr" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{leftText(secondsLeft, fa, t)}</Typography>
              <Typography sx={{ fontSize: 12, opacity: 0.8 }}>{t("ui_sub.ends")}: {ends}</Typography>
            </>
          )}
        </Box>
      )}
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <TextField select size="small" label={t("ui_sub.plan_label")} value={plan} onChange={(e) => setPlan(e.target.value)} sx={{ minWidth: 190 }}>
          {PLANS.map((p) => <MenuItem key={p} value={p}>{t(`ui_sub.plan.${p}`)}</MenuItem>)}
        </TextField>
        {plan !== "unlimited" && plan !== "custom" && (
          <TextField select size="small" label={t("ui_sub.mode_label")} value={mode} onChange={(e) => setMode(e.target.value)} sx={{ minWidth: 220 }}>
            <MenuItem value="set">{t("ui_sub.mode_set")}</MenuItem>
            <MenuItem value="extend">{t("ui_sub.mode_extend")}</MenuItem>
          </TextField>
        )}
        {plan === "custom" && (
          <TextField size="small" type="datetime-local" label={t("ui_sub.custom_label")} value={custom}
            onChange={(e) => setCustom(e.target.value)} slotProps={{ htmlInput: { step: 1, dir: "ltr" }, inputLabel: { shrink: true } }} />
        )}
        <Button variant="contained" onClick={apply} disabled={bid == null}>{t("ui_sub.apply")}</Button>
      </Box>
      <Typography sx={{ fontSize: 12, color: C.muted, mt: 1.5 }}>{t("ui_sub.hint")}</Typography>
    </Box>
  );
}
