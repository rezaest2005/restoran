import NavIcon from "@shared/ui/NavIcon";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import { useSuperAdmin } from "@super/hooks/useSuperAdmin";
import { getSuperColors } from "@super/common/superConfig";
import SuperSidebar from "@super/layout/SuperSidebar";
import SuperTopBar from "@super/layout/SuperTopBar";
import TenantsPanel from "@super/tenants/TenantsPanel";
import UsersPanel from "@super/users/UsersPanel";
import ModulesPanel from "@super/modules/ModulesPanel";
import QrPanel from "@super/qr/QrPanel";
import StorefrontPanel from "@super/storefront/StorefrontPanel";
import SupportPanel from "@super/support/SupportPanel";
import { fetchSupportSummary } from "@super/support/api";
import {
  Box, Button, Snackbar, Alert, useMediaQuery, useTheme,
  Dialog, DialogTitle, DialogContent, DialogActions, Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import superClient from "@super/api/super_client";
import { collectShortcuts, useRegisteredShortcuts, tabBindings, helpBinding, dialogBindings } from "@shared/common/shortcutKit";
import KbdHint from "@business/pos/common/KbdHint";
import ShortcutsHelpDialog from "@shared/common/ShortcutsHelpDialog";
import HintBar from "@shared/ui/HintBar";

export default function SuperAdminLayout() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { mode, toggleTheme } = useThemeMode();
  const { isRtl, toggleLang } = useLang();
  const { t } = useTranslation();

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const isDark = mode === "dark";
  const C = useMemo(() => getSuperColors(isDark), [isDark]);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [supportWaiting, setSupportWaiting] = useState(0);

  /* ── تیکت‌های در انتظار پاسخ: هر ۶۰ ثانیه، فقط وقتی صفحه دیده می‌شود ── */
  const refreshSupport = useCallback(() => {
    fetchSupportSummary().then((s) => setSupportWaiting(s?.waiting || 0)).catch(() => {});
  }, []);
  useEffect(() => {
    refreshSupport();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refreshSupport();
    }, 60000);
    const onVisible = () => { if (document.visibilityState === "visible") refreshSupport(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [refreshSupport]);

  const {
    stats, tenants, loadTenants, users, loadUsers,
    toast, setToast,
  } = useSuperAdmin();

  /* ── موبایل: بستن sidebar هنگام resize ── */
  useEffect(() => {
    if (!isMobile) setSidebarOpen(false);
  }, [isMobile]);

  /* ── خروج ── */
  const handleLogout = useCallback(async () => {
    try { await superClient.post("/api/super/logout/"); } catch {}
    localStorage.removeItem("super_token");
    localStorage.removeItem("super_user");
    try { sessionStorage.removeItem("super_token"); sessionStorage.removeItem("super_user"); } catch { /* ignore */ }
    navigate("/admin/login");
  }, [navigate]);

  /* ── تب‌ها ── */
  const tabs = [
    { id: "tenants", label: t("super.tab.tenants"), icon: "tenants" },
    { id: "users", label: t("super.tab.users"), icon: "users" },
    { id: "modules", label: t("ui_k.mod.title"), icon: "modules" },
    { id: "storefront", label: t("ui_sfa.tab"), icon: "website" },
    { id: "qr", label: t("ui_qr.tab"), icon: "qr" },
    { id: "support", label: t("ui_sup.admin_tab"), icon: "support", badge: supportWaiting },
  ];
  const tabParam = searchParams.get("tab");
  const found = tabs.findIndex((x) => x.id === tabParam);
  const activeTab = found >= 0 ? found : 0;
  const setActiveTab = (i) => setSearchParams({ tab: tabs[i].id }, { replace: true });

  useRegisteredShortcuts([
    helpBinding(t, () => setHelp(true)),
    ...tabBindings(t, tabs.map((x, i) => ({ id: i, label: x.label })), setActiveTab),
    { combo: "Alt+L", label: t("ui_l.super.logout"), handler: () => setLogoutOpen(true) },
    { combo: "Alt+T", label: t("ui_l.super.toggle_theme"), handler: () => toggleTheme() },
    { combo: "Alt+G", label: t("ui_l.super.toggle_lang"), handler: () => toggleLang() },
    { combo: "Alt+R", label: t("ui_l.super.refresh"), handler: () => { loadTenants(); loadUsers(1); } },
  ]);

  // logout confirmation: Enter / Ctrl+D confirm, Escape cancel
  useRegisteredShortcuts(
    dialogBindings(t, {
      onConfirm: () => { setLogoutOpen(false); handleLogout(); },
      onClose: () => setLogoutOpen(false),
      confirmLabel: t("ui_l.super.logout"),
    }),
    { enabled: logoutOpen },
  );

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{
      minHeight: "100vh", bgcolor: C.bg,
      display: "flex", fontFamily: "Vazirmatn",
    }}>

      <ShortcutsHelpDialog open={help} onClose={() => setHelp(false)} items={collectShortcuts()} />

      {/* ── sidebar ── */}
      <SuperSidebar
        isMobile={isMobile}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        currentUser={{ username: "Admin" }}
        onLogout={() => setLogoutOpen(true)}
        badges={{ support: supportWaiting }}
        C={C}
        t={t}
      />

      {/* ── main content ── */}
      <Box sx={{
        flex: 1,
        marginInlineStart: { xs: 0, md: "250px" },
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}>

        {/* ── topbar ── */}
        <SuperTopBar
          isMobile={isMobile}
          onMenuClick={() => setSidebarOpen(true)}
          toggleTheme={toggleTheme}
          toggleLang={toggleLang}
          onRefresh={() => { loadTenants(); loadUsers(1); }}
          C={C}
          t={t}
        />

        {/* ── body ── */}
        <Box sx={{ flex: 1, p: { xs: 1.5, md: 3 } }}>

          {/* تب‌ها */}
          <Box sx={{
            display: "flex", gap: 1, mb: 3,
            overflowX: "auto", flexShrink: 0,
          }}>
            {tabs.map((tab, i) => (
              <Button
                key={i}
                onClick={() => setActiveTab(i)}
                sx={{
                  textTransform: "none",
                  fontWeight: activeTab === i ? 700 : 500,
                  fontSize: 13,
                  borderRadius: "10px",
                  px: 2, py: 0.8,
                  color: activeTab === i ? "var(--on-primary)" : C.sub,
                  bgcolor: activeTab === i ? C.olive : "transparent",
                  border: `1px solid ${activeTab === i ? C.olive : C.glassBorder}`,
                  "&:hover": {
                    bgcolor: activeTab === i ? C.olive : C.oliveSubtle,
                  },
                  whiteSpace: "nowrap",
                }}
              >
                <NavIcon name={tab.icon} fontSize="inherit" sx={{ marginInlineEnd: 0.75, verticalAlign: "middle" }} />{tab.label}
                {tab.badge > 0 && (
                  <Box component="span" sx={{
                    ms: 1, minWidth: 20, height: 20, px: 0.75, borderRadius: 10, fontSize: 11, fontWeight: 700,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    bgcolor: C.accentSoft, color: C.accentInk,
                  }}>
                    {tab.badge}
                  </Box>
                )}
              </Button>
            ))}
          </Box>

          {/* محتوا */}
          {activeTab === 0 && (
            <TenantsPanel
              tenants={tenants}
              stats={stats}
              loadTenants={loadTenants}
              C={C}
              t={t}
            />
          )}
          {activeTab === 1 && (
            <UsersPanel
              users={users}
              tenants={tenants}
              loadUsers={loadUsers}
              C={C}
              t={t}
            />
          )}
          {activeTab === 2 && <ModulesPanel tenants={tenants} C={C} />}
          {activeTab === 3 && <StorefrontPanel tenants={tenants} />}
          {activeTab === 4 && <QrPanel tenants={tenants} C={C} />}
          {activeTab === 5 && <SupportPanel C={C} tenants={tenants} onChanged={refreshSupport} />}
        </Box>
      </Box>

      <Dialog open={logoutOpen} onClose={() => setLogoutOpen(false)} maxWidth="xs" fullWidth dir={isRtl ? "rtl" : "ltr"}>
        <DialogTitle>{t("ui_l.super.logout_title")}</DialogTitle>
        <DialogContent><Typography>{t("ui_l.super.logout_text")}</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setLogoutOpen(false)}>{t("shortcuts.close_dialog")}</Button>
          <Button variant="contained" onClick={() => { setLogoutOpen(false); handleLogout(); }}>
            {t("ui_l.super.logout")} <KbdHint>Enter</KbdHint>
          </Button>
        </DialogActions>
      </Dialog>

      {/* toast */}
      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast({ ...toast, open: false })}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={toast.type}
          onClose={() => setToast({ ...toast, open: false })}
          sx={{ borderRadius: "12px" }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
      <HintBar items={[{ keys: "Alt+R", label: t("ui_l.super.refresh") }, { keys: "Alt+T", label: t("ui_l.super.toggle_theme") }, { keys: "Alt+G", label: t("ui_l.super.toggle_lang") }, { keys: "Alt+L", label: t("ui_l.super.logout") }]} />
    </Box>
  );
}