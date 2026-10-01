import { useState, useCallback, useMemo } from "react";
import { Box, Grid, Typography, CircularProgress } from "@mui/material";
import FoodCard from "./FoodCard";

// ★ توابع محاسبه تخفیف (دقیقاً مثل useCart)
const isDiscountActive = (d) => {
  if (!d || !d.amount || d.amount <= 0) return false;
  if (!d.expiresAt) return true;
  return Date.now() < d.expiresAt;
};

const computeDiscountAmount = (basePrice, discount) => {
  if (!isDiscountActive(discount)) return 0;
  if (discount.type === "percent")
    return Math.round((basePrice * discount.amount) / 100);
  return Math.min(discount.amount, basePrice);
};

const getItemCategoryKeys = (item) =>
  [item.category, item.category_name, item.category_name_en].filter(Boolean);

export default function FoodGrid({
  foods = [],
  loading,
  onAdd,
  onRemove,
  C,
  showStock,
  isRtl,
  editMode,
  onSave,
  categoryDiscounts,
  onExitEdit,
  cartItems = [],
}) {
  const [pinned, setPinned] = useState(new Set());
  const [order, setOrder] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  const togglePin = useCallback((id) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDragStart = useCallback((e, idx) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  }, []);

  const handleDragOver = useCallback((e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverIdx(idx);
  }, []);

  const handleDrop = useCallback(
    (e, dropIdx) => {
      e.preventDefault();
      setOverIdx(null);
      if (dragIdx === null || dragIdx === dropIdx) {
        setDragIdx(null);
        return;
      }
      setOrder((prev) => {
        const list = prev ? [...prev] : foods.map((f) => f.id);
        const [moved] = list.splice(dragIdx, 1);
        list.splice(dropIdx, 0, moved);
        return list;
      });
      setDragIdx(null);
    },
    [dragIdx, foods],
  );

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setOverIdx(null);
  }, []);

  const sortedFoods = useMemo(() => {
    if (!foods || foods.length === 0) return [];

    let list = [...foods];

    if (order) {
      const map = new Map(foods.map((f) => [f.id, f]));
      const orderedList = order.map((id) => map.get(id)).filter(Boolean);
      const missing = foods.filter((f) => !order.includes(f.id));
      list = [...orderedList, ...missing];
    }

    list.sort((a, b) => {
      const aP = pinned.has(a.id) ? 1 : 0;
      const bP = pinned.has(b.id) ? 1 : 0;
      return bP - aP;
    });

    return list;
  }, [foods, order, pinned]);

  const cartMap = useMemo(() => {
    const map = new Map();
    cartItems.forEach((item) => {
      if (item.id != null) {
        map.set(item.id, (map.get(item.id) || 0) + (item.qty || 1));
      }
    });
    return map;
  }, [cartItems]);

  // ★ محاسبه تخفیف هر غذا (دسته + همه + بررسی انقضا)
  const getFoodDiscount = useCallback(
    (food) => {
      const basePrice = food.price || 0;

      // تخفیف دسته‌ای
      const catKeys = getItemCategoryKeys(food);
      let catDiscountAmt = 0;
      for (const key of catKeys) {
        const d = categoryDiscounts?.[key];
        if (isDiscountActive(d)) {
          catDiscountAmt = computeDiscountAmount(basePrice, d);
          break;
        }
      }

      // تخفیف "همه"
      const allDiscount = categoryDiscounts?.["all"];
      const allDiscountAmt = isDiscountActive(allDiscount)
        ? computeDiscountAmount(basePrice, allDiscount)
        : 0;

      return catDiscountAmt + allDiscountAmt;
    },
    [categoryDiscounts],
  );

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress sx={{ color: C.olive }} />
      </Box>
    );
  }

  if (!foods || foods.length === 0) {
    return (
      <Box sx={{ textAlign: "center", py: 6 }}>
        <Typography
          sx={{
            color: C.muted,
            fontSize: 14,
            fontFamily: "'Vazirmatn', sans-serif",
          }}
        >
          {isRtl ? "غذایی یافت نشد" : "No food found"}
        </Typography>
      </Box>
    );
  }

  return (
    <Grid container spacing={1.5}>
      {sortedFoods.map((food, i) => {
        // ★ تخفیف محاسبه‌شده (دسته + همه + انقضا)
        const totalCatDiscount = getFoodDiscount(food);

        return (
          <Grid
            size={{ xs: 12, sm: 6 }}
            key={food.id}
            draggable
            onDragStart={(e) => handleDragStart(e, i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={(e) => handleDrop(e, i)}
            onDragEnd={handleDragEnd}
            sx={{
              transition: "all 0.2s ease",
              transform:
                overIdx === i && dragIdx !== i ? "scale(1.02)" : "none",
              opacity: dragIdx === i ? 0.35 : 1,
              borderRadius: "14px",
              outline:
                overIdx === i && dragIdx !== i
                  ? `2px dashed ${C.olive}55`
                  : "none",
              outlineOffset: 2,
            }}
          >
            <FoodCard
              food={food}
              onAdd={onAdd}
              onRemove={onRemove}
              C={C}
              showStock={showStock}
              index={i}
              isRtl={isRtl}
              editMode={editMode}
              isPinned={pinned.has(food.id)}
              onPin={togglePin}
              onSave={onSave}
              categoryDiscount={totalCatDiscount}
              categoryDiscountType="fixed"
              onExitEdit={onExitEdit}
              cartQty={cartMap.get(food.id) || 0}
            />
          </Grid>
        );
      })}
    </Grid>
  );
}