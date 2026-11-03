import { useEffect, useState, useMemo } from "react";
import { Box, Typography, Drawer, Badge } from "@mui/material";
import { Storefront, Assessment, Public, Settings, ShoppingCart, Notifications, QrCode2 } from "@mui/icons-material";
import { useParams } from "react-router-dom";
import TableQrDialog from "@/features/public/TableQrDialog";
import { useTranslation } from "react-i18next";
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
import IncomingOrders from "./components/IncomingOrders";
import useIncomingOrders from "./hooks/useIncomingOrders";
import { buildColors } from "@shared/palette";
import useShortcuts from "@shared/common/useShortcuts";
import ShortcutsHelpDialog from "@shared/common/ShortcutsHelpDialog";
import { buildGlassCardSx, useToast, ToastSnackbar, formatMoney } from "./common";

const NAV_ITEMS = [
  { key: "pos", icon: Storefront, labelKey: "ui_c.pos.nav_pos" },
  { key: "report", icon: Assessment, labelKey: "ui_c.pos.nav_report" },
  { key: "online", icon: Public, labelKey: "ui_c.pos.nav_online" },
  { key: "incoming", icon: Notifications, labelKey: "ui_f.incoming.nav" },
  { key: "settings", icon: Settings, labelKey: "ui_c.pos.nav_settings" },
];

export default function Pos() {
  const { mode } = useThemeMode();
  const { isRtl, lang } = useLang();
  const { t } = useTranslation();
  const params = useParams();
  const isDark = mode === "dark";

  const [mounted, setMounted] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [orderType, setOrderType] = useState("hall");
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const { toast, showToast, closeToast } = useToast();
  const [mainTab, setMainTab] = useState("pos");
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [accepted, setAccepted] = useState([]);
  const [helpOpen, setHelpOpen] = useState(false);

  const incoming = useIncomingOrders({
    onNewOrder: (o) => showToast(
      o.table_number
        ? t("ui_f.incoming.new_order_table", { n: o.table_number })
        : t("ui_f.incoming.new_order"),
      "info",
    ),
  });

  // slug: URL param -> logged-in user object -> slug saved by api client from URL
  const tenantSlug = useMemo(() => {
    if (params.slug) return params.slug;
    try {
      const u = JSON.parse(sessionStorage.getItem("user") || "{}");
      const s = u.tenant_slug || u.slug || u.restaurant_slug || u.tenant?.slug || u.restaurant?.slug;
      if (s) return s;
    } catch { /* ignore */ }
    try { return localStorage.getItem("tenant_slug") || ""; } catch { return ""; }
  }, [params.slug]);

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

  const C = useMemo(() => buildColors(isDark), [isDark]);

  const glassCardSx = useMemo(() => buildGlassCardSx(C), [C]);

  const handleAddManual = (item) => {
    addToCart(item);
    showToast(t("ui_c.pos.added_to_cart", { name: item.name }), "success");
  };

  const handleCheckoutClick = () => {
    if (cart.length === 0) return;
    if (requireCustomer && !custName.trim()) {
      showToast(t("ui_c.pos.customer_required"), "warning");
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
      // ★ استفاده از Promise.all برای کاهش موجودی به صورت همزمان و سریع‌تر
      await Promise.all(cart.map(item => decreaseStock(item.id, item.qty)));
      
      clearCart();
      setCustName("");
      setCustPhone("");
      reloadReport();
      showToast(t("ui_c.pos.order_saved", { id: result.order_id }), "success");
    }
    return result;
  };

  // ── میان‌برهای کیبورد صفحه‌ی صندوق ──
  const newOrder = () => {
    clearCart();
    setCustName("");
    setCustPhone("");
    setMobileCartOpen(false);
    setMainTab("pos");
    setTimeout(() => document.getElementById("pos-search-input")?.focus(), 0);
  };

  const shortcuts = [
    { combo: "F1", label: t("shortcuts.help"), handler: () => setHelpOpen(true) },
    { combo: "F2", label: t("ui_g.pos.new_order"), handler: newOrder },
    { combo: "Ctrl+D", label: t("ui_g.pos.checkout"), handler: handleCheckoutClick, when: mainTab === "pos" },
    { combo: "/", label: t("ui_g.pos.focus_search"), when: mainTab === "pos" && !!useDictionary,
      handler: () => document.getElementById("pos-search-input")?.focus() },
    ...NAV_ITEMS.map(({ labelKey }, i) => ({
      combo: `Alt+${i + 1}`,
      label: `${t("shortcuts.tab_n", { n: i + 1 })} — ${t(labelKey)}`,
      handler: () => setMainTab(NAV_ITEMS[i].key),
    })),
  ];
  useShortcuts(shortcuts);

  // ردیف‌هایی که در کامپوننت‌های فرزند ثبت می‌شوند (فقط برای راهنما)
  const helpItems = [
    ...shortcuts.filter((b) => b.when !== false),
    ...(mainTab === "pos" ? [
      { combo: "Ctrl+A", label: t("ui_g.pos.next_product") },
      { combo: "Ctrl+Z", label: t("ui_g.pos.prev_product") },
      { combo: "Enter", label: t("ui_g.pos.add_product") },
    ] : []),
    ...(mainTab === "incoming" ? [
      { combo: "Ctrl+D", label: t("ui_g.pos.accept_first") },
      { combo: "Ctrl+A", label: t("ui_g.pos.next_order") },
      { combo: "Ctrl+Z", label: t("ui_g.pos.prev_order") },
      { combo: "Delete", label: t("ui_g.pos.reject_focused") },
    ] : []),
    { combo: "Escape", label: t("shortcuts.close_dialog") },
  ];

  // ★ استخراج پراپ‌های CartPanel برای جلوگیری از تکرار کد (DRY)
  const cartPanelProps = {
    cart, cartCount, cartTotal, categoryDiscounts,
    onAdd: addToCart, onRemove: removeFromCart, onClear: clearCart,
    orderType, setOrderType,
    custName, setCustName, custPhone, setCustPhone,
    requireCustomer,
    onCheckout: handleCheckoutClick,
    paymentMethod, setPaymentMethod,
    submitting, C, isRtl,
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
        {NAV_ITEMS.map(({ key, icon: Icon, labelKey }) => {
          const active = mainTab === key;
          return (
            <Box key={key} onClick={() => setMainTab(key)} title={`Alt+${NAV_ITEMS.findIndex((n) => n.key === key) + 1}`} sx={{
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
                {t(labelKey)}
              </Typography>
              {key === "incoming" && incoming.orders.length > 0 && (
                <Box sx={{
                  minWidth: 20, height: 20, px: 0.6, borderRadius: "10px",
                  bgcolor: C.burgundy, color: "#fff", fontSize: 11, fontWeight: 900,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {incoming.orders.length}
                </Box>
              )}
              <Box sx={{
                position: "absolute", bottom: -1, left: "20%", right: "20%",
                height: 3, borderRadius: "3px 3px 0 0", bgcolor: C.olive,
                opacity: active ? 1 : 0, transition: "all 0.25s ease",
              }} />
            </Box>
          );
        })}
        {tenantSlug && (
          <Box
            role="button" tabIndex={0} onClick={() => setQrOpen(true)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setQrOpen(true)}
            sx={{
              ml: isRtl ? 0 : "auto", mr: isRtl ? "auto" : 0,
              display: "flex", alignItems: "center", gap: 0.6, px: 1.2,
              minHeight: 40, cursor: "pointer", flexShrink: 0, borderRadius: "10px",
              color: C.olive, "&:hover": { bgcolor: `${C.olive}10` },
            }}
          >
            <QrCode2 sx={{ fontSize: 18 }} />
            <Typography sx={{ fontSize: { xs: 11, sm: 13 }, fontWeight: 700, fontFamily: "'Vazirmatn', sans-serif", whiteSpace: "nowrap", color: "inherit" }}>
              {t("ui_f.incoming.qr_codes")}
            </Typography>
          </Box>
        )}
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
                    cartItems={cart} // ★ این پراپ اضافه شد تا تعداد در FoodCard آپدیت شود
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
              {/* ★ استفاده از پراپ‌های استخراج شده */}
              <CartPanel {...cartPanelProps} />
            </Box>

            {/* نوار پایین موبایل */}
            <Box 
              onClick={() => cart.length > 0 && setMobileCartOpen(true)} 
              sx={{
                display: { xs: "flex", md: "none" },
                position: "fixed", bottom: 0, left: 0, right: 0,
                zIndex: 99, bgcolor: C.glass,
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                borderTop: `1px solid ${C.glassBorder}`,
                px: 1.5, py: 1,
                alignItems: "center", justifyContent: "space-between",
                boxShadow: "0 -4px 20px rgba(0,0,0,0.2)",
                cursor: cart.length > 0 ? "pointer" : "default",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1 }}>
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
                    {cartCount} {t("ui_c.pos.items")}
                  </Typography>
                  <Typography sx={{
                    fontSize: 15, fontWeight: 900, color: C.olive,
                    fontFamily: "'Vazirmatn', sans-serif",
                    lineHeight: 1.3,
                  }}>
                    {formatMoney(cartTotal)}
                    <Typography component="span" sx={{
                      fontSize: 10, fontWeight: 600, color: C.muted,
                      fontFamily: "'Vazirmatn', sans-serif",
                      mr: 0.5, ml: 0.3,
                    }}>
                      {t("ui_c.pos.toman")}
                    </Typography>
                  </Typography>
                </Box>
              </Box>

              <Box sx={{
                bgcolor: cart.length > 0 ? C.olive : `${C.muted}30`,
                color: cart.length > 0 ? "#fff" : C.muted,
                borderRadius: "12px", px: { xs: 2, sm: 3 }, py: 1,
                fontWeight: 800, fontSize: { xs: 13, sm: 14 },
                fontFamily: "'Vazirmatn', sans-serif",
                display: "flex", alignItems: "center", gap: 0.6,
                transition: "all 0.2s ease",
              }}>
                <ShoppingCart sx={{ fontSize: 17 }} />
                {t("ui_c.pos.cart")}
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
                    {t("ui_c.pos.cart")}
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
                  {/* ★ استفاده از پراپ‌های استخراج شده */}
                  <CartPanel {...cartPanelProps} />
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
                {t("ui_c.pos.online_orders")}
              </Typography>
              <Typography sx={{ color: C.sub, fontSize: 14 }}>
                {t("ui_c.pos.online_orders_will_appear_here")}
              </Typography>
            </Box>
          </Box>
        )}

        {mainTab === "incoming" && (
          <IncomingOrders
            {...incoming}
            accepted={accepted} setAccepted={setAccepted}
            onToast={showToast}
            C={C} glassCardSx={glassCardSx} isRtl={isRtl} lang={lang}
          />
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

      {tenantSlug && (
        <TableQrDialog open={qrOpen} onClose={() => setQrOpen(false)} slug={tenantSlug} />
      )}

      <CheckoutDialog
        open={checkoutOpen}
        onClose={closeCheckout}
        C={C}
        isRtl={isRtl}
        lastOrder={lastOrder}
        defaultMethod={paymentMethod}
        cart={cart}
        cartTotal={cartTotal}
        onSubmit={handlePayment}
        submitting={submitting}
        error={error}
      />

      <ToastSnackbar toast={toast} onClose={closeToast} C={C} />
      <ShortcutsHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} items={helpItems} />
    </Box>
  );
}