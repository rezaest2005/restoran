import { Box, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { appName } from "@shared/branding";

/** نشان موقت تا زمان آماده شدن لوگوی واقعی: مربع ۳۲ پیکسلی primary با نقطه‌ی accent. */
export function BrandSquare({ size = 32 }) {
  return (
    <Box
      aria-hidden="true"
      sx={{
        width: size, height: size, flexShrink: 0, bgcolor: "primary.main",
        borderRadius: "10px", display: "grid", placeItems: "center",
      }}
    >
      <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "secondary.main" }} />
    </Box>
  );
}

export default function BrandMark({ showName = true, size = 32, sx }) {
  const { i18n } = useTranslation();
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, ...sx }}>
      <BrandSquare size={size} />
      {showName && (
        <Typography component="span" sx={{ fontWeight: 800, fontSize: 16, color: "text.primary" }}>
          {appName(i18n.language)}
        </Typography>
      )}
    </Box>
  );
}
