import { useState, useEffect } from "react";
import {
  Box, IconButton, TextField, Typography,
  Dialog, DialogContent, Badge, Switch,
} from "@mui/material";
import { Sell, Close, Percent, Payments } from "@mui/icons-material";

const EXPIRY_PRESETS = [
  { id: "1h", labelFa: "۱ ساعت", labelEn: "1 hour", ms: 60 * 60 * 1000 },
  { id: "3h", labelFa: "۳ ساعت", labelEn: "3 hours", ms: 3 * 60 * 60 * 1000 },
  { id: "today", labelFa: "تا پایان امروز", labelEn: "End of today", endOfDay: true },
  { id: "tomorrow", labelFa: "تا فردا", labelEn: "Until tomorrow", ms: 24 * 60 * 60 * 1000 },
];

const computeExpiryFromPreset = (preset) => {
  if (preset.endOfDay) {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }
  return Date.now() + preset.ms;
};

// ★ ورودی عدد با جداکننده هزارگان: 1000 -> "1,000"
const formatThousands = (num) => (num ? Number(num).toLocaleString("en-US") : "");
const parseThousands = (str) => Number(String(str).replace(/[^\d]/g, "")) || 0;

// ★ تبدیل timestamp به مقدار قابل‌استفاده در input نوع datetime-local
const toDatetimeLocalValue = (ts) => {
  if (!ts) return "";
  const d = new Date(ts - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

export default function CategoryDiscountButton({
  categoryName,
  categoryDiscount,
  onApply,
  C, isRtl,
}) {
  const [open, setOpen] = useState(false);
  const [discountType, setDiscountType] = useState("fixed"); // "fixed" | "percent"
  const [amount, setAmount] = useState(0);
  const [focused, setFocused] = useState(false);
  const [expiryEnabled, setExpiryEnabled] = useState(false);
  const [expiryPreset, setExpiryPreset] = useState(null);
  const [customExpiry, setCustomExpiry] = useState("");

  const hasDiscount = !!(categoryDiscount && categoryDiscount.amount > 0);
  const isAll = categoryName === "all";

  const handleOpen = (e) => {
    e.stopPropagation();
    setDiscountType(categoryDiscount?.type || "fixed");
    setAmount(categoryDiscount?.amount || 0);
    if (categoryDiscount?.expiresAt) {
      setExpiryEnabled(true);
      setExpiryPreset(null);
      setCustomExpiry(toDatetimeLocalValue(categoryDiscount.expiresAt));
    } else {
      setExpiryEnabled(false);
      setExpiryPreset(null);
      setCustomExpiry("");
    }
    setOpen(true);
  };

  const handleApply = () => {
    let expiresAt = null;
    if (expiryEnabled) {
      if (customExpiry) {
        expiresAt = new Date(customExpiry).getTime();
      } else if (expiryPreset) {
        const preset = EXPIRY_PRESETS.find(p => p.id === expiryPreset);
        if (preset) expiresAt = computeExpiryFromPreset(preset);
      }
    }
    onApply(categoryName, {
      type: discountType,
      amount: Math.max(0, Number(amount)),
      expiresAt,
    });
    setOpen(false);
  };

  const handleRemove = () => {
    onApply(categoryName, null);
    setOpen(false);
  };

  const displayTitle = isAll
    ? (isRtl ? "تخفیف روی همه‌ی محصولات" : "Discount on all products")
    : (isRtl ? `تخفیف روی دسته «${categoryName}»` : `Discount on "${categoryName}"`);

  return (
    <>
      {/* دکمه + لیبل */}
      <Box
        onClick={handleOpen}
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0.2,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <Badge
          variant="dot"
          invisible={!hasDiscount}
          sx={{
            "& .MuiBadge-dot": {
              bgcolor: C.burgundy,
              width: 7,
              height: 7,
              borderRadius: "50%",
            },
          }}
        >
          <IconButton
            size="small"
            sx={{
              width: 28, height: 28,
              bgcolor: hasDiscount ? C.dangerBg : C.oliveSubtle,
              color: hasDiscount ? C.burgundy : C.olive,
              border: `1px solid ${hasDiscount ? C.burgundy : C.olive}40`,
              transition: "all 0.2s ease",
              "&:hover": { bgcolor: C.dangerBg, color: C.burgundy },
            }}
          >
            <Sell sx={{ fontSize: 16 }} />
          </IconButton>
        </Badge>
        <Typography
          sx={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.02em",
            color: hasDiscount ? C.burgundy : C.muted,
            fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
            whiteSpace: "nowrap",
            lineHeight: 1,
          }}
        >
          {isRtl ? "تخفیف" : "Discount"}
        </Typography>
      </Box>

      {/* مودال */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="xs"
        dir={isRtl ? "rtl" : "ltr"}
        PaperProps={{
          sx: {
            borderRadius: "28px",
            overflow: "hidden",
            bgcolor: C.bg,
            backgroundImage: `linear-gradient(160deg, ${C.burgundy}1A 0%, transparent 45%), linear-gradient(-20deg, ${C.gold}14 0%, transparent 40%)`,
            backdropFilter: "blur(28px)",
            WebkitBackdropFilter: "blur(28px)",
            border: `1px solid ${C.glassBorder}`,
            boxShadow: `0 24px 70px rgba(0,0,0,0.35), 0 0 0 1px ${C.gold}10`,
          },
        }}
      >
        <Box sx={{
          height: 5,
          background: `linear-gradient(90deg, ${C.gold}, ${C.burgundy})`,
        }} />

        <DialogContent sx={{ p: 0, position: "relative" }}>
          <IconButton
            onClick={() => setOpen(false)}
            size="small"
            sx={{
              position: "absolute",
              top: 16,
              [isRtl ? "left" : "right"]: 16,
              color: C.sub,
              bgcolor: C.oliveSubtle,
              "&:hover": { bgcolor: C.dangerBg, color: C.burgundy },
            }}
          >
            <Close sx={{ fontSize: 18 }} />
          </IconButton>

          <Box sx={{ p: 4, pt: 4.5 }}>
            {/* آیکون مرکزی */}
            <Box sx={{ display: "flex", justifyContent: "center", mb: 2.5 }}>
              <Box
                sx={{
                  width: 68, height: 68,
                  borderRadius: "20px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: `linear-gradient(145deg, ${C.gold}, ${C.burgundy})`,
                  boxShadow: `0 10px 30px ${C.burgundy}45, inset 0 1px 1px rgba(255,255,255,0.25)`,
                }}
              >
                <Sell sx={{ fontSize: 32, color: "#fff" }} />
              </Box>
            </Box>

            {/* عنوان */}
            <Typography sx={{
              fontSize: 18, fontWeight: 800, letterSpacing: "-0.01em",
              color: C.text,
              fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
              textAlign: "center", lineHeight: 1.4, mb: 0.8,
            }}>
              {displayTitle}
            </Typography>
            <Typography sx={{
              fontSize: 13, color: C.sub, mt: 0.3, mb: 2.5,
              fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
              textAlign: "center", lineHeight: 1.8,
              maxWidth: 280, mx: "auto",
            }}>
              {isAll
                ? (isRtl ? "این مبلغ از قیمت همه‌ی محصولات کم می‌شود." : "This is deducted from every product's price.")
                : (isRtl ? "این مبلغ از قیمت تک‌تک محصولات این دسته کم می‌شود." : "This amount is deducted from every product's price in this category.")}
            </Typography>

            {/* ★ نوع تخفیف: مبلغ ثابت یا درصد */}
            <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
              {[
                { id: "fixed", label: isRtl ? "مبلغ ثابت" : "Fixed amount", icon: Payments },
                { id: "percent", label: isRtl ? "درصدی" : "Percent", icon: Percent },
              ].map(({ id, label, icon: Icon }) => {
                const selected = discountType === id;
                return (
                  <Box
                    key={id}
                    onClick={() => setDiscountType(id)}
                    sx={{
                      flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                      gap: 0.6, py: 1.1, borderRadius: "12px", cursor: "pointer",
                      bgcolor: selected ? C.oliveSubtle : "transparent",
                      border: `1.5px solid ${selected ? C.olive : C.glassBorder}`,
                      color: selected ? C.olive : C.sub,
                      fontSize: 12.5, fontWeight: 700,
                      fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <Icon sx={{ fontSize: 15 }} />
                    {label}
                  </Box>
                );
              })}
            </Box>

            {/* فیلد ورودی مقدار */}
            <Box sx={{ mb: 2.5 }}>
              <Typography sx={{
                fontSize: 12, color: C.sub, mb: 1, fontWeight: 600,
                letterSpacing: "0.02em",
                fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
              }}>
                {discountType === "percent"
                  ? (isRtl ? "درصد تخفیف" : "Discount percent")
                  : (isRtl ? "مبلغ تخفیف (تومان)" : "Discount amount")}
              </Typography>
              <TextField
                autoFocus
                fullWidth
                type="text"
                inputMode="numeric"
                placeholder={
                  discountType === "percent"
                    ? (isRtl ? "مثلاً ۱۰" : "e.g. 10")
                    : (isRtl ? "لطفاً مبلغ را وارد کنید" : "Enter discount amount")
                }
                value={
                  amount === 0
                    ? ""
                    : discountType === "percent"
                      ? amount
                      : formatThousands(amount)
                }
                onChange={e => {
                  if (discountType === "percent") {
                    const n = Math.min(100, Math.max(0, Number(e.target.value.replace(/[^\d]/g, "")) || 0));
                    setAmount(n);
                  } else {
                    setAmount(parseThousands(e.target.value));
                  }
                }}
                onKeyDown={e => e.key === "Enter" && handleApply()}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                slotProps={{
                  input: {
                    endAdornment: discountType === "percent" ? (
                      <Typography sx={{ color: C.gold, fontWeight: 800, fontSize: 18 }}>%</Typography>
                    ) : (
                      <Typography sx={{ color: C.gold, fontWeight: 700, fontSize: 13 }}>
                        {isRtl ? "تومان" : "T"}
                      </Typography>
                    ),
                  },
                }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    borderRadius: "12px",
                    bgcolor: C.inputBg,
                    backdropFilter: "blur(8px)",
                    fontSize: 20,
                    fontWeight: 800,
                    color: C.gold,
                    fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                    textAlign: "center",
                    transition: "all 0.2s ease",
                    "& input": { textAlign: "center", py: 1.6 },
                    "& input::placeholder": {
                      color: C.muted, fontSize: 13, fontWeight: 500, opacity: 1,
                    },
                    "& fieldset": {
                      borderColor: focused ? C.olive : C.glassBorder,
                      borderWidth: focused ? 2 : 1.5,
                    },
                    "&:hover fieldset": { borderColor: C.gold },
                    "&.Mui-focused fieldset": {
                      borderColor: C.olive,
                      boxShadow: `0 0 0 4px ${C.olive}1A`,
                    },
                  },
                }}
              />

              {/* ★ دکمه‌های سریع پله‌ای برای مبلغ ثابت (هر بار ۱۰۰۰ تومان) */}
              {discountType === "fixed" && (
                <Box sx={{ display: "flex", gap: 0.8, mt: 1 }}>
                  {[1000, 5000, 10000].map(step => (
                    <Box
                      key={step}
                      onClick={() => setAmount(a => a + step)}
                      sx={{
                        flex: 1, textAlign: "center", py: 0.7, borderRadius: "10px",
                        bgcolor: C.oliveSubtle, color: C.olive, cursor: "pointer",
                        fontSize: 11.5, fontWeight: 700,
                        fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                        "&:hover": { bgcolor: `${C.olive}22` },
                      }}
                    >
                      +{step.toLocaleString()}
                    </Box>
                  ))}
                  <Box
                    onClick={() => setAmount(0)}
                    sx={{
                      flex: 1, textAlign: "center", py: 0.7, borderRadius: "10px",
                      bgcolor: C.dangerBg, color: C.burgundy, cursor: "pointer",
                      fontSize: 11.5, fontWeight: 700,
                      fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                      "&:hover": { bgcolor: `${C.burgundy}22` },
                    }}
                  >
                    {isRtl ? "صفر" : "0"}
                  </Box>
                </Box>
              )}
            </Box>

            {/* ★ تخفیف زمان‌دار */}
            <Box sx={{
              mb: 3, p: 1.8, borderRadius: "14px",
              bgcolor: C.oliveSubtle, border: `1px solid ${C.glassBorder}`,
            }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Typography sx={{
                  fontSize: 13, fontWeight: 700, color: C.text,
                  fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                }}>
                  {isRtl ? "تخفیف زمان‌دار باشد؟" : "Time-limited discount?"}
                </Typography>
                <Switch
                  checked={expiryEnabled}
                  onChange={e => setExpiryEnabled(e.target.checked)}
                  sx={{
                    "& .MuiSwitch-switchBase.Mui-checked": { color: C.gold },
                    "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { bgcolor: C.gold },
                  }}
                />
              </Box>

              {expiryEnabled && (
                <Box sx={{ mt: 1.5 }}>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.8, mb: 1.2 }}>
                    {EXPIRY_PRESETS.map(preset => {
                      const selected = expiryPreset === preset.id && !customExpiry;
                      return (
                        <Box
                          key={preset.id}
                          onClick={() => { setExpiryPreset(preset.id); setCustomExpiry(""); }}
                          sx={{
                            px: 1.4, py: 0.6, borderRadius: "10px", cursor: "pointer",
                            bgcolor: selected ? C.gold : "transparent",
                            border: `1.5px solid ${selected ? C.gold : C.glassBorder}`,
                            color: selected ? "#1A1817" : C.sub,
                            fontSize: 11.5, fontWeight: 700,
                            fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                            transition: "all 0.2s ease",
                          }}
                        >
                          {isRtl ? preset.labelFa : preset.labelEn}
                        </Box>
                      );
                    })}
                  </Box>

                  <Typography sx={{
                    fontSize: 11, color: C.muted, mb: 0.6,
                    fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                  }}>
                    {isRtl ? "یا یک تاریخ/ساعت دقیق انتخاب کنید:" : "Or pick an exact date/time:"}
                  </Typography>
                  <TextField
                    type="datetime-local"
                    fullWidth
                    size="small"
                    value={customExpiry}
                    onChange={e => { setCustomExpiry(e.target.value); setExpiryPreset(null); }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: "10px",
                        bgcolor: C.inputBg,
                        fontSize: 12.5,
                        color: C.text,
                        fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                        "& fieldset": { borderColor: C.glassBorder },
                        "&.Mui-focused fieldset": { borderColor: C.olive },
                      },
                    }}
                  />
                </Box>
              )}
            </Box>

            {/* دکمه‌ها */}
            <Box sx={{ display: "flex", gap: 1.2 }}>
              <Box
                onClick={handleApply}
                sx={{
                  flex: 2, textAlign: "center", py: 1.6, borderRadius: "14px",
                  background: `linear-gradient(135deg, ${C.gold}, ${C.burgundy})`,
                  color: "#fff", cursor: "pointer",
                  fontSize: 14.5, fontWeight: 800,
                  fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                  boxShadow: `0 8px 20px ${C.burgundy}35`,
                  transition: "all 0.2s ease",
                  "&:hover": { transform: "translateY(-2px)", boxShadow: `0 10px 26px ${C.burgundy}50` },
                  "&:active": { transform: "scale(0.985)" },
                }}
              >
                {isRtl ? "اعمال تخفیف" : "Apply discount"}
              </Box>
              <Box
                onClick={handleRemove}
                sx={{
                  flex: 1, textAlign: "center", py: 1.6, borderRadius: "14px",
                  bgcolor: C.dangerBg,
                  border: `1.5px solid ${C.burgundy}55`,
                  color: C.burgundy,
                  cursor: "pointer",
                  fontSize: 14.5, fontWeight: 800,
                  fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                  transition: "all 0.2s ease",
                  "&:hover": { bgcolor: `${C.burgundy}22`, transform: "translateY(-2px)" },
                  "&:active": { transform: "scale(0.985)" },
                }}
              >
                {isRtl ? "حذف" : "Remove"}
              </Box>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>
    </>
  );
}