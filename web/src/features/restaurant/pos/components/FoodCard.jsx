import { useState, useRef } from "react";
import { Box, Typography, IconButton } from "@mui/material";
import {
  CameraAlt, Add, Remove, PushPin, PushPinOutlined,
  Percent, AttachMoney,
} from "@mui/icons-material";

export default function FoodCard({
  food = {}, onAdd, onRemove, C = {}, showStock, index, isRtl, editMode,
  isPinned, onPin,
}) {
  const [price, setPrice] = useState(food.final_price || food.price || 0);
  const [discount, setDiscount] = useState(0);
  const [discountMode, setDiscountMode] = useState("percent");
  const [imageUrl, setImageUrl] = useState(food.image || null);
  const [uploading, setUploading] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [qty, setQty] = useState(0);
  const [stock, setStock] = useState(food.stock ?? 10);
  const initialStock = food.stock ?? 10;
  const fileRef = useRef(null);
  const outOfStock = stock <= 0;
  const lowStock = stock > 0 && stock <= 5;

  const discountAmount = discountMode === "percent"
    ? Math.round(price * discount / 100)
    : discount;
  const effectivePrice = Math.max(0, price - discountAmount);

  const formatNum = (n) => {
    if (!n && n !== 0) return "";
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  const labelSx = {
    fontSize: 11,
    fontWeight: 800,
    color: C.sub,
    fontFamily: "'Vazirmatn', sans-serif",
    mb: 0.3,
  };

  const inputSx = {
    width: "100%",
    height: 32,
    borderRadius: 7,
    border: `1.5px solid ${C.olive}22`,
    background: `${C.olive}08`,
    padding: "3px 8px",
    fontSize: 12,
    fontFamily: "'Vazirmatn', sans-serif",
    color: C.text,
    outline: "none",
    boxSizing: "border-box",
  };

  const toggleSx = (active) => ({
    width: 24,
    height: 24,
    borderRadius: "6px",
    bgcolor: active ? `${C.olive}22` : "transparent",
    color: active ? C.olive : C.muted,
    border: `1px solid ${active ? C.olive + "44" : C.olive + "15"}`,
    "&:hover": { bgcolor: `${C.olive}18` },
  });

  const handleAdd = () => {
    if (outOfStock || editMode || typeof onAdd !== "function") return;
    setQty(q => q + 1);
    setStock(s => Math.max(0, s - 1));
    onAdd({
      id: food.id,
      name: food.name,
      name_en: food.name_en || "",
      category: food.category_name || food.category || "",
      category_en: food.category_name_en || "",
      price,
      discount: discountAmount,
      effective_price: effectivePrice,
      is_manual: false,
    });
  };

  const inc = (e) => { e.stopPropagation(); handleAdd(); };
  const dec = (e) => {
    e.stopPropagation();
    setQty(q => {
      if (q > 0) {
        setStock(s => Math.min(initialStock, s + 1));
        if (typeof onRemove === "function") onRemove(food.id);
      }
      return Math.max(0, q - 1);
    });
  };

  const handlePin = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (onPin) onPin(food.id);
  };

  const handleImageClick = (e) => {
    e.stopPropagation();
    if (editMode && fileRef.current) fileRef.current.click();
    else if (!editMode) handleAdd();
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const client = (await import("../../api/client")).default;
      const fd = new FormData();
      fd.append("image", file);
      const res = await client.post(`/api/dictionary/food/${food.id}/update/`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (res.data?.image) setImageUrl(res.data.image);
      else if (res.data?.food?.image) setImageUrl(res.data.food.image);
    } catch (err) {
      console.error("Image upload failed:", err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const displayName = isRtl ? food.name : (food.name_en || food.name);
  const showSubName = isRtl && food.name_en;

  return (
    <Box
      onClick={handleAdd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={{
        borderRadius: "16px",
        border: `2px solid ${
          isPinned ? C.gold + "99" :
          outOfStock ? C.danger + "30" :
          editMode ? C.gold + "55" :
          C.glassBorder
        }`,
        cursor: editMode ? "default" : outOfStock ? "not-allowed" : "pointer",
        opacity: outOfStock ? 0.45 : 1,
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        animation: `fadeUp 0.4s ease-out ${(index || 0) * 0.04}s backwards`,
        position: "relative",
        overflow: "hidden",
        bgcolor: isPinned ? `${C.gold}08` : C.glass,
        display: "flex",
        flexDirection: "row",
        alignItems: "stretch",
        minHeight: { xs: 120, sm: 140 },
        userSelect: "none",
        "&:hover": editMode || outOfStock ? {} : {
          transform: "translateY(-4px)",
          borderColor: C.olive + "66",
          boxShadow: `0 8px 32px ${C.olive}20`,
        },
      }}
    >
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageUpload} />

      {/* دکمه پین — روی تصویر */}
      <IconButton
        onClick={handlePin}
        onMouseDown={(e) => e.stopPropagation()}
        size="small"
        sx={{
          position: "absolute",
          top: 6,
          left: isRtl ? "auto" : 6,
          right: isRtl ? 6 : "auto",
          zIndex: 5,
          width: { xs: 26, sm: 28 },
          height: { xs: 26, sm: 28 },
          borderRadius: "7px",
          bgcolor: isPinned ? C.gold : "rgba(0,0,0,0.35)",
          color: isPinned ? "#fff" : "rgba(255,255,255,0.8)",
          opacity: hovered || isPinned ? 1 : 0.5,
          border: isPinned
            ? `2px solid ${C.gold}`
            : "2px solid rgba(255,255,255,0.15)",
          transition: "all 0.2s ease",
          "&:hover": {
            bgcolor: isPinned ? C.gold : "rgba(0,0,0,0.5)",
            transform: "scale(1.1)",
            opacity: 1,
          },
        }}
      >
        {isPinned
          ? <PushPin sx={{ fontSize: { xs: 14, sm: 16 }, transform: "rotate(45deg)" }} />
          : <PushPinOutlined sx={{ fontSize: { xs: 14, sm: 16 } }} />
        }
      </IconButton>

      {/* بج تخفیف */}
      {discountAmount > 0 && !editMode && (
        <Box sx={{
          position: "absolute",
          top: 6,
          left: isRtl ? 40 : "auto",
          right: isRtl ? "auto" : 40,
          zIndex: 3,
          bgcolor: C.burgundy,
          color: "#fff",
          fontSize: { xs: 10, sm: 11 },
          fontWeight: 800,
          px: 0.8,
          py: 0.15,
          borderRadius: "6px",
          fontFamily: "'Vazirmatn', sans-serif",
        }}>
          {discountMode === "percent"
            ? `${discount}%`
            : `${formatNum(discountAmount)} ${isRtl ? "ت" : "T"}`
          }
        </Box>
      )}

      {/* بج ناموجود */}
      {outOfStock && !editMode && (
        <Box sx={{
          position: "absolute",
          top: 6,
          right: isRtl ? "auto" : 6,
          left: isRtl ? 6 : "auto",
          zIndex: 3,
          bgcolor: C.danger,
          color: "#fff",
          fontSize: { xs: 10, sm: 11 },
          fontWeight: 800,
          px: 0.8,
          py: 0.15,
          borderRadius: "6px",
          fontFamily: "'Vazirmatn', sans-serif",
        }}>
          {isRtl ? "ناموجود" : "OUT"}
        </Box>
      )}

      {/* تصویر */}
      <Box onClick={handleImageClick} sx={{
        width: { xs: 100, sm: 140 },
        minWidth: { xs: 100, sm: 140 },
        bgcolor: C.oliveSubtle,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        position: "relative",
        cursor: editMode ? "pointer" : "default",
        borderRadius: isRtl ? "0 16px 16px 0" : "16px 0 0 16px",
      }}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={food.name}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transition: "transform 0.3s ease",
              transform: hovered && !editMode ? "scale(1.08)" : "scale(1)",
            }}
          />
        ) : (
          <Typography sx={{ fontSize: { xs: 36, sm: 48 }, opacity: 0.25 }}>🍽️</Typography>
        )}

        {editMode && (
          <Box sx={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: hovered ? 1 : 0,
            transition: "opacity 0.2s ease",
          }}>
            {uploading ? (
              <Box sx={{
                width: 32,
                height: 32,
                border: "3px solid rgba(255,255,255,0.2)",
                borderTopColor: "#fff",
                borderRadius: "50%",
                animation: "spin 0.7s linear infinite",
              }} />
            ) : (
              <CameraAlt sx={{ color: "#fff", fontSize: 28 }} />
            )}
          </Box>
        )}
      </Box>

      {/* محتوا */}
      <Box sx={{
        flex: 1,
        px: { xs: 1.2, sm: 2 },
        py: { xs: 1, sm: 1.5 },
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: { xs: 0.5, sm: 1 },
        minWidth: 0,
        overflow: "hidden",
      }}>
        {/* اسم */}
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{
            fontWeight: 800,
            fontSize: { xs: 13, sm: 16 },
            color: C.text,
            fontFamily: "'Vazirmatn', sans-serif",
            lineHeight: 1.5,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {displayName}
          </Typography>
          {showSubName && (
            <Typography sx={{
              fontSize: { xs: 10, sm: 12 },
              color: C.muted,
              fontWeight: 400,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              {food.name_en}
            </Typography>
          )}
        </Box>

        {/* حالت ویرایش */}
        {editMode ? (
          <Box onClick={e => e.stopPropagation()} sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1.2,
          }}>
            {/* قیمت */}
            <Box>
              <Typography sx={labelSx}>
                {isRtl ? "قیمت محصول" : "Price"}
              </Typography>
              <input
                type="text"
                value={formatNum(price)}
                onChange={e => {
                  const raw = e.target.value.replace(/,/g, "");
                  if (/^\d*$/.test(raw)) setPrice(Number(raw));
                }}
                placeholder={isRtl ? "مثلاً ۴۵,۰۰۰" : "e.g. 45,000"}
                style={inputSx}
              />
            </Box>

            {/* تخفیف */}
            <Box>
              <Box sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                mb: 0.3,
              }}>
                <Typography sx={{ ...labelSx, mb: 0 }}>
                  {isRtl ? "تخفیف" : "Discount"}
                </Typography>
                <Box sx={{ display: "flex", gap: 0.4 }}>
                  <IconButton
                    size="small"
                    onClick={() => { setDiscountMode("percent"); setDiscount(0); }}
                    sx={toggleSx(discountMode === "percent")}
                  >
                    <Percent sx={{ fontSize: 14 }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => { setDiscountMode("amount"); setDiscount(0); }}
                    sx={toggleSx(discountMode === "amount")}
                  >
                    <AttachMoney sx={{ fontSize: 14 }} />
                  </IconButton>
                </Box>
              </Box>
              <input
                type="text"
                value={formatNum(discount)}
                onChange={e => {
                  const raw = e.target.value.replace(/,/g, "");
                  if (/^\d*$/.test(raw)) {
                    const val = Number(raw);
                    setDiscount(discountMode === "percent" ? Math.min(100, val) : val);
                  }
                }}
                placeholder={discountMode === "percent"
                  ? (isRtl ? "مثلاً ۱۰" : "e.g. 10")
                  : (isRtl ? "مثلاً ۵,۰۰۰" : "e.g. 5,000")
                }
                style={inputSx}
              />
              {discount > 0 && (
                <Typography sx={{
                  fontSize: 11,
                  color: C.burgundy,
                  fontWeight: 700,
                  mt: 0.4,
                  fontFamily: "'Vazirmatn', sans-serif",
                }}>
                  {discountMode === "percent"
                    ? `${discount}% = ${formatNum(discountAmount)} ${isRtl ? "تومان کاهش" : "T off"}`
                    : `${formatNum(discountAmount)} ${isRtl ? "تومان کاهش" : "T off"}`
                  }
                </Typography>
              )}
            </Box>

            {/* موجودی */}
            <Box>
              <Typography sx={labelSx}>
                {isRtl ? "موجودی" : "Stock"}
              </Typography>
              <Box sx={{ display: "flex", gap: 0.6, alignItems: "center" }}>
                <input
                  type="number"
                  value={stock}
                  onChange={e => setStock(Math.max(0, Number(e.target.value)))}
                  style={{ ...inputSx, flex: 1 }}
                />
                <Box
                  onClick={() => setStock(s => s + 10)}
                  sx={{
                    height: 34,
                    px: 1.2,
                    borderRadius: 8,
                    bgcolor: `${C.olive}12`,
                    color: C.olive,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 800,
                    fontFamily: "'Vazirmatn', sans-serif",
                    cursor: "pointer",
                    border: `1.5px solid ${C.olive}25`,
                    transition: "all 0.2s ease",
                    "&:hover": { bgcolor: `${C.olive}22` },
                  }}
                >
                  +10
                </Box>
              </Box>
              {stock <= 0 && (
                <Typography sx={{
                  fontSize: 11,
                  color: C.danger,
                  fontWeight: 700,
                  mt: 0.4,
                  fontFamily: "'Vazirmatn', sans-serif",
                }}>
                  {isRtl ? "⚠ ناموجود" : "⚠ Out of stock"}
                </Typography>
              )}
              {lowStock && stock > 0 && (
                <Typography sx={{
                  fontSize: 11,
                  color: C.gold,
                  fontWeight: 700,
                  mt: 0.4,
                  fontFamily: "'Vazirmatn', sans-serif",
                }}>
                  {isRtl ? `⚠ رو به اتمام (${stock} عدد)` : `⚠ Low stock (${stock})`}
                </Typography>
              )}
            </Box>
          </Box>
        ) : (
          /* حالت نمایش */
          <Box sx={{
            display: "flex",
            flexDirection: "column",
            gap: { xs: 0.4, sm: 0.8 },
          }}>
            {/* ★ موجودی — همیشه نشون داده میشه */}
            <Box sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.6,
            }}>
              <Box sx={{
                width: { xs: 6, sm: 7 },
                height: { xs: 6, sm: 7 },
                borderRadius: "50%",
                bgcolor: outOfStock ? C.danger : lowStock ? C.gold : C.olive,
                flexShrink: 0,
              }} />
              <Typography sx={{
                fontSize: { xs: 11, sm: 12 },
                fontWeight: 700,
                color: outOfStock ? C.danger : lowStock ? C.gold : C.muted,
                fontFamily: "'Vazirmatn', sans-serif",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {outOfStock
                  ? (isRtl ? "ناموجود" : "Out of stock")
                  : lowStock
                    ? (isRtl ? `رو به اتمام (${stock})` : `Low stock (${stock})`)
                    : (isRtl ? `موجودی: ${stock}` : `Stock: ${stock}`)
                }
              </Typography>
            </Box>

            {/* قیمت + دکمه */}
            <Box sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 0.5,
            }}>
              <Box sx={{
                display: "flex",
                alignItems: "baseline",
                gap: 0.6,
                minWidth: 0,
                overflow: "hidden",
              }}>
                {discountAmount > 0 && (
                  <Typography sx={{
                    fontSize: { xs: 10, sm: 12 },
                    color: C.muted,
                    textDecoration: "line-through",
                    fontFamily: "'Vazirmatn', sans-serif",
                    flexShrink: 0,
                  }}>
                    {formatNum(price)}
                  </Typography>
                )}
                <Typography sx={{
                  fontWeight: 900,
                  color: effectivePrice > 0 ? C.olive : C.muted,
                  fontSize: { xs: 15, sm: 18 },
                  fontFamily: "'Vazirmatn', sans-serif",
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                }}>
                  {effectivePrice > 0
                    ? formatNum(effectivePrice)
                    : (isRtl ? "رایگان" : "Free")
                  }
                  {effectivePrice > 0 && (
                    <Typography component="span" sx={{
                      fontSize: { xs: 10, sm: 11 },
                      fontWeight: 600,
                      color: C.muted,
                      mr: 0.4,
                      fontFamily: "'Vazirmatn', sans-serif",
                    }}>
                      {isRtl ? "تومان" : "T"}
                    </Typography>
                  )}
                </Typography>
              </Box>

              {/* دکمه +/- */}
              {qty > 0 ? (
                <Box sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: { xs: 0.2, sm: 0.4 },
                  bgcolor: `${C.olive}10`,
                  borderRadius: "10px",
                  px: { xs: 0.2, sm: 0.3 },
                  flexShrink: 0,
                }}>
                  <IconButton
                    onClick={dec}
                    size="small"
                    sx={{
                      width: { xs: 26, sm: 30 },
                      height: { xs: 26, sm: 30 },
                      borderRadius: "8px",
                      color: C.olive,
                      "&:hover": { bgcolor: `${C.olive}15` },
                    }}
                  >
                    <Remove sx={{ fontSize: { xs: 14, sm: 16 } }} />
                  </IconButton>
                  <Typography sx={{
                    fontSize: { xs: 13, sm: 14 },
                    fontWeight: 800,
                    color: C.olive,
                    minWidth: { xs: 16, sm: 20 },
                    textAlign: "center",
                    fontFamily: "'Vazirmatn', sans-serif",
                  }}>
                    {qty}
                  </Typography>
                  <IconButton
                    onClick={inc}
                    size="small"
                    sx={{
                      width: { xs: 26, sm: 30 },
                      height: { xs: 26, sm: 30 },
                      borderRadius: "8px",
                      bgcolor: outOfStock ? C.muted : C.olive,
                      color: "#fff",
                      "&:hover": {
                        bgcolor: outOfStock ? C.muted : C.olive,
                        opacity: 0.85,
                      },
                    }}
                  >
                    <Add sx={{ fontSize: { xs: 14, sm: 16 } }} />
                  </IconButton>
                </Box>
              ) : (
                <IconButton
                  onClick={inc}
                  size="small"
                  sx={{
                    width: { xs: 30, sm: 34 },
                    height: { xs: 30, sm: 34 },
                    borderRadius: "9px",
                    bgcolor: outOfStock ? `${C.muted}12` : `${C.olive}12`,
                    color: outOfStock ? C.muted : C.olive,
                    border: `1.5px solid ${outOfStock ? C.muted : C.olive}30`,
                    flexShrink: 0,
                    "&:hover": {
                      bgcolor: outOfStock ? `${C.muted}20` : `${C.olive}22`,
                    },
                  }}
                >
                  <Add sx={{ fontSize: { xs: 17, sm: 19 } }} />
                </IconButton>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}