import { useState, useEffect, useCallback } from "react";
import { Box, Typography, Button, Checkbox, Chip } from "@mui/material";
import { fmtMoney } from "@business/accounting/common";
import { fetchPendingOrders, fetchDispatchable } from "./api";

/**
 * "Waiting to be sent" — everything that is ready to go on a trip but is not on one yet:
 *   • courier orders rung up at the POS,
 *   • warehouse sales invoices (goods going out to a customer with the business's own courier / truck),
 *   • warehouse purchase invoices (the business's own truck fetches goods from the supplier).
 * The dispatcher ticks any mix and turns it into one trip; addresses, phones, cargo text and the
 * cash-on-delivery amount are filled from the documents.
 */
export default function PendingOrders({ ctx, refreshKey, onDispatch }) {
  const { t, C, S, lang } = ctx;
  const [orders, setOrders] = useState([]);
  const [docs, setDocs] = useState({ sales: [], purchases: [] });
  const [picked, setPicked] = useState({});          // "o:12" | "s:3" | "p:7" -> true

  const load = useCallback(() => {
    fetchPendingOrders().then((d) => setOrders(Array.isArray(d) ? d : [])).catch(() => setOrders([]));
    fetchDispatchable().then((d) => setDocs({ sales: d?.sales || [], purchases: d?.purchases || [] })).catch(() => setDocs({ sales: [], purchases: [] }));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, 20000);
    return () => clearInterval(id);
  }, [load, refreshKey]);

  const total = orders.length + docs.sales.length + docs.purchases.length;
  if (total === 0) return null;

  // one flat list, each row knows how to become a trip stop
  const rows = [
    ...orders.map((o) => ({
      key: `o:${o.id}`, kind: "order", title: `#${o.id} · ${o.customer_name}`, phone: o.phone, address: o.address, items: "",
      money: o.total, tag: o.cod ? "cod" : "paid",
      stop: { order_id: o.id, customer_name: o.customer_name, phone: o.phone, address: o.address, reference: `#${o.id}`, amount_due: o.cod ? String(Math.round(o.total)) : "" },
    })),
    ...docs.sales.map((i) => ({
      key: `s:${i.id}`, kind: "sale", title: `${t("ui_del.queue.sale")} ${i.number || i.id} · ${i.customer_name}`, phone: i.phone, address: i.address, items: i.items,
      money: i.total, tag: i.remaining > 0 ? "owed" : "paid",
      stop: { invoice_id: i.id, cod: i.remaining > 0, customer_name: i.customer_name, phone: i.phone, address: i.address, cargo_description: i.items, reference: `${t("ui_del.queue.sale")} ${i.number || i.id}`, amount_due: i.remaining > 0 ? String(Math.round(i.remaining)) : "" },
    })),
    ...docs.purchases.map((i) => ({
      key: `p:${i.id}`, kind: "purchase", title: `${t("ui_del.queue.purchase")} ${i.number || i.id} · ${i.supplier_name}`, phone: i.phone, address: i.address, items: i.items,
      money: null, tag: "pickup",
      stop: { purchase_id: i.id, stop_type: "pickup", customer_name: i.supplier_name, phone: i.phone, address: i.address, cargo_description: i.items, reference: `${t("ui_del.queue.purchase")} ${i.number || i.id}` },
    })),
  ];
  const chosen = rows.filter((r) => picked[r.key]);
  const go = (list) => onDispatch(list.map((r) => r.stop));

  const tagStyle = (tag) => ({
    cod: { label: t("ui_del.queue.cod"), bg: C.warningBg, color: C.warning },
    owed: { label: t("ui_del.queue.cod"), bg: C.warningBg, color: C.warning },
    paid: { label: t("ui_del.queue.paid"), bg: C.successBg, color: C.success },
    pickup: { label: t("ui_del.queue.pickup"), bg: C.infoBg, color: C.info },
  }[tag]);

  return (
    <Box sx={{ ...S.card, mb: 2, borderColor: C.accent }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap", mb: 0.5 }}>
        <Typography sx={{ fontWeight: 800, color: C.text }}>
          {t("ui_del.queue.title")} <Chip size="small" label={total} sx={{ ml: 0.5, bgcolor: C.accentSubtle, color: C.accent }} />
        </Typography>
        <Button sx={S.btn} disabled={chosen.length === 0} onClick={() => go(chosen)}>
          {t("ui_del.queue.make_trip", { n: chosen.length })}
        </Button>
      </Box>
      <Typography sx={{ color: C.sub, fontSize: 12, mb: 1 }}>{t("ui_del.queue.hint")}</Typography>

      {rows.map((r) => {
        const tag = tagStyle(r.tag);
        return (
          <Box key={r.key} sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.75, borderTop: `1px solid ${C.divider}` }}>
            <Checkbox size="small" checked={!!picked[r.key]} onChange={(e) => setPicked((p) => ({ ...p, [r.key]: e.target.checked }))}
              slotProps={{ input: { "aria-label": r.title } }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ color: C.text, fontSize: 13, fontWeight: 700 }}>
                {r.title} {r.phone && <span dir="ltr">· {r.phone}</span>}
              </Typography>
              <Typography sx={{ color: C.sub, fontSize: 12 }}>{r.address || t("ui_del.queue.no_address")}</Typography>
              {r.items && <Typography sx={{ color: C.sub, fontSize: 12 }}>{r.items}</Typography>}
            </Box>
            <Box sx={{ textAlign: "end" }}>
              {r.money != null && <Typography sx={{ color: C.text, fontSize: 13, fontWeight: 700 }}>{fmtMoney(r.money, lang)}</Typography>}
              <Chip size="small" label={tag.label} sx={{ height: 20, fontSize: 10, bgcolor: tag.bg, color: tag.color }} />
            </Box>
            <Button size="small" onClick={() => go([r])}>{r.kind === "purchase" ? t("ui_del.queue.send_truck") : t("ui_del.queue.one")}</Button>
          </Box>
        );
      })}
    </Box>
  );
}
