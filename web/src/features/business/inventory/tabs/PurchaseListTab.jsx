import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Box, Typography, Button, TextField, CircularProgress, Chip } from "@mui/material";
import { fetchPurchaseSuggestions } from "../api";
import { buildInputSx, useRowCursor, cursorAttrs, cursorSx, cursorBindings, useRegisteredShortcuts, KbdHint } from "../common";

/* لیست خرید = پیشنهاد خودکار سرور: کالاهایی که موجودی کل آن‌ها از حداقل کمتر یا مساوی است.
   فقط‌خواندنی است (گردش‌کار وضعیت/سفارش در سرور وجود ندارد). */

export default function PurchaseListTab({ C, isDark, showToast }) {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [totalCost, setTotalCost] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const notify = useCallback((msg, type = "info") => {
    if (typeof showToast === "function") showToast(msg, type);
  }, [showToast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPurchaseSuggestions();
      setItems(data.results || []);
      setTotalCost(Number(data.total_estimated_cost) || 0);
    } catch (err) {
      notify(err.response?.data?.error || err.message || "خطا", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter(i =>
    !search.trim() || i.material_name?.toLowerCase().includes(search.trim().toLowerCase()));

  // ── میان‌برها: F2 بازخوانی · Ctrl+A/Z ردیف ──
  const cursor = useRowCursor(filtered.length);
  useRegisteredShortcuts([
    { combo: "F2", label: t("ui_j.purchase.refresh"), handler: () => load() },
    ...cursorBindings(t, cursor),
  ]);

  const inputSx = buildInputSx(C);
  const fmt = (n) => Number(n || 0).toLocaleString("fa-IR");

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress sx={{ color: C.olive }} size={36} />
      </Box>
    );
  }

  return (
    <Box>
      {/* ── هدر ── */}
      <Box sx={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", mb: 2.5, flexWrap: "wrap", gap: 1.5,
      }}>
        <Box>
          <Typography sx={{ fontSize: { xs: 16, sm: 18 }, fontWeight: 800, color: C.text }}>
            🛒 لیست خرید
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.3 }}>
            {t("ui_j.purchase.summary", { count: items.length, cost: fmt(totalCost) })}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
          <TextField
            size="small" placeholder={t("ui_j.purchase.search")}
            value={search} onChange={(e) => setSearch(e.target.value)}
            sx={{ ...inputSx, width: 180 }}
          />
          <Button
            onClick={load}
            sx={{
              borderRadius: "12px", fontSize: 12, fontWeight: 700, textTransform: "none",
              px: 2.5, py: 1, color: "var(--on-primary)", background: C.btnGrad,
              boxShadow: `0 4px 20px ${C.olive}30`,
              "&:hover": { transform: "translateY(-1px)", boxShadow: `0 6px 28px ${C.olive}40` },
            }}
          >
            🔄 {t("ui_j.purchase.refresh")}<KbdHint>F2</KbdHint>
          </Button>
        </Box>
      </Box>

      <Typography sx={{ fontSize: 11, color: C.muted, mb: 1.5 }}>
        {t("ui_j.purchase.hint")}
      </Typography>

      {/* ── لیست ── */}
      {filtered.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 8 }}>
          <Typography sx={{ fontSize: 40, mb: 1 }}>🛒</Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: C.text }}>
            {t("ui_j.purchase.empty_title")}
          </Typography>
          <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.5 }}>
            {t("ui_j.purchase.empty_sub")}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8 }}>
          {filtered.map((item, i) => (
            <Box
              key={item.id}
              {...cursorAttrs(cursor.isActive(i))}
              sx={{
                ...cursorSx(C, cursor.isActive(i)),
                display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1,
                px: { xs: 1.5, sm: 2 }, py: { xs: 1, sm: 1.5 },
                borderRadius: "12px", bgcolor: C.glass,                border: `1px solid ${C.glassBorder}`,
                transition: "all 0.2s ease",
                opacity: 0,
                animation: `fadeUp 0.3s ease-out ${i * 0.04}s forwards`,
                "&:hover": {
                  bgcolor: isDark ? "var(--surface-sunken)" : "color-mix(in srgb, var(--ink) 2%, transparent)",
                },
              }}
            >
              <Box sx={{ flex: 1, minWidth: 140 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                    {item.material_name}
                  </Typography>
                  <Chip size="small" label={t("ui_j.purchase.low")} sx={{
                    height: 18, fontSize: 9, fontWeight: 700,
                    borderRadius: "5px", bgcolor: C.warningBg, color: C.warning,
                  }} />
                </Box>
                <Typography sx={{ fontSize: 11, color: C.sub, mt: 0.3 }}>
                  {t("ui_j.purchase.stock_line", {
                    qty: fmt(item.quantity), min: fmt(item.minimum_stock),
                    target: fmt(item.target_stock), unit: item.unit_display || item.unit,
                  })}
                </Typography>
              </Box>
              <Box sx={{ textAlign: "left", flexShrink: 0 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 800, color: C.olive }}>
                  {fmt(item.suggested_quantity)} {item.unit_display || item.unit}
                </Typography>
                <Typography sx={{ fontSize: 10, color: C.sub }}>
                  {t("ui_j.purchase.cost", { cost: fmt(item.estimated_cost) })}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
