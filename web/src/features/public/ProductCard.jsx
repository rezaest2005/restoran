import { memo } from "react";
import { Box, Typography, IconButton, ButtonBase } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import { useTranslation } from "react-i18next";

export function formatPrice(n) {
  return Math.round(Number(n) || 0).toLocaleString("en-US");
}

function ProductCard({ item, name, qty, C, onAdd, onRemove }) {
  const { t } = useTranslation();
  const available = item.is_available !== false;
  const hasDiscount = !!item.discount;
  const btn = { width: 40, height: 40 };

  return (
    <Box
      sx={{
        display: "flex", gap: 1.5, p: 1.25, borderRadius: 3,
        background: C.glass, border: `1px solid ${C.glassBorder}`,
        boxShadow: C.cardShadow, opacity: available ? 1 : 0.55,
      }}
    >
      <Box
        sx={{
          width: 84, height: 84, flexShrink: 0, borderRadius: 2, overflow: "hidden",
          background: C.primarySubtle, display: "flex", alignItems: "center",
          justifyContent: "center", color: C.muted,
        }}
      >
        {item.image ? (
          <img src={item.image} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <ImageOutlinedIcon />
        )}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 0.5 }}>
        <Box>
          <Typography sx={{ color: C.text, fontWeight: 700, fontSize: 15, lineHeight: 1.5, wordBreak: "break-word" }}>
            {name}
          </Typography>
          {hasDiscount && (
            <Box
              component="span"
              sx={{
                display: "inline-block", px: 1, borderRadius: 1, fontSize: 11, fontWeight: 700,
                background: C.dangerBg, color: C.danger,
              }}
            >
              {item.discount.label}
            </Box>
          )}
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
          <Box sx={{ minWidth: 0 }}>
            {hasDiscount && Number(item.price) !== Number(item.final_price) && (
              <Typography sx={{ color: C.muted, fontSize: 12, textDecoration: "line-through" }}>
                {formatPrice(item.price)}
              </Typography>
            )}
            <Typography sx={{ color: C.primary, fontWeight: 800, fontSize: 14 }}>
              {formatPrice(item.final_price)}{" "}
              <Box component="span" sx={{ color: C.sub, fontWeight: 500, fontSize: 11 }}>
                {t("ui_d.qr.currency")}
              </Box>
            </Typography>
          </Box>

          {!available ? (
            <Typography sx={{ color: C.muted, fontSize: 12 }}>{t("ui_d.qr.unavailable")}</Typography>
          ) : qty > 0 ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <IconButton sx={{ ...btn, color: C.primary, border: `1px solid ${C.glassBorder}` }}
                aria-label={t("ui_d.qr.dec_aria", { name })} onClick={() => onRemove(item.id)}>
                <RemoveIcon fontSize="small" />
              </IconButton>
              <Typography sx={{ minWidth: 22, textAlign: "center", color: C.text, fontWeight: 700 }}>{qty}</Typography>
              <IconButton sx={{ ...btn, color: C.onPrimary, background: C.btnGrad, "&:hover": { background: C.btnHover } }}
                aria-label={t("ui_d.qr.inc_aria", { name })} onClick={() => onAdd(item.id)}>
                <AddIcon fontSize="small" />
              </IconButton>
            </Box>
          ) : (
            <ButtonBase
              aria-label={t("ui_d.qr.add_aria", { name })}
              onClick={() => onAdd(item.id)}
              sx={{
                minHeight: 40, px: 2, borderRadius: 2, background: C.btnGrad, color: C.onPrimary,
                fontWeight: 700, fontSize: 13, gap: 0.5,
              }}
            >
              <AddIcon fontSize="small" />
              {t("ui_d.qr.add")}
            </ButtonBase>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default memo(ProductCard);
