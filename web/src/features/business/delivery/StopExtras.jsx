import { useState } from "react";
import { Box, Typography, Button, Chip, Link as MuiLink } from "@mui/material";
import { fmtInt, fmtMoney } from "@business/accounting/common";
import { priorityColor, stopStatusColor, fmtTime, fmtDateTime } from "./common";

/** Generic shipment details of one stop for the dispatcher: packages, priority, window, proof of delivery, timeline. */
export default function StopExtras({ ctx, stop: s }) {
  const { t, C, lang } = ctx;
  const [open, setOpen] = useState(false);
  const events = s.events || [];
  const chip = (label, color) => (
    <Chip size="small" label={label} sx={{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: "transparent", color, border: `1px solid ${color}` }} />
  );
  return (
    <Box sx={{ mt: 0.5 }}>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, alignItems: "center", color: C.sub, fontSize: 12 }}>
        {s.priority > 0 && chip(t(`dlv.stop.priority_${s.priority}`), priorityColor(C, s.priority))}
        {s.packages > 1 && <span>{t("dlv.stop.packages_n", { n: fmtInt(s.packages, lang) })}</span>}
        {s.fee > 0 && <span>{t("dlv.stop.fee")}: {fmtMoney(s.fee, lang)}</span>}
        {(s.window_start || s.window_end) && (
          <span>{t("dlv.stop.window", { from: s.window_start ? fmtTime(s.window_start, lang) : "—", to: s.window_end ? fmtTime(s.window_end, lang) : "—" })}</span>
        )}
        {s.require_otp && s.otp_code && s.status !== "delivered" && <span dir="ltr">{t("dlv.stop.otp", { code: s.otp_code })}</span>}
        {s.attempts > 0 && <span style={{ color: C.danger }}>{t("dlv.stop.attempts", { n: fmtInt(s.attempts, lang) })}</span>}
      </Box>
      {s.instructions && <Typography sx={{ color: C.sub, fontSize: 12 }}>📝 {s.instructions}</Typography>}
      {s.status === "failed" && s.failure_code && (
        <Typography sx={{ color: C.danger, fontSize: 12 }}>{t(`dlv.fail.${s.failure_code}`, { defaultValue: s.failure_code })}</Typography>
      )}
      {(s.recipient_name || s.pod_photo || s.pod_signature) && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, fontSize: 12, color: C.sub, mt: 0.25 }}>
          {s.recipient_name && <span>{t("dlv.stop.recipient", { name: s.recipient_name })}</span>}
          {s.pod_photo && <MuiLink href={s.pod_photo} target="_blank" rel="noreferrer" sx={{ color: C.primary }}>{t("dlv.stop.photo")}</MuiLink>}
          {s.pod_signature && <MuiLink href={s.pod_signature} target="_blank" rel="noreferrer" sx={{ color: C.primary }}>{t("dlv.stop.signature")}</MuiLink>}
        </Box>
      )}
      {events.length > 0 && (
        <>
          <Button size="small" onClick={() => setOpen((v) => !v)} sx={{ px: 0.5, minWidth: 0, fontSize: 11, color: C.primary, textTransform: "none" }}>
            {t("dlv.stop.timeline")} ({fmtInt(events.length, lang)})
          </Button>
          {open && (
            <Box component="ol" sx={{ m: 0, ps: 2.5, color: C.sub, fontSize: 12 }}>
              {events.map((e, i) => (
                <li key={i}>
                  <span style={{ color: stopStatusColor(C, e.status), fontWeight: 700 }}>{t(`ui_del.stop_status.${e.status}`, { defaultValue: e.status })}</span>
                  {` · ${fmtDateTime(e.at, lang)}`}{e.actor ? ` · ${e.actor}` : ""}{e.note && e.note !== "created" ? ` · ${e.note}` : ""}
                </li>
              ))}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
