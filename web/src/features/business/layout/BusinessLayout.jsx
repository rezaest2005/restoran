import { useState, useEffect, useMemo } from "react";
import { pathWithoutBase } from "@shared/basePath";
import { Link, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Box, Typography, Button, IconButton, Drawer, Divider,
  Snackbar, Alert, useMediaQuery, useTheme,
} from "@mui/material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import { buildColors } from "@shared/palette";
import useShortcuts from "@shared/common/useShortcuts";
import ShortcutsHelpDialog from "@shared/common/ShortcutsHelpDialog";
import { appName } from "@shared/branding";
import NavIcon from "@shared/ui/NavIcon";
import { BrandSquare } from "@shared/ui/BrandMark";
import SubscriptionGuard from "./SubscriptionGuard";
import client from "../api/client";
import { SyncProvider, SyncStatus, LogoutGuardDialog, useLogoutGuard, useSync } from "@shared/sync";
import LogoutIcon from "@mui/icons-material/Logout";
import LockIcon from "@mui/icons-material/Lock";
import MenuIcon from "@mui/icons-material/Menu";
import KeyboardOutlinedIcon from "@mui/icons-material/KeyboardOutlined";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";

/* ═══════════════════════════════════════
   ۱. کانفیگ منوها — با کلیدهای دسترسی
═══════════════════════════════════════ */

const NAV_SECTIONS = [
  {
    items: [
      {
        icon: "pos", labelKey: "rest.nav_pos", basePath: "pos",
        anyTabs: ["pos", "pos_report", "pos_settings", "orders"], module: "pos",
      },
    ],
  },
  {
    items: [
      {
        icon: "inventory", labelKey: "rest.nav_inventory", basePath: "inventory",
        anyTabs: ["inventory_invoice", "inventory_sales", "inventory_warehouse", "inventory_receiving", "inventory_purchase_list", "inventory_reports"], module: "inventory",
      },
    ],
  },
  {
    items: [
      {
        icon: "production", labelKey: "ui_e.nav_production", basePath: "production",
        anyTabs: ["kitchen"], module: "production",
      },
    ],
  },
  {
    items: [
      {
        icon: "delivery", labelKey: "ui_del.nav", basePath: "delivery",
        anyTabs: ["delivery_dispatch", "delivery_shipments", "delivery_fleet", "delivery_cash", "delivery_history"], module: "delivery",
      },
    ],
  },
  {
    items: [
      { icon: "list", labelKey: "ui_act.title", basePath: "activity", anyTabs: ["activity"] },
      {
        icon: "dictionary", labelKey: "rest.nav_dictionary", basePath: "dictionary",
        anyTabs: ["dictionary_items", "dictionary_menu", "dictionary_recipe", "dictionary_suppliers", "dictionary_warehouses", "dictionary_customers", "dictionary_users"],
      },
    ],
  },
];

const animations = `
  @keyframes orb1 { 0%, 100% { transform: translate(0, 0) scale(1); } 25% { transform: translate(60px, -80px) scale(1.1); } 50% { transform: translate(-20px, -40px) scale(0.95); } 75% { transform: translate(-50px, 50px) scale(1.05); } }
  @keyframes orb2 { 0%, 100% { transform: translate(0, 0) scale(1); } 33% { transform: translate(-70px, 60px) scale(0.92); } 66% { transform: translate(50px, -70px) scale(1.12); } }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
`;

// ═══════ خواندن دسترسی‌های کاربر ═══════
function getUserTabs() {
  try {
    const raw = sessionStorage.getItem("user") || localStorage.getItem("user");
    if (!raw) return null;
    const user = JSON.parse(raw);

    // ★★★ اول: تب‌های مجاز کسب‌وکار (از سوپرادمین) ★★★
    const restTabs = user?.business_tabs;
    if (Array.isArray(restTabs)) {
      const allowed = {};
      restTabs.forEach(k => { allowed[k] = true; });
      return allowed;
    }

    // بعد: تب‌های خود کاربر
    if (user?.tabs && Object.keys(user.tabs).length > 0) return user.tabs;
    if (user?.permissions && Object.keys(user.permissions).length > 0) return user.permissions;

    // آخر: از نقش بساز
    if (user?.role) return ROLE_TABS_FALLBACK[user.role] || null;
    return null;
  } catch {
    return null;
  }
}

// ═══════ پیش‌فرض تب‌ها بر اساس نقش ═══════
const ROLE_TABS_FALLBACK = {
  owner: new Proxy({}, { get: () => true }),
  manager: new Proxy({}, { get: () => true }),
  warehouse: {
    home: true,
    inventory_invoice: true, inventory_sales: true, inventory_warehouse: true,
    inventory_receiving: true, inventory_purchase_list: true, inventory_reports: true,
    dictionary_items: true, dictionary_suppliers: true, dictionary_warehouses: true,
  },
  cashier: {
    home: true,
    dictionary_menu: true, dictionary_customers: true,
    pos: true, pos_report: true, pos_settings: true, orders: true,
  },
  waiter: {
    home: true,
    dictionary_menu: true,
    pos: true, orders: true,
  },
  kitchen: {
    home: true,
    inventory_warehouse: true, inventory_reports: true,
    dictionary_menu: true, dictionary_recipe: true,
    orders: true,
  },
  customer: {
    home: true,
    dictionary_menu: true,
  },
};

function isOwnerUser() {
  try {
    const u = JSON.parse(sessionStorage.getItem("user") || localStorage.getItem("user") || "null");
    return !!u && (u.role === "owner" || u.is_superuser === true);
  } catch { return false; }
}

// ═══════ ماژول‌های فعال کسب‌وکار (null = همه) ═══════
function getUserModules() {
  try {
    const raw = sessionStorage.getItem("user") || localStorage.getItem("user");
    const mods = raw ? JSON.parse(raw)?.business_modules : null;
    return Array.isArray(mods) ? mods : null;
  } catch {
    return null;
  }
}

// ═══════ بررسی دسترسی ═══════
function hasAnyTab(userTabs, requiredTabs) {
  if (!userTabs) return true;
  return requiredTabs.some((k) => userTabs[k] === true);
}

/* ═══════════════════════════════════════
   ۲. کامپوننت اصلی
═══════════════════════════════════════ */

export default function BusinessLayout() {
  return (
    <SyncProvider client={client}>
      <BusinessLayoutInner />
    </SyncProvider>
  );
}

function BusinessLayoutInner() {
  const { mode, toggleTheme } = useThemeMode();
  const { isRtl, toggleLang, lang } = useLang();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const muiTheme = useTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down("md"));
  const isDark = mode === "dark";
  const { slug: urlSlug } = useParams();

  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState({ open: false, message: "", type: "info" });

  const userTabs = useMemo(() => getUserTabs(), []);
  const userModules = useMemo(() => getUserModules(), []);

  const slug = useMemo(() => {
    if (urlSlug) return urlSlug;
    const parts = pathWithoutBase().split("/").filter(Boolean);
    const first = parts[0] || "";
    if (first === "dashboard" || first === "bizsuite_dashboard" || first === "bizsuite_admin" || first === "super") return "";
    return first;
  }, [urlSlug]);

  const prefix = slug ? `/${slug}/bizsuite_dashboard/app` : "/bizsuite_dashboard/app";

  useEffect(() => {
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [isRtl, lang]);

  useEffect(() => {
    const tmr = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(tmr);
  }, []);

  // ★★★ بررسی امنیت session — تب بسته → صفحه لاگین ★★★
  useEffect(() => {
    const token = sessionStorage.getItem("access_token") || localStorage.getItem("access_token");
    const alive = sessionStorage.getItem("session_alive");
    if (!token || !alive) {
      navigate(slug ? `/${slug}/bizsuite_dashboard/login` : "/bizsuite_dashboard/login");
      return;
    }

    fetch("/api/auth/session-check/", {
      headers: { "Authorization": `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          sessionStorage.clear();
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          localStorage.removeItem("user");
          navigate(slug ? `/${slug}/bizsuite_dashboard/login` : "/bizsuite_dashboard/login");
          return null;
        }
        // keep the cached licence fresh: if the super admin changed this account's tabs/modules since
        // login, store the new lists and reload once so the menu matches what the server allows
        return fetch("/api/auth/me/", { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => (r.ok ? r.json() : null))
          .then((body) => {
            const fresh = body?.data ?? body;
            if (!fresh || !Array.isArray(fresh.business_tabs)) return;
            const store = sessionStorage.getItem("user") ? sessionStorage : localStorage;
            const cached = JSON.parse(store.getItem("user") || "{}");
            const same = JSON.stringify(cached.business_tabs) === JSON.stringify(fresh.business_tabs)
              && JSON.stringify(cached.business_modules) === JSON.stringify(fresh.business_modules);
            if (same) return;
            store.setItem("user", JSON.stringify({
              ...cached, business_tabs: fresh.business_tabs, business_modules: fresh.business_modules, tabs: fresh.tabs ?? cached.tabs,
            }));
            window.location.reload();
          });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredSections = useMemo(() => {
    return NAV_SECTIONS
      .map((section) => ({
        ...section,
        items: section.items.filter((item) =>
          hasAnyTab(userTabs, item.anyTabs) && (!item.module || !userModules || userModules.includes(item.module))),
      }))
      .filter((section) => section.items.length > 0);
  }, [userTabs, userModules]);

  // typing a URL by hand must not open a section the account does not have
  const location = useLocation();
  const routeBlocked = useMemo(() => {
    const seg = location.pathname.split("/").filter(Boolean).pop();
    const item = NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.basePath === seg);
    if (!item) return false;
    return !(hasAnyTab(userTabs, item.anyTabs) && (!item.module || !userModules || userModules.includes(item.module)));
  }, [location.pathname, userTabs, userModules]);

  // highlight the section being viewed (the home button used to look selected on every page)
  const cleanPath = location.pathname.replace(/\/+$/, "");
  const onHome = cleanPath === prefix || cleanPath === `${prefix}/dashboard`;
  const onSection = (basePath) => cleanPath === `${prefix}/${basePath}` || cleanPath.startsWith(`${prefix}/${basePath}/`);

  const canSeeHome = useMemo(() => {
    if (!userTabs) return true;
    return userTabs.home === true;
  }, [userTabs]);

  const C = useMemo(() => buildColors(isDark), [isDark]);

  // ── میان‌برها: Alt+Shift+N رفتن به بخش‌های سایدبار · F1 راهنما ──
  const [helpOpen, setHelpOpen] = useState(false);
  const navTargets = useMemo(() => {
    const list = [];
    if (canSeeHome) list.push({ labelKey: "rest.main_dashboard", to: prefix });
    filteredSections.forEach((section) => section.items.forEach((item) => {
      list.push({ labelKey: item.labelKey, to: `${prefix}/${item.basePath}` });
    }));
    return list.slice(0, 9).map((x, i) => ({ ...x, combo: `Alt+Shift+${i + 1}` }));
  }, [canSeeHome, filteredSections, prefix]);

  const layoutShortcuts = [
    { combo: "F1", label: t("shortcuts.title"), handler: () => setHelpOpen(true) },
    ...navTargets.map((n) => ({
      combo: n.combo,
      label: t("ui_g.layout.nav_n", { name: t(n.labelKey) }),
      handler: () => { navigate(n.to); setSidebarOpen(false); },
    })),
  ];
  useShortcuts(layoutShortcuts);
  const comboFor = (to) => navTargets.find((n) => n.to === to)?.combo;


  const logoutGuard = useLogoutGuard();
  const { ready: syncReady } = useSync();
  const [logoutAsk, setLogoutAsk] = useState(null);   // { unsynced, wipe } while the "unsent orders" question is open

  const finishLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    localStorage.removeItem("db_auth");
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("refresh_token");
    sessionStorage.removeItem("user");
    sessionStorage.removeItem("db_auth");
    sessionStorage.removeItem("session_alive");
    sessionStorage.removeItem("demo_logins_remaining");
    navigate(slug ? `/${slug}/bizsuite_dashboard/login` : "/bizsuite_dashboard/login");
  };

  // local copy: sync once more, warn about unsent orders, then wipe this device's data
  const handleLogout = async () => {
    if (!syncReady) { finishLogout(); return; }
    const g = await logoutGuard();
    if (g.unsynced > 0) { setLogoutAsk(g); return; }
    await g.wipe();
    finishLogout();
  };

  const sidebarContent = (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ height: "100%", display: "flex", flexDirection: "column", bgcolor: C.sidebarBg }}>
      <Box sx={{ p: 2.5, display: "flex", alignItems: "center", gap: 1.5 }}>
        <BrandSquare />
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: 16, color: C.text }}>{appName(i18n.language)}</Typography>
        </Box>
      </Box>
      <Divider sx={{ borderColor: C.sidebarBorder, mx: 2 }} />

      {canSeeHome && (
        <Box sx={{ p: 1.5 }}>
          <Button component={Link} to={prefix} fullWidth title={comboFor(prefix)} onClick={() => isMobile && setSidebarOpen(false)}
            aria-current={onHome ? "page" : undefined}
            sx={{ justifyContent: "flex-start", py: 1, px: 1.5, color: onHome ? C.olive : C.sub, fontSize: 13, fontWeight: 700, textTransform: "none", borderRadius: "10px", bgcolor: onHome ? C.oliveSubtle : "transparent", "&:hover": { bgcolor: C.oliveSubtle } }}>
            <NavIcon name="home" sx={{ marginInlineEnd: 1 }} /> {t("rest.main_dashboard")}
          </Button>
        </Box>
      )}

      <Box sx={{ flex: 1, overflowY: "auto", py: 1, px: 1.5 }}>
        {filteredSections.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <LockIcon sx={{ fontSize: 28, mb: 1 }} />
            <Typography sx={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>
              {t("ui_a.layout.no_access")}
            </Typography>
          </Box>
        ) : (
          filteredSections.map((section, si) => (
            <Box key={si} sx={{ mb: 1.5 }}>
              {section.items.map((item, ii) => (
                <Box key={ii} component={Link} to={`${prefix}/${item.basePath}`}
                  title={comboFor(`${prefix}/${item.basePath}`)}
                  onClick={() => isMobile && setSidebarOpen(false)}
                  aria-current={onSection(item.basePath) ? "page" : undefined}
                  sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 1.5, py: 1, minHeight: 40, borderRadius: "10px", textDecoration: "none", color: onSection(item.basePath) ? C.olive : C.sub, bgcolor: onSection(item.basePath) ? C.oliveSubtle : "transparent", transition: "all 0.2s ease", "&:hover": { bgcolor: C.oliveSubtle, color: C.olive } }}>
                  <NavIcon name={item.icon} />
                  <Typography sx={{ fontSize: 12.5, fontWeight: 500 }}>{t(item.labelKey)}</Typography>
                </Box>
              ))}
            </Box>
          ))
        )}
      </Box>

      <Divider sx={{ borderColor: C.sidebarBorder, mx: 2 }} />
      <Box sx={{ p: 1.5 }}>
        <Button onClick={handleLogout} fullWidth sx={{ justifyContent: "flex-start", color: C.danger, fontSize: 12, fontWeight: 600, textTransform: "none", borderRadius: "10px", py: 1, px: 1.5, "&:hover": { bgcolor: C.dangerBg } }}>
          <LogoutIcon fontSize="small" sx={{ marginInlineEnd: 1 }} /> {t("rest.logout")}
        </Button>
      </Box>
    </Box>
  );

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ minHeight: "100vh", bgcolor: C.bg, position: "relative", fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif", overflowX: "clip" }}>
      <style>{animations}</style>
      <Box sx={{ position: "fixed", inset: 0, zIndex: 0, background: C.bgWarm, pointerEvents: "none" }} />
      <Box sx={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: `radial-gradient(circle, ${isDark ? "color-mix(in srgb, var(--success) 6%, transparent)" : "color-mix(in srgb, var(--success) 6%, transparent)"} 1px, transparent 1px)`, backgroundSize: "36px 36px", pointerEvents: "none" }} />
      {[
        { size: 600, pos: { top: "5%", left: "10%" }, bg: C.orb1, anim: "orb1 24s ease-in-out infinite" },
        { size: 500, pos: { bottom: "10%", right: "5%" }, bg: C.orb2, anim: "orb2 28s ease-in-out infinite" },
      ].map((orb, i) => (
        <Box key={i} sx={{ position: "fixed", width: orb.size, height: orb.size, ...orb.pos, borderRadius: "50%", background: orb.bg, animation: orb.anim, pointerEvents: "none", zIndex: 0 }} />
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
          slotProps={{ paper: { sx: { width: "min(280px, 85vw)", bgcolor: "transparent", border: "none" } } }}
        >
          {sidebarContent}
        </Drawer>
      )}

      <Box sx={{
        position: "relative",
        zIndex: 2,
        marginInlineStart: isMobile ? 0 : "260px",
        width: isMobile ? "100%" : "calc(100% - 260px)",
        minWidth: 0,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}>
        <Box sx={{
          position: "sticky", top: 0, zIndex: 50, bgcolor: C.headerBg,          borderBottom: `1px solid ${C.headerBorder}`, px: { xs: 1.5, md: 3 }, py: 1.5,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1,
        }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, flex: 1 }}>
            {isMobile && (
              <IconButton onClick={() => setSidebarOpen(true)} size="small" aria-label={t("ui_resp.open_menu")} sx={{ color: C.text, border: `1px solid ${C.glassBorder}`, borderRadius: "10px", bgcolor: C.glass, flexShrink: 0, width: 40, height: 40 }}>
                <MenuIcon fontSize="small" />
              </IconButton>
            )}
            <Typography component={Link} to={prefix} sx={{ display: { md: "none" }, fontSize: { xs: 13, md: 14 }, color: C.olive, textDecoration: "none", fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {t("rest.breadcrumb_dashboard")}
            </Typography>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 0.5, md: 1 }, flexShrink: 0 }}>
            <SyncStatus client={client} isOwner={isOwnerUser()} />
            <IconButton onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "F1", bubbles: true, cancelable: true }))}
              size="small" title={`${t("shortcuts.title")} (F1)`} aria-label={t("shortcuts.title")}
              sx={{ color: C.text, border: `1px solid ${C.glassBorder}`, borderRadius: "10px", bgcolor: C.glass, width: { xs: 40, md: 34 }, height: { xs: 40, md: 34 }, "&:hover": { bgcolor: C.oliveSubtle, borderColor: C.olive } }}>
              <KeyboardOutlinedIcon fontSize="small" />
            </IconButton>
            <IconButton onClick={toggleTheme} size="small" aria-label={t(isDark ? "login.lightMode" : "login.darkMode")} title={t(isDark ? "login.lightMode" : "login.darkMode")} sx={{ color: C.text, border: `1px solid ${C.glassBorder}`, borderRadius: "10px", bgcolor: C.glass, width: { xs: 40, md: 34 }, height: { xs: 40, md: 34 }, "&:hover": { bgcolor: C.oliveSubtle, borderColor: C.olive } }}>
              {isDark ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
            </IconButton>
            <Box sx={{ display: "flex", border: `1px solid ${C.glassBorder}`, borderRadius: "10px", overflow: "hidden", bgcolor: C.glass, height: { xs: 40, md: 34 } }}>
              {["fa", "en"].map((lng) => (
                <Button key={lng} onClick={() => { if (lang !== lng) toggleLang(); }} sx={{
                  minWidth: { xs: 40, md: "auto" }, minHeight: 0, py: 0, px: { xs: 0.8, md: 1.2 }, borderRadius: 0, fontSize: { xs: 12, md: 10 }, fontWeight: lang === lng ? 700 : 500,
                  color: lang === lng ? C.olive : C.sub, bgcolor: lang === lng ? C.oliveSubtle : "transparent",
                  boxShadow: "none", textTransform: "none", "&:hover": { bgcolor: C.oliveSubtle },
                }}>
                  {lng === "fa" ? t("ui_a.layout.lang_fa_short") : "EN"}
                </Button>
              ))}
            </Box>
          </Box>
        </Box>

        <SubscriptionGuard C={C} onLogout={handleLogout} />

        <Box sx={{
          flex: 1,
          p: { xs: 1.5, sm: 2, md: 3 },
          width: "100%",
          minWidth: 0,
          opacity: mounted ? 1 : 0,
          transition: "opacity 0.5s ease",
        }}>
          {routeBlocked ? (
            <Box sx={{ textAlign: "center", py: 8 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 18, mb: 1 }}>{t("ui_a.layout.no_access")}</Typography>
              <Button component={Link} to={prefix + "/dashboard"} variant="outlined">{t("rest.main_dashboard")}</Button>
            </Box>
          ) : <Outlet />}
        </Box>
      </Box>

      <LogoutGuardDialog
        open={!!logoutAsk} unsynced={logoutAsk?.unsynced || 0}
        onCancel={() => setLogoutAsk(null)}
        onKeep={async () => { await logoutAsk.wipe({ keepOutbox: true }); setLogoutAsk(null); finishLogout(); }}
        onDiscard={async () => { await logoutAsk.wipe({ keepOutbox: false }); setLogoutAsk(null); finishLogout(); }}
      />

      <ShortcutsHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} items={layoutShortcuts} />

      <Snackbar open={toast.open} autoHideDuration={3000} onClose={() => setToast(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: "top", horizontal: "center" }}>
        <Alert onClose={() => setToast(s => ({ ...s, open: false }))} severity={toast.type} sx={{ bgcolor: C.glass, color: C.text, border: `1px solid ${C.olive}`, borderRadius: "12px", fontSize: 13, fontWeight: 600, boxShadow: C.cardShadow }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}