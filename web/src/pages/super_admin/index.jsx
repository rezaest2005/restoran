import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useThemeMode } from "../../contexts/ThemeContext";
import { useLang } from "../../contexts/LangContext";
import { useSuperAdmin } from "../../hooks/useSuperAdmin";
import { getSuperColors } from "../../theme/superConfig";
import SuperSidebar from "./SuperSidebar";
import SuperTopBar from "./SuperTopBar";
import TenantsPanel from "./TenantsPanel";
import UsersPanel from "./UsersPanel";
import { Box, Button, Snackbar, Alert, useMediaQuery, useTheme } from "@mui/material";
import { useTranslation } from "react-i18next";
import superClient from "../../api/super_client";

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
    navigate("/super/login");
  }, [navigate]);

  /* ── تب‌ها ── */
  const tabs = [
    { label: t("super.tab.tenants"), icon: "🏪" },
    { label: t("super.tab.users"),   icon: "👥" },
  ];

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{
      minHeight: "100vh", bgcolor: C.bg,
      display: "flex", fontFamily: "Vazirmatn",
    }}>

      {/* ── sidebar ── */}
      <SuperSidebar
        isMobile={isMobile}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        currentUser={{ username: "Admin" }}
        onLogout={handleLogout}
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
        </Box>
      </Box>

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