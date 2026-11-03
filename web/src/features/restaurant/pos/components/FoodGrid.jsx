import { useState, useCallback, useMemo, useEffect } from "react";
import { Box, Grid, Typography, CircularProgress } from "@mui/material";
import { useTranslation } from "react-i18next";
import useShortcuts from "@shared/common/useShortcuts";
import FoodCard from "./FoodCard";

import { isDiscountActive, getItemCategoryKeys } from "../common/discount";

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
  const { t } = useTranslation();
  const [pinned, setPinned] = useState(new Set());
  const [focusedId, setFocusedId] = useState(null);
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

  // ── کیبورد: Ctrl+A / Ctrl+Z حرکت بین محصولات، Enter افزودن به سبد ──
  const focusedIdx = sortedFoods.findIndex((f) => f.id === focusedId);

  const moveFocus = (dir) => {
    if (sortedFoods.length === 0) return;
    const next = focusedIdx < 0
      ? (dir > 0 ? 0 : sortedFoods.length - 1)
      : Math.min(Math.max(focusedIdx + dir, 0), sortedFoods.length - 1);
    setFocusedId(sortedFoods[next].id);
  };

  useEffect(() => {
    if (focusedId == null) return;
    document
      .querySelector(`[data-food-id="${String(focusedId).replace(/"/g, "")}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [focusedId]);

  const addFocused = (e) => {
    const el = e?.target;
    const tag = el?.tagName;
    const inSearch = el?.dataset?.posSearch === "1";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      if (!inSearch) return false;
    } else if (tag === "BUTTON" || tag === "A" || el?.getAttribute?.("role") === "button") {
      return false;
    }
    const food = focusedIdx >= 0
      ? sortedFoods[focusedIdx]
      : (inSearch && el.value ? sortedFoods[0] : null);
    if (!food) return false;
    document
      .querySelector(`[data-food-id="${String(food.id).replace(/"/g, "")}"] > *`)
      ?.click();
    return true;
  };

  useShortcuts([
    { combo: "Ctrl+A", label: t("ui_g.pos.next_product"), handler: () => moveFocus(1) },
    { combo: "Ctrl+Z", label: t("ui_g.pos.prev_product"), handler: () => moveFocus(-1) },
    { combo: "Enter", label: t("ui_g.pos.add_product"), handler: addFocused, allowInInput: true },
  ], { enabled: !editMode && !loading && sortedFoods.length > 0 });

  // ★ تابع جدید: برگرداندن نوع و مبلغ تخفیف
  const getFoodDiscount = useCallback(
    (food) => {
      const catKeys = getItemCategoryKeys(food);

      // تخفیف دسته‌ای
      for (const key of catKeys) {
        const d = categoryDiscounts?.[key];
        if (isDiscountActive(d)) {
          return { amount: d.amount, type: d.type || "fixed" };
        }
      }

      // تخفیف "همه"
      const allDiscount = categoryDiscounts?.["all"];
      if (isDiscountActive(allDiscount)) {
        return { amount: allDiscount.amount, type: allDiscount.type || "fixed" };
      }

      return { amount: 0, type: "fixed" };
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
        // ★ نوع و مبلغ تخفیف اصلی
        const discountInfo = getFoodDiscount(food);

        return (
          <Grid
            size={{ xs: 12, sm: 6 }}
            key={food.id}
            data-food-id={food.id}
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
                  : focusedIdx === i
                    ? `2px solid ${C.olive}`
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
              categoryDiscount={discountInfo.amount}
              categoryDiscountType={discountInfo.type}
              onExitEdit={onExitEdit}
              cartQty={cartMap.get(food.id) || 0}
            />
          </Grid>
        );
      })}
    </Grid>
  );
}