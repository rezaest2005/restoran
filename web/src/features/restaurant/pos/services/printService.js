/*
 * Browser printing for 80 mm thermal paper.
 * NOTE: printing straight to a network ESC/POS printer (TCP port 9100) needs a
 * server-side agent (browsers cannot open raw sockets), so it is out of scope here.
 * This module uses the OS print dialog / default printer via a hidden iframe.
 *
 * buildTicketHtml / escapeHtml are pure (no DOM) so they can be tested in plain node.
 */

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const fmt = (n) => {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString("en-US") : "0";
};

/**
 * labels: { productionTitle, receiptTitle, table, noTable, time, orderNo, customer, phone,
 *           note, product, qty, unitPrice, lineTotal, grandTotal, paymentStatus, paid,
 *           unpaid, currency, thanks }
 * opts: { isRtl, lang, businessName }
 */
export function buildTicketHtml(order, kind, labels, opts = {}) {
  const o = order || {};
  const L = labels || {};
  const isRtl = !!opts.isRtl;
  const dir = isRtl ? "rtl" : "ltr";
  const e = escapeHtml;
  const items = Array.isArray(o.items) ? o.items : [];
  const isProd = kind === "production";
  const name = (it) => (opts.lang === "en" && it.name_en) ? it.name_en : it.food_name;
  const tableTxt = o.table_number ? e(o.table_number) : e(L.noTable);

  const rows = items.map((it) => {
    const qty = Number(it.quantity) || 0;
    if (isProd) {
      return `<tr><td class="q">${e(qty)}&times;</td><td class="n">${e(name(it))}</td></tr>`;
    }
    const price = Number(it.price) || 0;
    return `<tr><td class="n">${e(name(it))}<div class="s">${e(qty)} &times; ${e(fmt(price))}</div></td>` +
      `<td class="p">${e(fmt(price * qty))}</td></tr>`;
  }).join("");

  const total = Number(o.total_price) || items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 0), 0);

  let body = "";
  if (isProd) {
    body += `<div class="c b">${e(L.productionTitle)}</div>`;
    body += `<div class="big c">${e(L.table)}: ${tableTxt}</div>`;
    body += `<div class="c">${e(L.time)}: ${e(o.created_at)}</div>`;
    body += `<div class="c">${e(L.orderNo)}: ${e(o.id)}</div><hr>`;
    body += `<table class="prod">${rows}</table>`;
    if (o.customer_note) body += `<hr><div class="note"><b>${e(L.note)}:</b> ${e(o.customer_note)}</div>`;
  } else {
    if (opts.businessName) body += `<div class="c b h">${e(opts.businessName)}</div>`;
    body += `<div class="c b">${e(L.receiptTitle)}</div>`;
    body += `<div>${e(L.orderNo)}: ${e(o.id)}</div>`;
    body += `<div>${e(L.time)}: ${e(o.created_at)}</div>`;
    if (o.table_number) body += `<div>${e(L.table)}: ${e(o.table_number)}</div>`;
    if (o.customer_name) body += `<div>${e(L.customer)}: ${e(o.customer_name)}</div>`;
    if (o.phone) body += `<div>${e(L.phone)}: <span dir="ltr">${e(o.phone)}</span></div>`;
    body += `<hr><table>${rows}</table><hr>`;
    body += `<div class="tot"><span>${e(L.grandTotal)}</span><span>${e(fmt(total))} ${e(L.currency)}</span></div>`;
    body += `<div>${e(L.paymentStatus)}: ${o.payment_status === "paid" ? e(L.paid) : e(L.unpaid)}</div>`;
    body += `<hr><div class="c">${e(L.thanks)}</div>`;
  }

  return `<!doctype html><html lang="${e(opts.lang || "fa")}" dir="${dir}"><head><meta charset="utf-8">` +
    `<title>${e(isProd ? L.productionTitle : L.receiptTitle)}</title><style>` +
    `@page{size:80mm auto;margin:2mm}` +
    `html,body{margin:0;padding:0;background:#fff;color:#000}` +
    `body{width:72mm;font-family:Vazirmatn,Tahoma,"Courier New",monospace;font-size:12px;line-height:1.5;direction:${dir}}` +
    `.c{text-align:center}.b{font-weight:700}.h{font-size:16px}` +
    `.big{font-size:26px;font-weight:900;margin:4px 0}` +
    `hr{border:0;border-top:1px dashed #000;margin:5px 0}` +
    `table{width:100%;border-collapse:collapse}td{vertical-align:top;padding:2px 0}` +
    `.prod td{font-size:16px;font-weight:700}.q{width:14mm;white-space:nowrap}` +
    `.p{text-align:${isRtl ? "left" : "right"};white-space:nowrap;padding-${isRtl ? "right" : "left"}:4px}` +
    `.s{font-size:10px;font-weight:400}` +
    `.note{border:2px solid #000;padding:3px;font-size:14px;word-break:break-word}` +
    `.tot{display:flex;justify-content:space-between;font-weight:900;font-size:15px}` +
    `</style></head><body>${body}</body></html>`;
}

export function readBusinessName() {
  try {
    const u = JSON.parse(sessionStorage.getItem("user") || "{}");
    return u.restaurant_name || u.business_name || u.tenant_name || u.restaurant?.name || "";
  } catch {
    return "";
  }
}

export function buildLabels(t) {
  const k = (s) => t(`ui_f.print.${s}`);
  return {
    productionTitle: k("production_title"), receiptTitle: k("receipt_title"),
    table: k("table"), noTable: k("no_table"), time: k("time"), orderNo: k("order_no"),
    customer: k("customer"), phone: k("phone"), note: k("note"), product: k("product"),
    qty: k("qty"), unitPrice: k("unit_price"), lineTotal: k("line_total"),
    grandTotal: k("grand_total"), paymentStatus: k("payment_status"), paid: k("paid"),
    unpaid: k("unpaid"), currency: k("currency"), thanks: k("thanks"),
  };
}

/** Prints one ticket via a hidden iframe. Resolves true when the print dialog was invoked. */
export function printTicket(order, kind, { lang, isRtl, t, onError } = {}) {
  return new Promise((resolve) => {
    let iframe;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      try { iframe?.remove(); } catch { /* ignore */ }
    };
    try {
      const html = buildTicketHtml(order, kind, buildLabels(t), {
        lang, isRtl, businessName: readBusinessName(),
      });
      iframe = document.createElement("iframe");
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
      document.body.appendChild(iframe);
      const win = iframe.contentWindow;
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.addEventListener("afterprint", cleanup);
      setTimeout(cleanup, 60000);
      // let layout/fonts settle before printing
      setTimeout(() => {
        try {
          win.focus();
          win.print();
          resolve(true);
        } catch (err) {
          cleanup();
          onError?.(err);
          resolve(false);
        }
      }, 250);
    } catch (err) {
      cleanup();
      onError?.(err);
      resolve(false);
    }
  });
}
