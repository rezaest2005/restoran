import { Box, Typography, IconButton } from "@mui/material";
import { Add, Delete } from "@mui/icons-material";

export default function CartItem({ item, onAdd, onRemove, categoryDiscounts, C, isRtl }) {
  const catDiscount = categoryDiscounts?.[item.category] || 0;
  const totalDiscount = (item.discount || 0) + catDiscount;
  const effective = Math.max(0, item.price - totalDiscount);

  return (
    <Box sx={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      p: 1.5,
      mb: 1,
      borderRadius: "12px",
      bgcolor: C.glass,
      border: `1px solid ${C.glassBorder}`,
    }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{
          fontWeight: 600,
          fontSize: 13,
          color: C.text,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontFamily: "'Vazirmatn', sans-serif",
        }}>
          {item.name}
        </Typography>
        <Typography sx={{
          fontSize: 11,
          color: C.sub,
          fontFamily: "'Vazirmatn', sans-serif",
        }}>
          {(effective * item.qty).toLocaleString()} {isRtl ? "تومان" : "T"}
        </Typography>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <IconButton
          size="small"
          onClick={() => onRemove(item.cartId)}
          sx={{ bgcolor: C.dangerBg, color: C.danger, width: 28, height: 28 }}
        >
          {item.qty <= 1 ? (
            <Delete sx={{ fontSize: 14 }} />
          ) : (
            <span style={{ fontSize: 14, fontWeight: 700 }}>−</span>
          )}
        </IconButton>
        <Typography sx={{
          fontWeight: 700,
          minWidth: 24,
          textAlign: "center",
          fontSize: 13,
          color: C.text,
          fontFamily: "'Vazirmatn', sans-serif",
        }}>
          {item.qty}
        </Typography>
        <IconButton
          size="small"
          onClick={() => onAdd(item)}
          sx={{ bgcolor: C.oliveSubtle, color: C.olive, width: 28, height: 28 }}
        >
          <Add sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>
    </Box>
  );
}