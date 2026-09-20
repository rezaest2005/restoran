import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Button, IconButton,
} from "@mui/material";
import { Print, Edit, Delete, Close } from "@mui/icons-material";

export default function OrderDetailDialog({
  open, onClose, order, C, isRtl,
}) {
  if (!order) return null;

  const formatNum = (n) => String(n || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  const handlePrint = () => { window.print(); };
  const handleEdit = () => { /* TODO */ };
  const handleDelete = () => { /* TODO */ };

  const infoItem = (label, value) => (
    <Box>
      <Typography sx={{ fontSize: 11, color: C.muted, fontWeight: 600, fontFamily: "'Vazirmatn', sans-serif" }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 700, fontSize: 14, fontFamily: "'Vazirmatn', sans-serif", color: C.text }}>
        {value}
      </Typography>
    </Box>
  );

  return (
    <Dialog
      open={open} onClose={onClose} maxWidth="sm" fullWidth
      PaperProps={{
        sx: {
          borderRadius: "20px", bgcolor: C.glass,
          backdropFilter: "blur(28px)", border: `1px solid ${C.glassBorder}`,
        },
      }}
    >
      <DialogTitle sx={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        fontFamily: "'Vazirmatn', sans-serif", fontWeight: 800, fontSize: 17,
        color: C.text, pb: 1,
      }}>
        {isRtl ? `فاکتور #${order.id}` : `Order #${order.id}`}
        <IconButton onClick={onClose} size="small" sx={{ color: C.muted }}>
          <Close sx={{ fontSize: 18 }} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        {/* اطلاعات مشتری */}
        <Box sx={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mb: 2,
          p: 1.5, borderRadius: "12px", bgcolor: `${C.olive}06`, border: `1px solid ${C.glassBorder}`,
          direction: isRtl ? "rtl" : "ltr",
        }}>
          {infoItem(isRtl ? "نام مشتری" : "Customer", order.customer_name || (isRtl ? "مشتری مهمان" : "Guest"))}
          {infoItem(isRtl ? "تلفن" : "Phone", order.phone || "—")}
          {infoItem(isRtl ? "تاریخ و ساعت" : "Date & Time", order.created_at)}
          <Box>
            <Typography sx={{ fontSize: 11, color: C.muted, fontWeight: 600, fontFamily: "'Vazirmatn', sans-serif" }}>
              {isRtl ? "وضعیت" : "Status"}
            </Typography>
            <Chip label={order.status} size="small" sx={{
              fontWeight: 700, fontSize: 12, height: 26, borderRadius: "7px",
              bgcolor: order.status === "delivered" ? `${C.olive}18` : `${C.gold}18`,
              color: order.status === "delivered" ? C.olive : C.gold,
            }} />
          </Box>
        </Box>

        {/* جدول اقلام */}
        <TableContainer sx={{ borderRadius: "12px", border: `1px solid ${C.glassBorder}`, mb: 1.5 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {[isRtl ? "کالا" : "Item", isRtl ? "تعداد" : "Qty", isRtl ? "قیمت" : "Price", isRtl ? "جمع" : "Total"].map(h => (
                  <TableCell key={h} sx={{
                    fontWeight: 800, fontSize: 12, fontFamily: "'Vazirmatn', sans-serif",
                    bgcolor: `${C.olive}08`, color: C.text, borderBottom: `1px solid ${C.glassBorder}`,
                  }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {order.items.map((item, i) => (
                <TableRow key={i}>
                  <TableCell sx={{ fontWeight: 600, fontSize: 13, fontFamily: "'Vazirmatn', sans-serif", color: C.text }}>
                    {item.name}
                  </TableCell>
                  <TableCell sx={{ fontSize: 13, fontFamily: "'Vazirmatn', sans-serif", color: C.text }}>
                    {item.quantity}
                  </TableCell>
                  <TableCell sx={{ fontSize: 13, fontFamily: "'Vazirmatn', sans-serif", color: C.sub }}>
                    {formatNum(item.price)}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 13, fontFamily: "'Vazirmatn', sans-serif", color: C.text }}>
                    {formatNum(item.line_total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* جمع کل */}
        <Box sx={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          p: 1.5, borderRadius: "12px", bgcolor: `${C.olive}08`, border: `1px solid ${C.olive}20`,
          direction: isRtl ? "rtl" : "ltr",
        }}>
          <Typography sx={{ fontWeight: 700, fontSize: 14, fontFamily: "'Vazirmatn', sans-serif", color: C.text }}>
            {isRtl ? "نحوه پرداخت" : "Payment"}:{" "}
            {order.payment_method === "cash" ? (isRtl ? "نقدی" : "Cash")
              : order.payment_method === "card" ? (isRtl ? "کارتی" : "Card")
              : (isRtl ? "آنلاین" : "Online")}
          </Typography>
          <Typography sx={{ fontWeight: 900, fontSize: 20, fontFamily: "'Vazirmatn', sans-serif", color: C.olive }}>
            {formatNum(order.total_price)}
            <Typography component="span" sx={{ fontSize: 12, fontWeight: 600, color: C.muted, mr: 0.5 }}>
              {isRtl ? "تومان" : "T"}
            </Typography>
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, gap: 1, direction: isRtl ? "rtl" : "ltr" }}>
        <Button startIcon={<Print />} onClick={handlePrint} sx={{
          borderRadius: "10px", fontWeight: 700, fontSize: 13,
          fontFamily: "'Vazirmatn', sans-serif", color: C.olive, bgcolor: `${C.olive}10`,
          "&:hover": { bgcolor: `${C.olive}20` },
        }}>
          {isRtl ? "چاپ" : "Print"}
        </Button>
        <Button startIcon={<Edit />} onClick={handleEdit} sx={{
          borderRadius: "10px", fontWeight: 700, fontSize: 13,
          fontFamily: "'Vazirmatn', sans-serif", color: C.gold, bgcolor: `${C.gold}10`,
          "&:hover": { bgcolor: `${C.gold}20` },
        }}>
          {isRtl ? "ویرایش" : "Edit"}
        </Button>
        <Button startIcon={<Delete />} onClick={handleDelete} sx={{
          borderRadius: "10px", fontWeight: 700, fontSize: 13,
          fontFamily: "'Vazirmatn', sans-serif", color: C.danger, bgcolor: `${C.danger}10`,
          "&:hover": { bgcolor: `${C.danger}20` },
        }}>
          {isRtl ? "حذف" : "Delete"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}