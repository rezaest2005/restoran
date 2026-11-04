import { memo } from "react";
import { Box, Typography, IconButton, Chip } from "@mui/material";

import { isDiscountActive, computeDiscountAmount, getItemCategoryKeys } from "../common/discount";

function CartItem({ item, onAdd, onRemove, onDelete, categoryDiscounts, C, isRtl }) {
  // کیبورد (روی ردیف فوکوس‌شده): + / = افزایش · - کاهش · Delete حذف · Ctrl+A بعدی · Ctrl+Z قبلی
  const onRowKeyDown = (e) => {
    if (e.target !== e.currentTarget) return;
    const el = e.currentTarget;
    const ctrl = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;
    if (ctrl && (e.code === "KeyA" || e.code === "KeyZ")) {
      e.preventDefault();
      const sib = e.code === "KeyA" ? el.nextElementSibling : el.previousElementSibling;
      if (sib && sib.hasAttribute("data-cart-row")) sib.focus();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "+" || e.key === "=" || e.code === "Equal" || e.code === "NumpadAdd") {
      e.preventDefault();
      onAdd(item);
    } else if (e.key === "-" || e.code === "Minus" || e.code === "NumpadSubtract") {
      e.preventDefault();
      if (item.qty <= 1) {
        const sib = el.nextElementSibling || el.previousElementSibling;
        if (sib && sib.hasAttribute("data-cart-row")) sib.focus();
      }
      onRemove(item.cartId);
    } else if (e.key === "Delete") {
      e.preventDefault();
      const sib = el.nextElementSibling || el.previousElementSibling;
      if (sib && sib.hasAttribute("data-cart-row")) sib.focus();
      (onDelete || onRemove)(item.cartId);
    }
  };

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
      data-cart-row
      tabIndex={0}
      onKeyDown={onRowKeyDown}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.2,
        p: 1.2,
        outline: "none",
        "&:focus-visible": { boxShadow: `0 0 0 2px ${C.olive}` },
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