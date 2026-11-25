import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, Typography, Dialog, DialogTitle, DialogContent, DialogActions, Button } from "@mui/material";
import { useLang } from "@shared/contexts/LangContext";
import client from "../api/client";
import { countdownParts, durationText, formatPart } from "./countdown";

const DAY = 86400;
const readStored = () => {
  try { return JSON.parse(sessionStorage.getItem("user") || "{}").subscription || null; } catch { return null; }
};

/** How often the reminder pops up, by time left (seconds): 0 = never. */
const everySeconds = (left) => {
  if (left <= 600) return 60;
  if (left <= 3600) return 300;
  if (left <= DAY) return 900;
  if (left <= 7 * DAY) return 3600;
  return 0;
};

/**
 * Subscription countdown above the dashboard.
 * - unlimited plan: nothing is shown
 * - always: the exact time left, ticking every second (counted against the SERVER clock)
 * - 7 days or less: warning colour and a reminder window that returns more and more often
 * - at zero: the dashboard is covered by a screen that cannot be closed (the API refuses everything as well)
 */
export default function SubscriptionGuard({ C, onLogout }) {
  const { t } = useTranslation();
  const { lang } = useLang();
  const [sub, setSub] = useState(readStored);
  const [offset, setOffset] = useState(() => {
    const s = readStored();
    return s?.server_now ? Date.parse(s.server_now) - Date.now() : 0;
  });
  const [now, setNow] = useState(() => Date.now());
  const [over, setOver] = useState(false);
  const [remind, setRemind] = useState(false);
  const last = useRef(Number(sessionStorage.getItem("sub_last_remind") || 0));

  const load = useCallback(() => {
    client.get("/api/business/subscription/").then((r) => r.data?.data ?? r.data).then((d) => {
      setSub(d);
      setOffset(Date.parse(d.server_now) - Date.now());
      setOver(!!d.expired);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);          // a renewal made by the super admin shows up without signing in again
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const h = () => setOver(true);
    window.addEventListener("bizsuite:subscription-expired", h);
    return () => window.removeEventListener("bizsuite:subscription-expired", h);
  }, []);

  const endMs = sub?.ends_at ? Date.parse(sub.ends_at) : null;

  useEffect(() => {
    const tick = () => {
      const t0 = Date.now();
      setNow(t0);
      if (endMs == null) return;
      const l = Math.floor((endMs - (t0 + offset)) / 1000);
      if (l <= 0) { setOver(true); return; }
      const every = everySeconds(l);
      if (every && (t0 - last.current) / 1000 >= every) {
        last.current = t0;
        try { sessionStorage.setItem("sub_last_remind", String(t0)); } catch { /* ignore */ }
        setRemind(true);
      }
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endMs, offset]);

  if (!sub || sub.unlimited || endMs == null) return null;

  const left = Math.max(0, Math.floor((endMs - (now + offset)) / 1000));
  const parts = countdownParts(left);
  const unitName = (u, n) => t(`ui_sub.unit.${u}`, { count: n });
  const timeText = durationText(left, lang, (u) => unitName(u, parts.find((p) => p.unit === u).value));
  const tone = left <= DAY ? C.danger : left <= 7 * DAY ? C.warning : C.info;
  const loc = lang === "fa" ? "fa-IR" : "en-GB";
  const endDate = new Date(endMs);
  const dir = lang === "fa" ? "rtl" : "ltr";
  // date and clock are separate isolated pieces so their order and digits never depend on bidi mixing
  const endNode = (
    <bdi dir={dir}>
      <bdi dir={dir}>{endDate.toLocaleDateString(loc, { dateStyle: "medium" })}</bdi>{lang === "fa" ? "، " : ", "}
      <bdi dir="ltr">{endDate.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })}</bdi>
    </bdi>
  );

  return (
    <>
      <Box role="status" aria-live="off" sx={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, flexWrap: "wrap",
        px: { xs: 1.5, md: 3 }, py: 0.9,
        bgcolor: `color-mix(in srgb, ${tone} 13%, transparent)`, color: tone,
        borderBottom: `1px solid color-mix(in srgb, ${tone} 35%, transparent)`,
      }}>
        <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 1.5, rowGap: 0.5 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 13 }}>{t("ui_sub.left_label")}</Typography>
          <Box dir={lang === "fa" ? "rtl" : "ltr"} role="timer" sx={{ display: "inline-flex", gap: 0.75 }}>
            {parts.map((p) => (
              <Box key={p.unit} sx={{
                display: "inline-flex", flexDirection: "column", alignItems: "center", minWidth: 46, px: 0.75, py: 0.25,
                borderRadius: 1, bgcolor: `color-mix(in srgb, ${tone} 14%, transparent)`,
              }}>
                <bdi dir="ltr" style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.25, fontVariantNumeric: "tabular-nums" }}>{formatPart(p, lang)}</bdi>
                <bdi style={{ fontSize: 11, lineHeight: 1.2, opacity: 0.9 }}>{unitName(p.unit, p.value)}</bdi>
              </Box>
            ))}
          </Box>
        </Box>
        {left > 7 * DAY && <Typography sx={{ fontSize: 12, opacity: 0.9 }}>{endNode}</Typography>}
      </Box>

      <Dialog open={remind && !over} onClose={() => setRemind(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: tone }}>{t("ui_sub.remind_title")}</DialogTitle>
        <DialogContent>
          <Typography>{t("ui_sub.remind_text", { time: timeText })}</Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setRemind(false)}>{t("ui_sub.ok")}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={over} fullScreen disableEscapeKeyDown>
        <Box sx={{ minHeight: "100%", display: "grid", placeItems: "center", textAlign: "center", p: 3 }}>
          <Box sx={{ maxWidth: 460 }}>
            <Typography sx={{ fontWeight: 900, fontSize: 26, color: C.danger, mb: 1.5 }}>{t("ui_sub.expired_title")}</Typography>
            <Typography sx={{ mb: 3 }}>{t("ui_sub.expired_text")}</Typography>
            <Button variant="contained" onClick={onLogout}>{t("ui_sub.logout")}</Button>
          </Box>
        </Box>
      </Dialog>
    </>
  );
}
