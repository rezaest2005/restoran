import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, Outlet, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Box, Typography, Button, IconButton, Drawer, Divider, Chip,
  Snackbar, Alert, CircularProgress, useMediaQuery, useTheme,
} from "@mui/material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";

/* ═══════════════════════════════════════
   ۱. کانفیگ منوها
═══════════════════════════════════════ */

const NAV_SECTIONS = [
  {
    titleKey: "rest.nav_management",
    serviceCode: null,
    items: [
      { icon: "🔥", labelKey: "rest.nav_kitchen", basePath: "kitchen", serviceCode: "kitchen" },
      { icon: "💻", labelKey: "rest.nav_pos", basePath: "pos", serviceCode: "pos" },
      { icon: "📒", labelKey: "rest.nav_orders", basePath: "orders", serviceCode: "pos" },
      { icon: "📖", labelKey: "rest.nav_recipes", basePath: "recipes", serviceCode: "foods" },
    ],
  },
  {
    titleKey: "rest.nav_inventory",
    serviceCode: "inventory",
    items: [
      { icon: "📦", labelKey: "rest.nav_raw_materials", basePath: "raw-materials", serviceCode: "inventory" },
      { icon: "🛍️", labelKey: "rest.nav_ready_materials", basePath: "ready-materials", serviceCode: "inventory" },
      { icon: "🧾", labelKey: "rest.nav_invoices", basePath: "invoices", serviceCode: "inventory" },
    ],
  },
  {
    titleKey: "rest.nav_tools",
    serviceCode: null,
    items: [
      { icon: "⏱️", labelKey: "rest.nav_usage_log", basePath: "usage-log", serviceCode: "inventory" },
      { icon: "📚", labelKey: "rest.nav_dictionary", basePath: "dictionary", serviceCode: "dictionary" },
    ],
  },
  {
    titleKey: "rest.nav_system",
    serviceCode: null,
    items: [
      { icon: "👥", labelKey: "rest.nav_users", basePath: "users", serviceCode: "users" },
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
  @keyframes fadeUp { from { opacity: 0; transform: translateY(20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
`;

/* ═══════════════════════════════════════
   ۲. کامپوننت اصلی
═══════════════════════════════════════ */

export default function RestaurantLayout() {
  const { mode, toggleTheme } = useThemeMode();
  const { isRtl, toggleLang, lang } = useLang();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const muiTheme = useTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down("md"));
  const isDark = mode === "dark";
  const { slug: urlSlug } = useParams();

  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("restaurant");
  const [toast, setToast] = useState({ open: false, message: "", type: "info" });

  const [enabledServices, setEnabledServices] = useState(null);
  const [servicesLoaded, setServicesLoaded] = useState(false);

  const slug = useMemo(() => {
    if (urlSlug) return urlSlug;
    const parts = window.location.pathname.split("/").filter(Boolean);
    const first = parts[0] || "";
    if (first === "dashboard" || first === "super") return "";
    return first;
  }, [urlSlug]);

  const prefix = slug ? `/${slug}/dashboard/app` : "/dashboard/app";

  useEffect(() => {
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [isRtl, lang]);

  useEffect(() => {
    const tmr = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(tmr);
  }, []);

  useEffect(() => {
    if (!slug) {
      setEnabledServices([]);
      setServicesLoaded(true);
      return;
    }

    fetch(`/api/restaurant/services/?slug=${encodeURIComponent(slug)}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (Array.isArray(data.enabled_services)) {
          setEnabledServices(data.enabled_services);
        }
        setServicesLoaded(true);
      })
      .catch(() => {
        setEnabledServices(null);
        setServicesLoaded(true);
      });
  }, [slug]);

  const filteredSections = useMemo(() => {
    if (!servicesLoaded) return null;
    if (!slug) return NAV_SECTIONS;
    if (enabledServices === null) return NAV_SECTIONS;
    if (!enabledServices.length) return [];

    const enabledSet = new Set(enabledServices);

    return NAV_SECTIONS
      .map(sec => {
        if (sec.serviceCode && !enabledSet.has(sec.serviceCode)) return null;
        const items = sec.items.filter(item => {
          if (!item.serviceCode) return true;
          return enabledSet.has(item.serviceCode);
        });
        if (!items.length) return null;
        return { ...sec, items };
      })
      .filter(Boolean);
  }, [enabledServices, servicesLoaded, slug]);

  const C = useMemo(() => ({
    bg: isDark ? "#0B0A0B" : "#E4E8F0",
    bgWarm: isDark
      ? "radial-gradient(ellipse at 25% 15%, rgba(61,90,62,0.07) 0%, transparent 50%), radial-gradient(ellipse at 75% 85%, rgba(120,30,58,0.06) 0%, transparent 50%)"
      : "radial-gradient(ellipse at 15% 10%, rgba(80,100,160,0.1) 0%, transparent 45%), radial-gradient(ellipse at 85% 85%, rgba(120,40,70,0.08) 0%, transparent 40%)",
    glass: isDark ? "rgba(16,18,16,0.6)" : "rgba(240,244,252,0.7)",
    glassBorder: isDark ? "rgba(107,155,110,0.1)" : "rgba(80,100,140,0.15)",
    olive: isDark ? "#6B9B6E" : "#2E4D30",
    oliveSubtle: isDark ? "rgba(107,155,110,0.08)" : "rgba(46,77,48,0.08)",
    text: isDark ? "#F0ECE8" : "#1A1A24",
    sub: isDark ? "#8A8588" : "#555568",
    muted: isDark ? "#4A4548" : "#8A8A9E",
    inputBg: isDark ? "rgba(11,10,11,0.5)" : "rgba(240,244,252,0.85)",
    btnGrad: isDark ? "linear-gradient(135deg, #3D6B40 0%, #5A8A5D 35%, #6B9B6E 70%, #4A7A4D 100%)" : "linear-gradient(135deg, #1E3A20 0%, #2E4D30 35%, #3D5A3E 70%, #2E4D30 100%)",
    danger: isDark ? "#E84057" : "#C83048",
    dangerBg: isDark ? "rgba(232,64,87,0.12)" : "rgba(200,48,72,0.1)",
    sidebarBg: isDark ? "rgba(11,10,11,0.95)" : "rgba(228,232,240,0.95)",
    sidebarBorder: isDark ? "rgba(107,155,110,0.06)" : "rgba(80,100,140,0.1)",
    headerBg: isDark ? "rgba(16,18,16,0.85)" : "rgba(228,232,240,0.9)",
    headerBorder: isDark ? "rgba(107,155,110,0.08)" : "rgba(80,100,140,0.1)",
    cardShadow: isDark ? "0 8px 60px rgba(0,0,0,0.5)" : "0 8px 60px rgba(0,0,0,0.1)",
    orb1: isDark ? "rgba(107,155,110,0.09)" : "rgba(74,106,148,0.12)",
    orb2: isDark ? "rgba(168,64,96,0.07)" : "rgba(122,40,69,0.1)",
  }), [isDark]);

  const showToast = useCallback((message, type = "info") => setToast({ open: true, message, type }), []);
  const handleLockedClick = (nameKey) => showToast(t("rest.locked_msg", { name: t(nameKey) }), "warning");

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    localStorage.removeItem("db_auth");
    navigate(slug ? `/${slug}/dashboard/login` : "/dashboard/login");
  };

  const sidebarContent = (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ height: "100%", display: "flex", flexDirection: "column", bgcolor: C.sidebarBg }}>
      <Box sx={{ p: 2.5, display: "flex", alignItems: "center", gap: 1.5 }}>
        <Box sx={{ width: 42, height: 42, borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, background: C.btnGrad, color: "#fff" }}>🏪</Box>
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: 16, color: C.text }}>{t("rest.panel_title")}</Typography>
          <Typography sx={{ fontSize: 9, color: C.muted, fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase" }}>{t("rest.panel_sub")}</Typography>
        </Box>
      </Box>
      <Divider sx={{ borderColor: C.sidebarBorder, mx: 2 }} />

      <Box sx={{ p: 1.5 }}>
        <Button component={Link} to={prefix} fullWidth onClick={() => isMobile && setSidebarOpen(false)}
          sx={{ justifyContent: "flex-start", py: 1, px: 1.5, color: C.olive, fontSize: 13, fontWeight: 700, textTransform: "none", borderRadius: "10px", bgcolor: C.oliveSubtle, "&:hover": { bgcolor: C.oliveSubtle } }}>
          🏠 {t("rest.main_dashboard")}
        </Button>
      </Box>

      <Box sx={{ display: "flex", gap: 0.5, px: 1.5, mb: 1 }}>
        {[
          { id: "restaurant", label: t("rest.tab_restaurant"), icon: "🏪" },
          { id: "dashboards", label: t("rest.tab_dashboards"), icon: "📊" },
        ].map((tab) => (
          <Button key={tab.id} onClick={() => setActiveTab(tab.id)} sx={{
            flex: 1, py: 0.8, borderRadius: "8px", fontSize: 11, fontWeight: activeTab === tab.id ? 700 : 500,
            textTransform: "none", transition: "all 0.2s ease",
            color: activeTab === tab.id ? C.olive : C.sub,
            bgcolor: activeTab === tab.id ? C.oliveSubtle : "transparent",
            border: activeTab === tab.id ? `1px solid ${C.glassBorder}` : "1px solid transparent",
            "&:hover": { bgcolor: C.oliveSubtle },
          }}>
            {tab.icon} {tab.label}
          </Button>
        ))}
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto", py: 1, px: 1.5 }}>
        {activeTab === "restaurant" ? (
          filteredSections === null ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={24} sx={{ color: C.olive }} />
            </Box>
          ) : filteredSections.length > 0 ? (
            filteredSections.map((section, si) => (
              <Box key={si} sx={{ mb: 2 }}>
                <Typography sx={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.15em", textTransform: "uppercase", px: 1.5, mb: 0.5 }}>
                  {t(section.titleKey)}
                </Typography>
                {section.items.map((item, ii) => (
                  <Box key={ii} component={Link} to={`${prefix}/${item.basePath}`}
                    onClick={() => isMobile && setSidebarOpen(false)}
                    sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 1.5, py: 1, borderRadius: "10px", textDecoration: "none", color: C.sub, transition: "all 0.2s ease", "&:hover": { bgcolor: C.oliveSubtle, color: C.olive } }}>
                    <Typography sx={{ fontSize: 16, lineHeight: 1 }}>{item.icon}</Typography>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 500 }}>{t(item.labelKey)}</Typography>
                  </Box>
                ))}
              </Box>
            ))
          ) : (
            <Box sx={{ textAlign: "center", color: C.muted, py: 4, fontSize: 12 }}>
              هیچ سرویسی فعال نیست
            </Box>
          )
        ) : (
          <Box sx={{ mb: 2 }}>
            <Typography sx={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.15em", textTransform: "uppercase", px: 1.5, mb: 0.5 }}>
              {t("rest.nav_dashboards")}
            </Typography>
            {DASHBOARDS.map((item, ii) => (
              <Box key={ii} onClick={() => handleLockedClick(item.labelKey)} sx={{
                display: "flex", alignItems: "center", gap: 1.5, px: 1.5, py: 1, borderRadius: "10px", cursor: "pointer", color: C.sub, transition: "all 0.2s ease", "&:hover": { bgcolor: C.oliveSubtle, color: C.olive },
              }}>
                <Typography sx={{ fontSize: 16, lineHeight: 1 }}>{item.icon}</Typography>
                <Typography sx={{ fontSize: 12.5, fontWeight: 500, flex: 1 }}>{t(item.labelKey)}</Typography>
                <Chip label={t("rest.coming_soon")} size="small" sx={{ height: 20, fontSize: 9, bgcolor: C.muted + "22", color: C.sub, borderRadius: "4px" }} />
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <Divider sx={{ borderColor: C.sidebarBorder, mx: 2 }} />
      <Box sx={{ p: 1.5 }}>
        <Button onClick={handleLogout} fullWidth sx={{ justifyContent: "flex-start", color: C.danger, fontSize: 12, fontWeight: 600, textTransform: "none", borderRadius: "10px", py: 1, px: 1.5, "&:hover": { bgcolor: C.dangerBg } }}>
          🚪 {t("rest.logout")}
        </Button>
      </Box>
    </Box>
  );

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ minHeight: "100vh", bgcolor: C.bg, position: "relative", fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif", overflowX: "hidden" }}>
      <style>{animations}</style>
      <Box sx={{ position: "fixed", inset: 0, zIndex: 0, background: C.bgWarm, pointerEvents: "none" }} />
      <Box sx={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: `radial-gradient(circle, ${isDark ? "rgba(107,155,110,0.06)" : "rgba(46,77,48,0.06)"} 1px, transparent 1px)`, backgroundSize: "36px 36px", pointerEvents: "none" }} />
      {[
        { size: 600, pos: { top: "5%", left: "10%" }, bg: C.orb1, anim: "orb1 24s ease-in-out infinite" },
        { size: 500, pos: { bottom: "10%", right: "5%" }, bg: C.orb2, anim: "orb2 28s ease-in-out infinite" },
      ].map((orb, i) => (
        <Box key={i} sx={{ position: "fixed", width: orb.size, height: orb.size, ...orb.pos, borderRadius: "50%", background: orb.bg, filter: "blur(80px)", animation: orb.anim, pointerEvents: "none", zIndex: 0 }} />
      ))}

      {!isMobile && (
        <Box sx={{ position: "fixed", top: 0, bottom: 0, insetInlineStart: 0, width: 260, borderInlineEnd: `1px solid ${C.sidebarBorder}`, zIndex: 100, overflow: "hidden" }}>
          {sidebarContent}
        </Box>
      )}

      {isMobile && (
  <Drawer
    key={isRtl ? "rtl" : "ltr"}          
    anchor="left"
    open={sidebarOpen}
    onClose={() => setSidebarOpen(false)}
    slotProps={{ paper: { sx: { width: 280, bgcolor: "transparent", border: "none" } } }}
  >
    {sidebarContent}
  </Drawer>
)}

      <Box sx={{
        position: "relative",
        zIndex: 2,
        marginInlineStart: isMobile ? 0 : "260px",
        width: isMobile ? "100%" : "calc(100% - 260px)",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}>
        <Box sx={{
          position: "sticky", top: 0, zIndex: 50, bgcolor: C.headerBg, backdropFilter: "blur(16px)",
          borderBottom: `1px solid ${C.headerBorder}`, px: { xs: 1.5, md: 3 }, py: 1.5,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1,
        }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, flex: 1 }}>
            {isMobile && (
              <IconButton onClick={() => setSidebarOpen(true)} size="small" sx={{ color: C.text, border: `1px solid ${C.glassBorder}`, borderRadius: "10px", bgcolor: C.glass, flexShrink: 0, width: 36, height: 36 }}>
                <Typography sx={{ fontSize: 18, lineHeight: 1 }}>☰</Typography>
              </IconButton>
            )}
            <Typography component={Link} to={prefix} sx={{ fontSize: { xs: 13, md: 14 }, color: C.olive, textDecoration: "none", fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {t("rest.breadcrumb_dashboard")}
            </Typography>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 0.5, md: 1 }, flexShrink: 0 }}>
            <IconButton onClick={toggleTheme} size="small" sx={{ color: C.text, border: `1px solid ${C.glassBorder}`, borderRadius: "10px", bgcolor: C.glass, width: 34, height: 34, "&:hover": { bgcolor: C.oliveSubtle, borderColor: C.olive } }}>
              <Typography sx={{ fontSize: 14 }}>{isDark ? "☀️" : "🌙"}</Typography>
            </IconButton>
            <Box sx={{ display: "flex", border: `1px solid ${C.glassBorder}`, borderRadius: "10px", overflow: "hidden", bgcolor: C.glass, height: 34 }}>
              {["fa", "en"].map((lng) => (
                <Button key={lng} onClick={() => { if (lang !== lng) toggleLang(); }} sx={{
                  minWidth: "auto", py: 0, px: { xs: 0.8, md: 1.2 }, borderRadius: 0, fontSize: 10, fontWeight: lang === lng ? 700 : 500,
                  color: lang === lng ? C.olive : C.sub, bgcolor: lang === lng ? C.oliveSubtle : "transparent",
                  boxShadow: "none", textTransform: "none", "&:hover": { bgcolor: C.oliveSubtle },
                }}>
                  {lng === "fa" ? "فا" : "EN"}
                </Button>
              ))}
            </Box>
          </Box>
        </Box>

        <Box sx={{
          flex: 1,
          p: { xs: 2, md: 3 },
          width: "100%",
          opacity: mounted ? 1 : 0,
          transition: "opacity 0.5s ease",
        }}>
          <Outlet />
        </Box>
      </Box>

      <Snackbar open={toast.open} autoHideDuration={3000} onClose={() => setToast(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: "top", horizontal: "center" }}>
        <Alert onClose={() => setToast(s => ({ ...s, open: false }))} severity={toast.type} sx={{ bgcolor: C.glass, backdropFilter: "blur(16px)", color: C.text, border: `1px solid ${C.olive}`, borderRadius: "12px", fontSize: 13, fontWeight: 600, boxShadow: C.cardShadow }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}