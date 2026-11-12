import { Box, Typography, Button } from "@mui/material";
import { QRCodeSVG } from "qrcode.react";
import CopyLink from "./CopyLink";
import { driverUrl } from "./common";

/**
 * Shown on the fleet tab: the one address every courier of this business opens on their phone
 * (the business slug comes first). Includes a QR so a courier can just scan it.
 */
export default function DriverLinkCard({ ctx }) {
  const { t, C, S } = ctx;
  const url = driverUrl();
  return (
    <Box sx={{ ...S.card, mb: 2, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
      <Box sx={{ flex: 1, minWidth: 240 }}>
        <Typography sx={{ fontWeight: 800, color: C.text, mb: 0.5 }}>{t("ui_del.drvlink.title")}</Typography>
        <Typography sx={{ color: C.sub, fontSize: 13, mb: 1 }}>{t("ui_del.drvlink.hint")}</Typography>
        <Typography dir="ltr" sx={{ fontFamily: "var(--font-mono)", fontSize: 14, color: C.text, bgcolor: "var(--surface-sunken)", border: "1px solid var(--line)", borderRadius: "10px", p: 1, wordBreak: "break-all", userSelect: "all" }}>
          {url}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
          <CopyLink url={url} label={t("ui_del.drvlink.copy")} doneLabel={t("ui_del.ship.copied")} />
          <Button size="small" variant="outlined" component="a" href={url} target="_blank" rel="noopener noreferrer">{t("ui_del.drvlink.open")}</Button>
        </Box>
        <Typography sx={{ color: C.sub, fontSize: 12, mt: 1 }}>{t("ui_del.drvlink.session")}</Typography>
      </Box>
      <Box sx={{ bgcolor: "#fff", p: 1, borderRadius: 1.5, width: 124, height: 124 }}>
        <QRCodeSVG value={url} size={128} level="M" marginSize={0} style={{ width: "100%", height: "100%" }} role="img" aria-label={t("ui_del.drvlink.title")} />
      </Box>
    </Box>
  );
}
