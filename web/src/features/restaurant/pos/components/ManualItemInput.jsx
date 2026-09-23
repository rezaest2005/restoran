import { useState } from "react";
import { Box, Typography, TextField, Button } from "@mui/material";
import { Add } from "@mui/icons-material";

export default function ManualItemInput({ onAdd, C, isRtl }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");

  const handleAdd = () => {
    if (!name.trim() || !price || Number(price) <= 0) return;

    onAdd({
      id: null,
      name: name.trim(),
      category: category.trim() || (isRtl ? "متفرقه" : "Other"),
      price: Number(price),
      qty: 1,
      is_manual: true,
      cartId: Date.now() + Math.random(),
    });

    setName("");
    setCategory("");
    setPrice("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleAdd();
  };

  // ★ استایل مشترک برای تمام TextField ها (جلوگیری از تکرار کد - DRY)
  const textFieldSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "12px", 
      bgcolor: C.inputBg, 
      fontSize: 13,
      fontFamily: "'Vazirmatn', sans-serif",
      "& fieldset": { borderColor: C.glassBorder },
      "&:hover fieldset": { borderColor: C.olive },
      "&.Mui-focused fieldset": { borderColor: C.olive },
    },
    "& .MuiInputLabel-root": {
      fontFamily: "'Vazirmatn', sans-serif", 
      fontSize: 12, 
      color: C.sub,
      "&.Mui-focused": { color: C.olive },
    },
  };

  return (
    <Box sx={{
      p: 3,
      borderRadius: "20px",
      border: `1px solid ${C.glassBorder}`,
      bgcolor: C.glass,
      mb: 3,
    }}>
      <Typography sx={{
        fontWeight: 700, fontSize: 14, mb: 2,
        color: C.text,
        fontFamily: "'Vazirmatn', sans-serif",
      }}>
        {isRtl ? "✏️ ورود دستی آیتم" : "✏️ Manual Item Entry"}
      </Typography>

      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "flex-end" }}>
        <TextField
          size="small"
          label={isRtl ? "نام غذا" : "Food name"}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          sx={{ ...textFieldSx, flex: 2, minWidth: 150 }}
        />

        <TextField
          size="small"
          label={isRtl ? "دسته‌بندی" : "Category"}
          value={category}
          onChange={e => setCategory(e.target.value)}
          onKeyDown={handleKeyDown}
          sx={{ ...textFieldSx, flex: 1, minWidth: 100 }}
        />

        <TextField
          size="small"
          label={isRtl ? "قیمت (تومان)" : "Price"}
          type="number"
          value={price}
          onChange={e => setPrice(e.target.value)}
          onKeyDown={handleKeyDown}
          sx={{ ...textFieldSx, flex: 1, minWidth: 100 }}
        />

        <Button
          onClick={handleAdd}
          disabled={!name.trim() || !price || Number(price) <= 0}
          sx={{
            bgcolor: C.btnGrad,
            color: "#fff",
            borderRadius: "12px",
            px: 3,
            py: 1,
            fontSize: 13,
            fontWeight: 700,
            fontFamily: "'Vazirmatn', sans-serif",
            whiteSpace: "nowrap",
            "&:hover": { transform: "translateY(-2px)" },
            "&.Mui-disabled": { bgcolor: C.muted, color: "#fff" },
          }}
        >
          <Add sx={{ fontSize: 18, mr: 0.5 }} />
          {isRtl ? "افزودن" : "Add"}
        </Button>
      </Box>
    </Box>
  );
}