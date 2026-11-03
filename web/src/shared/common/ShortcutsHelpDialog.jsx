import { Dialog, DialogTitle, DialogContent, Box, Typography, IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useTranslation } from "react-i18next";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { buildColors } from "@shared/palette";
import { formatCombo } from "./useShortcuts";

/**
 * راهنمای میان‌برهای صفحه.
 * items: [{ combo: "F2", label: "جدید" }, ...] — همان bindingهای useShortcuts.
 * برای باز شدن با F1 در صفحه یک binding { combo: "F1", handler: () => setHelp(true) } بگذارید.
 */
export default function ShortcutsHelpDialog({ open, onClose, items = [] }) {
  const { t } = useTranslation();
  const { mode } = useThemeMode();
  const C = buildColors(mode === "dark");
  const list = items.filter((i) => i && i.combo && i.label);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {t("shortcuts.title")}
        <IconButton onClick={onClose} aria-label={t("shortcuts.close")} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {list.length === 0 && (
          <Typography sx={{ color: C.sub }}>{t("shortcuts.empty")}</Typography>
        )}
        {list.map((i) => (
          <Box
            key={i.combo + i.label}
            sx={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 2, py: 1, borderBottom: `1px solid ${C.divider}`,
            }}
          >
            <Typography sx={{ color: C.text, fontSize: 14 }}>{i.label}</Typography>
            <Box
              component="kbd"
              dir="ltr"
              sx={{
                px: 1, py: 0.25, borderRadius: 1, fontSize: 12, fontFamily: "monospace",
                bgcolor: C.primarySubtle, color: C.primary, border: `1px solid ${C.glassBorder}`,
                whiteSpace: "nowrap",
              }}
            >
              {formatCombo(i.combo)}
            </Box>
          </Box>
        ))}
      </DialogContent>
    </Dialog>
  );
}
