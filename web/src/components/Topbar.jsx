import { useTranslation } from "react-i18next";
import { useLang } from "../contexts/LangContext";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Box, Typography, IconButton, Tooltip, useMediaQuery, useTheme,
} from "@mui/material";
import {
  Menu as MenuIcon, Dashboard, ShoppingCart, MenuBook, People, Language,
} from "@mui/icons-material";

export default function Topbar({ onMenuClick }) {
  const { t } = useTranslation();
  const { isRtl, toggleLang } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const quickLinks = [
    { path: "/pos", icon: <ShoppingCart fontSize="small" />, label: t("topbar.posBtn"), accent: true },
    { path: "/dictionary", icon: <MenuBook fontSize="small" />, label: t("topbar.dictBtn") },
    { path: "/users", icon: <People fontSize="small" />, label: t("topbar.usersBtn") },
  ];

  return (
    <Box sx={{
      position: "sticky", top: 0, zIndex: 50,
      background: "rgba(255,255,255,0.72)",
      backdropFilter: "blur(24px) saturate(180%)",
      WebkitBackdropFilter: "blur(24px) saturate(180%)",
      px: { xs: 1, sm: 2, md: 3 },
      py: { xs: 1, sm: 1.5 },
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottom: "1px solid rgba(255,255,255,0.6)",
      boxShadow: "0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)",
      borderRadius: { xs: "0 0 14px 14px", sm: "0 0 20px 20px" },
      gap: { xs: 0.5, sm: 1.5 },
      minHeight: { xs: 48, sm: 56 },
      overflow: "hidden",
    }}>

      {/* ── سمت راست: منو + لوگو ── */}
      <Box sx={{
        display: "flex", alignItems: "center",
        gap: { xs: 0.75, sm: 1.5 },
        minWidth: 0, flexShrink: 1, overflow: "hidden",
      }}>
        <IconButton onClick={onMenuClick} sx={{
          width: { xs: 36, sm: 40 }, height: { xs: 36, sm: 40 },
          borderRadius: { xs: 2, sm: 3 },
          border: "1.5px solid rgba(207,210,217,0.7)",
          background: "rgba(255,255,255,0.6)", flexShrink: 0,
          "&:hover": { background: "rgba(255,107,53,0.12)", borderColor: "#ff6b35", color: "#ff6b35" },
        }}>
          <MenuIcon sx={{ fontSize: { xs: 18, sm: 22 } }} />
        </IconButton>

        <Box onClick={() => navigate("/dashboard")} sx={{
          display: "flex", alignItems: "center",
          gap: { xs: 0.5, sm: 1 },
          cursor: "pointer", px: { xs: 0.75, sm: 1.5 }, py: 0.5,
          borderRadius: 3, minWidth: 0, overflow: "hidden",
          "&:hover": {
            background: "rgba(255,107,53,0.06)",
            "& .topbar-ico": { boxShadow: "0 4px 14px rgba(255,107,53,0.35)", transform: "scale(1.08)" },
            "& .topbar-text": { color: "#ff6b35" },
          },
        }}>
          <Box className="topbar-ico" sx={{
            width: { xs: 28, sm: 32 }, height: { xs: 28, sm: 32 },
            borderRadius: { xs: 2, sm: 2.5 },
            background: "linear-gradient(135deg, #ff6b35, #ff9a3c)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: { xs: 12, sm: 14 },
            boxShadow: "0 2px 8px rgba(255,107,53,0.2)",
            transition: "all 0.3s", flexShrink: 0,
          }}>
            <Dashboard fontSize="inherit" />
          </Box>
          <Typography className="topbar-text" noWrap sx={{
            fontSize: { xs: 13, sm: 16, md: 18 },
            fontWeight: 900, color: "text.primary",
            whiteSpace: "nowrap", transition: "color 0.2s",
          }}>
            {t("topbar.dashboard")}
          </Typography>
        </Box>
      </Box>

      {/* ── سمت چپ: دکمه‌ها + زبان ── */}
      <Box sx={{
        display: "flex", alignItems: "center",
        gap: { xs: 0.5, sm: 1 },
        flexShrink: 0,
      }}>

        {quickLinks.map((link) => (
          <Tooltip key={link.path} title={link.label} arrow>
            <Box onClick={() => navigate(link.path)} sx={{
              display: "flex", flexDirection: "column", alignItems: "center",
              gap: { xs: 0.2, sm: 0.3 },
              p: { xs: 0.4, sm: 0.8 },
              px: { xs: 0.6, sm: 1.5 },
              borderRadius: { xs: 2, sm: 3 },
              cursor: "pointer", transition: "all 0.2s",
              "&:hover": {
                "& .tb-icon": {
                  background: link.accent ? "#ff6b35" : "rgba(255,107,53,0.15)",
                  borderColor: "#ff6b35",
                  color: link.accent ? "#fff" : "#ff6b35",
                  transform: "translateY(-1px)",
                },
                "& .tb-label": { color: "#ff6b35" },
              },
            }}>
              <Box className="tb-icon" sx={{
                width: { xs: 28, sm: 36 }, height: { xs: 28, sm: 36 },
                borderRadius: { xs: 1.5, sm: 2.5 },
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: { xs: 13, sm: 16 }, transition: "all 0.25s",
                border: "1.5px solid rgba(207,210,217,0.7)",
                background: link.accent ? "rgba(255,107,53,0.08)" : "rgba(255,255,255,0.6)",
                borderColor: link.accent ? "rgba(255,107,53,0.4)" : "rgba(207,210,217,0.7)",
                color: link.accent ? "#ff6b35" : "#4b5563",
                boxShadow: link.accent ? "0 2px 8px rgba(255,107,53,0.1)" : "0 1px 3px rgba(0,0,0,0.05)",
              }}>
                {link.icon}
              </Box>
              <Typography className="tb-label" sx={{
                fontSize: { xs: 7, sm: 10 }, fontWeight: 700,
                color: link.accent ? "#ff6b35" : "text.secondary",
                whiteSpace: "nowrap", transition: "color 0.2s",
                lineHeight: 1,
              }}>
                {link.label}
              </Typography>
            </Box>
          </Tooltip>
        ))}

        {/* جداکننده */}
        <Box sx={{
          width: 1, height: { xs: 20, sm: 24 },
          background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.1), transparent)",
          mx: { xs: 0.25, sm: 0.5 },
        }} />

        {/* زبان */}
        <Tooltip title={isRtl ? "English" : "فارسی"} arrow>
          <IconButton onClick={toggleLang} size="small" sx={{
            width: { xs: 32, sm: 36 }, height: { xs: 32, sm: 36 },
            border: "1px solid", borderColor: "divider",
            "&:hover": { background: "rgba(255,107,53,0.08)", borderColor: "#ff6b35" },
          }}>
            <Language sx={{ fontSize: { xs: 16, sm: 20 } }} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}