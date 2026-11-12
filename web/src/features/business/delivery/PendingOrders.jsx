import { useState, useEffect, useCallback } from "react";
import { Box, Typography, Button, Checkbox, Chip } from "@mui/material";
import { fmtMoney } from "@business/accounting/common";
import { fetchPendingOrders } from "./api";

/**
 * Dispatch queue: delivery orders rung up at the POS that are not on any trip yet.
 * The dispatcher ticks one or more and turns them into a single trip (address, phone and the
 * cash-on-delivery amount are filled from the order).
 */
export default function PendingOrders({ ctx, refreshKey, onDispatch }) {
  const { t, C, S, lang } = ctx;
  const [rows, setRows] = useState([]);
  const [picked, setPicked] = useState({});

  const load = useCallback(() => {
    fetchPendingOrders().then((d) => setRows(Array.isArray(d) ? d : [])).catch(() => setRows([]));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, 20000);
    return () => clearInterval(id);
  }, [load, refreshKey]);

  if (rows.length === 0) return null;
  const chosen = rows.filter((r) => picked[r.id]);
  const go = (list) => onDispatch(list.map((o) => ({
    order_id: o.id, customer_name: o.customer_name, phone: o.phone, address: o.address,
    reference: `#${o.id}`, amount_due: o.cod ? String(Math.round(o.total)) : "",
  })));

  return (
    <Box sx={{ ...S.card, mb: 2, borderColor: C.accent }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap", mb: 1 }}>
        <Typography sx={{ fontWeight: 800, color: C.text }}>
          {t("ui_del.queue.title")} <Chip size="small" label={rows.length} sx={{ ml: 0.5, bgcolor: C.accentSubtle, color: C.accent }} />
        </Typography>
        <Button sx={S.btn} disabled={chosen.length === 0} onClick={() => go(chosen)}>
          {t("ui_del.queue.make_trip", { n: chosen.length })}
        </Button>
      </Box>
      {rows.map((o) => (
        <Box key={o.id} sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.75, borderTop: `1px solid ${C.divider}` }}>
          <Checkbox size="small" checked={!!picked[o.id]} onChange={(e) => setPicked((p) => ({ ...p, [o.id]: e.target.checked }))}
            slotProps={{ input: { "aria-label": `#${o.id}` } }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ color: C.text, fontSize: 13, fontWeight: 700 }}>
              #{o.id} · {o.customer_name} {o.phone && <span dir="ltr">· {o.phone}</span>}
            </Typography>
            <Typography sx={{ color: C.sub, fontSize: 12 }}>{o.address}</Typography>
          </Box>
          <Box sx={{ textAlign: "end" }}>
            <Typography sx={{ color: C.text, fontSize: 13, fontWeight: 700 }}>{fmtMoney(o.total, lang)}</Typography>
            <Chip size="small" label={o.cod ? t("ui_del.queue.cod") : t("ui_del.queue.paid")}
              sx={{ height: 20, fontSize: 10, bgcolor: o.cod ? C.warningBg : C.successBg, color: o.cod ? C.warning : C.success }} />
          </Box>
          <Button size="small" onClick={() => go([o])}>{t("ui_del.queue.one")}</Button>
        </Box>
      ))}
    </Box>
  );
}
