import { useState, useMemo, useCallback } from "react";
import {
  Box, Typography, Chip, TextField, Select, MenuItem, CircularProgress, Divider,
} from "@mui/material";
import { getUnitLabel } from "../../../../shared/common/units";

const F = (size) => Math.round(size * 1.1);

const readJSON = (key, def = []) => {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(def)); }
  catch { return def; }
};

const PAYMENTS = {
  cash: { label: "نقد", color: "#2E7D32", icon: "💵" },
  credit: { label: "نسیه", color: "#E65100", icon: "📝" },
  check: { label: "چک", color: "#1565C0", icon: "📄" },
};

const PERIODS = [
  { value: "all", label: "همه" },
  { value: "daily", label: "روزانه" },
  { value: "monthly", label: "ماهانه" },
  { value: "seasonly", label: "فصلی" },
  { value: "yearly", label: "سالانه" },
];

export default function ReportsTab({ C, isDark, showToast }) {
  const [tab, setTab] = useState("sales");
  const [period, setPeriod] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  // ── داده‌ها ──
  const invoices = useMemo(() => readJSON("local_purchase_invoices", []), []);
  const salesInvoices = useMemo(() => readJSON("local_sales_invoices", []), []);
  const transfers = useMemo(() => readJSON("local_transfers", []), []);
  const materials = useMemo(() => readJSON("local_materials", []), []);
  const warehouses = useMemo(() => readJSON("local_warehouses", []), []);

  // ── فیلتر تاریخ ──
  const filterByDate = useCallback((items) => {
    if (period === "all") return items;
    const now = new Date();
    return items.filter((item) => {
      const d = new Date(item.created_at || item.date);
      if (isNaN(d)) return true;
      switch (period) {
        case "daily": return d.toDateString() === now.toDateString();
        case "monthly": return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        case "seasonly": {
          const season = Math.floor(now.getMonth() / 3);
          return Math.floor(d.getMonth() / 3) === season && d.getFullYear() === now.getFullYear();
        }
        case "yearly": return d.getFullYear() === now.getFullYear();
        default: return true;
      }
    });
  }, [period]);

  const filteredSales = useMemo(() => filterByDate(salesInvoices), [salesInvoices, filterByDate]);
  const filteredPurchases = useMemo(() => filterByDate(invoices), [invoices, filterByDate]);
  const filteredTransfers = useMemo(() => filterByDate(transfers), [transfers, filterByDate]);

  // ── محاسبات ──
  const totalSales = useMemo(() => filteredSales.reduce((s, i) => s + (i.grand_total || 0), 0), [filteredSales]);
  const totalPurchases = useMemo(() => filteredPurchases.reduce((s, i) => {
    return s + (i.items?.reduce((is, it) => is + (it.line_total || (it.quantity * it.unit_price) || 0), 0) || 0);
  }, 0), [filteredPurchases]);
  const totalProfit = totalSales - totalPurchases;
  const totalDebt = useMemo(() => filteredSales.reduce((s, i) => s + (i.remaining || 0), 0), [filteredSales]);

  // ── سود هر محصول ──
  const productProfit = useMemo(() => {
    const map = {};
    // خرید
    for (const inv of filteredPurchases) {
      for (const it of inv.items || []) {
        const key = it.material_code || it.material_name;
        if (!map[key]) map[key] = { name: it.material_name, code: it.material_code, buyQty: 0, sellQty: 0, buyTotal: 0, sellTotal: 0 };
        map[key].buyQty += it.quantity;
        map[key].buyTotal += it.line_total || (it.quantity * it.unit_price);
      }
    }
    // فروش
    for (const inv of filteredSales) {
      for (const it of inv.items || []) {
        const key = it.material_code || it.material_name;
        if (!map[key]) map[key] = { name: it.material_name, code: it.material_code, buyQty: 0, sellQty: 0, buyTotal: 0, sellTotal: 0 };
        map[key].sellQty += it.quantity;
        map[key].sellTotal += it.line_total || (it.quantity * it.unit_price);
      }
    }
    return Object.values(map).map((p) => ({
      ...p,
      profit: p.sellTotal - p.buyTotal,
      avgBuy: p.buyQty > 0 ? p.buyTotal / p.buyQty : 0,
      avgSell: p.sellQty > 0 ? p.sellTotal / p.sellQty : 0,
    })).sort((a, b) => b.profit - a.profit);
  }, [filteredPurchases, filteredSales]);

  // ── پرداخت‌ها ──
  const paymentSummary = useMemo(() => {
    const summary = { cash: { count: 0, total: 0 }, credit: { count: 0, total: 0 }, check: { count: 0, total: 0 } };
    for (const inv of filteredSales) {
      const method = inv.payment_method || "cash";
      if (summary[method]) {
        summary[method].count++;
        summary[method].total += inv.grand_total || 0;
      }
    }
    return summary;
  }, [filteredSales]);

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

  // ── استایل‌ها ──
  const cardSx = (color) => ({
    p: 1.5, borderRadius: "12px", flex: "1 1 180px",
    bgcolor: color + "10", border: `1.5px solid ${color}25`,
  });

  const tabs = [
    { value: "sales", label: "💰 فروش", count: filteredSales.length },
    { value: "purchases", label: "🛒 خرید", count: filteredPurchases.length },
    { value: "transfers", label: "🔄 حواله", count: filteredTransfers.length },
    { value: "products", label: "📈 محصولات", count: productProfit.length },
    { value: "payments", label: "💳 مالی", count: 3 },
  ];

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress sx={{ color: C.olive }} size={32} />
      </Box>
    );
  }

  return (
    <Box>
      {/* ═══════════ هدر ═══════════ */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, flexWrap: "wrap", gap: 1 }}>
        <Box>
          <Typography sx={{ fontSize: F(15), fontWeight: 800, color: C.text }}>📊 گزارشات جامع سیستم انبار</Typography>
          <Typography sx={{ fontSize: F(10), color: C.sub, mt: 0.2 }}>
            فروش + خرید + حواله + سود/زیان + مالی
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <TextField size="small" placeholder="🔍 جستجو..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            sx={{
              width: 180,
              "& .MuiOutlinedInput-root": {
                borderRadius: "8px", bgcolor: C.inputBg, fontSize: F(11),
                "& fieldset": { borderColor: C.glassBorder },
                "&.Mui-focused fieldset": { borderColor: C.olive },
              },
              "& .MuiInputBase-input": { color: C.text, py: 0.6 },
            }} />
          <Select size="small" value={period} onChange={(e) => setPeriod(e.target.value)}
            sx={{
              minWidth: 120,
              "& .MuiOutlinedInput-root": {
                borderRadius: "8px", bgcolor: C.inputBg, fontSize: F(11),
                "& fieldset": { borderColor: C.glassBorder },
              },
              "& .MuiSelect-select": { color: C.text, py: 0.6 },
            }}
          >
            {PERIODS.map((p) => (
              <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
            ))}
          </Select>
        </Box>
      </Box>

      {/* ═══════════ کارت‌های خلاصه ═══════════ */}
      <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
        {[
          { label: "فروش کل", value: `${totalSales.toLocaleString("en-US")} تومان`, color: "#2E7D32" },
          { label: "خرید کل", value: `${totalPurchases.toLocaleString("en-US")} تومان`, color: "#1565C0" },
          { label: totalProfit >= 0 ? "سود خالص" : "زیان خالص", value: `${Math.abs(totalProfit).toLocaleString("en-US")} تومان`, color: totalProfit >= 0 ? "#2E7D32" : "#C62828" },
          { label: "بدهکاری مشتریان", value: `${totalDebt.toLocaleString("en-US")} تومان`, color: "#E65100" },
          { label: "حواله‌ها", value: `${filteredTransfers.length} فقره`, color: "#7C4DFF" },
        ].map((c, i) => (
          <Box key={i} sx={cardSx(c.color)}>
            <Typography sx={{ fontSize: 11, color: C.sub, fontWeight: 600 }}>{c.label}</Typography>
            <Typography sx={{ fontSize: 16, fontWeight: 900, color: c.color, mt: 0.3 }}>{c.value}</Typography>
          </Box>
        ))}
      </Box>

      {/* ═══════════ تب‌ها ═══════════ */}
      <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <Chip key={t.value} clickable
            label={`${t.label} (${t.count})`}
            onClick={() => setTab(t.value)}
            sx={{
              height: 34, fontSize: 12, fontWeight: 700, borderRadius: "10px",
              bgcolor: tab === t.value ? C.olive : (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"),
              color: tab === t.value ? "#fff" : C.sub,
              border: `1.5px solid ${tab === t.value ? C.olive : "transparent"}`,
              px: 2,
            }}
          />
        ))}
      </Box>

      {/* ═══════════ محتوای تب‌ها ═══════════ */}

      {/* ── فروش ── */}
      {tab === "sales" && (
        <Box>
          {searchFilter(filteredSales, ["invoice_number", "customer.first_name", "customer.last_name", "customer.mobile", "user"]).length === 0 ? (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <Typography sx={{ fontSize: 28, mb: 0.5 }}>💰</Typography>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text }}>داده‌ای یافت نشد</Typography>
            </Box>
          ) : (
            searchFilter(filteredSales, ["invoice_number", "customer.first_name", "customer.last_name", "customer.mobile", "user"]).map((inv, i) => (
              <Box key={inv.id} sx={{
                p: 1.5, borderRadius: "12px", mb: 1,
                bgcolor: C.glass, border: `1px solid ${C.glassBorder}`,
                opacity: 0, animation: `fadeUp 0.3s ease-out ${i * 0.03}s forwards`,
              }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                    <Chip size="small" label={inv.invoice_number} sx={{
                      height: 22, fontSize: 10, fontWeight: 700, fontFamily: "monospace",
                      bgcolor: C.oliveSubtle, color: C.olive, borderRadius: "5px",
                    }} />
                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                      {inv.customer?.first_name} {inv.customer?.last_name}
                    </Typography>
                    <Typography sx={{ fontSize: 10, color: C.sub }}>📱 {inv.customer?.mobile}</Typography>
                  </Box>
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                    <Chip size="small" label={`${(PAYMENTS[inv.payment_method] || PAYMENTS.cash).icon} ${(PAYMENTS[inv.payment_method] || PAYMENTS.cash).label}`} sx={{
                      height: 20, fontSize: 9, borderRadius: "5px",
                      bgcolor: (PAYMENTS[inv.payment_method] || PAYMENTS.cash).color + "18",
                      color: (PAYMENTS[inv.payment_method] || PAYMENTS.cash).color,
                    }} />
                    <Typography sx={{ fontSize: 10, color: C.sub }}>{inv.date} | {inv.time}</Typography>
                    <Typography sx={{ fontSize: 12, fontWeight: 800, color: C.olive }}>
                      {(inv.grand_total || 0).toLocaleString("en-US")} تومان
                    </Typography>
                  </Box>
                </Box>
                <Typography sx={{ fontSize: 10, color: C.muted, mt: 0.5 }}>
                  👤 {inv.user} | 📍 {inv.customer?.address || "—"} | 📋 {inv.items_count} قلم
                  {inv.remaining > 0 && ` | ⚠️ بدهکاری: ${inv.remaining.toLocaleString("en-US")}`}
                </Typography>
                <Box sx={{ display: "flex", gap: 0.5, mt: 0.5, flexWrap: "wrap" }}>
                  {inv.items?.map((it, j) => (
                    <Chip key={j} size="small" label={`${it.material_name} × ${it.quantity} ${getUnitLabel(it.unit)}`} sx={{
                      height: 18, fontSize: 8, borderRadius: "4px",
                      bgcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", color: C.sub,
                    }} />
                  ))}
                </Box>
              </Box>
            ))
          )}
        </Box>
      )}

      {/* ── خرید ── */}
      {tab === "purchases" && (
        <Box>
          {filteredPurchases.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <Typography sx={{ fontSize: 28, mb: 0.5 }}>🛒</Typography>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text }}>داده‌ای یافت نشد</Typography>
            </Box>
          ) : (
            filteredPurchases.map((inv, i) => (
              <Box key={inv.id} sx={{
                p: 1.5, borderRadius: "12px", mb: 1,
                bgcolor: C.glass, border: `1px solid ${C.glassBorder}`,
                opacity: 0, animation: `fadeUp 0.3s ease-out ${i * 0.03}s forwards`,
              }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                    <Chip size="small" label={inv.invoice_number} sx={{
                      height: 22, fontSize: 10, fontWeight: 700, fontFamily: "monospace",
                      bgcolor: "rgba(21,101,192,0.1)", color: "#1565C0", borderRadius: "5px",
                    }} />
                    <Typography sx={{ fontSize: 11, color: C.sub }}>
                      {inv.supplier || inv.supplier_name || "—"} | 👤 {inv.user}
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                    <Typography sx={{ fontSize: 10, color: C.sub }}>{inv.date}</Typography>
                    <Typography sx={{ fontSize: 12, fontWeight: 800, color: "#1565C0" }}>
                      {(inv.items?.reduce((s, it) => s + (it.line_total || it.quantity * it.unit_price), 0) || 0).toLocaleString("en-US")} تومان
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: "flex", gap: 0.5, mt: 0.5, flexWrap: "wrap" }}>
                  {inv.items?.map((it, j) => (
                    <Chip key={j} size="small" label={`${it.material_name} × ${it.quantity} ${getUnitLabel(it.unit)}`} sx={{
                      height: 18, fontSize: 8, borderRadius: "4px",
                      bgcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", color: C.sub,
                    }} />
                  ))}
                </Box>
              </Box>
            ))
          )}
        </Box>
      )}

      {/* ── حواله ── */}
      {tab === "transfers" && (
        <Box>
          {filteredTransfers.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <Typography sx={{ fontSize: 28, mb: 0.5 }}>🔄</Typography>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text }}>حواله‌ای یافت نشد</Typography>
            </Box>
          ) : (
            filteredTransfers.map((tr, i) => {
              const fromWh = warehouses.find((w) => String(w.id) === String(tr.from_warehouse));
              const toWh = warehouses.find((w) => String(w.id) === String(tr.to_warehouse));
              return (
                <Box key={tr.id} sx={{
                  p: 1.5, borderRadius: "12px", mb: 1,
                  bgcolor: C.glass, border: `1px solid ${C.glassBorder}`,
                  opacity: 0, animation: `fadeUp 0.3s ease-out ${i * 0.03}s forwards`,
                }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
                    <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                      <Chip size="small" label={tr.transfer_number} sx={{
                        height: 22, fontSize: 10, fontWeight: 700, fontFamily: "monospace",
                        bgcolor: "rgba(124,77,255,0.1)", color: "#7C4DFF", borderRadius: "5px",
                      }} />
                      <Typography sx={{ fontSize: 11, color: C.text }}>
                        {fromWh?.icon} {fromWh?.name || tr.from_warehouse} → {toWh?.icon} {toWh?.name || tr.to_warehouse}
                      </Typography>
                    </Box>
                    <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                      <Typography sx={{ fontSize: 10, color: C.sub }}>👤 {tr.user} | {tr.date} | {tr.time}</Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: "flex", gap: 0.5, mt: 0.5, flexWrap: "wrap" }}>
                    {tr.items?.map((it, j) => (
                      <Chip key={j} size="small" label={`${it.material_name} × ${it.quantity} ${getUnitLabel(it.unit)}`} sx={{
                        height: 18, fontSize: 8, borderRadius: "4px",
                        bgcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", color: C.sub,
                      }} />
                    ))}
                  </Box>
                </Box>
              );
            })
          )}
        </Box>
      )}

      {/* ── محصولات (سود/زیان) ── */}
      {tab === "products" && (
        <Box>
          {/* هدر جدول */}
          <Box sx={{
            display: "grid", gridTemplateColumns: "60px 1.5fr 80px 100px 80px 100px 110px 110px",
            gap: 1, px: 1.5, py: 0.8, borderRadius: "8px",
            bgcolor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
          }}>
            {["کد", "نام کالا", "خرید", "فروش", "سود واحد", "تعداد فروش", "درآمد فروش", "سود/زیان"].map((h) => (
              <Typography key={h} sx={{ fontSize: F(9), fontWeight: 700, color: C.muted }}>{h}</Typography>
            ))}
          </Box>

          {productProfit.map((p, i) => (
            <Box key={p.code || p.name} sx={{
              display: "grid", gridTemplateColumns: "60px 1.5fr 80px 100px 80px 100px 110px 110px",
              gap: 1, px: 1.5, py: 1, borderRadius: "10px", mt: 0.5,
              bgcolor: C.glass, border: `1px solid ${C.glassBorder}`,
              opacity: 0, animation: `fadeUp 0.3s ease-out ${i * 0.03}s forwards`,
            }}>
              <Chip size="small" label={p.code || "—"} sx={{
                height: 22, fontSize: 9, fontWeight: 700, borderRadius: "5px",
                bgcolor: C.oliveSubtle, color: C.olive, fontFamily: "monospace",
                width: "100%", justifyContent: "center",
              }} />
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.text, alignSelf: "center" }}>{p.name}</Typography>
              <Typography sx={{ fontSize: 10, color: C.sub, alignSelf: "center" }}>{p.avgBuy.toLocaleString("en-US")}</Typography>
              <Typography sx={{ fontSize: 10, color: C.sub, alignSelf: "center" }}>{p.avgSell.toLocaleString("en-US")}</Typography>
              <Typography sx={{
                fontSize: 11, fontWeight: 700, alignSelf: "center",
                color: (p.avgSell - p.avgBuy) >= 0 ? "#2E7D32" : "#C62828",
              }}>
                {(p.avgSell - p.avgBuy).toLocaleString("en-US")}
              </Typography>
              <Typography sx={{ fontSize: 11, color: C.text, alignSelf: "center" }}>{p.sellQty.toLocaleString("en-US")}</Typography>
              <Typography sx={{ fontSize: 11, color: C.olive, alignSelf: "center" }}>{p.sellTotal.toLocaleString("en-US")}</Typography>
              <Chip size="small"
                label={`${p.profit >= 0 ? "+" : ""}${p.profit.toLocaleString("en-US")}`}
                sx={{
                  height: 22, fontSize: 10, fontWeight: 800, borderRadius: "6px",
                  alignSelf: "center", justifyContent: "center",
                  bgcolor: p.profit >= 0 ? "rgba(46,125,50,0.1)" : "rgba(198,40,40,0.1)",
                  color: p.profit >= 0 ? "#2E7D32" : "#C62828",
                  border: `1px solid ${p.profit >= 0 ? "#2E7D3230" : "#C6282830"}`,
                }} />
            </Box>
          ))}
        </Box>
      )}

      {/* ── مالی ── */}
      {tab === "payments" && (
        <Box>
          <Typography sx={{ fontSize: 14, fontWeight: 800, color: C.olive, mb: 1.5 }}>💳 تفکیک روش پرداخت</Typography>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            {Object.entries(paymentSummary).map(([key, val]) => {
              const pay = PAYMENTS[key];
              return (
                <Box key={key} sx={{
                  flex: "1 1 250px", p: 2, borderRadius: "14px",
                  bgcolor: pay.color + "10", border: `2px solid ${pay.color}25`,
                }}>
                  <Typography sx={{ fontSize: 16, fontWeight: 900, color: pay.color, mb: 1 }}>
                    {pay.icon} {pay.label}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: C.sub }}>
                    {val.count} فاکتور
                  </Typography>
                  <Typography sx={{ fontSize: 20, fontWeight: 900, color: pay.color, mt: 0.5 }}>
                    {val.total.toLocaleString("en-US")}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: C.muted }}>تومان</Typography>
                </Box>
              );
            })}
          </Box>

          <Divider sx={{ my: 2, borderColor: C.olive + "25" }} />

          <Typography sx={{ fontSize: 14, fontWeight: 800, color: C.olive, mb: 1 }}>📊 خلاصه مالی</Typography>
          {[
            { label: "مجموع فروش", value: totalSales, color: "#2E7D32" },
            { label: "مجموع خرید", value: totalPurchases, color: "#1565C0" },
            { label: totalProfit >= 0 ? "سود خالص" : "زیان خالص", value: Math.abs(totalProfit), color: totalProfit >= 0 ? "#2E7D32" : "#C62828" },
            { label: "بدهکاری مشتریان", value: totalDebt, color: "#E65100" },
            { label: "نقد دریافتی", value: paymentSummary.cash.total, color: "#2E7D32" },
          ].map((row, i) => (
            <Box key={i} sx={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              px: 2, py: 1, borderRadius: "8px", mb: 0.5,
              bgcolor: i % 2 === 0 ? (isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.015)") : "transparent",
            }}>
              <Typography sx={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{row.label}</Typography>
              <Typography sx={{ fontSize: 15, fontWeight: 900, color: row.color }}>
                {row.value.toLocaleString("en-US")} تومان
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}