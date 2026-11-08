import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Box, Typography, Drawer, Badge } from "@mui/material";
import { Storefront, Assessment, ShoppingCart, Notifications, QrCode2 } from "@mui/icons-material";
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
import useBarcodeScanner from "./hooks/useBarcodeScanner";
import { lookupBarcode } from "./api";
import { beepOk, beepError } from "./common/beep";

import PosHeader from "./components/PosHeader";
import CategoryBar from "./components/CategoryBar";
import FoodGrid from "./components/FoodGrid";
import ManualItemInput from "./components/ManualItemInput";
import CartPanel from "./components/CartPanel";
import CheckoutDialog from "./components/CheckoutDialog";
import DailyReport from "./components/DailyReport";
import OrderDetailDialog from "./components/OrderDetailDialog";
import DaySummary from "./components/DaySummary";
import IncomingOrders from "./components/IncomingOrders";
import useIncomingOrders from "./hooks/useIncomingOrders";
import { buildColors } from "@shared/palette";
import useShortcuts from "@shared/common/useShortcuts";
import ShortcutsHelpDialog from "@shared/common/ShortcutsHelpDialog";
import { buildGlassCardSx, useToast, ToastSnackbar, formatMoney } from "./common";

const NAV_ITEMS = [
  { key: "pos", icon: Storefront, labelKey: "ui_c.pos.nav_pos" },
  { key: "report", icon: Assessment, labelKey: "ui_c.pos.nav_report" },
  { key: "incoming", icon: Notifications, labelKey: "ui_f.incoming.nav" },
];

const ORDER_TYPES = [
  { key: "hall", labelKey: "ui_l.pos.type_hall" },
  { key: "takeout", labelKey: "ui_l.pos.type_takeout" },
  { key: "delivery", labelKey: "ui_l.pos.type_delivery" },
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
  const [reportView, setReportView] = useState("orders"); // orders | summary

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
      const s = u.tenant_slug || u.slug || u.business_slug || u.tenant?.slug || u.business?.slug;
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
    allFoods, reload,
  } = useFoods(useDictionary, isRtl);

  const {
    cart, addToCart, removeFromCart, removeOneFromCart, updateQty, clearCart,
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
  } = useDailyReport(mainTab === "report");

  const analytics = useAnalytics(dailyOrders);
  const deleteCartLine = useCallback((cartId) => updateQty(cartId, 0), [updateQty]);


  useEffect(() => {
    const tmr = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(tmr);
  }, []);

  useEffect(() => {
    setActiveCat("all");
  }, [isRtl]);

  const C = useMemo(() => buildColors(isDark), [isDark]);

  const glassCardSx = useMemo(() => buildGlassCardSx(C), [C]);

  // Adds a product to the cart without exceeding the server's effective stock.
  const tryAdd = useCallback((item) => {
    if (!item.is_manual && item.id != null) {
      const live = allFoods.find((f) => f.id === item.id);
      const stock = live ? live.stock : item.stock;
      if (stock != null) {
        const inCart = cart.filter((c) => c.id === item.id && !c.is_manual).reduce((n, c) => n + c.qty, 0);
        const inc = inCart > 0 ? 1 : (item.qty || 1);
        if (inCart + inc > stock) {
          beepError();
          showToast(
            stock <= 0
              ? t("ui_pos2.scan.out_of_stock", { name: item.name })
              : t("ui_pos2.stock.limit", { name: item.name, n: stock }),
            "error",
          );
          return false;
        }
      }
    }
    addToCart(item);
    return true;
  }, [allFoods, cart, addToCart, showToast, t]);

  const tryAddRef = useRef(tryAdd);
  useEffect(() => { tryAddRef.current = tryAdd; });

  // Barcode (USB wedge burst or typed in the search box + Enter) -> catalog lookup -> cart.
  const handleScan = useCallback(async (raw) => {
    const code = String(raw || "").trim();
    if (!code) return;
    setSearch("");
    try {
      const p = await lookupBarcode(code);
      if (!p) throw new Error("empty");
      if (p.is_available === false) {
        beepError();
        showToast(t("ui_pos2.scan.unavailable", { name: p.name }), "error");
        return;
      }
      const price = Number(p.price) || 0;
      const fin = Number(p.final_price) || 0;
      const live = allFoods.find((f) => f.id === p.id);
      const item = {
        id: p.id, name: p.name, name_en: p.name_en || "",
        category: p.category || "",
        category_en: live?.category_name_en || p.category || "",
        price, discount: fin > 0 && fin < price ? price - fin : 0,
        stock: Number(p.stock) || 0, is_manual: false,
      };
      if (tryAddRef.current(item)) {
        beepOk();
        showToast(t("ui_pos2.scan.added", { name: p.name }), "success");
      }
    } catch (err) {
      beepError();
      showToast(
        err?.response?.status === 404
          ? t("ui_pos2.scan.unknown", { code })
          : t("ui_pos2.scan.error"),
        "error",
      );
    }
  }, [allFoods, setSearch, showToast, t]);

  useBarcodeScanner({ enabled: mainTab === "pos" && !!useDictionary, onScan: handleScan });

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
      clearCart();
      reload(); // effective stock is decided by the server
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

  const focusCart = () => {
    const rows = Array.from(document.querySelectorAll("[data-cart-row]")).filter((el) => el.offsetParent !== null);
    if (!rows.length) return false;
    rows[0].focus();
    return true;
  };

  const shortcuts = [
    { combo: "F1", label: t("shortcuts.help"), handler: () => setHelpOpen(true) },
    { combo: "F2", label: t("ui_g.pos.new_order"), handler: newOrder },
    { combo: "Ctrl+D", label: t("ui_g.pos.checkout"), handler: handleCheckoutClick, when: mainTab === "pos" },
    { combo: "/", label: t("ui_g.pos.focus_search"), when: mainTab === "pos" && !!useDictionary,
      handler: () => document.getElementById("pos-search-input")?.focus() },
    { combo: "F4", label: t("ui_l.pos.toggle_edit"), when: mainTab === "pos" && !!useDictionary,
      handler: () => setEditMode((v) => !v) },
    { combo: "Escape", label: t("ui_l.pos.exit_edit"), when: mainTab === "pos" && editMode,
      handler: () => (editMode ? setEditMode(false) : false) },
    { combo: "Alt+C", label: t("ui_l.pos.focus_cart"), when: mainTab === "pos", handler: focusCart },
    ...ORDER_TYPES.map(({ key, labelKey }, i) => ({
      combo: `Ctrl+Shift+${i + 1}`,
      label: t("ui_l.pos.order_type_n", { name: t(labelKey) }),
      when: mainTab === "pos",
      handler: () => setOrderType(key),
    })),
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
      { combo: t("ui_pos2.help.scan_combo"), label: t("ui_pos2.help.scan") },
      { combo: "Alt+PageDown", label: t("ui_l.pos.next_category") },
      { combo: "Alt+PageUp", label: t("ui_l.pos.prev_category") },
      { combo: "Ctrl+A / Ctrl+Z", label: t("ui_l.pos.cart_next_row") + " / " + t("ui_l.pos.cart_prev_row") },
      { combo: "Delete", label: t("ui_l.pos.cart_row_remove") },
      { combo: "+", label: t("ui_l.pos.cart_row_inc") },
      { combo: "-", label: t("ui_l.pos.cart_row_dec") },
    ] : []),
    ...(mainTab === "report" ? [
      { combo: "Ctrl+Z", label: t("shortcuts.prev") },
      { combo: "Ctrl+A", label: t("shortcuts.next") },
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
    onAdd: tryAdd, onRemove: removeFromCart, onDelete: deleteCartLine, onClear: clearCart,
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
        bgcolor: C.glass,        position: "sticky", top: 0, zIndex: 100,
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
                  bgcolor: C.burgundy, color: "var(--on-primary)", fontSize: 11, fontWeight: 900,
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
                search={search} setSearch={setSearch} onScanCode={handleScan} C={C}
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
                    onAdd={tryAdd}
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
              bgcolor: C.glass,              display: { xs: "none", md: "flex" }, flexDirection: "column",
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
                borderTop: `1px solid ${C.glassBorder}`,
                px: 1.5, py: 1,
                alignItems: "center", justifyContent: "space-between",
                boxShadow: "0 -4px 20px color-mix(in srgb, var(--ink) 20%, transparent)",
                cursor: cart.length > 0 ? "pointer" : "default",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1 }}>
                <Badge
                  badgeContent={cartCount}
                  color="error"
                  sx={{
                    "& .MuiBadge-badge": {
                      bgcolor: C.burgundy, color: "var(--on-primary)",
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
                color: cart.length > 0 ? "var(--on-primary)" : C.muted,
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
                    bgcolor: "var(--surface-sunken)",
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
            <Box role="tablist" sx={{ display: "flex", gap: 0.8, mb: 1.2, flexWrap: "wrap" }}>
              {[["orders", "ui_pos2.tabs.orders"], ["summary", "ui_pos2.tabs.summary"]].map(([key, labelKey]) => (
                <Box
                  key={key} role="tab" tabIndex={0} aria-selected={reportView === key}
                  onClick={() => setReportView(key)}
                  onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && setReportView(key)}
                  sx={{
                    px: 1.8, py: 0.7, borderRadius: "10px", cursor: "pointer", fontSize: 13,
                    fontWeight: reportView === key ? 800 : 500, fontFamily: "'Vazirmatn', sans-serif",
                    color: reportView === key ? C.primary : C.sub,
                    bgcolor: reportView === key ? C.primarySubtle : "transparent",
                    border: `1px solid ${reportView === key ? C.primary : C.glassBorder}`,
                  }}
                >
                  {t(labelKey)}
                </Box>
              ))}
            </Box>
            <Box sx={{ ...glassCardSx, p: { xs: 1.5, sm: 2 } }}>
              {reportView === "summary" ? (
                <DaySummary
                  date={selectedDate} isToday={isToday}
                  onPrevDay={goPrevDay} onNextDay={goNextDay} onGoToday={goToday}
                  C={C} isRtl={isRtl} lang={lang}
                />
              ) : (
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
              )}
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

        {mainTab === "incoming" && (
          <IncomingOrders
            {...incoming}
            accepted={accepted} setAccepted={setAccepted}
            onToast={showToast}
            C={C} glassCardSx={glassCardSx} isRtl={isRtl} lang={lang}
          />
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