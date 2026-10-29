import { useState, useMemo, useCallback } from "react";
import {
  Box, Typography, Chip, TextField, Select, MenuItem, Divider,
} from "@mui/material";
import { getUnitLabel } from "../../../../shared/common/units";

// ═══════════ ثابت‌ها ═══════════
const PAYMENTS = {
  cash:     { label: "نقدی",  color: "#4CAF50", icon: "💵" },
  credit:   { label: "نسیه",  color: "#FF9800", icon: "📒" },
  cheque:   { label: "چک",    color: "#42A5F5", icon: "📄" },
  transfer: { label: "حواله", color: "#AB47BC", icon: "🔄" },
};

const PERIODS = [
  { value: "all",     label: "همه" },
  { value: "daily",   label: "امروز" },
  { value: "weekly",  label: "این هفته" },
  { value: "monthly", label: "این ماه" },
  { value: "yearly",  label: "امسال" },
];

const FA = "۰۱۲۳۴۵۶۷۸۹";
const toFa = (s) => String(s).replace(/\d/g, (d) => FA[d]);
const div = (a, b) => Math.trunc(a / b);
const G_DM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

function gregorianToJalali(gy, gm, gd) {
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 355666 + 365 * gy + div(gy2 + 3, 4) - div(gy2 + 99, 100) + div(gy2 + 399, 400) + gd + G_DM[gm - 1];
  let jy = -1595 + 33 * div(days, 12053);
  days %= 12053;
  jy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) { jy += div(days - 1, 365); days = (days - 1) % 365; }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

const pad2 = (n) => String(n).padStart(2, "0");
const fmtJalali = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return "—";
  const [jy, jm, jd] = gregorianToJalali(+m[1], +m[2], +m[3]);
  return toFa(`${jy}/${pad2(jm)}/${pad2(jd)}`);
};

const fmtMoney = (n) => (n || 0).toLocaleString("en-US");
const readJSON = (key, def = []) => {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(def)); }
  catch { return def; }
};

// ═══════════════════════════════════════════════════
//   کامپوننت: کارت آمار بزرگ
// ═══════════════════════════════════════════════════
function BigStatCard({ icon, label, value, color, bgColor, sub }) {
  return (
    <Box sx={{
      flex: "1 1 220px", p: 2.5, borderRadius: "16px",
      bgcolor: bgColor || color + "12",
      border: `2px solid ${color}35`,
    }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <Box sx={{
          width: 36, height: 36, borderRadius: "10px",
          bgcolor: color + "20", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18,
        }}>
          {icon}
        </Box>
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
          {label}
        </Typography>
      </Box>
      <Typography sx={{ fontSize: 22, fontWeight: 900, color: color }}>
        {value}
      </Typography>
      {sub && (
        <Typography sx={{ fontSize: 13, color: "#aaa", mt: 0.5 }}>
          {sub}
        </Typography>
      )}
    </Box>
  );
}

// ═══════════════════════════════════════════════════
//   کامپوننت: سطر آیتم فاکتور (خرید یا فروش)
// ═══════════════════════════════════════════════════
function ItemRow({ item, buyPrice, sellPrice, type }) {
  const isBuy = type === "buy";
  const color = isBuy ? "#42A5F5" : "#4CAF50";
  const unitProfit = sellPrice - buyPrice;
  const profitPct = buyPrice > 0 ? Math.round((unitProfit / buyPrice) * 100) : 0;

  return (
    <Box sx={{
      display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1.5,
      px: 2, py: 1.2, borderRadius: "10px", mb: 0.5,
      bgcolor: isBuy ? "rgba(66,165,245,0.08)" : "rgba(76,175,80,0.08)",
      border: `1px solid ${color}25`,
    }}>
      {/* نام کالا */}
      <Box sx={{ flex: "1 1 180px", minWidth: 150 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
          {item.material_name}
        </Typography>
        <Typography sx={{ fontSize: 11, color: "#888" }}>
          {toFa(item.quantity)} {getUnitLabel(item.unit)}
        </Typography>
      </Box>

      {/* قیمت خرید واحد */}
      <Box sx={{ textAlign: "center", minWidth: 100 }}>
        <Typography sx={{ fontSize: 10, color: "#888" }}>قیمت خرید</Typography>
        <Typography sx={{ fontSize: 14, fontWeight: 800, color: "#42A5F5" }}>
          {fmtMoney(Math.round(buyPrice))}
        </Typography>
      </Box>

      {/* قیمت فروش واحد */}
      <Box sx={{ textAlign: "center", minWidth: 100 }}>
        <Typography sx={{ fontSize: 10, color: "#888" }}>قیمت فروش</Typography>
        <Typography sx={{ fontSize: 14, fontWeight: 800, color: "#4CAF50" }}>
          {fmtMoney(Math.round(sellPrice))}
        </Typography>
      </Box>

      {/* سود هر واحد */}
      <Box sx={{ textAlign: "center", minWidth: 110 }}>
        <Typography sx={{ fontSize: 10, color: "#888" }}>سود هر واحد</Typography>
        <Typography sx={{
          fontSize: 16, fontWeight: 900,
          color: unitProfit >= 0 ? "#4CAF50" : "#EF5350",
        }}>
          {unitProfit >= 0 ? "+" : "−"}{fmtMoney(Math.abs(Math.round(unitProfit)))}
        </Typography>
      </Box>

      {/* درصد سود */}
      <Chip
        label={`${profitPct >= 0 ? "+" : "−"}${toFa(Math.abs(profitPct))}٪`}
        size="small"
        sx={{
          height: 28, fontSize: 13, fontWeight: 800, borderRadius: "8px",
          bgcolor: unitProfit >= 0 ? "rgba(76,175,80,0.2)" : "rgba(239,83,80,0.2)",
          color: unitProfit >= 0 ? "#66BB6A" : "#EF5350",
          border: `1.5px solid ${unitProfit >= 0 ? "#4CAF5050" : "#EF535050"}`,
        }}
      />
    </Box>
  );
}

// ═══════════════════════════════════════════════════
//   کامپوننت: کارت فاکتور با جزئیات سود
// ═══════════════════════════════════════════════════
function InvoiceCard({ invoice, productMap, index }) {
  const [expanded, setExpanded] = useState(false);
  const isProfit = invoice.profit > 0;
  const accentColor = isProfit ? "#4CAF50" : "#EF5350";
  const accentBg = isProfit ? "rgba(76,175,80,0.08)" : "rgba(239,83,80,0.08)";
  const pay = PAYMENTS[invoice.payment_method] || PAYMENTS.cash;

  return (
    <Box sx={{
      borderRadius: "16px", mb: 1.5, overflow: "hidden",
      border: `2px solid ${accentColor}30`,
      opacity: 0,
      animation: `fadeUp 0.4s ease-out ${index * 0.05}s forwards`,
    }}>
      {/* ═══ هدر فاکتور ═══ */}
      <Box
        onClick={() => setExpanded(!expanded)}
        sx={{
          p: 2, cursor: "pointer", bgcolor: accentBg,
          "&:hover": { bgcolor: isProfit ? "rgba(76,175,80,0.14)" : "rgba(239,83,80,0.14)" },
        }}
      >
        {/* سطر ۱: شماره + مشتری + تاریخ + وضعیت */}
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1.5, mb: 1.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
            <Chip
              label={invoice.invoice_number}
              sx={{
                height: 32, fontSize: 14, fontWeight: 800,
                fontFamily: "monospace", borderRadius: "8px",
                bgcolor: "#FFA72620", color: "#FFA726",
                border: "1.5px solid #FFA72640",
              }}
            />
            <Chip
              label={isProfit ? "✅ سودده" : "❌ زیان‌ده"}
              sx={{
                height: 30, fontSize: 13, fontWeight: 800, borderRadius: "8px",
                bgcolor: accentColor + "20", color: accentColor,
                border: `1.5px solid ${accentColor}50`,
              }}
            />
            <Box>
              <Typography sx={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>
                👤 {invoice.customer?.first_name} {invoice.customer?.last_name}
              </Typography>
              <Typography sx={{ fontSize: 12, color: "#999", mt: 0.2 }}>
                📅 {fmtJalali(invoice.invoice_date || invoice.date || invoice.created_at)}
              </Typography>
            </Box>
          </Box>

          <Chip
            label={`${pay.icon} ${pay.label}`}
            sx={{
              height: 28, fontSize: 12, fontWeight: 700, borderRadius: "8px",
              bgcolor: pay.color + "20", color: pay.color,
            }}
          />
        </Box>

        {/* سطر ۲: اعداد اصلی */}
        <Box sx={{
          display: "flex", gap: 2, flexWrap: "wrap",
          p: 2, borderRadius: "12px",
          bgcolor: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}>
          <Box sx={{ flex: 1, minWidth: 130, textAlign: "center" }}>
            <Typography sx={{ fontSize: 11, color: "#888", fontWeight: 600 }}>مبلغ فروش</Typography>
            <Typography sx={{ fontSize: 20, fontWeight: 900, color: "#4CAF50", mt: 0.5 }}>
              {fmtMoney(invoice.grand_total)}
            </Typography>
            <Typography sx={{ fontSize: 10, color: "#777" }}>تومان</Typography>
          </Box>

          <Divider orientation="vertical" flexItem sx={{ borderColor: "rgba(255,255,255,0.1)" }} />

          <Box sx={{ flex: 1, minWidth: 130, textAlign: "center" }}>
            <Typography sx={{ fontSize: 11, color: "#888", fontWeight: 600 }}>بهای تمام‌شده</Typography>
            <Typography sx={{ fontSize: 20, fontWeight: 900, color: "#42A5F5", mt: 0.5 }}>
              {fmtMoney(invoice.cost)}
            </Typography>
            <Typography sx={{ fontSize: 10, color: "#777" }}>تومان</Typography>
          </Box>

          <Divider orientation="vertical" flexItem sx={{ borderColor: "rgba(255,255,255,0.1)" }} />

          <Box sx={{ flex: 1, minWidth: 130, textAlign: "center" }}>
            <Typography sx={{ fontSize: 11, color: "#888", fontWeight: 600 }}>سود / زیان</Typography>
            <Typography sx={{ fontSize: 24, fontWeight: 900, color: accentColor, mt: 0.5 }}>
              {invoice.profit >= 0 ? "+" : "−"}{fmtMoney(Math.abs(invoice.profit))}
            </Typography>
            <Typography sx={{ fontSize: 10, color: "#777" }}>تومان</Typography>
          </Box>

          <Divider orientation="vertical" flexItem sx={{ borderColor: "rgba(255,255,255,0.1)" }} />

          <Box sx={{ flex: 1, minWidth: 130, textAlign: "center" }}>
            <Typography sx={{ fontSize: 11, color: "#888", fontWeight: 600 }}>درصد سود</Typography>
            <Typography sx={{ fontSize: 24, fontWeight: 900, color: accentColor, mt: 0.5 }}>
              {invoice.cost > 0 ? toFa(Math.round((invoice.profit / invoice.cost) * 100)) : "—"}٪
            </Typography>
            <Typography sx={{ fontSize: 10, color: "#777" }}>از بهای تمام‌شده</Typography>
          </Box>
        </Box>

        {/* نوار پیشرفت */}
        <Box sx={{ mt: 1.5 }}>
          <Box sx={{
            height: 6, borderRadius: 3, overflow: "hidden",
            bgcolor: "rgba(255,255,255,0.08)",
          }}>
            <Box sx={{
              height: "100%", borderRadius: 3,
              width: `${Math.min(100, invoice.cost > 0 ? (invoice.profit / invoice.cost) * 100 : 0)}%`,
              bgcolor: accentColor,
              transition: "width 0.8s ease",
            }} />
          </Box>
        </Box>

        {/* دکمه باز شدن */}
        <Box sx={{ display: "flex", justifyContent: "center", mt: 1 }}>
          <Typography sx={{
            fontSize: 13, color: "#888", fontWeight: 600,
            display: "flex", alignItems: "center", gap: 0.5,
          }}>
            {expanded ? "▲ بستن جزئیات" : "▼ نمایش جزئیات کالاها"}
          </Typography>
        </Box>
      </Box>

      {/* ═══ جزئیات کالاها ═══ */}
      {expanded && (
        <Box sx={{ p: 2, bgcolor: "rgba(0,0,0,0.2)" }}>
          <Typography sx={{
            fontSize: 15, fontWeight: 800, color: "#FFA726", mb: 1.5,
            display: "flex", alignItems: "center", gap: 1,
          }}>
            📋 جزئیات کالاهای این فاکتور
          </Typography>

          {invoice.items?.map((it, j) => {
            const prod = productMap[it.material_code || it.material_name];
            const buyPrice = prod?.avgBuy || (it.unit_price || 0) * 0.7;
            const sellPrice = it.unit_price || 0;

            return (
              <ItemRow
                key={j}
                item={it}
                buyPrice={buyPrice}
                sellPrice={sellPrice}
                type="sell"
              />
            );
          })}

          {/* جمع‌بندی */}
          <Box sx={{
            mt: 2, p: 2, borderRadius: "12px",
            bgcolor: isProfit ? "rgba(76,175,80,0.12)" : "rgba(239,83,80,0.12)",
            border: `2px solid ${accentColor}30`,
            display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 2,
          }}>
            <Box sx={{ textAlign: "center" }}>
              <Typography sx={{ fontSize: 12, color: "#888" }}>جمع فروش</Typography>
              <Typography sx={{ fontSize: 18, fontWeight: 900, color: "#4CAF50" }}>
                {fmtMoney(invoice.grand_total)}
              </Typography>
            </Box>
            <Box sx={{ textAlign: "center" }}>
              <Typography sx={{ fontSize: 12, color: "#888" }}>جمع خرید</Typography>
              <Typography sx={{ fontSize: 18, fontWeight: 900, color: "#42A5F5" }}>
                {fmtMoney(invoice.cost)}
              </Typography>
            </Box>
            <Box sx={{ textAlign: "center" }}>
              <Typography sx={{ fontSize: 12, color: "#888" }}>سود خالص</Typography>
              <Typography sx={{ fontSize: 22, fontWeight: 900, color: accentColor }}>
                {invoice.profit >= 0 ? "+" : "−"}{fmtMoney(Math.abs(invoice.profit))}
              </Typography>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}

// ═══════════════════════════════════════════════════
//   کامپوننت اصلی
// ═══════════════════════════════════════════════════
export default function ReportsTab({ C, isDark, showToast }) {
  const [tab, setTab] = useState("pnl");
  const [period, setPeriod] = useState("all");
  const [search, setSearch] = useState("");
  const [invoiceFilter, setInvoiceFilter] = useState("all");

  // ── داده‌ها ──
  const purchases = useMemo(() => readJSON("local_purchase_invoices", []), []);
  const sales = useMemo(() => readJSON("local_sales_invoices", []), []);
  const transfers = useMemo(() => readJSON("local_transfers", []), []);
  const warehouses = useMemo(() => readJSON("local_warehouses", []), []);

  const getWhName = useCallback((id) => {
    if (!id) return "—";
    if (String(id) === "mother") return "انبار مرکزی";
    return warehouses.find((w) => String(w.id) === String(id))?.name || String(id);
  }, [warehouses]);

  const filterByDate = useCallback((items) => {
    if (period === "all") return items;
    const now = new Date();
    return items.filter((item) => {
      const d = new Date(item.created_at || item.invoice_date || item.date);
      if (isNaN(d)) return true;
      switch (period) {
        case "daily": return d.toDateString() === now.toDateString();
        case "weekly": {
          const w = new Date(now); w.setDate(now.getDate() - 7);
          return d >= w;
        }
        case "monthly": return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        case "yearly": return d.getFullYear() === now.getFullYear();
        default: return true;
      }
    });
  }, [period]);

  const fSales = useMemo(() => filterByDate(sales), [sales, filterByDate]);
  const fPurchases = useMemo(() => filterByDate(purchases), [purchases, filterByDate]);
  const fTransfers = useMemo(() => filterByDate(transfers), [transfers, filterByDate]);

  // ── محاسبات کلی ──
  const totalSales = useMemo(() => fSales.reduce((s, i) => s + (i.grand_total || 0), 0), [fSales]);
  const totalPurchases = useMemo(() => fPurchases.reduce((s, i) => s + (i.grand_total || 0), 0), [fPurchases]);
  const grossProfit = totalSales - totalPurchases;
  const salesPaid = useMemo(() => fSales.reduce((s, i) => s + (i.paid_amount || 0), 0), [fSales]);
  const salesDebt = totalSales - salesPaid;
  const purchasesPaid = useMemo(() => fPurchases.reduce((s, i) => s + (i.paid_amount || 0), 0), [fPurchases]);
  const purchasesDebt = totalPurchases - purchasesPaid;

  // ── نقشه محصولات (قیمت خرید میانگین) ──
  const productMap = useMemo(() => {
    const map = {};
    for (const inv of fPurchases) {
      for (const it of inv.items || []) {
        const key = it.material_code || it.material_name;
        if (!map[key]) map[key] = { name: it.material_name, code: it.material_code, buyQty: 0, sellQty: 0, buyTotal: 0, sellTotal: 0, buyInvoices: [], sellInvoices: [] };
        map[key].buyQty += it.quantity || 0;
        const lt = it.line_total || ((it.quantity || 0) * (it.unit_price || 0));
        map[key].buyTotal += lt;
        map[key].buyInvoices.push({ invoice_number: inv.invoice_number, date: inv.invoice_date || inv.created_at, supplier: inv.supplier_name || "—", qty: it.quantity, unit_price: it.unit_price, lineTotal: lt });
      }
    }
    for (const inv of fSales) {
      for (const it of inv.items || []) {
        const key = it.material_code || it.material_name;
        if (!map[key]) map[key] = { name: it.material_name, code: it.material_code, buyQty: 0, sellQty: 0, buyTotal: 0, sellTotal: 0, buyInvoices: [], sellInvoices: [] };
        map[key].sellQty += it.quantity || 0;
        const lt = it.line_total || ((it.quantity || 0) * (it.unit_price || 0));
        map[key].sellTotal += lt;
        map[key].sellInvoices.push({ invoice_number: inv.invoice_number, date: inv.invoice_date || inv.date || inv.created_at, customer: `${inv.customer?.first_name || ""} ${inv.customer?.last_name || ""}`.trim() || "—", qty: it.quantity, unit_price: it.unit_price, lineTotal: lt });
      }
    }
    for (const key of Object.keys(map)) {
      const p = map[key];
      p.avgBuy = p.buyQty > 0 ? p.buyTotal / p.buyQty : 0;
      p.avgSell = p.sellQty > 0 ? p.sellTotal / p.sellQty : 0;
      p.profit = p.sellTotal - p.buyTotal;
    }
    return map;
  }, [fPurchases, fSales]);

  const productList = useMemo(() =>
    Object.values(productMap).sort((a, b) => b.profit - a.profit),
  [productMap]);

  const profitableProducts = useMemo(() => productList.filter((p) => p.profit > 0), [productList]);
  const lossProducts = useMemo(() => productList.filter((p) => p.profit < 0), [productList]);
  const totalProductProfit = useMemo(() => profitableProducts.reduce((s, p) => s + p.profit, 0), [profitableProducts]);
  const totalProductLoss = useMemo(() => Math.abs(lossProducts.reduce((s, p) => s + p.profit, 0)), [lossProducts]);

  // ── سود هر فاکتور ──
  const invoicesWithProfit = useMemo(() => {
    return fSales.map((inv) => {
      let cost = 0;
      for (const it of inv.items || []) {
        const prod = productMap[it.material_code || it.material_name];
        cost += (it.quantity || 0) * (prod?.avgBuy || (it.unit_price || 0) * 0.7);
      }
      return { ...inv, cost: Math.round(cost), profit: Math.round((inv.grand_total || 0) - cost) };
    }).sort((a, b) => b.profit - a.profit);
  }, [fSales, productMap]);

  const profitableInvoices = useMemo(() => invoicesWithProfit.filter((i) => i.profit > 0), [invoicesWithProfit]);
  const lossInvoices = useMemo(() => invoicesWithProfit.filter((i) => i.profit < 0), [invoicesWithProfit]);

  // ── خلاصه پرداخت ──
  const paymentSummary = useMemo(() => {
    const s = { cash: { count: 0, total: 0 }, credit: { count: 0, total: 0 }, cheque: { count: 0, total: 0 }, transfer: { count: 0, total: 0 } };
    for (const inv of fSales) {
      const m = inv.payment_method || "cash";
      if (s[m]) { s[m].count++; s[m].total += inv.grand_total || 0; }
    }
    return s;
  }, [fSales]);

  const purchasePercent = totalSales > 0 ? Math.round((totalPurchases / totalSales) * 100) : 0;
  const profitPercent = totalSales > 0 ? Math.round((grossProfit / totalSales) * 100) : 0;

  // ── جستجو ──
  const searchFilter = useCallback((items, fields) => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((item) =>
      fields.some((f) => {
        const val = f.split(".").reduce((o, k) => o?.[k], item);
        return val?.toString().toLowerCase().includes(q);
      })
    );
  }, [search]);

  const filteredInvoices = useMemo(() => {
    let list = invoicesWithProfit;
    if (invoiceFilter === "profit") list = profitableInvoices;
    if (invoiceFilter === "loss") list = lossInvoices;
    return list;
  }, [invoiceFilter, invoicesWithProfit, profitableInvoices, lossInvoices]);

  const tabs = [
    { value: "pnl",       label: "📊 سود و زیان",  count: 1 },
    { value: "sales",     label: "💰 فروش",         count: fSales.length },
    { value: "purchases", label: "🛒 خرید",         count: fPurchases.length },
    { value: "products",  label: "📈 محصولات",      count: productList.length },
    { value: "payments",  label: "💳 مالی",         count: 4 },
    { value: "transfers", label: "🔄 حواله",        count: fTransfers.length },
  ];

  // ═══════════════════════════════════════════
  //   رندر
  // ═══════════════════════════════════════════
  return (
    <Box>
      {/* ═══════════ هدر ═══════════ */}
      <Box sx={{ mb: 3 }}>
        <Typography sx={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>
          📊 داشبورد سود و زیان
        </Typography>
        <Typography sx={{ fontSize: 14, color: "#888", mt: 0.5 }}>
          همه چیز واضح، شفاف و با جزئیات کامل
        </Typography>
      </Box>

      {/* ═══════════ فیلترها ═══════════ */}
      <Box sx={{ display: "flex", gap: 1.5, mb: 3, flexWrap: "wrap", alignItems: "center" }}>
        <TextField
          size="small" placeholder="🔍 جستجو در فاکتورها..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          sx={{
            width: 250,
            "& .MuiOutlinedInput-root": {
              borderRadius: "12px", bgcolor: "rgba(255,255,255,0.08)", fontSize: 14,
              "& fieldset": { borderColor: "rgba(255,255,255,0.15)" },
              "&.Mui-focused fieldset": { borderColor: "#FFA726" },
            },
            "& .MuiInputBase-input": { color: "#fff", py: 1 },
          }}
        />
        <Select
          size="small" value={period}
          onChange={(e) => setPeriod(e.target.value)}
          sx={{
            minWidth: 150,
            "& .MuiOutlinedInput-root": {
              borderRadius: "12px", bgcolor: "rgba(255,255,255,0.08)", fontSize: 14,
              "& fieldset": { borderColor: "rgba(255,255,255,0.15)" },
            },
            "& .MuiSelect-select": { color: "#fff", py: 1 },
          }}
        >
          {PERIODS.map((p) => (
            <MenuItem key={p.value} value={p.value} sx={{ fontSize: 14 }}>{p.label}</MenuItem>
          ))}
        </Select>
      </Box>

      {/* ═══════════ کارت‌های آمار ═══════════ */}
      <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
        <BigStatCard
          icon="💰" label="فروش کل"
          value={`${fmtMoney(totalSales)} تومان`}
          color="#4CAF50"
          sub={`${toFa(fSales.length)} فاکتور فروش`}
        />
        <BigStatCard
          icon="🛒" label="خرید کل"
          value={`${fmtMoney(totalPurchases)} تومان`}
          color="#42A5F5"
          sub={`${toFa(fPurchases.length)} فاکتور خرید`}
        />
        <BigStatCard
          icon={grossProfit >= 0 ? "✅" : "❌"}
          label={grossProfit >= 0 ? "سود ناخالص" : "زیان ناخالص"}
          value={`${fmtMoney(Math.abs(grossProfit))} تومان`}
          color={grossProfit >= 0 ? "#4CAF50" : "#EF5350"}
          sub={grossProfit >= 0 ? `${toFa(profitPercent)}٪ حاشیه سود از فروش` : `${toFa(Math.abs(profitPercent))}٪ زیان`}
        />
        <BigStatCard
          icon="⚠️" label="بدهی مشتریان"
          value={`${fmtMoney(salesDebt)} تومان`}
          color="#FF9800"
          sub={`${toFa(fSales.length)} فاکتور`}
        />
        <BigStatCard
          icon="📋" label="بدهی تأمین‌کنندگان"
          value={`${fmtMoney(purchasesDebt)} تومان`}
          color="#AB47BC"
          sub={`${toFa(fPurchases.length)} فاکتور`}
        />
      </Box>

      {/* ═══════════ تب‌ها ═══════════ */}
      <Box sx={{ display: "flex", gap: 1, mb: 3, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <Chip
            key={t.value} clickable
            label={`${t.label} (${toFa(t.count)})`}
            onClick={() => setTab(t.value)}
            sx={{
              height: 42, fontSize: 14, fontWeight: 800, borderRadius: "12px",
              bgcolor: tab === t.value ? "#FFA726" : "rgba(255,255,255,0.08)",
              color: tab === t.value ? "#1a1a2e" : "#ccc",
              border: `2px solid ${tab === t.value ? "#FFA726" : "rgba(255,255,255,0.1)"}`,
              px: 2.5,
              "&:hover": { bgcolor: tab === t.value ? "#FFB74D" : "rgba(255,255,255,0.12)" },
            }}
          />
        ))}
      </Box>

      {/* ══════════════════════════════════════════════ */}
      {/*   تب: سود و زیان                                */}
      {/* ══════════════════════════════════════════════ */}
      {tab === "pnl" && (
        <Box>
          {/* ── جدول اصلی ── */}
          <Box sx={{ borderRadius: "16px", overflow: "hidden", border: "2px solid rgba(255,255,255,0.1)", mb: 3 }}>
            {/* هدر */}
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 200px 140px", bgcolor: "#FFA726", px: 3, py: 1.5 }}>
              <Typography sx={{ fontSize: 15, fontWeight: 800, color: "#1a1a2e" }}>شرح</Typography>
              <Typography sx={{ fontSize: 15, fontWeight: 800, color: "#1a1a2e", textAlign: "center" }}>مبلغ (تومان)</Typography>
              <Typography sx={{ fontSize: 15, fontWeight: 800, color: "#1a1a2e", textAlign: "center" }}>درصد</Typography>
            </Box>

            {/* درآمد */}
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 200px 140px", px: 3, py: 2, bgcolor: "rgba(76,175,80,0.1)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: "#4CAF50" }}>💰 درآمد فروش</Typography>
              <Typography sx={{ fontSize: 18, fontWeight: 900, color: "#4CAF50", textAlign: "center" }}>{fmtMoney(totalSales)}</Typography>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: "#4CAF50", textAlign: "center" }}>۱۰۰٪</Typography>
            </Box>

            {/* خرید */}
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 200px 140px", px: 3, py: 2, bgcolor: "rgba(66,165,245,0.1)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: "#42A5F5" }}>🛒 بهای خرید</Typography>
              <Typography sx={{ fontSize: 18, fontWeight: 900, color: "#42A5F5", textAlign: "center" }}>{fmtMoney(totalPurchases)}</Typography>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: "#42A5F5", textAlign: "center" }}>{totalSales > 0 ? toFa(purchasePercent) : "—"}٪</Typography>
            </Box>

            {/* سود */}
            <Box sx={{
              display: "grid", gridTemplateColumns: "1fr 200px 140px", px: 3, py: 2.5,
              bgcolor: grossProfit >= 0 ? "rgba(76,175,80,0.15)" : "rgba(239,83,80,0.15)",
              borderTop: `2px solid ${grossProfit >= 0 ? "#4CAF50" : "#EF5350"}`,
            }}>
              <Typography sx={{ fontSize: 18, fontWeight: 900, color: grossProfit >= 0 ? "#4CAF50" : "#EF5350" }}>
                {grossProfit >= 0 ? "✅ سود ناخالص" : "❌ زیان ناخالص"}
              </Typography>
              <Typography sx={{ fontSize: 22, fontWeight: 900, textAlign: "center", color: grossProfit >= 0 ? "#4CAF50" : "#EF5350" }}>
                {fmtMoney(Math.abs(grossProfit))}
              </Typography>
              <Typography sx={{ fontSize: 18, fontWeight: 800, textAlign: "center", color: grossProfit >= 0 ? "#4CAF50" : "#EF5350" }}>
                {totalSales > 0 ? toFa(Math.abs(profitPercent)) : "—"}٪
              </Typography>
            </Box>
          </Box>

          {/* ── جزئیات مالی ── */}
          <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
            {[
              { label: "پرداختی مشتریان", value: salesPaid, color: "#4CAF50", icon: "📱" },
              { label: "بدهی مشتریان", value: salesDebt, color: "#FF9800", icon: "⚠️" },
              { label: "پرداختی تأمین‌کنندگان", value: purchasesPaid, color: "#42A5F5", icon: "🏭" },
              { label: "بدهی تأمین‌کنندگان", value: purchasesDebt, color: "#AB47BC", icon: "📋" },
            ].map((c, i) => (
              <Box key={i} sx={{
                flex: "1 1 200px", p: 2, borderRadius: "14px",
                bgcolor: c.color + "12", border: `2px solid ${c.color}30`,
              }}>
                <Typography sx={{ fontSize: 13, color: "#aaa", fontWeight: 600 }}>{c.icon} {c.label}</Typography>
                <Typography sx={{ fontSize: 20, fontWeight: 900, color: c.color, mt: 0.5 }}>
                  {fmtMoney(c.value)} <Typography component="span" sx={{ fontSize: 12, color: "#888" }}>تومان</Typography>
                </Typography>
              </Box>
            ))}
          </Box>

          {/* ── سود و زیان هر فاکتور ── */}
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, flexWrap: "wrap", gap: 1 }}>
              <Typography sx={{ fontSize: 18, fontWeight: 900, color: "#FFA726" }}>
                📋 سود و زیان هر فاکتور فروش
              </Typography>
              <Box sx={{ display: "flex", gap: 1 }}>
                {[
                  { value: "all", label: `همه (${toFa(invoicesWithProfit.length)})`, color: "#FFA726" },
                  { value: "profit", label: `✅ سود (${toFa(profitableInvoices.length)})`, color: "#4CAF50" },
                  { value: "loss", label: `❌ زیان (${toFa(lossInvoices.length)})`, color: "#EF5350" },
                ].map((f) => (
                  <Chip key={f.value} clickable size="small"
                    label={f.label}
                    onClick={() => setInvoiceFilter(f.value)}
                    sx={{
                      height: 34, fontSize: 13, fontWeight: 800, borderRadius: "10px",
                      bgcolor: invoiceFilter === f.value ? f.color : "rgba(255,255,255,0.08)",
                      color: invoiceFilter === f.value ? "#1a1a2e" : "#ccc",
                      border: `2px solid ${invoiceFilter === f.value ? f.color : "rgba(255,255,255,0.1)"}`,
                    }}
                  />
                ))}
              </Box>
            </Box>

            {filteredInvoices.length === 0 ? (
              <Box sx={{ textAlign: "center", py: 5 }}>
                <Typography sx={{ fontSize: 36, mb: 1 }}>🎉</Typography>
                <Typography sx={{ fontSize: 16, fontWeight: 700, color: "#4CAF50" }}>
                  {invoiceFilter === "loss" ? "هیچ فاکتور زیان‌دهی ندارید!" : "داده‌ای یافت نشد"}
                </Typography>
              </Box>
            ) : (
              filteredInvoices.map((inv, i) => (
                <InvoiceCard key={inv.id} invoice={inv} productMap={productMap} index={i} />
              ))
            )}
          </Box>

          {/* ── آمار ── */}
          <Box sx={{ display: "flex", gap: 1.5, mt: 3, flexWrap: "wrap" }}>
            {[
              { label: "فاکتورهای سودده", value: profitableInvoices.length, color: "#4CAF50", icon: "✅" },
              { label: "فاکتورهای زیان‌ده", value: lossInvoices.length, color: "#EF5350", icon: "❌" },
              { label: "میانگین فروش هر فاکتور", value: fSales.length > 0 ? Math.round(totalSales / fSales.length) : 0, color: "#4CAF50", icon: "📊" },
              { label: "میانگین خرید هر فاکتور", value: fPurchases.length > 0 ? Math.round(totalPurchases / fPurchases.length) : 0, color: "#42A5F5", icon: "📊" },
            ].map((c, i) => (
              <Box key={i} sx={{
                flex: "1 1 200px", p: 2, borderRadius: "14px",
                bgcolor: c.color + "10", border: `2px solid ${c.color}25`,
              }}>
                <Typography sx={{ fontSize: 12, color: "#aaa", fontWeight: 600 }}>{c.icon} {c.label}</Typography>
                <Typography sx={{ fontSize: 20, fontWeight: 900, color: c.color, mt: 0.5 }}>
                  {typeof c.value === "number" && c.value > 1000 ? fmtMoney(c.value) : c.value}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* ══════════════════════════════════════════════ */}
      {/*   تب: فروش                                      */}
      {/* ══════════════════════════════════════════════ */}
      {tab === "sales" && (
        <Box>
          {searchFilter(fSales, ["invoice_number", "customer.first_name", "customer.last_name", "customer.mobile"]).length === 0 ? (
            <Box sx={{ textAlign: "center", py: 5 }}>
              <Typography sx={{ fontSize: 36, mb: 1 }}>💰</Typography>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>داده‌ای یافت نشد</Typography>
            </Box>
          ) : (
            searchFilter(fSales, ["invoice_number", "customer.first_name", "customer.last_name", "customer.mobile"]).map((inv, i) => {
              const pay = PAYMENTS[inv.payment_method] || PAYMENTS.cash;
              return (
                <Box key={inv.id} sx={{
                  p: 2, borderRadius: "14px", mb: 1.5,
                  bgcolor: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.1)",
                  opacity: 0, animation: `fadeUp 0.3s ease-out ${i * 0.04}s forwards`,
                }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
                    <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
                      <Chip size="small" label={inv.invoice_number} sx={{
                        height: 28, fontSize: 13, fontWeight: 700, fontFamily: "monospace",
                        bgcolor: "#FFA72620", color: "#FFA726", borderRadius: "8px",
                      }} />
                      <Typography sx={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
                        👤 {inv.customer?.first_name} {inv.customer?.last_name}
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: "#999" }}>
                        📅 {fmtJalali(inv.invoice_date || inv.date || inv.created_at)}
                      </Typography>
                      <Chip size="small" label={`${pay.icon} ${pay.label}`} sx={{
                        height: 24, fontSize: 11, borderRadius: "8px",
                        bgcolor: pay.color + "20", color: pay.color,
                      }} />
                    </Box>
                    <Typography sx={{ fontSize: 18, fontWeight: 900, color: "#4CAF50" }}>
                      {fmtMoney(inv.grand_total)} تومان
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", gap: 0.5, mt: 1, flexWrap: "wrap" }}>
                    {inv.items?.map((it, j) => (
                      <Chip key={j} size="small"
                        label={`${it.material_name} × ${it.quantity} ${getUnitLabel(it.unit)}`}
                        sx={{
                          height: 22, fontSize: 10, borderRadius: "6px",
                          bgcolor: "rgba(255,255,255,0.08)", color: "#bbb",
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              );
            })
          )}
        </Box>
      )}

      {/* ══════════════════════════════════════════════ */}
      {/*   تب: خرید                                      */}
      {/* ══════════════════════════════════════════════ */}
      {tab === "purchases" && (
        <Box>
          {fPurchases.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 5 }}>
              <Typography sx={{ fontSize: 36, mb: 1 }}>🛒</Typography>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>داده‌ای یافت نشد</Typography>
            </Box>
          ) : (
            fPurchases.map((inv, i) => (
              <Box key={inv.id} sx={{
                p: 2, borderRadius: "14px", mb: 1.5,
                bgcolor: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.1)",
                opacity: 0, animation: `fadeUp 0.3s ease-out ${i * 0.04}s forwards`,
              }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
                  <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
                    <Chip size="small" label={inv.invoice_number} sx={{
                      height: 28, fontSize: 13, fontWeight: 700, fontFamily: "monospace",
                      bgcolor: "#42A5F520", color: "#42A5F5", borderRadius: "8px",
                    }} />
                    <Typography sx={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
                      🏭 {inv.supplier_name || "—"}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: "#999" }}>
                      📅 {fmtJalali(inv.invoice_date || inv.created_at)}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: 18, fontWeight: 900, color: "#42A5F5" }}>
                    {fmtMoney(inv.grand_total)} تومان
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 0.5, mt: 1, flexWrap: "wrap" }}>
                  {inv.items?.map((it, j) => (
                    <Chip key={j} size="small"
                      label={`${it.material_name} × ${it.quantity} ${getUnitLabel(it.unit)}`}
                      sx={{
                        height: 22, fontSize: 10, borderRadius: "6px",
                        bgcolor: "rgba(255,255,255,0.08)", color: "#bbb",
                      }}
                    />
                  ))}
                </Box>
              </Box>
            ))
          )}
        </Box>
      )}

      {/* ══════════════════════════════════════════════ */}
      {/*   تب: محصولات                                   */}
      {/* ══════════════════════════════════════════════ */}
      {tab === "products" && (
        <Box>
          {/* خلاصه */}
          <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
            <Box sx={{ flex: "1 1 220px", p: 2.5, borderRadius: "16px", bgcolor: "rgba(76,175,80,0.12)", border: "2px solid rgba(76,175,80,0.3)" }}>
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: "#4CAF50" }}>
                ✅ کالاهای سودده ({toFa(profitableProducts.length)})
              </Typography>
              <Typography sx={{ fontSize: 24, fontWeight: 900, color: "#4CAF50", mt: 0.5 }}>
                +{fmtMoney(totalProductProfit)} تومان
              </Typography>
            </Box>
            <Box sx={{ flex: "1 1 220px", p: 2.5, borderRadius: "16px", bgcolor: "rgba(239,83,80,0.12)", border: "2px solid rgba(239,83,80,0.3)" }}>
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: "#EF5350" }}>
                ❌ کالاهای زیان‌ده ({toFa(lossProducts.length)})
              </Typography>
              <Typography sx={{ fontSize: 24, fontWeight: 900, color: "#EF5350", mt: 0.5 }}>
                −{fmtMoney(totalProductLoss)} تومان
              </Typography>
            </Box>
          </Box>

          {/* لیست محصولات */}
          {productList.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 5 }}>
              <Typography sx={{ fontSize: 36, mb: 1 }}>📈</Typography>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>داده‌ای یافت نشد</Typography>
            </Box>
          ) : (
            productList.map((p, i) => {
              const isProfit = p.profit > 0;
              const isLoss = p.profit < 0;
              const accentColor = isProfit ? "#4CAF50" : isLoss ? "#EF5350" : "#9E9E9E";
              const unitProfit = p.avgSell - p.avgBuy;

              return (
                <Box key={p.code || p.name} sx={{
                  borderRadius: "14px", mb: 1.5, overflow: "hidden",
                  border: `2px solid ${accentColor}30`,
                  opacity: 0, animation: `fadeUp 0.3s ease-out ${i * 0.04}s forwards`,
                }}>
                  <Box sx={{
                    p: 2,
                    bgcolor: isProfit ? "rgba(76,175,80,0.08)" : isLoss ? "rgba(239,83,80,0.08)" : "rgba(158,158,158,0.08)",
                  }}>
                    {/* سطر اول: اسم + وضعیت */}
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", mb: 1.5 }}>
                      <Chip label={p.code || "—"} sx={{
                        height: 26, fontSize: 11, fontWeight: 700,
                        bgcolor: "#FFA72620", color: "#FFA726", fontFamily: "monospace",
                      }} />
                      <Typography sx={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>
                        {p.name}
                      </Typography>
                      <Chip label={isProfit ? "✅ سودده" : isLoss ? "❌ زیان‌ده" : "➖ صفر"} sx={{
                        height: 26, fontSize: 12, fontWeight: 800,
                        bgcolor: accentColor + "20", color: accentColor,
                        border: `1.5px solid ${accentColor}40`,
                      }} />
                    </Box>

                    {/* سطر دوم: قیمت‌ها */}
                    <Box sx={{
                      display: "flex", gap: 2, flexWrap: "wrap",
                      p: 1.5, borderRadius: "10px",
                      bgcolor: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}>
                      <Box sx={{ flex: 1, minWidth: 120, textAlign: "center" }}>
                        <Typography sx={{ fontSize: 11, color: "#888" }}>قیمت خرید واحد</Typography>
                        <Typography sx={{ fontSize: 16, fontWeight: 800, color: "#42A5F5" }}>
                          {fmtMoney(Math.round(p.avgBuy))}
                        </Typography>
                        <Typography sx={{ fontSize: 10, color: "#777" }}>{toFa(p.buyQty)} واحد خرید</Typography>
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 120, textAlign: "center" }}>
                        <Typography sx={{ fontSize: 11, color: "#888" }}>قیمت فروش واحد</Typography>
                        <Typography sx={{ fontSize: 16, fontWeight: 800, color: "#4CAF50" }}>
                          {fmtMoney(Math.round(p.avgSell))}
                        </Typography>
                        <Typography sx={{ fontSize: 10, color: "#777" }}>{toFa(p.sellQty)} واحد فروش</Typography>
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 120, textAlign: "center" }}>
                        <Typography sx={{ fontSize: 11, color: "#888" }}>سود هر واحد</Typography>
                        <Typography sx={{
                          fontSize: 18, fontWeight: 900,
                          color: unitProfit >= 0 ? "#4CAF50" : "#EF5350",
                        }}>
                          {unitProfit >= 0 ? "+" : "−"}{fmtMoney(Math.abs(Math.round(unitProfit)))}
                        </Typography>
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 120, textAlign: "center" }}>
                        <Typography sx={{ fontSize: 11, color: "#888" }}>سود/زیان کل</Typography>
                        <Typography sx={{ fontSize: 22, fontWeight: 900, color: accentColor }}>
                          {p.profit >= 0 ? "+" : "−"}{fmtMoney(Math.abs(p.profit))}
                        </Typography>
                        <Typography sx={{ fontSize: 11, color: accentColor }}>
                          {p.buyTotal > 0 ? toFa(Math.round(Math.abs(p.profit) / p.buyTotal * 100)) : "—"}٪
                        </Typography>
                      </Box>
                    </Box>

                    {/* فرمول */}
                    <Box sx={{
                      mt: 1.5, px: 2, py: 1, borderRadius: "8px",
                      bgcolor: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}>
                      <Typography sx={{ fontSize: 13, color: "#aaa", fontWeight: 600 }}>
                        📐 سود = جمع فروش ({fmtMoney(p.sellTotal)}) − جمع خرید ({fmtMoney(p.buyTotal)}) = <Typography component="span" sx={{ color: accentColor, fontWeight: 900 }}>{p.profit >= 0 ? "+" : "−"}{fmtMoney(Math.abs(p.profit))} تومان</Typography>
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              );
            })
          )}
        </Box>
      )}

      {/* ══════════════════════════════════════════════ */}
      {/*   تب: مالی                                      */}
      {/* ══════════════════════════════════════════════ */}
      {tab === "payments" && (
        <Box>
          <Typography sx={{ fontSize: 18, fontWeight: 900, color: "#FFA726", mb: 2 }}>
            💳 تفکیک روش پرداخت (فروش)
          </Typography>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 3 }}>
            {Object.entries(paymentSummary).map(([key, val]) => {
              const pay = PAYMENTS[key];
              return (
                <Box key={key} sx={{
                  flex: "1 1 220px", p: 2.5, borderRadius: "16px",
                  bgcolor: pay.color + "12", border: `2px solid ${pay.color}30`,
                }}>
                  <Typography sx={{ fontSize: 18, fontWeight: 900, color: pay.color, mb: 1 }}>
                    {pay.icon} {pay.label}
                  </Typography>
                  <Typography sx={{ fontSize: 14, color: "#aaa" }}>{toFa(val.count)} فاکتور</Typography>
                  <Typography sx={{ fontSize: 22, fontWeight: 900, color: pay.color, mt: 0.5 }}>
                    {fmtMoney(val.total)}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: "#888" }}>تومان</Typography>
                </Box>
              );
            })}
          </Box>

          <Divider sx={{ my: 2, borderColor: "rgba(255,255,255,0.1)" }} />

          <Typography sx={{ fontSize: 18, fontWeight: 900, color: "#FFA726", mb: 1.5 }}>
            📊 خلاصه مالی
          </Typography>
          {[
            { label: "💰 مجموع فروش", value: totalSales, color: "#4CAF50" },
            { label: "🛒 مجموع خرید", value: totalPurchases, color: "#42A5F5" },
            { label: grossProfit >= 0 ? "✅ سود ناخالص" : "❌ زیان ناخالص", value: Math.abs(grossProfit), color: grossProfit >= 0 ? "#4CAF50" : "#EF5350" },
            { label: "📱 پرداختی مشتریان", value: salesPaid, color: "#4CAF50" },
            { label: "⚠️ بدهی مشتریان", value: salesDebt, color: "#FF9800" },
            { label: "🏭 پرداختی تأمین‌کنندگان", value: purchasesPaid, color: "#42A5F5" },
            { label: "📋 بدهی تأمین‌کنندگان", value: purchasesDebt, color: "#AB47BC" },
            { label: "💵 نقد دریافتی", value: paymentSummary.cash.total, color: "#4CAF50" },
          ].map((row, i) => (
            <Box key={i} sx={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              px: 2.5, py: 1.2, borderRadius: "10px", mb: 0.8,
              bgcolor: i % 2 === 0 ? "rgba(255,255,255,0.04)" : "transparent",
            }}>
              <Typography sx={{ fontSize: 15, color: "#ddd", fontWeight: 600 }}>{row.label}</Typography>
              <Typography sx={{ fontSize: 17, fontWeight: 900, color: row.color }}>
                {fmtMoney(row.value)} تومان
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {/* ══════════════════════════════════════════════ */}
      {/*   تب: حواله                                     */}
      {/* ══════════════════════════════════════════════ */}
      {tab === "transfers" && (
        <Box>
          {fTransfers.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 5 }}>
              <Typography sx={{ fontSize: 36, mb: 1 }}>🔄</Typography>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>حواله‌ای یافت نشد</Typography>
            </Box>
          ) : (
            fTransfers.map((tr, i) => (
              <Box key={tr.id} sx={{
                p: 2, borderRadius: "14px", mb: 1.5,
                bgcolor: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.1)",
                opacity: 0, animation: `fadeUp 0.3s ease-out ${i * 0.04}s forwards`,
              }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
                  <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
                    <Chip size="small" label={tr.transfer_number || tr.id} sx={{
                      height: 28, fontSize: 13, fontWeight: 700, fontFamily: "monospace",
                      bgcolor: "#AB47BC20", color: "#AB47BC", borderRadius: "8px",
                    }} />
                    <Typography sx={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
                      📦 {getWhName(tr.from_warehouse)} → {getWhName(tr.to_warehouse)}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: 13, color: "#999" }}>
                    👤 {tr.user || "—"} | 📅 {fmtJalali(tr.date || tr.created_at)}
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 0.5, mt: 1, flexWrap: "wrap" }}>
                  {tr.items?.map((it, j) => (
                    <Chip key={j} size="small"
                      label={`${it.material_name} × ${it.quantity} ${getUnitLabel(it.unit)}`}
                      sx={{
                        height: 22, fontSize: 10, borderRadius: "6px",
                        bgcolor: "rgba(255,255,255,0.08)", color: "#bbb",
                      }}
                    />
                  ))}
                </Box>
              </Box>
            ))
          )}
        </Box>
      )}
    </Box>
  );
}