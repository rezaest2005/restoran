import { Box, Chip } from "@mui/material";
import CategoryDiscountButton from "./CategoryDiscountButton";

export default function CategoryBar({
  categoryNames, activeCat, setActiveCat,
  categoryDiscounts, onCategoryDiscount,
  C, isRtl,
}) {
  if (!categoryNames || categoryNames.length <= 1) return null;

  return (
    <Box sx={{
      display: "flex",
      gap: 1,
      mb: 2,
      flexWrap: "wrap",
      direction: isRtl ? "rtl" : "ltr",
      justifyContent: isRtl ? "flex-end" : "flex-start",
      alignItems: "center",
    }}>
      {(isRtl ? [...categoryNames].reverse() : categoryNames).map(cat => {
        const discount = categoryDiscounts?.[cat] || 0;
        const isActive = activeCat === cat;

        return (
          <Box key={cat} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Chip
              label={
                cat === "all"
                  ? (isRtl ? "همه" : "All")
                  : discount > 0
                    ? `${cat} (${discount.toLocaleString()})`
                    : cat
              }
              onClick={() => setActiveCat(cat)}
              variant={isActive ? "filled" : "outlined"}
              sx={{
                bgcolor: isActive ? C.olive : discount > 0 ? C.dangerBg : "transparent",
                color: isActive ? "#fff" : discount > 0 ? C.burgundy : C.sub,
                borderColor: C.glassBorder,
                fontWeight: 600,
                fontFamily: "'Vazirmatn', sans-serif",
                "&:hover": {
                  bgcolor: isActive ? C.olive : C.oliveSubtle,
                },
              }}
            />
            {cat !== "all" && (
              <CategoryDiscountButton
                categoryName={cat}
                categoryDiscount={discount}
                onApply={onCategoryDiscount}
                C={C}
                isRtl={isRtl}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}