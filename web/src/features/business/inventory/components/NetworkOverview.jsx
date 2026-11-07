import { useTranslation } from "react-i18next";
import { Box, Typography, Chip } from "@mui/material";
import { whIcon, makeScale } from "../common";

const F = makeScale(1.1);

/** چیپ اطلاع‌رسانی برای انباردار محدودشده */
export function AccessChip({ access, warehouses, C }) {
  const { t } = useTranslation();
  if (!access || access.all_access) return null;
  const names = (warehouses || []).map((w) => w.name).join("، ");
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
      <Chip
        size="small"
        label={t("ui_net.restricted")}
        sx={{ bgcolor: C.infoBg, color: C.info, border: `1px solid ${C.info}30`, fontWeight: 700, fontSize: F(10) }}
      />
      <Typography sx={{ fontSize: F(10), color: C.sub }}>
        {names ? t("ui_net.restricted_list", { names }) : t("ui_net.none")}
      </Typography>
    </Box>
  );
}

/** کارت‌های نمای کلی شبکهٔ انبارها (فقط مدیر) */
export default function NetworkOverview({ rows, C }) {
  const { t } = useTranslation();
  if (!rows || rows.length === 0) return null;
  const num = (n) => Number(n || 0).toLocaleString("fa-IR");
  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography sx={{ fontSize: F(13), fontWeight: 800, color: C.text }}>
        🌐 {t("ui_net.network_title")}
      </Typography>
      <Typography sx={{ fontSize: F(10), color: C.sub, mb: 1 }}>{t("ui_net.network_hint")}</Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(auto-fill, minmax(230px, 1fr))" },
          gap: 1,
        }}
      >
        {rows.map((w) => (
          <Box
            key={w.id}
            sx={{ p: 1.5, borderRadius: "12px", bgcolor: C.glass, border: `1px solid ${C.glassBorder}` }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.8, flexWrap: "wrap" }}>
              <Typography sx={{ fontSize: 18 }}>{whIcon(w)}</Typography>
              <Typography sx={{ fontSize: F(12), fontWeight: 800, color: C.text }}>{w.name}</Typography>
              {w.is_mother && (
                <Chip size="small" label={t("ui_net.mother")}
                  sx={{ height: 18, fontSize: F(9), bgcolor: C.oliveSubtle, color: C.olive }} />
              )}
              {w.is_sales_default && (
                <Chip size="small" label={t("ui_net.sales_default")}
                  sx={{ height: 18, fontSize: F(9), bgcolor: C.infoBg, color: C.info }} />
              )}
            </Box>
            <Typography sx={{ fontSize: F(10), color: C.sub, mt: 0.3 }}>
              {w.warehouse_type_display}
            </Typography>
            <Typography sx={{ fontSize: F(11), color: C.text, mt: 0.8 }}>
              {t("ui_net.items", { count: w.item_count })}
            </Typography>
            <Typography sx={{ fontSize: F(11), color: C.olive, fontWeight: 700 }}>
              {t("ui_net.value")}: {num(w.total_stock_value)} {t("ui_net.currency")}
            </Typography>
            <Typography sx={{ fontSize: F(10), color: C.sub, mt: 0.8 }}>
              {t("ui_net.keepers")}: {w.keepers?.length ? w.keepers.join("، ") : t("ui_net.no_keepers")}
            </Typography>
            <Box sx={{ display: "flex", gap: 1.5, mt: 0.6, flexWrap: "wrap" }}>
              <Typography sx={{ fontSize: F(9), color: C.muted }}>
                {t("ui_net.out_7d")}: {num(w.transfers_out_7d)}
              </Typography>
              <Typography sx={{ fontSize: F(9), color: C.muted }}>
                {t("ui_net.in_7d")}: {num(w.transfers_in_7d)}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
