import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, Typography, Dialog, DialogTitle, DialogContent, DialogActions, Button } from "@mui/material";
import { useLang } from "@shared/contexts/LangContext";
import client from "../api/client";

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

function formatLeft(left, lang) {
  const nf = new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en", { minimumIntegerDigits: 2, useGrouping: false });
  const days = Math.floor(left / DAY);
  const rest = left % DAY;
  const hms = [Math.floor(rest / 3600), Math.floor((rest % 3600) / 60), rest % 60].map((n) => nf.format(n)).join(":");
  return { days, hms };
}

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
  const { days, hms } = formatLeft(left, lang);
  const nfDays = new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en").format(days);
  const timeText = days > 0 ? `${nfDays} ${t("ui_sub.days")} ${t("ui_sub.and")} ${hms}` : hms;
  const tone = left <= DAY ? C.danger : left <= 7 * DAY ? C.warning : C.info;
  const endText = new Date(endMs).toLocaleString(lang === "fa" ? "fa-IR" : "en-GB", { dateStyle: "medium", timeStyle: "medium" });

  return (
    <>
      <Box role="status" aria-live="off" sx={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, flexWrap: "wrap",
        px: { xs: 1.5, md: 3 }, py: 0.9,
        bgcolor: `color-mix(in srgb, ${tone} 13%, transparent)`, color: tone,
        borderBottom: `1px solid color-mix(in srgb, ${tone} 35%, transparent)`,
      }}>
        <Typography sx={{ fontWeight: 800, fontSize: 13 }}>
          {t("ui_sub.left_label")}{" "}
          <Box component="span" dir="ltr" sx={{ fontVariantNumeric: "tabular-nums", fontSize: 15 }}>{timeText}</Box>
        </Typography>
        <Typography sx={{ fontSize: 12, opacity: 0.9 }}>
          {left <= 7 * DAY ? t("ui_sub.warn") : `${t("ui_sub.ends")}: ${endText}`}
        </Typography>
      </Box>

      <Dialog open={remind && !over} onClose={() => setRemind(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: tone }}>{t("ui_sub.remind_title")}</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1.5 }}>{t("ui_sub.remind_text", { time: timeText })}</Typography>
          <Typography sx={{ fontSize: 13, opacity: 0.8 }}>{t("ui_sub.ends")}: {endText}</Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setRemind(false)}>{t("ui_sub.ok")}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={over} fullScreen disableEscapeKeyDown>
        <Box sx={{ minHeight: "100%", display: "grid", placeItems: "center", textAlign: "center", p: 3 }}>
          <Box sx={{ maxWidth: 460 }}>
            <Typography sx={{ fontWeight: 900, fontSize: 26, color: C.danger, mb: 1.5 }}>{t("ui_sub.expired_title")}</Typography>
            <Typography sx={{ mb: 1 }}>{t("ui_sub.expired_text")}</Typography>
            <Typography sx={{ fontSize: 13, opacity: 0.75, mb: 3 }}>{t("ui_sub.ended_at")}: {endText}</Typography>
            <Button variant="contained" onClick={onLogout}>{t("ui_sub.logout")}</Button>
          </Box>
        </Box>
      </Dialog>
    </>
  );
}
