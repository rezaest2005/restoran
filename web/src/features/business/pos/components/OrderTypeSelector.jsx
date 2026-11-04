import { Box, Button } from "@mui/material";
import { Storefront, ShoppingBag, DeliveryDining } from "@mui/icons-material";

const TYPES = [
  { key: "hall", icon: Storefront },
  { key: "takeout", icon: ShoppingBag },
  { key: "delivery", icon: DeliveryDining },
];

const LABELS = {
  hall: { fa: "سالن", en: "Dine-in" },
  takeout: { fa: "بیرون‌بر", en: "Takeout" },
  delivery: { fa: "پیک", en: "Delivery" },
};

export default function OrderTypeSelector({ orderType, setOrderType, C, isRtl }) {
  return (
    <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
      {TYPES.map(t => {
        const Icon = t.icon;
        const active = orderType === t.key;
        const label = isRtl ? LABELS[t.key].fa : LABELS[t.key].en;
        return (
          <Button
            key={t.key}
            onClick={() => setOrderType(t.key)}
            sx={{
              flex: 1,
              py: 1,
              borderRadius: "12px",
              fontSize: 11,
              fontWeight: 600,
              fontFamily: "'Vazirmatn', sans-serif",
              bgcolor: active ? C.btnGrad : "transparent",
              color: active ? "#fff" : C.sub,
              border: active ? "none" : `1px solid ${C.glassBorder}`,
              "&:hover": {
                bgcolor: active ? C.btnGrad : C.oliveSubtle,
              },
            }}
          >
            <Icon sx={{ fontSize: 14, mr: 0.5 }} />
            {label}
          </Button>
        );
      })}
    </Box>
  );
}