import { Dialog, Box, Typography, Button, Divider } from "@mui/material";
import { CheckCircle, Print } from "@mui/icons-material";

export default function ReceiptDialog({
  open, onClose, lastOrder, C, isRtl,
}) {
  if (!lastOrder) return null;

  const handlePrint = () => {
    const printWindow = window.open("", "_blank", "width=300,height=600");
    if (!printWindow) return;

    const itemsHtml = (lastOrder.items || []).map(item =>
      `<tr>
        <td style="padding:4px 0;font-size:12px;">${item.quantity}× ${item.name}</td>
        <td style="padding:4px 0;font-size:12px;text-align:left;direction:ltr;">${(item.line_total || item.price * item.quantity).toLocaleString()}</td>
      </tr>`
    ).join("");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <meta charset="utf-8"/>
        <style>
          body { font-family: 'Vazirmatn', Tahoma, sans-serif; width: 260px; margin: 10px auto; }
          h3 { text-align: center; margin: 0 0 8px; font-size: 15px; }
          table { width: 100%; border-collapse: collapse; }
          .divider { border-top: 1px dashed #999; margin: 8px 0; }
          .total { font-weight: 800; font-size: 16px; text-align: center; margin: 10px 0; }
          .info { font-size: 11px; color: #666; text-align: center; }
        </style>
      </head>
      <body>
        <h3>رسید پرداخت</h3>
        <div class="info">سفارش #${lastOrder.order_id}</div>
        <div class="info">${lastOrder.created_at}</div>
        <div class="divider"></div>
        <table>${itemsHtml}</table>
        <div class="divider"></div>
        <div class="total">${lastOrder.total_price?.toLocaleString()} تومان</div>
        <div class="divider"></div>
        <div class="info">${lastOrder.customer_name || "مشتری"}</div>
        <div class="info">از خرید شما متشکریم</div>
        <script>window.print();window.close();</script>
      </body>
      </html>
    `);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: C.glass,
          backdropFilter: "blur(28px)",
          border: `1px solid ${C.glassBorder}`,
          borderRadius: "20px",
          boxShadow: C.cardShadow,
        },
      }}
    >
      <Box sx={{ p: 3 }}>
        {/* موفقیت */}
        <Box sx={{ textAlign: "center", mb: 3 }}>
          <CheckCircle sx={{ fontSize: 60, color: C.olive, mb: 1 }} />
          <Typography variant="h5" sx={{
            fontWeight: 800, color: C.text,
            fontFamily: "'Vazirmatn', sans-serif",
          }}>
            {isRtl ? "پرداخت موفق" : "Payment Successful"}
          </Typography>
        </Box>

        {/* اطلاعات سفارش */}
        <Box sx={{
          display: "flex", justifyContent: "space-between",
          mb: 2, fontSize: 13, color: C.sub,
          fontFamily: "'Vazirmatn', sans-serif",
        }}>
          <span>
            {isRtl ? "شماره سفارش:" : "Order #"}
            <b style={{ color: C.text }}>#{lastOrder.order_id}</b>
          </span>
          <span>{lastOrder.created_at}</span>
        </Box>

        <Divider sx={{ borderColor: C.glassBorder, mb: 2 }} />

        {/* آیتم‌ها */}
        {(lastOrder.items || []).map((item, idx) => (
          <Box key={idx} sx={{
            display: "flex", justifyContent: "space-between",
            py: 0.5, fontSize: 13,
          }}>
            <Typography sx={{
              color: C.text,
              fontFamily: "'Vazirmatn', sans-serif",
            }}>
              {item.quantity}× {item.name}
            </Typography>
            <Typography sx={{
              color: C.sub,
              fontFamily: "'Vazirmatn', sans-serif",
            }}>
              {(item.line_total || item.price * item.quantity).toLocaleString()}
            </Typography>
          </Box>
        ))}

        <Divider sx={{ borderColor: C.glassBorder, my: 2 }} />

        {/* جمع کل */}
        <Box sx={{
          display: "flex", justifyContent: "space-between",
          fontWeight: 800,
        }}>
          <Typography sx={{
            fontFamily: "'Vazirmatn', sans-serif", fontWeight: 800,
          }}>
            {isRtl ? "جمع کل:" : "Total:"}
          </Typography>
          <Typography sx={{
            color: C.olive, fontWeight: 800,
            fontFamily: "'Vazirmatn', sans-serif",
          }}>
            {lastOrder.total_price?.toLocaleString()} {isRtl ? "تومان" : "T"}
          </Typography>
        </Box>

        {/* دکمه‌ها */}
        <Box sx={{ display: "flex", gap: 1, mt: 3 }}>
          <Button
            onClick={handlePrint}
            sx={{
              flex: 1,
              bgcolor: C.inputBg,
              color: C.text,
              borderRadius: "12px",
              py: 1.2,
              fontSize: 13,
              fontWeight: 600,
              border: `1px solid ${C.glassBorder}`,
              fontFamily: "'Vazirmatn', sans-serif",
              "&:hover": { borderColor: C.olive },
            }}
          >
            <Print sx={{ fontSize: 18, mr: 0.5 }} />
            {isRtl ? "چاپ رسید" : "Print"}
          </Button>
          <Button
            onClick={onClose}
            sx={{
              flex: 1,
              bgcolor: C.btnGrad,
              color: "#fff",
              borderRadius: "12px",
              py: 1.2,
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "'Vazirmatn', sans-serif",
              "&:hover": { transform: "translateY(-2px)" },
            }}
          >
            {isRtl ? "تأیید" : "Confirm"}
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
}