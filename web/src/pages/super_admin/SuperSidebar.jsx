import { Box, Typography, Button, Divider, Drawer } from "@mui/material";
import { Link, useLocation } from "react-router-dom";
import { useLang } from "../../contexts/LangContext";
import { NAV_SECTIONS } from "../../theme/superConfig";

export default function SuperSidebar({ isMobile, open, onClose, currentUser, onLogout, C, t }) {
  const location = useLocation();
  const { isRtl } = useLang();

  const content = (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{
      width: 250, height: "100%", bgcolor: C.sidebarBg,
      display: "flex", flexDirection: "column",
      borderInlineEnd: `1px solid ${C.sidebarBorder}`,
    }}>
      {/* header */}
      <Box sx={{ p: 2, display: "flex", alignItems: "center", gap: 1.5 }}>
        <Box sx={{
          width: 40, height: 40, borderRadius: "12px",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, bgcolor: C.oliveSubtle,
        }}>🏪</Box>
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: 15, color: C.text }}>
            {t("super.panel_title")}
          </Typography>
          <Typography sx={{ fontSize: 9, color: C.muted, fontWeight: 600 }}>
            SaaS Admin
          </Typography>
        </Box>
      </Box>
      <Divider sx={{ borderColor: C.sidebarBorder, mx: 2 }} />

      {/* nav */}
      <Box sx={{ flex: 1, overflowY: "auto", py: 1, px: 1.5 }}>
        {NAV_SECTIONS.map(sec => (
          <Box key={sec.titleKey} sx={{ mb: 2 }}>
            <Typography sx={{
              px: 2, mb: 1, fontSize: 10, color: C.muted,
              fontWeight: 700, textTransform: "uppercase",
            }}>
              {t(sec.titleKey)}
            </Typography>
            {sec.items.map(item => {
              const isActive = location.pathname === item.path;
              return (
                <Box
                  key={item.path}
                  component={Link}
                  to={item.path}
                  onClick={isMobile ? onClose : undefined}
                  sx={{
                    display: "flex", alignItems: "center",
                    gap: 1.5, px: 1.5, py: 1,
                    textDecoration: "none", borderRadius: "10px", mb: 0.5,
                    outline: "none", boxShadow: "none",
                    bgcolor: isActive ? C.oliveSubtle : "transparent",
                    color: isActive ? C.olive : C.sub,
                    "&:hover": { bgcolor: C.oliveSubtle, color: C.olive },
                    "&:focus": { bgcolor: isActive ? C.oliveSubtle : "transparent" },
                  }}
                >
                  <Typography sx={{ fontSize: 16 }}>{item.icon}</Typography>
                  <Typography sx={{ fontSize: 12.5, fontWeight: isActive ? 700 : 500 }}>
                    {t(item.labelKey)}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>

      {/* user + logout */}
      <Divider sx={{ borderColor: C.sidebarBorder, mx: 2 }} />
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
          <Box sx={{
            width: 36, height: 36, borderRadius: "10px",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, bgcolor: C.oliveSubtle,
          }}>👤</Box>
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.text }}>
              {currentUser?.username || "—"}
            </Typography>
            <Typography sx={{ fontSize: 10, color: C.muted }}>
              {t("super.admin_role")}
            </Typography>
          </Box>
        </Box>
        <Button
          onClick={onLogout}
          fullWidth
          sx={{
            justifyContent: "flex-start", color: C.danger,
            fontSize: 12, fontWeight: 600, textTransform: "none",
            borderRadius: "10px", py: 1,
            "&:hover": { bgcolor: C.dangerBg },
            outline: "none",
            "&:focus": { bgcolor: "transparent" },
          }}
        >
          🚪 {t("super.logout")}
        </Button>
      </Box>
    </Box>
  );

  /* ── موبایل: Drawer ── */
  if (isMobile) {
    return (
      <Drawer
        anchor={isRtl ? "right" : "left"}
        open={open}
        onClose={onClose}
        slotProps={{
          paper: {
            sx: {
              bgcolor: C.sidebarBg,
              borderInlineEnd: `1px solid ${C.sidebarBorder}`,
            },
          },
        }}
      >
        {content}
      </Drawer>
    );
  }

  /* ── دسکتاپ: fixed sidebar ── */
  return (
    <Box sx={{
      position: "fixed", top: 0, bottom: 0,
      insetInlineStart: 0, width: 250, zIndex: 100, overflow: "hidden",
    }}>
      {content}
    </Box>
  );
}