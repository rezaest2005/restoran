import { useEffect, useState, useMemo } from "react";
import { Box, Snackbar, Alert, Typography } from "@mui/material";
import { Storefront, Assessment, Public } from "@mui/icons-material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";

import usePosSettings from "./hooks/usePosSettings";
import useFoods from "./hooks/useFoods";
import useCart from "./hooks/useCart";
import useCheckout from "./hooks/useCheckout";

import PosHeader from "./components/PosHeader";
import CategoryBar from "./components/CategoryBar";
import FoodGrid from "./components/FoodGrid";
import ManualItemInput from "./components/ManualItemInput";
import CartPanel from "./components/CartPanel";
import CheckoutDialog from "./components/CheckoutDialog";
import ReceiptDialog from "./components/ReceiptDialog";
import { fetchDailyReport } from "./api";

const NAV_ITEMS = [
  { key: "pos", icon: Storefront, labelFa: "صندوق فروش", labelEn: "POS" },
  { key: "report", icon: Assessment, labelFa: "گزارش روز", labelEn: "Report" },
  { key: "online", icon: Public, labelFa: "فروش آنلاین", labelEn: "Online" },
];

export default function Pos() {
  const { mode, toggleTheme } = useThemeMode();
  const { isRtl } = useLang();
  const isDark = mode === "dark";

  const {
    settings, loading: settingsLoading,
    useDictionary, showStock, requireCustomer, defaultPayment,
  } = usePosSettings();

  // ★ isRtl رو پاس بده
  const {
    foods, categoryNames, loading: foodsLoading,
    search, setSearch, activeCat, setActiveCat,
  } = useFoods(useDictionary, isRtl);

  const {
    cart, addToCart, removeFromCart, removeOneFromCart, clearCart,
    cartTotal, cartCount, toOrderItems,
    categoryDiscounts, setCategoryDiscount,
  } = useCart();

  const {
    checkoutOpen, receiptOpen, lastOrder,
    submitting, error,
    openCheckout, closeCheckout, closeReceipt, submitOrder, setError,
  } = useCheckout();

  const [mounted, setMounted] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [orderType, setOrderType] = useState("hall");
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [toast, setToast] = useState({ open: false, message: "", type: "info" });
  const [mainTab, setMainTab] = useState("pos");

  useEffect(() => {
    const tmr = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(tmr);
  }, []);

  // ★ ریست دسته‌بندی هنگام تغییر زبان
  useEffect(() => {
    setActiveCat("all");
  }, [isRtl]);

  const C = useMemo(() => ({
    bg: isDark ? "#0B0A0B" : "#E4E8F0",
    glass: isDark ? "rgba(16,18,16,0.6)" : "rgba(240,244,252,0.7)",
    glassBorder: isDark ? "rgba(107,155,110,0.1)" : "rgba(80,100,140,0.15)",
    olive: isDark ? "#6B9B6E" : "#2E4D30",
    oliveSubtle: isDark ? "rgba(107,155,110,0.08)" : "rgba(46,77,48,0.08)",
    burgundy: isDark ? "#A84060" : "#7A2845",
    gold: isDark ? "#D4B76A" : "#A08040",
    text: isDark ? "#F0ECE8" : "#1A1A24",
    sub: isDark ? "#8A8588" : "#555568",
    muted: isDark ? "#4A4548" : "#8A8A9E",
    inputBg: isDark ? "rgba(11,10,11,0.5)" : "rgba(240,244,252,0.85)",
    danger: isDark ? "#E84057" : "#C83048",
    dangerBg: isDark ? "rgba(232,64,87,0.12)" : "rgba(200,48,72,0.1)",
    cardShadow: isDark
      ? "0 8px 60px rgba(0,0,0,0.5), 0 0 80px rgba(107,155,110,0.04)"
      : "0 8px 60px rgba(0,0,0,0.1), 0 0 60px rgba(74,106,148,0.08)",
  }), [isDark]);

  const glassCardSx = {
    bgcolor: C.glass,
    backdropFilter: "blur(28px)",
    WebkitBackdropFilter: "blur(28px)",
    border: `1px solid ${C.glassBorder}`,
    borderRadius: "16px",
    boxShadow: C.cardShadow,
  };

  const handleAddManual = (item) => {
    addToCart(item);
    setToast({ open: true, message: `${item.name} اضافه شد`, type: "success" });
  };

  const handleCheckoutClick = () => {
    if (cart.length === 0) return;
    if (requireCustomer && !custName.trim()) {
      setToast({ open: true, message: "نام مشتری الزامی است", type: "warning" });
      return;
    }
    openCheckout();
  };

  const handlePayment = async (method) => {
    const items = toOrderItems();
    const result = await submitOrder({
      items, customerName: custName, phone: custPhone,
      orderType, paymentMethod: method,
    });
    if (result) {
      clearCart();
      setCustName("");
      setCustPhone("");
      setToast({ open: true, message: `سفارش #${result.order_id} ثبت شد`, type: "success" });
    }
  };

  return (
    <Box
      dir={isRtl ? "rtl" : "ltr"}
      sx={{
        fontFamily: "'Vazirmatn', sans-serif",
        minHeight: "100vh",
        color: C.text,
        opacity: mounted ? 1 : 0,
        transition: "opacity 0.5s ease",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ═══ نوبار بالا ═══ */}
      <Box sx={{
        display: "flex", alignItems: "center", gap: 0.5, px: 2,
        borderBottom: `1px solid ${C.glassBorder}`,
        bgcolor: C.glass, backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        position: "sticky", top: 0, zIndex: 100,
        minHeight: 48, flexShrink: 0,
      }}>
        {NAV_ITEMS.map(({ key, icon: Icon, labelFa, labelEn }) => {
          const active = mainTab === key;
          return (
            <Box key={key} onClick={() => setMainTab(key)} sx={{
              display: "flex", alignItems: "center", gap: 0.8,
              px: 2, py: 1.2, cursor: "pointer", position: "relative",
              borderRadius: "10px 10px 0 0", transition: "all 0.2s ease",
              bgcolor: active ? `${C.olive}12` : "transparent",
              "&:hover": { bgcolor: active ? `${C.olive}12` : `${C.olive}06` },
            }}>
              <Icon sx={{ fontSize: 18, color: active ? C.olive : C.muted }} />
              <Typography sx={{
                fontSize: 13, fontWeight: active ? 800 : 500,
                color: active ? C.olive : C.muted,
                fontFamily: "'Vazirmatn', sans-serif", whiteSpace: "nowrap",
              }}>
                {isRtl ? labelFa : labelEn}
              </Typography>
              <Box sx={{
                position: "absolute", bottom: -1, left: "20%", right: "20%",
                height: 3, borderRadius: "3px 3px 0 0", bgcolor: C.olive,
                opacity: active ? 1 : 0, transition: "all 0.25s ease",
              }} />
            </Box>
          );
        })}
      </Box>

      {/* ═══ محتوای اصلی ═══ */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {mainTab === "pos" && (
          <Box sx={{
            flex: 1, display: "flex",
            flexDirection: isRtl ? "row-reverse" : "row",
            overflow: "hidden",
          }}>
            {/* ★ بخش غذا */}
            <Box sx={{
              flex: 1, overflowY: "auto", p: 2,
              display: "flex", flexDirection: "column", gap: 1.5,
            }}>
              <PosHeader
                search={search} setSearch={setSearch} C={C}
                useDictionary={useDictionary} isRtl={isRtl}
                editMode={editMode} setEditMode={setEditMode}
              />

              <CategoryBar
                categoryNames={categoryNames}
                activeCat={activeCat}
                setActiveCat={setActiveCat}
                categoryDiscounts={categoryDiscounts}
                onCategoryDiscount={setCategoryDiscount}
                C={C}
                isRtl={isRtl}
              />

              <Box sx={{ ...glassCardSx, p: 2, flex: 1 }}>
                {useDictionary ? (
                  <FoodGrid
                    foods={foods}
                    loading={foodsLoading || settingsLoading}
                    onAdd={addToCart}
                    onRemove={removeOneFromCart}
                    C={C}
                    showStock={showStock}
                    isRtl={isRtl}
                    editMode={editMode}
                  />
                ) : (
                  <ManualItemInput onAdd={handleAddManual} C={C} isRtl={isRtl} />
                )}
              </Box>
            </Box>

            {/* ★ سبد خرید */}
            <Box sx={{
              width: { xs: "100%", md: 340 },
              minWidth: { md: 300 }, maxWidth: { md: 380 },
              borderLeft: isRtl ? "none" : `1px solid ${C.glassBorder}`,
              borderRight: isRtl ? `1px solid ${C.glassBorder}` : "none",
              bgcolor: C.glass, backdropFilter: "blur(28px)",
              WebkitBackdropFilter: "blur(28px)",
              display: { xs: "none", md: "flex" }, flexDirection: "column",
              overflowY: "auto", p: 2,
              position: "sticky", top: 48,
              height: "calc(100vh - 48px)", flexShrink: 0,
            }}>
              <CartPanel
                cart={cart} cartCount={cartCount} cartTotal={cartTotal}
                categoryDiscounts={categoryDiscounts}
                onAdd={addToCart} onRemove={removeFromCart} onClear={clearCart}
                orderType={orderType} setOrderType={setOrderType}
                custName={custName} setCustName={setCustName}
                custPhone={custPhone} setCustPhone={setCustPhone}
                requireCustomer={requireCustomer}
                onCheckout={handleCheckoutClick}
                C={C} isRtl={isRtl}
              />
            </Box>
          </Box>
        )}

        {mainTab === "report" && (
          <Box sx={{ p: 3 }}>
            <Box sx={{ ...glassCardSx, p: 3 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 20, mb: 2, fontFamily: "'Vazirmatn', sans-serif" }}>
                {isRtl ? "گزارش روز" : "Daily Report"}
              </Typography>
              <Typography sx={{ color: C.sub, fontSize: 14 }}>
                {isRtl ? "گزارش مالی اینجا نمایش داده می‌شود..." : "Report will appear here..."}
              </Typography>
            </Box>
          </Box>
        )}

        {mainTab === "online" && (
          <Box sx={{ p: 3 }}>
            <Box sx={{ ...glassCardSx, p: 3 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 20, mb: 2, fontFamily: "'Vazirmatn', sans-serif" }}>
                {isRtl ? "فروش آنلاین" : "Online Orders"}
              </Typography>
              <Typography sx={{ color: C.sub, fontSize: 14 }}>
                {isRtl ? "سفارشات آنلاین اینجا نمایش داده می‌شود..." : "Online orders will appear here..."}
              </Typography>
            </Box>
          </Box>
        )}
      </Box>

      <CheckoutDialog
        open={checkoutOpen} onClose={closeCheckout}
        cartTotal={cartTotal} onSubmit={handlePayment}
        submitting={submitting} error={error}
        C={C} isRtl={isRtl}
      />
      <ReceiptDialog
        open={receiptOpen} onClose={() => closeReceipt()}
        lastOrder={lastOrder} C={C} isRtl={isRtl}
      />

      <Snackbar
        open={toast.open} autoHideDuration={3000}
        onClose={() => setToast({ ...toast, open: false })}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert severity={toast.type} sx={{
          bgcolor: C.glass, backdropFilter: "blur(16px)",
          color: C.text, border: `1px solid ${C.olive}`,
          borderRadius: "12px", fontFamily: "'Vazirmatn', sans-serif",
        }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}