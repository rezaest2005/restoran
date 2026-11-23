// Helpers that turn a cart into an outbox order and local rows into the shapes the cashier screens already use.
import { shortId } from "./syncEngine";

const p2 = (n) => String(n).padStart(2, "0");
const stamp = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;

export const serverPrice = (p) => (Number(p?.final_price) > 0 ? Number(p.final_price) : Number(p?.price) || 0);

/** items: [{food_id, quantity, price, ...}] as the cart produces them; products: local product rows. */
export function buildLocalOrder({ items, form, products, businessName }) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines = [];
  const snap = [];
  for (const it of items) {
    const id = it.food_id ?? it.id;
    const qty = Number(it.quantity || it.qty || 1);
    const price = Number(it.effective_price ?? it.price ?? 0);
    const p = byId.get(id);
    lines.push({ id, food_id: id, quantity: qty, price, ...(p ? { base_price: serverPrice(p) } : {}),
      ...(!id ? { item_name: it.item_name } : {}) });
    snap.push({ food_id: id, name: p?.name || it.item_name || "", name_en: p?.name_en || "", quantity: qty, price,
      base_price: p ? serverPrice(p) : undefined });
  }
  const payload = {
    items: lines, customer_name: form.customerName || "مشتری", phone: form.phone || "", table_id: form.tableId || null,
    source: "pos", payment_method: form.paymentMethod, order_type: form.orderType || "",
    ...(form.orderType === "delivery" && form.delivery ? {
      delivery_address: (form.delivery.address || "").trim(), driver_id: form.delivery.driverId || null,
      cod: !!form.delivery.cod } : {}),
  };
  const total = snap.reduce((s, l) => s + l.price * l.quantity, 0);
  const snapshot = { items: snap, total, customer_name: payload.customer_name, phone: payload.phone,
    payment_method: payload.payment_method, order_type: payload.order_type,
    delivery_address: payload.delivery_address || "", cod: !!payload.cod, business_name: businessName || "" };
  return { payload, snapshot };
}

export const localNumber = (row) => `L-${shortId(row.id)}`;

/** What the checkout dialog / receipt expects after creating an order. */
export function receiptOf(row) {
  const s = row.snapshot || {};
  const d = new Date(row.createdAt);
  return {
    success: true, local: true, order_id: localNumber(row), local_id: row.id,
    customer_name: s.customer_name, phone: s.phone, total_price: s.total,
    items: (s.items || []).map((l) => ({ name: l.name, name_en: l.name_en, quantity: l.quantity, price: l.price, line_total: l.price * l.quantity })),
    created_at: stamp(d), created_at_iso: d.toISOString(), business_name: s.business_name,
    payment_method: s.payment_method, payment_status: s.cod ? "pending" : "paid", order_type: s.order_type,
    delivery_address: s.delivery_address, dispatch: null, sync_state: row.status,
  };
}

/** A daily-report row (same keys as /api/pos/daily-orders/) with a sync_state badge. */
export function reportRowOfOutbox(row) {
  const s = row.snapshot || {};
  return {
    id: localNumber(row), local: true, outbox_id: row.id, sync_state: row.status, sync_error: row.error || "",
    customer_name: s.customer_name || "", customer_name_en: "", phone: s.phone || "", total_price: s.total || 0,
    items: (s.items || []).map((l) => ({ name: l.name, name_en: l.name_en, quantity: l.quantity, price: l.price, line_total: l.price * l.quantity })),
    status: "pending", created_at: stamp(new Date(row.createdAt)), payment_method: s.payment_method || "cash", source: "pos",
  };
}

export function reportRowOfOrder(o, productsById) {
  return {
    id: o.id, sync_state: "synced", customer_name: o.customer_name || "", customer_name_en: o.customer_name_en || "",
    phone: o.phone || "", total_price: o.total_price,
    items: (o.items || []).map((l) => {
      const p = l.food_id ? productsById.get(l.food_id) : null;
      return { name: p?.name || l.name || "—", name_en: p?.name_en || l.name_en || "", quantity: l.quantity, price: l.price, line_total: l.price * l.quantity };
    }),
    status: o.status, created_at: stamp(new Date(o.created_at)), payment_method: o.payment_method || "cash", source: o.source || "pos",
  };
}

export const dayOf = (iso) => stamp(new Date(iso)).slice(0, 10);
