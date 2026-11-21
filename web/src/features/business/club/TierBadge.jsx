import { Chip } from "@mui/material";
import { useTranslation } from "react-i18next";

/** Tier chip: `tier` is {name, color} from the API, or null for the base level. */
export default function TierBadge({ tier, C }) {
  const { t } = useTranslation();
  const color = (tier && tier.color) || (tier ? C.info : C.muted);
  return (
    <Chip size="small" label={tier ? tier.name : t("ui_club.tier.member")}
      sx={{ fontWeight: 700, color, border: `1px solid ${color}`, bgcolor: "transparent", maxWidth: 160 }} />
  );
}
