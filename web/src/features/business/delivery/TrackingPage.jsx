import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Box, Typography, Button, CircularProgress } from "@mui/material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import { buildColors } from "@shared/palette";
import { fetchTracking } from "./api";
import { stopStatusColor, fmtTime, fmtDateTime } from "./common";
import LiveMap from "./LiveMap";

const POLL_MS = 15000;

/** Public customer tracking page (`/t/:token`) — shows no internal data. */
export default function TrackingPage() {
  const { token } = useParams();
  const { t } = useTranslation();
  const { mode } = useThemeMode();
  const { isRtl, lang } = useLang();
  const C = useMemo(() => buildColors(mode === "dark"), [mode]);

  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");   // loading | ok | notfound | error

  useEffect(() => {
    let alive = true;
    let ctrl = null;
    const load = () => {
      if (document.hidden) return;
      ctrl?.abort();
      ctrl = new AbortController();
      fetchTracking(token, ctrl.signal)
        .then((d) => { if (alive) { setData(d); setState("ok"); } })
        .catch((e) => {
          if (!alive || e?.name === "AbortError") return;
          if (e.status === 404) setState("notfound");
          else setState((s) => (s === "ok" ? s : "error"));
        });
    };
    load();
    const id = setInterval(load, POLL_MS);
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      ctrl?.abort();
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [token]);

  const card = { bgcolor: C.glass, border: `1px solid ${C.glassBorder}`, borderRadius: 3, p: 2, boxShadow: C.cardShadow };
  const done = data && (data.status === "delivered" || data.status === "failed");
  const points = data?.position ? [{ id: 1, type: "driver", name: data.driver?.name || "", lat: data.position.lat, lng: data.position.lng }] : [];
  const dest = data?.destination ? [{ id: 1, lat: data.destination.lat, lng: data.destination.lng, status: data.status }] : [];
  const color = data ? stopStatusColor(C, data.status) : C.muted;

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ minHeight: "100vh", bgcolor: C.bg, p: 2, maxWidth: 480, mx: "auto", fontFamily: "'Vazirmatn', sans-serif" }}>
      {state === "loading" && <Box sx={{ textAlign: "center", py: 8 }}><CircularProgress /></Box>}
      {state === "notfound" && (
        <Box sx={{ ...card, textAlign: "center", py: 5 }}>
          <Typography sx={{ fontSize: 40 }}>🔍</Typography>
          <Typography sx={{ color: C.text, fontWeight: 700 }}>{t("ui_del.track.not_found")}</Typography>
        </Box>
      )}
      {state === "error" && (
        <Box sx={{ ...card, textAlign: "center", py: 5 }}>
          <Typography sx={{ color: C.danger, fontWeight: 700 }}>{t("ui_del.track.error")}</Typography>
        </Box>
      )}

      {state === "ok" && data && (
        <Box sx={{ display: "grid", gap: 2 }}>
          <Typography sx={{ color: C.sub, fontSize: 14, fontWeight: 700, textAlign: "center" }}>{data.business}</Typography>

          <Box sx={{ ...card, textAlign: "center", py: 3 }}>
            <Typography sx={{ color: C.sub, fontSize: 12 }}>{t("ui_del.track.status")}</Typography>
            <Typography sx={{ color, fontWeight: 800, fontSize: 32, lineHeight: 1.4 }}>
              {t(`ui_del.stop_status.${data.status}`)}
            </Typography>
            {!done && data.eta && (
              <Typography sx={{ color: C.text, fontSize: 16, mt: 1 }}>
                {t("ui_del.track.eta")}: <b>{fmtTime(data.eta, lang)}</b>
              </Typography>
            )}
            {data.status === "delivered" && data.delivered_at && (
              <Typography sx={{ color: C.text, fontSize: 15, mt: 1 }}>
                {t("ui_del.track.delivered_at")}: <b>{fmtDateTime(data.delivered_at, lang)}</b>
              </Typography>
            )}
            {data.status === "failed" && data.failure_reason && (
              <Typography sx={{ color: C.danger, fontSize: 15, mt: 1 }}>
                {t("ui_del.track.failure_reason")}: {data.failure_reason}
              </Typography>
            )}
          </Box>

          {(data.driver?.name || data.vehicle) && (
            <Box sx={card}>
              {data.driver?.name && (
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                  <Box>
                    <Typography sx={{ color: C.sub, fontSize: 12 }}>{t("ui_del.track.driver")}</Typography>
                    <Typography sx={{ color: C.text, fontWeight: 700, fontSize: 18 }}>{data.driver.name}</Typography>
                  </Box>
                  {data.driver.phone && !done && (
                    <Button component="a" href={`tel:${data.driver.phone}`} variant="contained"
                      sx={{ minHeight: 48, px: 3, borderRadius: 3, fontWeight: 700, background: C.btnGrad, color: C.onPrimary }}>
                      📞 {t("ui_del.track.call")}
                    </Button>
                  )}
                </Box>
              )}
              {data.vehicle && (
                <Typography sx={{ color: C.sub, fontSize: 13, mt: 1 }}>{t("ui_del.track.vehicle")}: {data.vehicle}</Typography>
              )}
            </Box>
          )}

          {data.position && !done && (
            <Box sx={card}>
              <Typography sx={{ color: C.text, fontWeight: 700, mb: 1 }}>{t("ui_del.track.position")}</Typography>
              <LiveMap ctx={{ t, C }} points={points} stops={dest} />
            </Box>
          )}

          {data.amount_due > 0 && !done && (
            <Typography sx={{ color: C.sub, fontSize: 12, textAlign: "center" }}>
              {t("ui_del.track.amount_due", { v: Number(data.amount_due).toLocaleString(lang === "fa" ? "fa-IR" : "en-US") })}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
