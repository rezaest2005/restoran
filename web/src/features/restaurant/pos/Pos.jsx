import { useEffect, useState, useMemo } from "react";
import { Box, Snackbar, Alert, Typography, Drawer, Badge } from "@mui/material";
import { Storefront, Assessment, Public, Settings, ShoppingCart } from "@mui/icons-material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";

import usePosSettings from "./hooks/usePosSettings";
import useFoods from "./hooks/useFoods";
import useCart from "./hooks/useCart";
import useCheckout from "./hooks/useCheckout";
import useDailyReport from "./hooks/useDailyReport";
import useAnalytics from "./hooks/useAnalytics";
import usePaymentConfig from "./hooks/usePaymentConfig";

import PosHeader from "./components/PosHeader";
import CategoryBar from "./components/CategoryBar";
import FoodGrid from "./components/FoodGrid";
import ManualItemInput from "./components/ManualItemInput";
import CartPanel from "./components/CartPanel";
import CheckoutDialog from "./components/CheckoutDialog";
import DailyReport from "./components/DailyReport";
import OrderDetailDialog from "./components/OrderDetailDialog";
import PaymentSettingsPage from "./components/PaymentSettingsPage";

const NAV_ITEMS = [
  { key: "pos", icon: Storefront, labelFa: "صندوق فروش", labelEn: "POS" },
  { key: "report", icon: Assessment, labelFa: "گزارش روز", labelEn: "Report" },
  { key: "online", icon: Public, labelFa: "فروش آنلاین", labelEn: "Online" },
  { key: "settings", icon: Settings, labelFa: "تنظیمات", labelEn: "Settings" },
];

export default function Pos() {
  const { mode } = useThemeMode();
  const { isRtl } = useLang();
  const isDark = mode === "dark";

  const [mounted, setMounted] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [orderType, setOrderType] = useState("hall");
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [toast, setToast] = useState({ open: false, message: "", type: "info" });
  const [mainTab, setMainTab] = useState("pos");
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  const {
    settings, loading: settingsLoading,
    useDictionary, showStock, requireCustomer, defaultPayment,
  } = usePosSettings();

  const {
    foods, categoryNames, loading: foodsLoading,
    search, setSearch, activeCat, setActiveCat,
    reload, decreaseStock,
  } = useFoods(useDictionary, isRtl);

  const {
    cart, addToCart, removeFromCart, removeOneFromCart, clearCart,
    cartTotal, cartCount, toOrderItems,
    categoryDiscounts, setCategoryDiscount,
  } = useCart();

  const {
    checkoutOpen, lastOrder, submitting, error,
    openCheckout, closeCheckout, submitOrder,
  } = useCheckout();

  const {
    orders: dailyOrders, loading: reportLoading,
    selectedOrder, detailOpen, openDetail, closeDetail,
    reload: reloadReport,
    selectedDate, isToday,
    goPrevDay, goNextDay, goToday,
  } = useDailyReport();

  const analytics = useAnalytics(dailyOrders);

  const {
    gateways, terminals, loading: configLoading,
    saving: configSaving, testing, testResult,
    save: saveConfig, remove: removeConfig, test: testConfig,
  } = usePaymentConfig(mainTab === "settings");

  useEffect(() => {
    const tmr = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(tmr);
  }, []);

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
    setMobileCartOpen(false);
    openCheckout();
  };

  const handlePayment = async (method) => {
    const items = toOrderItems();
    const result = await submitOrder({
      items, customerName: custName, phone: custPhone,
      orderType, paymentMethod: method,
    });
    if (result) {
      for (const item of cart) {
        await decreaseStock(item.id, item.qty);
      }
      clearCart();
      setCustName("");
      setCustPhone("");
      reloadReport();
      setToast({ open: true, message: `سفارش #${result.order_id} ثبت شد`, type: "success" });
    }
    return result;
  };

  return (
    <Box
      dir={isRtl ? "rtl" : "ltr"}
      sx={{
        fontFamily: "'Vazirmatn', sans-serif",
        minHeight: "100vh", height: "100vh",
        color: C.text,
        opacity: mounted ? 1 : 0,
        transition: "opacity 0.5s ease",
        display: "flex", flexDirection: "column",
        overflow: "hidden", bgcolor: C.bg,
      }}
    >
      {/* ═══ نوبار بالا ═══ */}
      <Box sx={{
        display: "flex", alignItems: "center",
        gap: { xs: 0.2, sm: 0.5 },
        px: { xs: 1, sm: 2 },
        borderBottom: `1px solid ${C.glassBorder}`,
        bgcolor: C.glass, backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        position: "sticky", top: 0, zIndex: 100,
        minHeight: 48, flexShrink: 0,
        overflowX: "auto",
        "&::-webkit-scrollbar": { display: "none" },
        scrollbarWidth: "none",
      }}>
        {NAV_ITEMS.map(({ key, icon: Icon, labelFa, labelEn }) => {
          const active = mainTab === key;
          return (
            <Box key={key} onClick={() => setMainTab(key)} sx={{
              display: "flex", alignItems: "center",
              gap: { xs: 0.4, sm: 0.8 },
              px: { xs: 1.2, sm: 2 },
              py: 1.2, cursor: "pointer", position: "relative",
              borderRadius: "10px 10px 0 0", transition: "all 0.2s ease",
              bgcolor: active ? `${C.olive}12` : "transparent",
              flexShrink: 0,
              "&:hover": { bgcolor: active ? `${C.olive}12` : `${C.olive}06` },
            }}>
              <Icon sx={{ fontSize: { xs: 16, sm: 18 }, color: active ? C.olive : C.muted }} />
              <Typography sx={{
                fontSize: { xs: 11, sm: 13 },
                fontWeight: active ? 800 : 500,
                color: active ? C.olive : C.muted,
                fontFamily: "'Vazirmatn', sans-serif",
                whiteSpace: "nowrap",
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
      <Box sx={{
        flex: 1, display: "flex", flexDirection: "column",
        overflow: "auto", minHeight: 0,
      }}>

        {mainTab === "pos" && (
          <Box sx={{
            flex: 1, display: "flex",
            flexDirection: { xs: "column", md: isRtl ? "row-reverse" : "row" },
            overflow: "hidden", minHeight: 0,
          }}>
            <Box sx={{
              flex: 1, overflowY: "auto",
              p: { xs: 1, sm: 2 },
              display: "flex", flexDirection: "column", gap: 1.5, minHeight: 0,
              pb: { xs: 10, md: 2 },
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
              <Box sx={{ ...glassCardSx, p: { xs: 1, sm: 2 }, flex: 1, minHeight: 0 }}>
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
                    onSave={reload}
                    onExitEdit={() => setEditMode(false)}
                    categoryDiscounts={categoryDiscounts}
                  />
                ) : (
                  <ManualItemInput onAdd={handleAddManual} C={C} isRtl={isRtl} />
                )}
              </Box>
            </Box>

            {/* سبد خرید دسکتاپ */}
            <Box sx={{
              width: { xs: "100%", md: 340 },
              minWidth: { md: 300 }, maxWidth: { md: 380 },
              borderLeft: isRtl ? "none" : { md: `1px solid ${C.glassBorder}` },
              borderRight: isRtl ? { md: `1px solid ${C.glassBorder}` } : "none",
              bgcolor: C.glass, backdropFilter: "blur(28px)",
              WebkitBackdropFilter: "blur(28px)",
              display: { xs: "none", md: "flex" }, flexDirection: "column",
              overflowY: "auto", p: 2,
              position: { md: "sticky" }, top: 48,
              height: { md: "calc(100vh - 48px)" }, flexShrink: 0,
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
                paymentMethod={paymentMethod}
                setPaymentMethod={setPaymentMethod}
                submitting={submitting}
                C={C} isRtl={isRtl}
              />
            </Box>


            {/* نوار پایین موبایل — همیشه نمایش داده بشه */}
                        {/* نوار پایین موبایل */}
            <Box sx={{
              display: { xs: "flex", md: "none" },
              position: "fixed", bottom: 0, left: 0, right: 0,
              zIndex: 99, bgcolor: C.glass,
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              borderTop: `1px solid ${C.glassBorder}`,
              px: 1.5, py: 1,
              alignItems: "center", justifyContent: "space-between",
              boxShadow: "0 -4px 20px rgba(0,0,0,0.2)",
            }}>
              <Box
                onClick={() => setMobileCartOpen(true)}
                sx={{
                  display: "flex", alignItems: "center", gap: 1,
                  cursor: "pointer", flex: 1,
                }}
              >
                <Badge
                  badgeContent={cartCount}
                  color="error"
                  sx={{
                    "& .MuiBadge-badge": {
                      bgcolor: C.burgundy, color: "#fff",
                      fontFamily: "'Vazirmatn', sans-serif",
                      fontSize: 10, fontWeight: 800,
                      minWidth: 18, height: 18,
                    },
                  }}
                >
                  <ShoppingCart sx={{ fontSize: 22, color: C.olive }} />
                </Badge>
                <Box>
                  <Typography sx={{
                    fontSize: 10, color: C.muted, fontWeight: 600,
                    fontFamily: "'Vazirmatn', sans-serif",
                    lineHeight: 1.2,
                  }}>
                    {cartCount} {isRtl ? "آیتم" : "items"}
                  </Typography>
                  <Typography sx={{
                    fontSize: 15, fontWeight: 900, color: C.olive,
                    fontFamily: "'Vazirmatn', sans-serif",
                    lineHeight: 1.3,
                  }}>
                    {cartTotal.toLocaleString()}
                    <Typography component="span" sx={{
                      fontSize: 10, fontWeight: 600, color: C.muted,
                      fontFamily: "'Vazirmatn', sans-serif",
                      mr: 0.5, ml: 0.3,
                    }}>
                      {isRtl ? "تومان" : "Toman"}
                    </Typography>
                  </Typography>
                </Box>
              </Box>

              {/* ★ دکمه سبد خرید به جای تسویه */}
              <Box onClick={() => setMobileCartOpen(true)} sx={{
                bgcolor: cart.length > 0 ? C.olive : `${C.muted}30`,
                color: cart.length > 0 ? "#fff" : C.muted,
                borderRadius: "12px", px: { xs: 2, sm: 3 }, py: 1,
                fontWeight: 800, fontSize: { xs: 13, sm: 14 },
                fontFamily: "'Vazirmatn', sans-serif",
                cursor: cart.length > 0 ? "pointer" : "default",
                display: "flex", alignItems: "center", gap: 0.6,
                transition: "all 0.2s ease",
                "&:hover": cart.length > 0 ? { opacity: 0.88 } : {},
              }}>
                <ShoppingCart sx={{ fontSize: 17 }} />
                {isRtl ? "سبد خرید" : "Cart"}
                {cartCount > 0 && (
                  <Box sx={{
                    minWidth: 18, height: 18, borderRadius: "50%",
                    bgcolor: "rgba(255,255,255,0.3)",
                    display: "flex", alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11, fontWeight: 900,
                  }}>
                    {cartCount}
                  </Box>
                )}
              </Box>
            </Box>

            {/* دراور سبد خرید موبایل */}
            <Drawer
              anchor={isRtl ? "right" : "left"}
              open={mobileCartOpen}
              onClose={() => setMobileCartOpen(false)}
              sx={{
                display: { xs: "block", md: "none" },
                "& .MuiDrawer-paper": {
                  width: "100%",
                  maxWidth: 380,
                  bgcolor: C.bg,
                  color: C.text,
                  fontFamily: "'Vazirmatn', sans-serif",
                },
              }}
            >
              <Box sx={{
                display: "flex", flexDirection: "column",
                height: "100%", overflow: "auto",
                p: 2,
              }}>
                {/* هدر دراور */}
                <Box sx={{
                  display: "flex", alignItems: "center",
                  justifyContent: "space-between", mb: 2,
                  pb: 1.5, borderBottom: `1px solid ${C.glassBorder}`,
                }}>
                  <Typography sx={{
                    fontWeight: 800, fontSize: 16,
                    fontFamily: "'Vazirmatn', sans-serif",
                    color: C.text,
                  }}>
                    {isRtl ? "سبد خرید" : "Cart"}
                  </Typography>
                  <Box onClick={() => setMobileCartOpen(false)} sx={{
                    width: 32, height: 32, borderRadius: "8px",
                    bgcolor: `${C.muted}15`, display: "flex",
                    alignItems: "center", justifyContent: "center",
                    cursor: "pointer", fontSize: 18, color: C.muted,
                    "&:hover": { bgcolor: `${C.muted}25` },
                  }}>
                    ×
                  </Box>
                </Box>

                {/* محتوای سبد */}
                <Box sx={{ flex: 1, overflow: "auto" }}>
                  <CartPanel
                    cart={cart} cartCount={cartCount} cartTotal={cartTotal}
                    categoryDiscounts={categoryDiscounts}
                    onAdd={addToCart} onRemove={removeFromCart} onClear={clearCart}
                    orderType={orderType} setOrderType={setOrderType}
                    custName={custName} setCustName={setCustName}
                    custPhone={custPhone} setCustPhone={setCustPhone}
                    requireCustomer={requireCustomer}
                    onCheckout={handleCheckoutClick}
                    paymentMethod={paymentMethod}
                    setPaymentMethod={setPaymentMethod}
                    submitting={submitting}
                    C={C} isRtl={isRtl}
                  />
                </Box>
              </Box>
            </Drawer>
          </Box>
        )}

        {mainTab === "report" && (
          <Box sx={{ p: { xs: 1, sm: 2 }, overflowY: "auto", flex: 1, pb: 2 }}>
            <Box sx={{ ...glassCardSx, p: { xs: 1.5, sm: 2 } }}>
              <DailyReport
                orders={dailyOrders}
                loading={reportLoading}
                onRowClick={openDetail}
                onReload={reloadReport}
                C={C}
                isRtl={isRtl}
                selectedDate={selectedDate}
                isToday={isToday}
                onPrevDay={goPrevDay}
                onNextDay={goNextDay}
                onGoToday={goToday}
                analytics={analytics}
              />
            </Box>
            <OrderDetailDialog
              open={detailOpen}
              onClose={closeDetail}
              order={selectedOrder}
              C={C}
              isRtl={isRtl}
            />
          </Box>
        )}

        {mainTab === "online" && (
          <Box sx={{ p: { xs: 1.5, sm: 3 }, overflowY: "auto", flex: 1 }}>
            <Box sx={{ ...glassCardSx, p: { xs: 2, sm: 3 } }}>
              <Typography sx={{
                fontWeight: 800, fontSize: { xs: 17, sm: 20 }, mb: 2,
                fontFamily: "'Vazirmatn', sans-serif",
              }}>
                {isRtl ? "فروش آنلاین" : "Online Orders"}
              </Typography>
              <Typography sx={{ color: C.sub, fontSize: 14 }}>
                {isRtl ? "سفارشات آنلاین اینجا نمایش داده می‌شود..." : "Online orders will appear here..."}
              </Typography>
            </Box>
          </Box>
        )}

        {mainTab === "settings" && (
          <Box sx={{ p: { xs: 1, sm: 2 }, overflowY: "auto", flex: 1 }}>
            <Box sx={{ ...glassCardSx, p: { xs: 1.5, sm: 2.5 }, maxWidth: 800 }}>
              <PaymentSettingsPage
                gateways={gateways}
                terminals={terminals}
                loading={configLoading}
                saving={configSaving}
                testing={testing}
                testResult={testResult}
                onSave={saveConfig}
                onDelete={removeConfig}
                onTest={testConfig}
                isRtl={isRtl}
              />
            </Box>
          </Box>
        )}
      </Box>

      <CheckoutDialog
        open={checkoutOpen}
        onClose={closeCheckout}
        C={C}
        isRtl={isRtl}
        lastOrder={lastOrder}
        cart={cart}
        cartTotal={cartTotal}
        onSubmit={handlePayment}
        submitting={submitting}
        error={error}
      />

      <Snackbar
        open={toast.open} autoHideDuration={3000}
        onClose={() => setToast({ ...toast, open: false })}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert severity={toast.type} sx={{
          bgcolor: C.glass,
          backdropFilter: "blur(16px)",
          color: C.text,
          border: `1px solid ${C.olive}`,
          borderRadius: "12px",
          fontFamily: "'Vazirmatn', sans-serif",
        }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}