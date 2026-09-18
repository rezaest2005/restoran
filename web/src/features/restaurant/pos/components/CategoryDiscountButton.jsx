import { useState } from "react";
import { Box, IconButton, TextField, Typography, Popover } from "@mui/material";
import { LocalOffer } from "@mui/icons-material";

export default function CategoryDiscountButton({
  categoryName,
  categoryDiscount,
  onApply,
  C, isRtl,
}) {
  const [anchor, setAnchor] = useState(null);
  const [value, setValue] = useState(categoryDiscount || 0);

  const handleApply = () => {
    onApply(categoryName, Math.max(0, Number(value)));
    setAnchor(null);
  };

  return (
    <>
      <IconButton
        size="small"
        onClick={e => { e.stopPropagation(); setAnchor(e.currentTarget); setValue(categoryDiscount || 0); }}
        sx={{
          width: 24, height: 24,
          bgcolor: categoryDiscount > 0 ? C.dangerBg : C.oliveSubtle,
          color: categoryDiscount > 0 ? C.burgundy : C.muted,
          "&:hover": { bgcolor: C.dangerBg, color: C.burgundy },
        }}
      >
        <LocalOffer sx={{ fontSize: 14 }} />
      </IconButton>

      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Box sx={{
          p: 2, width: 200,
          bgcolor: C.glass,
          backdropFilter: "blur(28px)",
          border: `1px solid ${C.glassBorder}`,
        }}>
          <Typography sx={{
            fontSize: 12, fontWeight: 700, mb: 1,
            color: C.text,
            fontFamily: "'Vazirmatn', sans-serif",
          }}>
            {isRtl ? `تخفیف ${categoryName}` : `Discount: ${categoryName}`}
          </Typography>
          <TextField
            size="small"
            fullWidth
            type="number"
            label={isRtl ? "مبلغ تخفیف (تومان)" : "Discount amount"}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleApply()}
            sx={{
              mb: 1.5,
              "& .MuiOutlinedInput-root": {
                borderRadius: "10px",
                bgcolor: C.inputBg,
                fontSize: 12,
                fontFamily: "'Vazirmatn', sans-serif",
                "& fieldset": { borderColor: C.glassBorder },
                "&:hover fieldset": { borderColor: C.olive },
                "&.Mui-focused fieldset": { borderColor: C.olive },
              },
              "& .MuiInputLabel-root": {
                fontFamily: "'Vazirmatn', sans-serif",
                fontSize: 11,
                color: C.sub,
              },
            }}
          />
          <Box sx={{ display: "flex", gap: 1 }}>
            <Box
              onClick={handleApply}
              sx={{
                flex: 1, textAlign: "center", py: 0.8, borderRadius: "8px",
                bgcolor: C.btnGrad, color: "#fff", cursor: "pointer",
                fontSize: 12, fontWeight: 700,
                fontFamily: "'Vazirmatn', sans-serif",
              }}
            >
              {isRtl ? "اعمال" : "Apply"}
            </Box>
            <Box
              onClick={() => { onApply(categoryName, 0); setAnchor(null); }}
              sx={{
                flex: 1, textAlign: "center", py: 0.8, borderRadius: "8px",
                bgcolor: C.dangerBg, color: C.danger, cursor: "pointer",
                fontSize: 12, fontWeight: 700,
                fontFamily: "'Vazirmatn', sans-serif",
              }}
            >
              {isRtl ? "حذف" : "Remove"}
            </Box>
          </Box>
        </Box>
      </Popover>
    </>
  );
}