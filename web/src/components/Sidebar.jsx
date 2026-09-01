
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLang } from "../contexts/LangContext";
import { useThemeMode } from "../contexts/ThemeContext";
import {
  Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  Typography, IconButton, Divider, Tooltip,
} from "@mui/material";
import {
  Dashboard, Restaurant, ShoppingCart, Receipt, Kitchen,
  Inventory2, LocalGroceryStore, Description, History,
  MenuBook, People, Logout, ChevronLeft, ChevronRight,
  DarkMode, LightMode, Language,
} from "@mui/icons-material";

const NAV_ITEMS = [
  { section: "management", items: [
    { key: "kitchen", icon: <Kitchen />, path: "/kitchen" },
    { key: "pos", icon: <ShoppingCart />, path: "/pos" },
    { key: "orders", icon: <Receipt />, path: "/orders" },
    { key: "recipes", icon: <MenuBook />, path: "/recipes" },
  ]},
  { section: "warehouse", items: [
    { key: "rawMaterials", icon: <Inventory2 />, path: "/raw-materials" },
    { key: "readyMaterials", icon: <LocalGroceryStore />, path: "/ready-materials" },
    { key: "invoices", icon: <Description />, path: "/invoices" },
  ]},
  { section: "tools", items: [
    { key: "usageLog", icon: <History />, path: "/usage-log" },
    { key: "dictionary", icon: <MenuBook />, path: "/dictionary" },
  ]},
  { section: "system", items: [
    { key: "users", icon: <People />, path: "/users" },
  ]},
];

const DRAWER_WIDTH = 280;

export default function Sidebar({ open, onClose, collapsed, onToggleCollapse }) {
  const { t } = useTranslation();
  const { isRtl } = useLang();
  const { mode, toggleTheme } = useThemeMode();
  const navigate = useNavigate();
  const location = useLocation();

  const handleNav = (path) => {
    navigate(path);
    if (window.innerWidth < 900) onClose();
  };

  const drawerContent = (
    <Box sx={{
      height: "100%", display: "flex", flexDirection: "column",
      background: "linear-gradient(180deg, #0d1017 0%, #0a0e1a 40%, #0f0a1e 100%)",
      color: "#fff", overflow: "hidden",
    }}>

      {/* ═══ Brand ═══ */}
      <Box sx={{
        p: 2.5, display: "flex", alignItems: "center", gap: 1.5,
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}>
        <Box sx={{
          width: 42, height: 42, borderRadius: 3,
          background: "linear-gradient(135deg, #ff6b35, #ff9a3c)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, boxShadow: "0 4px 16px rgba(255,107,53,0.3)",
          flexShrink: 0,
        }}>🏪</Box>
        {!collapsed && (
          <Box>
            <Typography sx={{ fontSize: 15, fontWeight: 900, color: "#fff" }}>
              {t("sidebar.restaurant")}
            </Typography>
            <Typography sx={{ fontSize: 9, color: "rgba(160,200,255,0.6)", fontWeight: 600, letterSpacing: 0.5 }}>
              RESTAURANT DASHBOARD
            </Typography>
          </Box>
        )}
      </Box>

      {/* ═══ Dashboard Link ═══ */}
      <Box sx={{ px: 1.5, pt: 1.5 }}>
        <ListItemButton onClick={() => handleNav("/dashboard")} sx={{
          borderRadius: 3, py: 1.2, px: 1.5,
          background: location.pathname === "/dashboard"
            ? "linear-gradient(135deg, #221838 0%, #181330 50%, #14202e 100%)"
            : "linear-gradient(135deg, #1a1230 0%, #120e28 50%, #0d1a28 100%)",
          border: "1px solid",
          borderColor: location.pathname === "/dashboard" ? "rgba(255,107,53,0.45)" : "rgba(255,107,53,0.18)",
          "&:hover": {
            borderColor: "rgba(255,107,53,0.4)",
            background: "linear-gradient(135deg, #1f163a 0%, #16122e 50%, #111f32 100%)",
          },
        }}>
          <ListItemIcon sx={{ minWidth: 36 }}>
            <Dashboard sx={{ color: "#ff9a5e", fontSize: 20 }} />
          </ListItemIcon>
          {!collapsed && (
            <ListItemText
              primary={t("sidebar.dashboard")}
              slotProps={{ primary: { sx: { fontWeight: 800, fontSize: 13, color: "#ffe0cc" } } }}
            />
          )}
        </ListItemButton>
      </Box>

      {/* ═══ Nav Items ═══ */}
      <Box sx={{ flex: 1, overflowY: "auto", overflowX: "hidden", py: 1,
        "&::-webkit-scrollbar": { width: 3 },
        "&::-webkit-scrollbar-thumb": { background: "rgba(120,160,255,0.12)", borderRadius: 3 },
      }}>
        {NAV_ITEMS.map((section) => (
          <Box key={section.section} sx={{ mb: 0.5 }}>
            {!collapsed && (
              <Typography sx={{
                fontSize: 9, fontWeight: 800, px: 3, pt: 1.5, pb: 0.5,
                color: "rgba(100,180,255,0.4)", letterSpacing: 1.8,
                textTransform: "uppercase",
              }}>
                {t("sidebar." + section.section)}
              </Typography>
            )}
            {section.items.map((item) => {
              const active = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
              return (
                <Tooltip key={item.key} title={collapsed ? t("sidebar." + item.key) : ""} placement="left">
                  <ListItemButton onClick={() => handleNav(item.path)} sx={{
                    mx: 1, borderRadius: 2.5, py: 1, px: collapsed ? 1.5 : 2.5,
                    color: active ? "#ffb380" : "rgba(180,210,240,0.75)",
                    background: active ? "rgba(255,107,53,0.1)" : "transparent",
                    boxShadow: active ? "inset 0 0 0 1px rgba(255,107,53,0.15)" : "none",
                    "&:hover": {
                      background: "rgba(100,160,255,0.08)",
                      color: "#d0e0ff",
                    },
                  }}>
                    <ListItemIcon sx={{
                      minWidth: collapsed ? 0 : 40, justifyContent: "center",
                    }}>
                      <Box sx={{
                        width: 28, height: 28, borderRadius: 2,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: active ? "rgba(255,107,53,0.22)" : "rgba(100,160,255,0.08)",
                        color: active ? "#ffb380" : "inherit",
                        "& .MuiSvgIcon-root": { fontSize: 16 },
                      }}>
                        {item.icon}
                      </Box>
                    </ListItemIcon>
                    {!collapsed && (
                      <ListItemText
                        primary={t("sidebar." + item.key)}
                        slotProps={{ primary: { sx: { fontWeight: 700, fontSize: 13 } } }}
                      />
                    )}
                  </ListItemButton>
                </Tooltip>
              );
            })}
          </Box>
        ))}
      </Box>

      {/* ═══ Footer ═══ */}
      <Box sx={{
        p: 1.5, borderTop: "1px solid rgba(100,160,255,0.08)",
        display: "flex", flexDirection: "column", gap: 0.5,
      }}>
        <Box sx={{ display: "flex", gap: 0.5, justifyContent: "center", mb: 0.5 }}>
          <IconButton onClick={toggleTheme} size="small"
            sx={{ color: "rgba(160,200,240,0.6)", "&:hover": { color: "#ffb380" } }}>
            {mode === "dark" ? <LightMode fontSize="small" /> : <DarkMode fontSize="small" />}
          </IconButton>
        </Box>
        <ListItemButton sx={{
          borderRadius: 2.5, py: 1, px: 1.5,
          color: "rgba(160,200,240,0.6)",
          "&:hover": { background: "rgba(239,68,68,0.08)", color: "#fca5a5" },
        }}>
          <ListItemIcon sx={{ minWidth: 36 }}>
            <Logout sx={{ fontSize: 18, color: "inherit" }} />
          </ListItemIcon>
          {!collapsed && (
            <ListItemText
              primary={t("sidebar.logout")}
              slotProps={{ primary: { sx: { fontWeight: 700, fontSize: 13 } } }}
            />
          )}
        </ListItemButton>
      </Box>
    </Box>
  );

  return (
    <>
      {/* ── Mobile Drawer ── */}
      <Drawer
        variant="temporary"
        open={open}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH, boxSizing: "border-box",
            borderLeft: isRtl ? "none" : "1px solid rgba(255,255,255,0.04)",
            borderRight: isRtl ? "1px solid rgba(255,255,255,0.04)" : "none",
          },
        }}
      >
        {drawerContent}
      </Drawer>

      {/* ── Desktop Drawer ── */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: "none", md: "block" },
          width: collapsed ? 72 : DRAWER_WIDTH,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: collapsed ? 72 : DRAWER_WIDTH,
            boxSizing: "border-box",
            transition: "width 0.3s ease",
            overflow: "hidden",
            borderLeft: isRtl ? "none" : "1px solid rgba(255,255,255,0.04)",
            borderRight: isRtl ? "1px solid rgba(255,255,255,0.04)" : "none",
          },
        }}
      >
        {drawerContent}
      </Drawer>
    </>
  );
}
