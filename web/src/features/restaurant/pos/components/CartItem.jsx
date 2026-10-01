import { memo } from "react";
import { Box, Typography, IconButton, Chip } from "@mui/material";

// ★ محاسبه تخفیف دسته (دقیقاً مثل useCart)
const isDiscountActive = (d) => {
  if (!d || !d.amount || d.amount <= 0) return false;
  if (!d.expiresAt) return true;
  return Date.now() < d.expiresAt;
};

const computeDiscountAmount = (basePrice, discount) => {
  if (!isDiscountActive(discount)) return 0;
  if (discount.type === "percent") return (basePrice * discount.amount) / 100;
  return discount.amount;
};

const getItemCategoryKeys = (item) =>
  [item.category, item.category_name, item.category_name_en].filter(Boolean);

function CartItem({ item, onAdd, onRemove, categoryDiscounts, C, isRtl }) {
  // ★ تخفیف دسته — بررسی همه فیلدهای دسته
  const catKeys = getItemCategoryKeys(item);
  let catDiscountAmt = 0;
  for (const key of catKeys) {
    const d = categoryDiscounts?.[key];
    if (isDiscountActive(d)) {
      catDiscountAmt = computeDiscountAmount(item.price, d);
      break;
    }
  }

  // ★ تخفیف "همه"
  const allDiscount = categoryDiscounts?.["all"];
  const allDiscountAmt = isDiscountActive(allDiscount)
    ? computeDiscountAmount(item.price, allDiscount)
    : 0;

  const itemDiscount = item.discount || 0;
  const totalDiscount = itemDiscount + catDiscountAmt + allDiscountAmt;
  const effective = Math.max(0, item.price - totalDiscount);

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.2,
        p: 1.2,
        borderRadius: "10px",
        border: `1px solid ${C.glassBorder}`,
        bgcolor: C.glass,
        mb: 1,
      }}
    >
      {/* اسم */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 700,
            color: C.text,
            fontFamily: "'Vazirmatn', sans-serif",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.name}
        </Typography>

        {/* قیمت */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.3 }}>
          {totalDiscount > 0 ? (
            <>
              <Typography
                sx={{
                  fontSize: 11,
                  color: C.muted,
                  textDecoration: "line-through",
                }}
              >
                {item.price.toLocaleString()}
              </Typography>
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: C.burgundy || C.danger,
                }}
              >
                {effective.toLocaleString()}
              </Typography>
              <Chip
                size="small"
                label={`-${totalDiscount.toLocaleString()}`}
                sx={{
                  height: 16,
                  fontSize: 8,
                  fontWeight: 700,
                  bgcolor: C.dangerBg,
                  color: C.burgundy || C.danger,
                  borderRadius: "4px",
                }}
              />
            </>
          ) : (
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 700,
                color: C.text,
              }}
            >
              {item.price.toLocaleString()} تومان
            </Typography>
          )}
        </Box>
      </Box>

      {/* +/- */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <IconButton
          size="small"
          onClick={() => onRemove(item.cartId)}
          sx={{
            width: 28,
            height: 28,
            border: `1px solid ${C.glassBorder}`,
            color: C.sub,
            fontSize: 14,
            "&:hover": { bgcolor: C.dangerBg, color: C.danger },
          }}
        >
          −
        </IconButton>
        <Typography
          sx={{
            fontSize: 14,
            fontWeight: 800,
            color: C.text,
            minWidth: 24,
            textAlign: "center",
          }}
        >
          {item.qty}
        </Typography>
        <IconButton
          size="small"
          onClick={() => onAdd(item)}
          sx={{
            width: 28,
            height: 28,
            border: `1px solid ${C.olive}40`,
            color: C.olive,
            fontSize: 14,
            "&:hover": { bgcolor: C.oliveSubtle },
          }}
        >
          +
        </IconButton>
      </Box>

      {/* جمع کل این ردیف */}
      <Typography
        sx={{
          fontSize: 13,
          fontWeight: 800,
          color: C.text,
          minWidth: 70,
          textAlign: isRtl ? "left" : "right",
        }}
      >
        {(effective * item.qty).toLocaleString()}
      </Typography>
    </Box>
  );
}

export default memo(CartItem);