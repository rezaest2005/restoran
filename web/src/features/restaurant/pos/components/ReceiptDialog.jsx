import { useRef } from "react";
import { Dialog, Box, Typography, Button, Divider } from "@mui/material";
import { CheckCircle, Print, ReceiptLong, Close, Storefront, CalendarToday, Person, LocalPhone } from "@mui/icons-material";

export default function ReceiptDialog({
  open, onClose, lastOrder, C, isRtl,
}) {
  const iframeRef = useRef(null);

  if (!lastOrder) return null;

  const handlePrint = () => {
    const itemsHtml = (lastOrder.items || []).map(item =>
      `<tr>
        <td style="padding:6px 0;font-size:13px;font-weight:600;">${item.quantity}× ${item.name}</td>
        <td style="padding:6px 0;font-size:13px;text-align:left;direction:ltr;font-weight:700;">${(item.line_total || item.price * item.quantity).toLocaleString()}</td>
      </tr>`
    ).join("");

    const html = `
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <meta charset="utf-8"/>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700;800;900&display=swap');
          * { margin:0; padding:0; box-sizing:border-box; }
          body { font-family:'Vazirmatn',Tahoma,sans-serif; width:300px; margin:20px auto; }
          .receipt { border:2px solid #333; border-radius:12px; padding:20px; }
          .header { text-align:center; margin-bottom:14px; }
          .header h2 { font-size:18px; font-weight:900; margin-bottom:4px; }
          .header .sub { font-size:11px; color:#666; }
          .dashed { border-top:2px dashed #aaa; margin:12px 0; }
          .dotted { border-top:1px dotted #ccc; margin:8px 0; }
          .info-row { display:flex; justify-content:space-between; font-size:12px; color:#555; margin:3px 0; }
          .info-row b { color:#111; }
          table { width:100%; border-collapse:collapse; margin:8px 0; }
          .total-box { background:#f5f5f5; border:2px solid #333; border-radius:10px; padding:12px; display:flex; justify-content:space-between; align-items:center; margin-top:12px; }
          .total-label { font-size:14px; font-weight:800; }
          .total-amount { font-size:20px; font-weight:900; }
          .footer { text-align:center; margin-top:14px; font-size:11px; color:#888; }
          .dots { letter-spacing:3px; }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="header">
            <h2>رسید پرداخت</h2>
            <div class="sub">سفارش #${lastOrder.order_id}</div>
            <div class="sub">${lastOrder.created_at}</div>
          </div>
          <div class="dashed"></div>
          <div class="info-row"><span>مشتری</span><b>${lastOrder.customer_name || "مشتری"}</b></div>
          ${lastOrder.phone ? `<div class="info-row"><span>تلفن</span><b>${lastOrder.phone}</b></div>` : ""}
          <div class="dashed"></div>
          <table>${itemsHtml}</table>
          <div class="dashed"></div>
          <div class="total-box">
            <span class="total-label">جمع کل:</span>
            <span class="total-amount">${lastOrder.total_price?.toLocaleString()} تومان</span>
          </div>
          <div class="footer">
            <div class="dots">• • • • • • •</div>
            <div style="margin-top:6px;">از خرید شما متشکریم</div>
          </div>
        </div>
      </body>
      </html>
    `;

    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    }, 400);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: "transparent",
          boxShadow: "none",
          overflow: "visible",
        },
      }}
    >
      <iframe
        ref={iframeRef}
        title="receipt"
        style={{ position: "absolute", width: 0, height: 0, border: "none" }}
      />

      {/* ★ کارت اصلی */}
      <Box sx={{
        bgcolor: C.glass,
        backdropFilter: "blur(40px)",
        WebkitBackdropFilter: "blur(40px)",
        border: `1px solid ${C.glassBorder}`,
        borderRadius: "24px",
        boxShadow: C.cardShadow,
        overflow: "hidden",
      }}>

        {/* ★ هدر موفقیت */}
        <Box sx={{
          textAlign: "center",
          py: 3.5,
          px: 3,
          background: `linear-gradient(135deg, ${C.olive}15 0%, ${C.olive}05 100%)`,
          borderBottom: `1px solid ${C.glassBorder}`,
          position: "relative",
        }}>
          {/* دکمه بستن */}
          <Box onClick={onClose} sx={{
            position: "absolute", top: 12, left: isRtl ? "auto" : 12, right: isRtl ? 12 : "auto",
            width: 30, height: 30, borderRadius: "10px",
            bgcolor: `${C.muted}12`, display: "flex",
            alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "all 0.2s",
            "&:hover": { bgcolor: `${C.danger}15`, color: C.danger },
          }}>
            <Close sx={{ fontSize: 16, color: C.muted }} />
          </Box>

          <Box sx={{
            width: 64, height: 64, borderRadius: "50%",
            bgcolor: `${C.olive}15`, border: `3px solid ${C.olive}30`,
            display: "flex", alignItems: "center", justifyContent: "center",
            mx: "auto", mb: 1.5,
          }}>
            <CheckCircle sx={{ fontSize: 34, color: C.olive }} />
          </Box>
          <Typography sx={{
            fontWeight: 900, fontSize: 20, color: C.text,
            fontFamily: "'Vazirmatn', sans-serif", mb: 0.5,
          }}>
            {isRtl ? "پرداخت موفق" : "Payment Successful"}
          </Typography>
          <Typography sx={{
            fontSize: 12, color: C.muted,
            fontFamily: "'Vazirmatn', sans-serif",
          }}>
            {isRtl ? "سفارش شما با موفقیت ثبت شد" : "Your order has been placed"}
          </Typography>
        </Box>

        {/* ★ بدنه رسید */}
        <Box sx={{ p: 2.5 }}>

          {/* ★ کارت رسید با border */}
          <Box sx={{
            border: `2px solid ${C.olive}25`,
            borderRadius: "16px",
            overflow: "hidden",
            bgcolor: `${C.olive}04`,
          }}>

            {/* هدر رسید */}
            <Box sx={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              px: 2, py: 1.5,
              borderBottom: `2px dashed ${C.olive}20`,
              bgcolor: `${C.olive}08`,
            }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <ReceiptLong sx={{ fontSize: 18, color: C.olive }} />
                <Typography sx={{
                  fontSize: 13, fontWeight: 800, color: C.text,
                  fontFamily: "'Vazirmatn', sans-serif",
                }}>
                  {isRtl ? "رسید پرداخت" : "Receipt"}
                </Typography>
              </Box>
              <Box sx={{
                px: 1.2, py: 0.3, borderRadius: "8px",
                bgcolor: `${C.olive}18`, border: `1px solid ${C.olive}25`,
              }}>
                <Typography sx={{
                  fontSize: 12, fontWeight: 800, color: C.olive,
                  fontFamily: "'Vazirmatn', sans-serif",
                }}>
                  #{lastOrder.order_id}
                </Typography>
              </Box>
            </Box>

            {/* اطلاعات سفارش */}
            <Box sx={{ px: 2, py: 1.5, borderBottom: `2px dashed ${C.olive}20` }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.8, mb: 0.8 }}>
                <CalendarToday sx={{ fontSize: 14, color: C.muted }} />
                <Typography sx={{
                  fontSize: 12, color: C.sub,
                  fontFamily: "'Vazirmatn', sans-serif",
                }}>
                  {lastOrder.created_at}
                </Typography>
              </Box>
              {lastOrder.customer_name && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.8, mb: 0.8 }}>
                  <Person sx={{ fontSize: 14, color: C.muted }} />
                  <Typography sx={{
                    fontSize: 12, color: C.sub,
                    fontFamily: "'Vazirmatn', sans-serif",
                  }}>
                    {lastOrder.customer_name}
                  </Typography>
                </Box>
              )}
              {lastOrder.phone && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.8 }}>
                  <LocalPhone sx={{ fontSize: 14, color: C.muted }} />
                  <Typography sx={{
                    fontSize: 12, color: C.sub,
                    fontFamily: "'Vazirmatn', sans-serif",
                    direction: "ltr",
                  }}>
                    {lastOrder.phone}
                  </Typography>
                </Box>
              )}
            </Box>

            {/* آیتم‌ها */}
            <Box sx={{ px: 2, py: 1 }}>
              {(lastOrder.items || []).map((item, idx) => (
                <Box key={idx} sx={{
                  display: "flex", justifyContent: "space-between",
                  alignItems: "center",
                  py: 0.8,
                  borderBottom: idx < (lastOrder.items || []).length - 1
                    ? `1px solid ${C.olive}10` : "none",
                }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Box sx={{
                      width: 22, height: 22, borderRadius: "6px",
                      bgcolor: `${C.olive}12`, display: "flex",
                      alignItems: "center", justifyContent: "center",
                    }}>
                      <Typography sx={{
                        fontSize: 10, fontWeight: 800, color: C.olive,
                        fontFamily: "'Vazirmatn', sans-serif",
                      }}>
                        {item.quantity}
                      </Typography>
                    </Box>
                    <Typography sx={{
                      fontSize: 13, fontWeight: 600, color: C.text,
                      fontFamily: "'Vazirmatn', sans-serif",
                    }}>
                      {item.name}
                    </Typography>
                  </Box>
                  <Typography sx={{
                    fontSize: 13, fontWeight: 800, color: C.text,
                    fontFamily: "'Vazirmatn', sans-serif",
                  }}>
                    {(item.line_total || item.price * item.quantity).toLocaleString()}
                  </Typography>
                </Box>
              ))}
            </Box>

            {/* جمع کل */}
            <Box sx={{
              mx: 2, mb: 2,
              p: 1.8, borderRadius: "12px",
              bgcolor: `${C.olive}10`,
              border: `2px solid ${C.olive}25`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
              <Typography sx={{
                fontSize: 14, fontWeight: 800, color: C.text,
                fontFamily: "'Vazirmatn', sans-serif",
              }}>
                {isRtl ? "جمع کل:" : "Total:"}
              </Typography>
              <Box sx={{ textAlign: isRtl ? "left" : "right" }}>
                <Typography sx={{
                  fontSize: 22, fontWeight: 900, color: C.olive,
                  fontFamily: "'Vazirmatn', sans-serif", lineHeight: 1,
                }}>
                  {lastOrder.total_price?.toLocaleString()}
                </Typography>
                <Typography sx={{
                  fontSize: 10, fontWeight: 600, color: C.muted,
                  fontFamily: "'Vazirmatn', sans-serif",
                }}>
                  {isRtl ? "تومان" : "Toman"}
                </Typography>
              </Box>
            </Box>
          </Box>

          {/* پیام تشکر */}
          <Typography sx={{
            textAlign: "center", fontSize: 12, color: C.muted, mt: 1.5,
            fontFamily: "'Vazirmatn', sans-serif",
          }}>
            ✦ {isRtl ? "از خرید شما متشکریم" : "Thank you for your purchase"} ✦
          </Typography>

          {/* دکمه‌ها */}
          <Box sx={{ display: "flex", gap: 1.2, mt: 2.5 }}>
            <Button
              onClick={handlePrint}
              sx={{
                flex: 1,
                bgcolor: `${C.olive}08`,
                color: C.olive,
                borderRadius: "12px",
                py: 1.3,
                fontSize: 13,
                fontWeight: 700,
                border: `1.5px solid ${C.olive}30`,
                fontFamily: "'Vazirmatn', sans-serif",
                transition: "all 0.2s ease",
                "&:hover": {
                  bgcolor: `${C.olive}15`,
                  borderColor: C.olive,
                  transform: "translateY(-2px)",
                },
                "&:active": { transform: "scale(0.97)" },
              }}
            >
              <Print sx={{ fontSize: 18, mr: 0.8 }} />
              {isRtl ? "چاپ رسید" : "Print Receipt"}
            </Button>
            <Button
              onClick={onClose}
              sx={{
                flex: 1,
                bgcolor: C.olive,
                color: "#fff",
                borderRadius: "12px",
                py: 1.3,
                fontSize: 13,
                fontWeight: 800,
                fontFamily: "'Vazirmatn', sans-serif",
                transition: "all 0.2s ease",
                boxShadow: `0 4px 20px ${C.olive}40`,
                "&:hover": {
                  bgcolor: C.olive,
                  opacity: 0.9,
                  transform: "translateY(-2px)",
                  boxShadow: `0 6px 28px ${C.olive}50`,
                },
                "&:active": { transform: "scale(0.97)" },
              }}
            >
              {isRtl ? "تأیید" : "Confirm"}
            </Button>
          </Box>
        </Box>
      </Box>
    </Dialog>
  );
}