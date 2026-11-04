import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import { useSuperAdmin } from "@super/hooks/useSuperAdmin";
import { getSuperColors } from "@super/common/superConfig";
import SuperSidebar from "@super/layout/SuperSidebar";
import SuperTopBar from "@super/layout/SuperTopBar";
import TenantsPanel from "@super/tenants/TenantsPanel";
import UsersPanel from "@super/users/UsersPanel";
import ModulesPanel from "@super/modules/ModulesPanel";
import {
  Box, Button, Snackbar, Alert, useMediaQuery, useTheme,
  Dialog, DialogTitle, DialogContent, DialogActions, Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import superClient from "@super/api/super_client";
import { collectShortcuts, useRegisteredShortcuts, tabBindings, helpBinding, dialogBindings } from "@shared/common/shortcutKit";
import KbdHint from "@business/pos/common/KbdHint";
import ShortcutsHelpDialog from "@shared/common/ShortcutsHelpDialog";

export default function SuperAdminLayout() {
  const navigate = useNavigate();
  const { mode, toggleTheme } = useThemeMode();
  const { isRtl, toggleLang } = useLang();
  const { t } = useTranslation();

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const isDark = mode === "dark";
  const C = useMemo(() => getSuperColors(isDark), [isDark]);

  const [activeTab, setActiveTab] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  const {
    stats, tenants, services, servicesLoading,
    loadServices, loadTenants, users, loadUsers,
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
    navigate("/super/login");
  }, [navigate]);

  /* ── تب‌ها ── */
  const tabs = [
    { label: t("super.tab.tenants"), icon: "🏪" },
    { label: t("super.tab.users"),   icon: "👥" },
    { label: t("ui_k.mod.title"),    icon: "🧩" },
  ];

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
                  color: activeTab === i ? "#fff" : C.sub,
                  bgcolor: activeTab === i ? C.olive : "transparent",
                  border: `1px solid ${activeTab === i ? C.olive : C.glassBorder}`,
                  "&:hover": {
                    bgcolor: activeTab === i ? C.olive : C.oliveSubtle,
                  },
                  whiteSpace: "nowrap",
                }}
              >
                {tab.icon} {tab.label}
              </Button>
            ))}
          </Box>

          {/* محتوا */}
          {activeTab === 0 && (
            <TenantsPanel
              tenants={tenants}
              stats={stats}
              loadTenants={loadTenants}
              loadServices={loadServices}
              services={services}
              servicesLoading={servicesLoading}
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
        </Box>
      </Box>

      <Dialog open={logoutOpen} onClose={() => setLogoutOpen(false)} maxWidth="xs" fullWidth dir={isRtl ? "rtl" : "ltr"}>
        <DialogTitle>{t("ui_l.super.logout_title")}</DialogTitle>
        <DialogContent><Typography>{t("ui_l.super.logout_text")}</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setLogoutOpen(false)}>{t("shortcuts.close_dialog")} <KbdHint>Esc</KbdHint></Button>
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
    </Box>
  );
}