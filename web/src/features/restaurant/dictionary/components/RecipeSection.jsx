import { Box, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

export default function RecipeSection({ C }) {
  const { t } = useTranslation();

  return (
    <Box sx={{ textAlign: "center", py: 8 }}>
      <Typography sx={{ fontSize: 48, mb: 2 }}>📖</Typography>
      <Typography sx={{ fontSize: 18, fontWeight: 800, color: C.text, mb: 1 }}>
        {t("dict.recipe_tab")}
      </Typography>
      <Typography sx={{ fontSize: 13, color: C.sub, mb: 2 }}>
        {t("dict.recipe_subtitle")}
      </Typography>
      <Typography sx={{ fontSize: 12, color: C.muted }}>
        {t("dict.coming_soon")}
      </Typography>
    </Box>
  );
}