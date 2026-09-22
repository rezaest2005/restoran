import { useRef, useState } from "react";
import {
  Dialog,
  Box,
  Typography,
  Button,
  CircularProgress,
} from "@mui/material";
import {
  CheckCircle,
  Print,
  ReceiptLong,
  CalendarToday,
  Person,
  LocalPhone,
  Payments,
  CreditCard,
  Language,
} from "@mui/icons-material";

export default function CheckoutDialog({
  open,
  onClose,
  C,
  isRtl,
  lastOrder,
  cart,
  cartTotal,
  onSubmit,
  submitting,
  error: externalError,
}) {
  const iframeRef = useRef(null);
  const isPaid = !!lastOrder;

  const [localSubmitting, setLocalSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);

  const error = externalError || localError;
  const busy = submitting || localSubmitting;

  const paymentMethods = [
    { key: "cash", icon: Payments, labelFa: "پرداخت نقدی", labelEn: "Cash" },
    { key: "card", icon: CreditCard, labelFa: "کارتخوان", labelEn: "Card" },
    {
      key: "online",
      icon: Language,
      labelFa: "درگاه آنلاین",
      labelEn: "Online",
    },
  ];

  const handlePayment = async (method) => {
    setLocalError(null);
    setLocalSubmitting(true);
    try {
      if (onSubmit) await onSubmit(method);
    } catch (err) {
      setLocalError(err.message || "خطا در پرداخت");
    } finally {
      setLocalSubmitting(false);
    }
  };

  const renderItems = (items, accentColor) => (
    <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 55px 65px",
          gap: 0.5,
          px: 1.2,
          py: 0.8,
          mb: 0.5,
          borderRadius: "10px",
          bgcolor: `${accentColor}12`,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box sx={{ width: 6, height: 6, flexShrink: 0, opacity: 0 }} />
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: 900,
              color: accentColor,
              fontFamily: "'Vazirmatn', sans-serif",
              textAlign: "right",
            }}
          >
            {isRtl ? "نام کالا" : "Item"}
          </Typography>
        </Box>
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 900,
            color: accentColor,
            fontFamily: "'Vazirmatn', sans-serif",
            textAlign: "center",
          }}
        >
          {isRtl ? "تعداد" : "Qty"}
        </Typography>
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 900,
            color: accentColor,
            fontFamily: "'Vazirmatn', sans-serif",
            textAlign: "left",
          }}
        >
          {isRtl ? "قیمت" : "Price"}
        </Typography>
      </Box>

      {items.map((item, idx) => {
        const qty = Number(item.quantity ?? item.qty ?? 0);
        const unitPrice = Number(item.price ?? item.unit_price ?? 0);
        const lineTotal = Number(item.line_total) || unitPrice * qty || 0;
        const isLast = idx === items.length - 1;
        return (
          <Box
            key={idx}
            sx={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 55px 65px", // ★ ستون اسم بزرگ‌تر
              gap: 0.5,
              alignItems: "center",
              px: 1.2,
              py: 1,
              borderBottom: isLast ? "none" : `1px dashed ${accentColor}18`,
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                minWidth: 0,
              }}
            >
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  bgcolor: accentColor,
                  flexShrink: 0,
                  opacity: 0.6,
                }}
              />
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: C.text,
                  fontFamily: "'Vazirmatn', sans-serif",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  minWidth: 0,
                }}
              >
                {item.name || "—"}
              </Typography>
            </Box>

            <Box sx={{ display: "flex", justifyContent: "center" }}>
              <Box
                sx={{
                  minWidth: 30,
                  height: 26,
                  borderRadius: "8px",
                  bgcolor: `${accentColor}18`,
                  border: `1.5px solid ${accentColor}30`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  px: 1,
                }}
              >
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 900,
                    color: accentColor,
                    fontFamily: "'Vazirmatn', sans-serif",
                    lineHeight: 1,
                  }}
                >
                  {qty}
                </Typography>
              </Box>
            </Box>

            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 800,
                color: C.text,
                fontFamily: "'Vazirmatn', sans-serif",
                textAlign: "left",
                direction: "ltr",
              }}
            >
              {lineTotal.toLocaleString()}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );

  const handlePrint = () => {
    if (!lastOrder) return;
    const itemsHtml = (lastOrder.items || [])
      .map(
        (item) =>
          `<tr>
        <td style="padding:8px 6px;font-size:13px;font-weight:700;text-align:right;">${item.name}</td>
        <td style="padding:8px 6px;font-size:13px;font-weight:700;text-align:center;">${item.quantity}</td>
        <td style="padding:8px 6px;font-size:13px;font-weight:800;text-align:left;direction:ltr;">${(item.line_total || item.price * item.quantity).toLocaleString()}</td>
      </tr>`,
      )
      .join("");

    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"/>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700;800;900&display=swap');
        *{margin:0;padding:0;box-sizing:border-box;}
        body{font-family:'Vazirmatn',Tahoma,sans-serif;width:300px;margin:20px auto;}
        .r{border:2px solid #333;border-radius:12px;padding:20px;}
        .h{text-align:center;margin-bottom:14px;}
        .h h2{font-size:18px;font-weight:900;margin-bottom:4px;}
        .h .s{font-size:11px;color:#666;}
        .d{border-top:2px dashed #aaa;margin:12px 0;}
        .ir{display:flex;justify-content:space-between;font-size:12px;color:#555;margin:3px 0;}
        .ir b{color:#111;}
        table{width:100%;border-collapse:collapse;margin:8px 0;}
        thead th{font-size:11px;font-weight:800;color:#444;padding:6px;border-bottom:2px solid #333;text-align:center;}
        thead th:first-child{text-align:right;}
        thead th:last-child{text-align:left;}
        tbody td{padding:6px;font-size:12px;border-bottom:1px dashed #ddd;}
        .tb{background:#f5f5f5;border:2px solid #333;border-radius:10px;padding:12px;display:flex;justify-content:space-between;align-items:center;margin-top:12px;}
        .tl{font-size:14px;font-weight:800;}
        .ta{font-size:20px;font-weight:900;}
        .f{text-align:center;margin-top:14px;font-size:11px;color:#888;}
      </style>
    </head><body>
      <div class="r">
        <div class="h">
          <h2>رسید پرداخت</h2>
          <div class="s">سفارش #${lastOrder.order_id}</div>
          <div class="s">${lastOrder.created_at}</div>
        </div>
        <div class="d"></div>
        <div class="ir"><span>مشتری</span><b>${lastOrder.customer_name || "مشتری"}</b></div>
        ${lastOrder.phone ? `<div class="ir"><span>تلفن</span><b>${lastOrder.phone}</b></div>` : ""}
        <div class="d"></div>
        <table>
          <thead><tr><th>نام کالا</th><th>تعداد</th><th>فی</th></tr></thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <div class="d"></div>
        <div class="tb">
          <span class="tl">جمع کل:</span>
          <span class="ta">${lastOrder.total_price?.toLocaleString()} تومان</span>
        </div>
        <div class="f">
          <div>• • • •</div>
          <div style="margin-top:6px;">از خرید شما متشکریم</div>
        </div>
      </div>
    </body></html>`;

    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => onClose(), 500);
    }, 400);
  };

  return (
    <Dialog
      open={open}
      onClose={isPaid ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            bgcolor: "transparent",
            boxShadow: "none",
            overflow: "visible",
          },
        },
      }}
    >
      <iframe
        ref={iframeRef}
        title="receipt"
        style={{ position: "absolute", width: 0, height: 0, border: "none" }}
      />

      <Box
        sx={{
          bgcolor: C.glass,
          backdropFilter: "blur(40px)",
          border: `1px solid ${C.glassBorder}`,
          borderRadius: "24px",
          boxShadow: C.cardShadow,
          overflow: "hidden",
        }}
      >
        {/* ── هدر ── */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            px: 2.5,
            py: 1.8,
            borderBottom: `1px solid ${C.glassBorder}`,
            bgcolor: isPaid ? `${C.olive}0A` : `${C.gold}0A`,
          }}
        >
          <Typography
            sx={{
              fontWeight: 900,
              fontSize: 16,
              color: C.text,
              fontFamily: "'Vazirmatn', sans-serif",
              display: "flex",
              alignItems: "center",
              gap: 0.8,
            }}
          >
            {isPaid ? (
              <>
                <CheckCircle sx={{ fontSize: 20, color: C.olive }} />
                {isRtl ? "پرداخت موفق" : "Payment Successful"}
              </>
            ) : (
              <>
                <Payments sx={{ fontSize: 20, color: C.gold }} />
                {isRtl ? "منتظر پرداخت" : "Awaiting Payment"}
              </>
            )}
          </Typography>

          {!isPaid && (
            <Box
              onClick={onClose}
              sx={{
                width: 28,
                height: 28,
                borderRadius: "8px",
                cursor: "pointer",
                bgcolor: `${C.muted}12`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                "&:hover": { bgcolor: `${C.danger}15` },
              }}
            >
              <Typography sx={{ fontSize: 14, color: C.muted, lineHeight: 1 }}>
                ✕
              </Typography>
            </Box>
          )}
        </Box>

        <Box sx={{ px: 2.5, pt: 2.5, pb: 2.5 }}>
          {/* ══════════ حالت ۱: منتظر پرداخت ══════════ */}
          {!isPaid && (
            <>
              <Box
                sx={{
                  border: `2px solid ${C.gold}25`,
                  borderRadius: "16px",
                  overflow: "hidden",
                  bgcolor: `${C.gold}04`,
                  mb: 2.5,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    px: 2,
                    py: 1.5,
                    borderBottom: `2px dashed ${C.gold}20`,
                    bgcolor: `${C.gold}08`,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: C.text,
                      fontFamily: "'Vazirmatn', sans-serif",
                    }}
                  >
                    {isRtl ? "خلاصه سفارش" : "Order Summary"}
                  </Typography>
                  <Box
                    sx={{
                      px: 1.2,
                      py: 0.3,
                      borderRadius: "8px",
                      bgcolor: `${C.gold}18`,
                      border: `1px solid ${C.gold}25`,
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: C.gold,
                        fontFamily: "'Vazirmatn', sans-serif",
                      }}
                    >
                      {(cart || []).length} {isRtl ? "آیتم" : "items"}
                    </Typography>
                  </Box>
                </Box>

                {renderItems(cart || [], C.gold)}

                <Box
                  sx={{
                    mx: 1.5,
                    mb: 1.5,
                    p: 1.5,
                    borderRadius: "12px",
                    bgcolor: `${C.gold}10`,
                    border: `2px solid ${C.gold}25`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: C.text,
                      fontFamily: "'Vazirmatn', sans-serif",
                    }}
                  >
                    {isRtl ? "جمع کل:" : "Total:"}
                  </Typography>
                  <Box sx={{ textAlign: isRtl ? "left" : "right" }}>
                    <Typography
                      sx={{
                        fontSize: 20,
                        fontWeight: 900,
                        color: C.gold,
                        fontFamily: "'Vazirmatn', sans-serif",
                        lineHeight: 1,
                      }}
                    >
                      {(cartTotal || 0).toLocaleString()}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: C.muted,
                        fontFamily: "'Vazirmatn', sans-serif",
                      }}
                    >
                      {isRtl ? "تومان" : "Toman"}
                    </Typography>
                  </Box>
                </Box>
              </Box>

              {error && (
                <Box
                  sx={{
                    mb: 2,
                    p: 1.5,
                    borderRadius: "12px",
                    bgcolor: C.dangerBg,
                    border: `1px solid ${C.danger}30`,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: C.danger,
                      fontFamily: "'Vazirmatn', sans-serif",
                      textAlign: "center",
                    }}
                  >
                    {error}
                  </Typography>
                </Box>
              )}

              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: C.text,
                  mb: 1.5,
                  fontFamily: "'Vazirmatn', sans-serif",
                }}
              >
                {isRtl ? "روش پرداخت:" : "Payment Method:"}
              </Typography>

              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {paymentMethods.map(({ key, icon: Icon, labelFa, labelEn }) => (
                  <Button
                    key={key}
                    onClick={() => handlePayment(key)}
                    disabled={busy}
                    sx={{
                      bgcolor: `${C.olive}08`,
                      color: C.text,
                      borderRadius: "12px",
                      py: 1.5,
                      px: 2,
                      fontSize: 14,
                      fontWeight: 700,
                      border: `1.5px solid ${C.olive}30`,
                      fontFamily: "'Vazirmatn', sans-serif",
                      display: "flex",
                      alignItems: "center",
                      gap: 1.2,
                      justifyContent: isRtl ? "flex-start" : "flex-end",
                      "&:hover": {
                        bgcolor: `${C.olive}15`,
                        borderColor: C.olive,
                      },
                      "&:disabled": { opacity: 0.5 },
                    }}
                  >
                    {busy ? (
                      <CircularProgress size={18} sx={{ color: C.olive }} />
                    ) : (
                      <Icon sx={{ fontSize: 20, color: C.olive }} />
                    )}
                    {isRtl ? labelFa : labelEn}
                  </Button>
                ))}
              </Box>
            </>
          )}

          {/* ══════════ حالت ۲: پرداخت موفق ══════════ */}
          {isPaid && (
            <>
              <Box
                sx={{
                  border: `2px solid ${C.olive}25`,
                  borderRadius: "16px",
                  overflow: "hidden",
                  bgcolor: `${C.olive}04`,
                  mb: 2,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    px: 2,
                    py: 1.5,
                    borderBottom: `2px dashed ${C.olive}20`,
                    bgcolor: `${C.olive}08`,
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <ReceiptLong sx={{ fontSize: 18, color: C.olive }} />
                    <Typography
                      sx={{
                        fontSize: 13,
                        fontWeight: 800,
                        color: C.text,
                        fontFamily: "'Vazirmatn', sans-serif",
                      }}
                    >
                      {isRtl ? "رسید پرداخت" : "Receipt"}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      px: 1.2,
                      py: 0.3,
                      borderRadius: "8px",
                      bgcolor: `${C.olive}18`,
                      border: `1px solid ${C.olive}25`,
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: C.olive,
                        fontFamily: "'Vazirmatn', sans-serif",
                      }}
                    >
                      #{lastOrder.order_id}
                    </Typography>
                  </Box>
                </Box>

                <Box
                  sx={{
                    px: 2,
                    py: 1.5,
                    borderBottom: `2px dashed ${C.olive}20`,
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.8,
                      mb: 0.8,
                    }}
                  >
                    <CalendarToday sx={{ fontSize: 14, color: C.muted }} />
                    <Typography
                      sx={{
                        fontSize: 12,
                        color: C.sub,
                        fontFamily: "'Vazirmatn', sans-serif",
                      }}
                    >
                      {lastOrder.created_at}
                    </Typography>
                  </Box>
                  {lastOrder.customer_name && (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.8,
                        mb: 0.8,
                      }}
                    >
                      <Person sx={{ fontSize: 14, color: C.muted }} />
                      <Typography
                        sx={{
                          fontSize: 12,
                          color: C.sub,
                          fontFamily: "'Vazirmatn', sans-serif",
                        }}
                      >
                        {lastOrder.customer_name}
                      </Typography>
                    </Box>
                  )}
                  {lastOrder.phone && (
                    <Box
                      sx={{ display: "flex", alignItems: "center", gap: 0.8 }}
                    >
                      <LocalPhone sx={{ fontSize: 14, color: C.muted }} />
                      <Typography
                        sx={{
                          fontSize: 12,
                          color: C.sub,
                          fontFamily: "'Vazirmatn', sans-serif",
                          direction: "ltr",
                        }}
                      >
                        {lastOrder.phone}
                      </Typography>
                    </Box>
                  )}
                </Box>

                {renderItems(lastOrder.items || [], C.olive)}

                <Box
                  sx={{
                    mx: 1.5,
                    mb: 1.5,
                    p: 1.5,
                    borderRadius: "12px",
                    bgcolor: `${C.olive}10`,
                    border: `2px solid ${C.olive}25`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: C.text,
                      fontFamily: "'Vazirmatn', sans-serif",
                    }}
                  >
                    {isRtl ? "جمع کل:" : "Total:"}
                  </Typography>
                  <Box sx={{ textAlign: isRtl ? "left" : "right" }}>
                    <Typography
                      sx={{
                        fontSize: 22,
                        fontWeight: 900,
                        color: C.olive,
                        fontFamily: "'Vazirmatn', sans-serif",
                        lineHeight: 1,
                      }}
                    >
                      {lastOrder.total_price?.toLocaleString()}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: C.muted,
                        fontFamily: "'Vazirmatn', sans-serif",
                      }}
                    >
                      {isRtl ? "تومان" : "Toman"}
                    </Typography>
                  </Box>
                </Box>
              </Box>

              <Typography
                sx={{
                  textAlign: "center",
                  fontSize: 12,
                  color: C.muted,
                  mb: 2,
                  fontFamily: "'Vazirmatn', sans-serif",
                }}
              >
                ✦ {isRtl ? "از خرید شما متشکریم" : "Thank you"} ✦
              </Typography>

              <Button
                onClick={handlePrint}
                fullWidth
                sx={{
                  bgcolor: C.olive,
                  color: "#fff",
                  borderRadius: "12px",
                  py: 1.5,
                  fontSize: 14,
                  fontWeight: 800,
                  fontFamily: "'Vazirmatn', sans-serif",
                  boxShadow: `0 4px 20px ${C.olive}40`,
                  "&:hover": { bgcolor: C.olive, opacity: 0.9 },
                }}
              >
                <Print sx={{ fontSize: 20, mr: 1 }} />
                {isRtl ? "چاپ رسید" : "Print Receipt"}
              </Button>
            </>
          )}
        </Box>
      </Box>
    </Dialog>
  );
}
