import { escapeHtml } from "./printService";

const fmt = (n) => {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString("en-US") : "0";
};

/**
 * Pure: builds a printable A4 page for the end-of-day summary.
 * labels: { title, date, totalSales, orders, cancelled, average, byMethod, methods:{cash,card,online},
 *           topQty, topRevenue, hourly, product, qty, revenue, count, hour, currency }
 */
export function buildDaySummaryHtml(s, L, opts = {}) {
  const e = escapeHtml;
  const isRtl = !!opts.isRtl;
  const dir = isRtl ? "rtl" : "ltr";
  const name = (p) => (opts.lang === "en" && p.name_en ? p.name_en : p.name);
  const kpi = (label, value) => `<div class="k"><span>${e(label)}</span><b>${e(value)}</b></div>`;

  const methods = (s.payment_methods || [])
    .map((m) => `<tr><td>${e(L.methods?.[m.method] || m.method)}</td><td>${e(fmt(m.count))}</td><td class="n">${e(fmt(m.total))}</td></tr>`)
    .join("");
  const top = (rows, key) => (rows || [])
    .map((p, i) => `<tr><td>${i + 1}</td><td>${e(name(p))}</td><td class="n">${e(fmt(p[key]))}</td></tr>`)
    .join("");
  const hours = (s.hourly || [])
    .filter((h) => h.count > 0)
    .map((h) => `<tr><td>${e(String(h.hour).padStart(2, "0"))}:00</td><td>${e(fmt(h.count))}</td><td class="n">${e(fmt(h.total))}</td></tr>`)
    .join("");

  return `<!doctype html><html lang="${e(opts.lang || "fa")}" dir="${dir}"><head><meta charset="utf-8">` +
    `<title>${e(L.title)} ${e(s.date)}</title><style>` +
    `@page{size:A4;margin:14mm}` +
    `html,body{margin:0;padding:0;background:#fff;color:#000}` +
    `body{font-family:Vazirmatn,Tahoma,sans-serif;font-size:12px;line-height:1.6;direction:${dir}}` +
    `h1{font-size:20px;margin:0 0 2px}h2{font-size:14px;margin:16px 0 4px;border-bottom:1px solid #000}` +
    `.sub{color:#444;margin-bottom:10px}` +
    `.kpis{display:flex;flex-wrap:wrap;gap:8px}.k{border:1px solid #000;border-radius:6px;padding:6px 10px;min-width:120px}` +
    `.k span{display:block;font-size:11px;color:#444}.k b{font-size:16px}` +
    `table{width:100%;border-collapse:collapse}th,td{padding:3px 6px;border-bottom:1px solid #bbb;text-align:${isRtl ? "right" : "left"}}` +
    `td.n,th.n{text-align:${isRtl ? "left" : "right"};direction:ltr;white-space:nowrap}` +
    `table,tr{page-break-inside:avoid}` +
    `</style></head><body>` +
    `<h1>${e(opts.businessName || "")} ${e(L.title)}</h1><div class="sub">${e(L.date)}: ${e(s.date)}</div>` +
    `<div class="kpis">${kpi(L.totalSales, `${fmt(s.total_sales)} ${L.currency}`)}${kpi(L.orders, fmt(s.order_count))}` +
    `${kpi(L.cancelled, fmt(s.cancelled_count))}${kpi(L.average, `${fmt(s.average_ticket)} ${L.currency}`)}</div>` +
    `<h2>${e(L.byMethod)}</h2><table><tr><th></th><th>${e(L.count)}</th><th class="n">${e(L.revenue)}</th></tr>${methods}</table>` +
    `<h2>${e(L.topQty)}</h2><table><tr><th>#</th><th>${e(L.product)}</th><th class="n">${e(L.qty)}</th></tr>${top(s.top_by_quantity, "qty")}</table>` +
    `<h2>${e(L.topRevenue)}</h2><table><tr><th>#</th><th>${e(L.product)}</th><th class="n">${e(L.revenue)}</th></tr>${top(s.top_by_revenue, "revenue")}</table>` +
    `<h2>${e(L.hourly)}</h2><table><tr><th>${e(L.hour)}</th><th>${e(L.count)}</th><th class="n">${e(L.revenue)}</th></tr>${hours}</table>` +
    `</body></html>`;
}

/** Prints an HTML document through a hidden iframe (OS print dialog). */
export function printHtml(html) {
  return new Promise((resolve) => {
    let iframe;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      try { iframe?.remove(); } catch { /* ignore */ }
    };
    try {
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
      setTimeout(() => {
        try { win.focus(); win.print(); resolve(true); } catch { cleanup(); resolve(false); }
      }, 250);
    } catch {
      cleanup();
      resolve(false);
    }
  });
}
