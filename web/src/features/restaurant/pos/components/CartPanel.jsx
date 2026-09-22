import { Box, Typography, Button, Chip } from "@mui/material";
import { ShoppingBag, ShoppingBagOutlined, CreditCard, Storefront, DeliveryDining } from "@mui/icons-material";
import CartItem from "./CartItem";
import CustomerInfo from "./CustomerInfo";
import OrderTypeSelector from "./OrderTypeSelector";

export default function CartPanel({
  cart, cartCount, cartTotal,
  categoryDiscounts,
  onAdd, onRemove, onClear,
  orderType, setOrderType,
  custName, setCustName,
  custPhone, setCustPhone,
  requireCustomer,
  onCheckout,
  submitting,
  C, isRtl,
}) {
  return (
    <Box sx={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      maxHeight: "calc(100vh - 180px)",
    }}>
      {/* هدر سبد */}
      <Box sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        mb: 2,
        pb: 2,
        borderBottom: `1px solid ${C.glassBorder}`,
      }}>
        <Typography variant="h6" sx={{
          fontWeight: 700,
          display: "flex", alignItems: "center", gap: 1,
          fontFamily: "'Vazirmatn', sans-serif",
        }}>
          <ShoppingBag sx={{ color: C.olive }} />
          {isRtl ? "سبد خرید" : "Cart"}
        </Typography>
        <Chip
          label={cartCount}
          sx={{ bgcolor: C.oliveSubtle, color: C.olive, fontWeight: 700 }}
        />
      </Box>

      {/* آیتم‌ها */}
      <Box sx={{ flex: 1, overflowY: "auto", mb: 2 }}>
        {cart.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 5, color: C.muted }}>
            <ShoppingBagOutlined sx={{ fontSize: 48, opacity: 0.3, mb: 1 }} />
            <Typography sx={{ fontFamily: "'Vazirmatn', sans-serif", fontSize: 13 }}>
              {isRtl ? "سبد خالی است" : "Cart is empty"}
            </Typography>
          </Box>
        ) : (
          cart.map(item => (
            <CartItem
              key={item.cartId}
              item={item}
              onAdd={onAdd}
              onRemove={onRemove}
              C={C}
              isRtl={isRtl}
            />
          ))
        )}
      </Box>

      {/* پایین سبد */}
      <Box sx={{ borderTop: `1px solid ${C.glassBorder}`, pt: 2 }}>
        {/* نوع سفارش */}
        <OrderTypeSelector
          orderType={orderType}
          setOrderType={setOrderType}
          C={C}
          isRtl={isRtl}
        />

        {/* اطلاعات مشتری */}
        <CustomerInfo
          custName={custName}
          setCustName={setCustName}
          custPhone={custPhone}
          setCustPhone={setCustPhone}
          requireCustomer={requireCustomer}
          C={C}
          isRtl={isRtl}
        />

        {/* جمع کل */}
        <Box sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          mb: 2,
          mt: 1,
        }}>
          <Typography sx={{
            fontWeight: 600, color: C.sub,
            fontFamily: "'Vazirmatn', sans-serif", fontSize: 13,
          }}>
            {isRtl ? "جمع کل:" : "Total:"}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.4 }}>
            <Typography sx={{
              fontWeight: 800, color: C.olive, fontSize: 18,
              fontFamily: "'Vazirmatn', sans-serif",
            }}>
              {cartTotal.toLocaleString()}
            </Typography>
            <Typography sx={{
              fontWeight: 600, color: C.muted, fontSize: 11,
              fontFamily: "'Vazirmatn', sans-serif",
            }}>
              {isRtl ? "تومان" : "Toman"}
            </Typography>
          </Box>
        </Box>

        {/* دکمه پرداخت */}
        <Button
          fullWidth
          onClick={onCheckout}
          disabled={cart.length === 0 || submitting}
          sx={{
            bgcolor: C.olive,
            color: "#fff",
            py: 1.5,
            fontSize: 14,
            fontWeight: 700,
            borderRadius: "14px",
            fontFamily: "'Vazirmatn', sans-serif",
            transition: "all 0.2s ease",
            "&:hover": {
              bgcolor: C.olive,
              opacity: 0.88,
              transform: "translateY(-2px)",
            },
            "&.Mui-disabled": { bgcolor: `${C.muted}30`, color: C.muted },
          }}
        >
          <CreditCard sx={{ mr: 1 }} />
          {submitting
            ? (isRtl ? "در حال پرداخت..." : "Processing...")
            : (isRtl ? "پرداخت" : "Checkout")
          }
        </Button>
      </Box>
    </Box>
  );
}