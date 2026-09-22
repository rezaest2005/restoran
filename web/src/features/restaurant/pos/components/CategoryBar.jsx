import { useState, useRef, useEffect } from "react";
import { Box, Chip } from "@mui/material";
import { DragIndicator } from "@mui/icons-material";
import CategoryDiscountButton from "./CategoryDiscountButton";

const isDiscountActive = (d) => {
  if (!d || !d.amount || d.amount <= 0) return false;
  if (!d.expiresAt) return true;
  return Date.now() < d.expiresAt;
};

const formatDiscountLabel = (d) => {
  if (!isDiscountActive(d)) return "";
  return d.type === "percent" ? `%${d.amount}` : d.amount.toLocaleString();
};

export default function CategoryBar({
  categoryNames,
  activeCat,
  setActiveCat,
  categoryDiscounts,
  onCategoryDiscount,
  C,
  isRtl,
}) {
  const [ordered, setOrdered] = useState([]);
  const [dragIdx, setDragIdx] = useState(null);
  const scrollRef = useRef(null);

  const STORAGE_KEY = "pos_cat_order";

  useEffect(() => {
    if (!categoryNames || categoryNames.length <= 1) return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const filtered = parsed.filter((c) => categoryNames.includes(c));
        const missing = categoryNames.filter((c) => !filtered.includes(c));
        setOrdered([...filtered, ...missing]);
        return;
      } catch {}
    }
    setOrdered([...categoryNames]);
  }, [categoryNames]);

  useEffect(() => {
    if (ordered.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ordered));
    }
  }, [ordered]);

  if (!categoryNames || categoryNames.length <= 1) return null;

  const others = ordered.filter((c) => c !== "all");
  const displayCats = ["all", ...others];

  const handleDragStart = (e, idx) => {
    if (idx === 0) return;
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    if (idx === 0) return;
  };

  const handleDrop = (e, dropIdx) => {
    e.preventDefault();
    if (dropIdx === 0 || dragIdx === null || dragIdx === dropIdx) return;

    const newOrder = [...others];
    const fromReal = dragIdx - 1;
    const toReal = dropIdx - 1;
    const dragItem = newOrder[fromReal];

    newOrder.splice(fromReal, 1);
    newOrder.splice(toReal, 0, dragItem);

    setOrdered(["all", ...newOrder]);
    setDragIdx(null);
  };

  const handleDragEnd = () => setDragIdx(null);

  return (
    <Box
      ref={scrollRef}
      style={{ direction: isRtl ? "rtl" : "ltr" }}
      sx={{
        display: "flex",
        flexDirection: "row",
        gap: { xs: 0.6, sm: 1 },
        mb: 2,
        alignItems: "center",
        overflowX: "auto",
        overflowY: "hidden",
        whiteSpace: "nowrap",
        pb: 0.5,
        scrollBehavior: "smooth",
        "&::-webkit-scrollbar": { height: 4 },
        "&::-webkit-scrollbar-thumb": {
          bgcolor: `${C.muted}40`,
          borderRadius: 2,
        },
        "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
      }}
    >
      {displayCats.map((cat, idx) => {
        const discount = categoryDiscounts?.[cat];
        const hasDiscount = isDiscountActive(discount);
        const isActive = activeCat === cat;
        const isDragging = dragIdx === idx;
        const isAll = cat === "all";

        return (
          <Box
            key={cat}
            draggable={!isAll}
            onDragStart={(e) => handleDragStart(e, idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={(e) => handleDrop(e, idx)}
            onDragEnd={handleDragEnd}
            sx={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: 0.3,
              flexShrink: 0,
              opacity: isDragging ? 0.4 : 1,
              transition: "opacity 0.2s ease",
              cursor: isAll ? "default" : "grab",
              "&:active": { cursor: isAll ? "default" : "grabbing" },
            }}
          >
            {!isAll && (
              <DragIndicator
                sx={{
                  fontSize: { xs: 14, sm: 16 },
                  color: C.muted,
                  opacity: 0.5,
                  "&:hover": { opacity: 1, color: C.olive },
                  cursor: "grab",
                }}
              />
            )}

            <Chip
              label={
                isAll
                  ? hasDiscount
                    ? `${isRtl ? "همه" : "All"} (${formatDiscountLabel(discount)})`
                    : isRtl
                      ? "همه"
                      : "All"
                  : hasDiscount
                    ? `${cat} (${formatDiscountLabel(discount)})`
                    : cat
              }
              onClick={() => setActiveCat(cat)}
              variant={isActive ? "filled" : "outlined"}
              sx={{
                bgcolor: isActive
                  ? C.olive
                  : hasDiscount
                    ? C.dangerBg
                    : "transparent",
                color: isActive ? "#fff" : hasDiscount ? C.burgundy : C.sub,
                borderColor: C.glassBorder,
                fontWeight: isActive ? 800 : 600,
                fontSize: { xs: 12, sm: 13 },
                fontFamily: "'Vazirmatn', sans-serif",
                height: { xs: 32, sm: 36 },
                transition: "all 0.2s ease",
                "&:hover": {
                  bgcolor: isActive ? C.olive : C.oliveSubtle,
                },
                userSelect: "none",
              }}
            />

            {/* ★ دیگه "all" استثنا نیست — روی همه محصولات هم می‌شه تخفیف زد */}
            <CategoryDiscountButton
              categoryName={cat}
              categoryDiscount={discount}
              onApply={onCategoryDiscount}
              C={C}
              isRtl={isRtl}
            />
          </Box>
        );
      })}
    </Box>
  );
}
