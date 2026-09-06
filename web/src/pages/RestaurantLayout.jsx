import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Box, Typography, Button, IconButton, Drawer, Divider, Chip,
  Snackbar, Alert, useMediaQuery, useTheme
} from "@mui/material";
import { useThemeMode } from "../contexts/ThemeContext";
import { useLang } from "../contexts/LangContext";

/* ═══════════════════════════════════════
   ۱. کانفیگ منوها و ثابت‌ها
═══════════════════════════════════════ */
const NAV_SECTIONS = [
  {
    titleKey: "rest.nav_management",
    items: [
      { icon: "🔥", labelKey: "rest.nav_kitchen", path: "/dashboard/app/kitchen" },
      { icon: "💻", labelKey: "rest.nav_pos", path: "/dashboard/app/pos" },
      { icon: "📒", labelKey: "rest.nav_orders", path: "/dashboard/app/orders" },
      { icon: "📖", labelKey: "rest.nav_recipes", path: "/dashboard/app/recipes" },
    ],
  },
  {
    titleKey: "rest.nav_inventory",
    items: [
      { icon: "📦", labelKey: "rest.nav_raw_materials", path: "/dashboard/app/raw-materials" },
      { icon: "🛍️", labelKey: "rest.nav_ready_materials", path: "/dashboard/app/ready-materials" },
      { icon: "🧾", labelKey: "rest.nav_invoices", path: "/dashboard/app/invoices" },
    ],
  },
  {
    titleKey: "rest.nav_tools",
    items: [
      { icon: "⏱️", labelKey: "rest.nav_usage_log", path: "/dashboard/app/usage-log" },
      { icon: "📚", labelKey: "rest.nav_dictionary", path: "/dashboard/app/dictionary" },
    ],
  },
  {
    titleKey: "rest.nav_system",
    items: [
      { icon: "👥", labelKey: "rest.nav_users", path: "/dashboard/app/users" },
    ],
  },
];

const DASHBOARDS = [
  { icon: "🚴", labelKey: "rest.dash_delivery", locked: true },
  { icon: "🧮", labelKey: "rest.dash_accounting", locked: true },
  { icon: "💎", labelKey: "rest.dash_loyalty", locked: true },
];

const animations = `
  @keyframes orb1 { 0%, 100% { transform: translate(0, 0) scale(1); } 25% { transform: translate(60px, -80px) scale(1.1); } 50% { transform: translate(-20px, -40px) scale(0.95); } 75% { transform: translate(-50px, 50px) scale(1.05); } }
  @keyframes orb2 { 0%, 100% { transform: translate(0, 0) scale(1); } 33% { transform: translate(-70px, 60px) scale(0.92); } 66% { transform: translate(50px, -70px) scale(1.12); } }
  @keyframes orb3 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(40px, -50px) scale(1.06); } }
  @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-6px); } }
  @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
  @keyframes breathe { 0%, 100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 0.6; transform: scale(1.02); } }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
`;

/* ═══════════════════════════════════════
   ۲. کامپوننت اصلی لایوت
═══════════════════════════════════════ */
export default function RestaurantLayout() {
  const { mode, toggleTheme } = useThemeMode();
  const { isRtl, toggleLang, lang } = useLang();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const muiTheme = useTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down("md"));
  const isDark = mode === "dark";

  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("restaurant");
  const [toast, setToast] = useState({ open: false, message: "", type: "info" });

  useEffect(() => {
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [isRtl, lang]);

  useEffect(() => {
    const tmr = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(tmr);
  }, []);

  /* ── پالت رنگ‌ها و استایل‌ها ── */
  const C = useMemo(() => ({
    bg: isDark ? "#0B0A0B" : "#E4E8F0",
    bgWarm: isDark
      ? "radial-gradient(ellipse at 25% 15%, rgba(61,90,62,0.07) 0%, transparent 50%), radial-gradient(ellipse at 75% 85%, rgba(120,30,58,0.06) 0%, transparent 50%)"
      : "radial-gradient(ellipse at 15% 10%, rgba(80,100,160,0.1) 0%, transparent 45%), radial-gradient(ellipse at 85% 85%, rgba(120,40,70,0.08) 0%, transparent 40%)",
    glass: isDark ? "rgba(16,18,16,0.6)" : "rgba(240,244,252,0.7)",
    glassBorder: isDark ? "rgba(107,155,110,0.1)" : "rgba(80,100,140,0.15)",
    glassShimmer: isDark
      ? "linear-gradient(90deg, transparent 0%, rgba(107,155,110,0.05) 20%, rgba(168,64,96,0.06) 40%, rgba(212,183,106,0.07) 60%, rgba(107,155,110,0.04) 80%, transparent 100%)"
      : "linear-gradient(90deg, transparent 0%, rgba(80,100,160,0.06) 20%, rgba(120,40,70,0.05) 40%, rgba(196,162,101,0.06) 60%, rgba(61,90,62,0.04) 80%, transparent 100%)",
    olive: isDark ? "#6B9B6E" : "#2E4D30",
    oliveLight: isDark ? "#8BB88E" : "#3D5A3E",
    oliveSubtle: isDark ? "rgba(107,155,110,0.08)" : "rgba(46,77,48,0.08)",
    burgundy: isDark ? "#A84060" : "#7A2845",
    gold: isDark ? "#D4B76A" : "#A08040",
    text: isDark ? "#F0ECE8" : "#1A1A24",
    sub: isDark ? "#8A8588" : "#555568",
    muted: isDark ? "#4A4548" : "#8A8A9E",
    inputBg: isDark ? "rgba(11,10,11,0.5)" : "rgba(240,244,252,0.85)",
    btnGrad: isDark ? "linear-gradient(135deg, #3D6B40 0%, #5A8A5D 35%, #6B9B6E 70%, #4A7A4D 100%)" : "linear-gradient(135deg, #1E3A20 0%, #2E4D30 35%, #3D5A3E 70%, #2E4D30 100%)",
    btnHover: isDark ? "linear-gradient(135deg, #4A7A4D 0%, #6B9B6E 35%, #7BAB7E 70%, #5A8A5D 100%)" : "linear-gradient(135deg, #2E4D30 0%, #3D5A3E 35%, #4A6B4B 70%, #3D5A3E 100%)",
    danger: isDark ? "#E84057" : "#C83048",
    dangerBg: isDark ? "rgba(232,64,87,0.12)" : "rgba(200,48,72,0.1)",
    sidebarBg: isDark ? "rgba(11,10,11,0.95)" : "rgba(228,232,240,0.95)",
    sidebarBorder: isDark ? "rgba(107,155,110,0.06)" : "rgba(80,100,140,0.1)",
    headerBg: isDark ? "rgba(16,18,16,0.85)" : "rgba(228,232,240,0.9)",
    headerBorder: isDark ? "rgba(107,155,110,0.08)" : "rgba(80,100,140,0.1)",
    cardShadow: isDark ? "0 8px 60px rgba(0,0,0,0.5), 0 0 80px rgba(107,155,110,0.04), 0 0 120px rgba(168,64,96,0.03)" : "0 8px 60px rgba(0,0,0,0.1), 0 0 60px rgba(74,106,148,0.08), 0 0 100px rgba(46,77,48,0.04)",
    orb1: isDark ? "rgba(107,155,110,0.09)" : "rgba(74,106,148,0.12)",
    orb2: isDark ? "rgba(168,64,96,0.07)" : "rgba(122,40,69,0.1)",
    orb3: isDark ? "rgba(212,183,106,0.06)" : "rgba(160,128,64,0.09)",
  }), [isDark]);

  const showToast = useCallback((message, type = "info") => setToast({ open: true, message, type }), []);
  const handleLockedClick = (nameKey) => {
    const name = t(nameKey);
    showToast(t("rest.locked_msg", { name }), "warning");
  };

  // ★ تابع خروج (Logout)
  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    localStorage.removeItem("db_auth");
    navigate("/dashboard/login");
  };

  /* ── محتوای سایدبار ── */
  const sidebarContent = (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ height: "100%", display: "flex", flexDirection: "column", bgcolor: C.sidebarBg }}>
      {/* لوگو و برند */}
      <Box sx={{ p: 2.5, display: "flex", alignItems: "center", gap: 1.5 }}>
        <Box sx={{ width: 42, height: 42, borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, background: C.btnGrad, color: "#fff", boxShadow: "0 4px 14px rgba(0,0,0,0.2)" }}>🏪</Box>
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: 16, color: C.text, fontFamily: "'Vazirmatn', sans-serif" }}>{t("rest.panel_title")}</Typography>
          <Typography sx={{ fontSize: 9, color: C.muted, fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: "0.15em", textTransform: "uppercase" }}>{t("rest.panel_sub")}</Typography>
        </Box>
      </Box>
      <Divider sx={{ borderColor: C.sidebarBorder, mx: 2 }} />

      {/* دکمه داشبورد اصلی */}
      <Box sx={{ p: 1.5 }}>
        <Button component={Link} to="/dashboard/app" fullWidth sx={{ justifyContent: "flex-start", py: 1, px: 1.5, color: C.olive, fontSize: 13, fontWeight: 700, textTransform: "none", borderRadius: "10px", fontFamily: "'Vazirmatn', sans-serif", bgcolor: C.oliveSubtle, "&:hover": { bgcolor: C.oliveSubtle } }}>🏠 {t("rest.main_dashboard")}</Button>
      </Box>

      {/* تب‌های سایدبار */}
      <Box sx={{ display: "flex", gap: 0.5, px: 1.5, mb: 1 }}>
        {[
          { id: "restaurant", label: t("rest.tab_restaurant"), icon: "🏪" },
          { id: "dashboards", label: t("rest.tab_dashboards"), icon: "📊" },
        ].map((tab) => (
          <Button key={tab.id} onClick={() => setActiveTab(tab.id)} sx={{
            flex: 1, py: 0.8, borderRadius: "8px", fontSize: 11, fontWeight: activeTab === tab.id ? 700 : 500,
            textTransform: "none", fontFamily: "'Vazirmatn', sans-serif", transition: "all 0.2s ease",
            color: activeTab === tab.id ? C.olive : C.sub,
            bgcolor: activeTab === tab.id ? C.oliveSubtle : "transparent",
            border: activeTab === tab.id ? `1px solid ${C.glassBorder}` : "1px solid transparent",
            "&:hover": { bgcolor: C.oliveSubtle }
          }}>{tab.icon} {tab.label}</Button>
        ))}
      </Box>

      {/* لیست منوها */}
      <Box sx={{ flex: 1, overflowY: "auto", py: 1, px: 1.5 }}>
        {activeTab === "restaurant" ? (
          NAV_SECTIONS.map((section, si) => (
            <Box key={si} sx={{ mb: 2 }}>
              <Typography sx={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.15em", textTransform: "uppercase", px: 1.5, mb: 0.5, fontFamily: "'Vazirmatn', sans-serif" }}>{t(section.titleKey)}</Typography>
              {section.items.map((item, ii) => (
                <Box key={ii} component={Link} to={item.path} onClick={() => isMobile && setSidebarOpen(false)} sx={{
                  display: "flex", alignItems: "center", gap: 1.5, px: 1.5, py: 1, borderRadius: "10px", textDecoration: "none",
                  color: C.sub, transition: "all 0.2s ease", "&:hover": { bgcolor: C.oliveSubtle, color: C.olive }
                }}>
                  <Typography sx={{ fontSize: 16, lineHeight: 1 }}>{item.icon}</Typography>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 500, fontFamily: "'Vazirmatn', sans-serif" }}>{t(item.labelKey)}</Typography>
                </Box>
              ))}
            </Box>
          ))
        ) : (
          <Box sx={{ mb: 2 }}>
            <Typography sx={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.15em", textTransform: "uppercase", px: 1.5, mb: 0.5, fontFamily: "'Vazirmatn', sans-serif" }}>{t("rest.nav_dashboards")}</Typography>
            {DASHBOARDS.map((item, ii) => (
              <Box key={ii} onClick={() => handleLockedClick(item.labelKey)} sx={{
                display: "flex", alignItems: "center", gap: 1.5, px: 1.5, py: 1, borderRadius: "10px", cursor: "pointer",
                color: C.sub, transition: "all 0.2s ease", "&:hover": { bgcolor: C.oliveSubtle, color: C.olive }
              }}>
                <Typography sx={{ fontSize: 16, lineHeight: 1 }}>{item.icon}</Typography>
                <Typography sx={{ fontSize: 12.5, fontWeight: 500, flex: 1, fontFamily: "'Vazirmatn', sans-serif" }}>{t(item.labelKey)}</Typography>
                <Chip label={t("rest.coming_soon")} size="small" sx={{ height: 20, fontSize: 9, bgcolor: C.muted + "22", color: C.sub, borderRadius: "4px" }} />
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <Divider sx={{ borderColor: C.sidebarBorder, mx: 2 }} />
      {/* دکمه خروج */}
      <Box sx={{ p: 1.5 }}>
        <Button 
          onClick={handleLogout} // ★ اتصال تابع خروج
          fullWidth 
          sx={{ justifyContent: "flex-start", color: C.danger, fontSize: 12, fontWeight: 600, textTransform: "none", borderRadius: "10px", py: 1, px: 1.5, fontFamily: "'Vazirmatn', sans-serif", "&:hover": { bgcolor: C.dangerBg } }}
        >
          🚪 {t("rest.logout")}
        </Button>
      </Box>
    </Box>
  );

  /* ── رندر اصلی ── */
  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ minHeight: "100vh", bgcolor: C.bg, position: "relative", fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif" }}>
      <style>{animations}</style>

      {/* بک‌گراند انیمیشنی */}
      <Box sx={{ position: "fixed", inset: 0, zIndex: 0, background: C.bgWarm, pointerEvents: "none" }} />
      <Box sx={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: `radial-gradient(circle, ${isDark ? "rgba(107,155,110,0.06)" : "rgba(46,77,48,0.06)"} 1px, transparent 1px)`, backgroundSize: "36px 36px", pointerEvents: "none" }} />
      {[
        { size: 600, pos: { top: "5%", left: "10%" }, bg: C.orb1, anim: "orb1 24s ease-in-out infinite" },
        { size: 500, pos: { bottom: "10%", right: "5%" }, bg: C.orb2, anim: "orb2 28s ease-in-out infinite" },
      ].map((orb, i) => (
        <Box key={i} sx={{ position: "fixed", width: orb.size, height: orb.size, ...orb.pos, borderRadius: "50%", background: orb.bg, filter: "blur(80px)", animation: orb.anim, pointerEvents: "none", zIndex: 0 }} />
      ))}

      {/* سایدبار دسکتاپ */}
      {!isMobile && (
        <Box sx={{ position: "fixed", top: 0, bottom: 0, insetInlineStart: 0, width: 260, borderInlineEnd: `1px solid ${C.sidebarBorder}`, zIndex: 100, overflow: "hidden" }}>
          {sidebarContent}
        </Box>
      )}

      {/* سایدبار موبایل */}
      {isMobile && (
        <Drawer anchor="left" open={sidebarOpen} onClose={() => setSidebarOpen(false)} slotProps={{ paper: { sx: { width: 280, bgcolor: "transparent", border: "none" } } }}>
          {sidebarContent}
        </Drawer>
      )}

      {/* بدنه اصلی */}
      <Box sx={{ position: "relative", zIndex: 2, marginInlineStart: isMobile ? 0 : "260px", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        
        {/* هدر (TopBar) */}
        <Box sx={{
          position: "sticky", top: 0, zIndex: 50, bgcolor: C.headerBg, backdropFilter: "blur(16px)",
          borderBottom: `1px solid ${C.headerBorder}`, px: { xs: 1.5, md: 3 }, py: 1.5,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1
        }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
            {isMobile && (
              <IconButton onClick={() => setSidebarOpen(true)} size="small" sx={{ color: C.text, border: `1px solid ${C.glassBorder}`, borderRadius: "10px", bgcolor: C.glass, flexShrink: 0 }}>
                <Typography sx={{ fontSize: 18, lineHeight: 1 }}>☰</Typography>
              </IconButton>
            )}
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0, overflow: "hidden" }}>
              <Typography component={Link} to="/dashboard/app" sx={{ fontSize: 14, color: C.olive, textDecoration: "none", fontWeight: 800, fontFamily: "'Vazirmatn', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {t("rest.breadcrumb_dashboard")}
              </Typography>
            </Box>
          </Box>

          {/* دکمه‌های هدر */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
            <IconButton onClick={toggleTheme} size="small" sx={{ color: C.text, border: `1px solid ${C.glassBorder}`, borderRadius: "10px", bgcolor: C.glass, py: 0.5, px: 1, "&:hover": { bgcolor: C.oliveSubtle, borderColor: C.olive } }}>
              <Typography sx={{ fontSize: 14 }}>{isDark ? "☀️" : "🌙"}</Typography>
            </IconButton>
            <Box sx={{ display: "flex", border: `1px solid ${C.glassBorder}`, borderRadius: "10px", overflow: "hidden", bgcolor: C.glass }}>
              {["fa", "en"].map((lng) => (
                <Button key={lng} onClick={() => { if (lang !== lng) toggleLang(); }} sx={{ minWidth: "auto", py: 0.5, px: 1, borderRadius: 0, fontSize: 10, fontWeight: lang === lng ? 700 : 500, color: lang === lng ? C.olive : C.sub, bgcolor: lang === lng ? C.oliveSubtle : "transparent", boxShadow: "none", textTransform: "none", fontFamily: "'Vazirmatn', sans-serif", "&:hover": { bgcolor: C.oliveSubtle } }}>
                  {lng === "fa" ? "فا" : "EN"}
                </Button>
              ))}
            </Box>
          </Box>
        </Box>

        {/* محتوای صفحه */}
        <Box sx={{ flex: 1, p: { xs: 2, md: 3 }, opacity: mounted ? 1 : 0, transition: "opacity 0.5s ease" }}>
          <Outlet />
        </Box>
      </Box>

      {/* نوتیفیکیشن قفل داشبورد */}
      <Snackbar open={toast.open} autoHideDuration={3000} onClose={() => setToast(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: "top", horizontal: "center" }}>
        <Alert onClose={() => setToast(s => ({ ...s, open: false }))} severity={toast.type} sx={{ bgcolor: C.glass, backdropFilter: "blur(16px)", color: C.text, border: `1px solid ${C.olive}`, borderRadius: "12px", fontSize: 13, fontWeight: 600, fontFamily: "'Vazirmatn', sans-serif", boxShadow: C.cardShadow }}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
}