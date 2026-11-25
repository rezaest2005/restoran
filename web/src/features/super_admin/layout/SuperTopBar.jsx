import { Box, Typography, IconButton, Button, Tooltip } from "@mui/material";
import { LightMode, DarkMode, Language, Refresh, Menu, KeyboardOutlined } from "@mui/icons-material";
import { useLang } from "@shared/contexts/LangContext";

export default function SuperTopBar({ isMobile, onMenuClick, toggleTheme, toggleLang, onRefresh, onHelp, C, t }) {
  const { isRtl } = useLang();
  const isDark = C.bg === "var(--ink)";

  const iconBtnSx = {
    color: C.text,
    border: `1px solid ${C.glassBorder}`,
    borderRadius: "8px",
    width: { xs: 40, md: 34 }, height: { xs: 40, md: 34 }, flexShrink: 0,
  };

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{
      position: "sticky", top: 0, zIndex: 50,
      bgcolor: C.headerBg,      borderBottom: `1px solid ${C.headerBorder}`,
      px: { xs: 1, md: 2 }, py: 1,
      display: "flex", alignItems: "center",
      justifyContent: "space-between",
      overflow: "hidden",  // ★ جلوگیری از اسکرول افقی
    }}>
      {/* چپ: hamburger + breadcrumb */}
      <Box sx={{
        display: "flex", alignItems: "center", gap: 0.8,
        minWidth: 0, flex: 1, overflow: "hidden",
      }}>
        {isMobile && (
          <IconButton
            onClick={onMenuClick}
            aria-label={t("ui_resp.open_menu")}
            sx={{
              color: C.text, flexShrink: 0,
              width: 40, height: 40, borderRadius: "10px",
              "&:hover": { bgcolor: C.oliveSubtle },
            }}
          >
            <Menu fontSize="small" />
          </IconButton>
        )}
        <Typography sx={{
          color: C.olive, fontWeight: 700, fontSize: { xs: 13, md: 14 },
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          minWidth: 0,
        }}>
          {t("super.breadcrumb.dashboard")}
        </Typography>
      </Box>

      {/* راست: دکمه‌ها — فقط آیکون در موبایل */}
      <Box sx={{
        display: "flex", gap: { xs: 0.5, md: 1 },
        alignItems: "center", flexShrink: 0,
      }}>
        {onHelp && (
          <Tooltip title={`${t("shortcuts.title")} (F1)`} arrow>
            <IconButton onClick={onHelp} aria-label={t("shortcuts.title")} sx={iconBtnSx}>
              <KeyboardOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title={`${isDark ? t("super.lightMode") : t("super.darkMode")} (Alt+T)`} arrow>
          <IconButton onClick={toggleTheme} sx={iconBtnSx}>
            {isDark ? <LightMode fontSize="small" /> : <DarkMode fontSize="small" />}
          </IconButton>
        </Tooltip>

        <Tooltip title={`${t("super.switchLang")} (Alt+G)`} arrow>
          <IconButton onClick={toggleLang} sx={iconBtnSx}>
            <Language fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* ★ موبایل: فقط آیکون — دسکتاپ: آیکون + متن */}
        {isMobile ? (
          <Tooltip title={`${t("super.refresh")} (Alt+R)`} arrow>
            <IconButton onClick={onRefresh} sx={iconBtnSx}>
              <Refresh fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : (
          <Button
            onClick={onRefresh}
            startIcon={<Refresh fontSize="small" />}
            sx={{
              color: C.sub,
              border: `1px solid ${C.glassBorder}`,
              borderRadius: "8px",
              textTransform: "none",
              fontSize: 12,
              px: 1.5,
              height: 34,
              whiteSpace: "nowrap",
            }}
          >
            {t("super.refresh")}
          </Button>
        )}
      </Box>
    </Box>
  );
}