import { Chip } from "@mui/material";
import { useTranslation } from "react-i18next";

/** member | silver | gold — colours come from the palette `C`. */
export default function TierBadge({ tier, C }) {
  const { t } = useTranslation();
  const color = tier === "gold" ? C.gold : tier === "silver" ? C.info : C.muted;
  return (
    <Chip size="small" label={t(`ui_club.tier.${tier}`, tier)}
      sx={{ fontWeight: 700, color, border: `1px solid ${color}`, bgcolor: "transparent" }} />
  );
}
