import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLang } from "../contexts/LangContext";
import { posApi } from "../api/pos";
import {
  Box, Typography, Grid, Paper, TextField, Button, IconButton,
  Badge, Chip, Divider, CircularProgress, InputAdornment,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from "@mui/material";
import {
  Add, Remove, Delete, ShoppingCart, Search,
  PointOfSale, Receipt, Close,
} from "@mui/icons-material";

const toFa = (n) => {
  if (n == null) return "—";
  return Number(n).toLocaleString("fa-IR");
};
const fmtPrice = (v) => toFa(Math.round(v || 0)) + " تومان";

export default function Pos() {
  const { t } = useTranslation();
  const { isRtl } = useLang();
  const queryClient = useQueryClient();

  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const [orderType, setOrderType] = useState("dine_in");
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);

  const { data: menuData, isLoading: menuLoading } = useQuery({
    queryKey: ["foodMenu"],
    queryFn: () => posApi.foodMenu().then((r) => r.data),
  });

  const { data: report } = useQuery({
    queryKey: ["dailyReport"],
    queryFn: () => posApi.dailyReport().then((r) => r.data),
  });

  const foods = useMemo(() => {
    const list = Array.isArray(menuData) ? menuData : menuData?.items || menuData?.results || [];
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter((f) => (f.name || "").toLowerCase().includes(q));
  }, [menuData, search]);

  const addToCart = (food) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === food.id);
      if (existing) {
        return prev.map((item) =>
          item.id === food.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...food, quantity: 1 }];
    });
  };

  const updateQty = (id, delta) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.id === id ? { ...item, quantity: item.quantity + delta } : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const removeFromCart = (id) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + (item.discounted_price || item.price || 0) * item.quantity, 0),
    [cart]
  );

  const cartCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  const orderMutation = useMutation({
    mutationFn: (payload) => posApi.createOrder(payload),
    onSuccess: (res) => {
      setLastOrder(res.data);
      setShowReceipt(true);
      setCart([]);
      queryClient.invalidateQueries(["dailyReport"]);
    },
  });

  const submitOrder = () => {
    if (!cart.length) return;
    const payload = {
      order_type: orderType,
      items: cart.map((item) => ({
        food: item.id,
        quantity: item.quantity,
      })),
    };
    orderMutation.mutate(payload);
  };

  const orderTypes = [
    { value: "dine_in", label: isRtl ? "حضوری" : "Dine In", icon: "🍽️" },
    { value: "takeaway", label: isRtl ? "بیرون‌بر" : "Takeaway", icon: "📦" },
    { value: "delivery", label: isRtl ? "ارسال" : "Delivery", icon: "🛵" },
  ];

  return (
    <Box sx={{
      display: "flex", gap: 2, height: "calc(100vh - 140px)",
      flexDirection: { xs: "column", md: isRtl ? "row-reverse" : "row" },
    }}>

      {/* منوی غذا */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        <Box sx={{
          display: "flex", gap: 1.5, mb: 2,
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { sm: "center" },
        }}>
          <TextField
            size="small" fullWidth
            placeholder={isRtl ? "جستجوی غذا..." : "Search food..."}
            value={search} onChange={(e) => setSearch(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search fontSize="small" sx={{ opacity: 0.4 }} />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
          />
          <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }}>
            {orderTypes.map((ot) => (
              <Chip
                key={ot.value}
                label={ot.icon + " " + ot.label}
                onClick={() => setOrderType(ot.value)}
                variant={orderType === ot.value ? "filled" : "outlined"}
                sx={{
                  fontWeight: 700, fontSize: 12, borderRadius: 2,
                  ...(orderType === ot.value
                    ? { background: "linear-gradient(135deg, #ff6b35, #f7931e)", color: "#fff" }
                    : {}),
                }}
              />
            ))}
          </Box>
        </Box>

        {report?.success && (
          <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
            <Chip
              icon={<Receipt />}
              label={(isRtl ? "فروش: " : "Sales: ") + fmtPrice(report.total_sales)}
              sx={{ fontWeight: 700, background: "rgba(255,107,53,0.1)", color: "#ff6b35" }}
            />
            <Chip
              icon={<PointOfSale />}
              label={(isRtl ? "سفارش: " : "Orders: ") + toFa(report.order_count)}
              sx={{ fontWeight: 700, background: "rgba(59,130,246,0.1)", color: "#3b82f6" }}
            />
          </Box>
        )}

        <Box sx={{
          flex: 1, overflowY: "auto", overflowX: "hidden",
          "&::-webkit-scrollbar": { width: 4 },
          "&::-webkit-scrollbar-thumb": { background: "rgba(0,0,0,0.1)", borderRadius: 2 },
        }}>
          {menuLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
              <CircularProgress />
            </Box>
          ) : foods.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 8, color: "text.secondary" }}>
              <Typography>{isRtl ? "غذایی یافت نشد" : "No food found"}</Typography>
            </Box>
          ) : (
            <Grid container spacing={1.5}>
              {foods.map((food) => {
                const inCart = cart.find((c) => c.id === food.id);
                const price = food.discounted_price || food.price || 0;
                return (
                  <Grid size={{ xs: 6, sm: 4, md: 3 }} key={food.id}>
                    <Paper
                      onClick={() => addToCart(food)}
                      sx={{
                        p: 1.5, cursor: "pointer", borderRadius: 3,
                        border: "2px solid",
                        borderColor: inCart ? "rgba(255,107,53,0.4)" : "divider",
                        transition: "all 0.2s",
                        position: "relative", overflow: "hidden",
                        "&:hover": {
                          borderColor: "#ff6b35",
                          transform: "translateY(-2px)",
                          boxShadow: 3,
                        },
                      }}
                    >
                      {inCart && (
                        <Badge
                          badgeContent={toFa(inCart.quantity)}
                          sx={{
                            position: "absolute", top: 8,
                            right: isRtl ? 8 : "auto",
                            left: isRtl ? "auto" : 8,
                            "& .MuiBadge-badge": {
                              background: "linear-gradient(135deg, #ff6b35, #f7931e)",
                              color: "#fff", fontWeight: 900, fontSize: 13,
                            },
                          }}
                        />
                      )}
                      <Typography sx={{
                        fontSize: 14, fontWeight: 800, color: "text.primary",
                        mb: 0.5, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {food.name}
                      </Typography>
                      <Typography sx={{ fontSize: 13, fontWeight: 900, color: "#ff6b35" }}>
                        {fmtPrice(price)}
                      </Typography>
                    </Paper>
                  </Grid>
                );
              })}
            </Grid>
          )}
        </Box>
      </Box>

      {/* سبد خرید */}
      <Box sx={{
        width: { xs: "100%", md: 360 },
        display: "flex", flexDirection: "column",
        bgcolor: "background.paper",
        borderRadius: 4, border: "2px solid", borderColor: "divider",
        overflow: "hidden", flexShrink: 0,
      }}>

        <Box sx={{
          p: 2, display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "2px solid", borderColor: "divider",
          background: "rgba(255,107,53,0.03)",
        }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <ShoppingCart sx={{ color: "#ff6b35" }} />
            <Typography sx={{ fontWeight: 900, fontSize: 16 }}>
              {isRtl ? "سبد خرید" : "Cart"}
            </Typography>
            {cartCount > 0 && (
              <Chip label={toFa(cartCount)} size="small" sx={{
                fontWeight: 900, fontSize: 11,
                background: "rgba(255,107,53,0.15)", color: "#ff6b35",
              }} />
            )}
          </Box>
          {cart.length > 0 && (
            <IconButton size="small" onClick={() => setCart([])}
              sx={{ color: "text.secondary", "&:hover": { color: "#ef4444" } }}>
              <Delete fontSize="small" />
            </IconButton>
          )}
        </Box>

        <Box sx={{
          flex: 1, overflowY: "auto", p: 1,
          "&::-webkit-scrollbar": { width: 3 },
          "&::-webkit-scrollbar-thumb": { background: "rgba(0,0,0,0.08)", borderRadius: 2 },
        }}>
          {cart.length === 0 ? (
            <Box sx={{
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              height: "100%", py: 6, color: "text.secondary",
            }}>
              <ShoppingCart sx={{ fontSize: 48, opacity: 0.2, mb: 1 }} />
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                {isRtl ? "سبد خالی است" : "Cart is empty"}
              </Typography>
              <Typography sx={{ fontSize: 11, opacity: 0.6 }}>
                {isRtl ? "روی غذا کلیک کنید" : "Click on food to add"}
              </Typography>
            </Box>
          ) : (
            cart.map((item) => {
              const price = item.discounted_price || item.price || 0;
              return (
                <Paper key={item.id} sx={{
                  display: "flex", alignItems: "center", gap: 1,
                  p: 1.5, mb: 1, borderRadius: 2.5,
                  border: "1px solid", borderColor: "divider",
                }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{
                      fontSize: 13, fontWeight: 800,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {item.name}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: "text.secondary", fontWeight: 600 }}>
                      {fmtPrice(price)} × {toFa(item.quantity)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.3 }}>
                    <IconButton size="small" onClick={() => updateQty(item.id, -1)}
                      sx={{ width: 28, height: 28 }}>
                      <Remove fontSize="inherit" />
                    </IconButton>
                    <Typography sx={{
                      fontSize: 14, fontWeight: 900, minWidth: 24, textAlign: "center",
                    }}>
                      {toFa(item.quantity)}
                    </Typography>
                    <IconButton size="small" onClick={() => updateQty(item.id, 1)}
                      sx={{ width: 28, height: 28 }}>
                      <Add fontSize="inherit" />
                    </IconButton>
                    <IconButton size="small" onClick={() => removeFromCart(item.id)}
                      sx={{ width: 28, height: 28, color: "#ef4444" }}>
                      <Close fontSize="inherit" />
                    </IconButton>
                  </Box>
                </Paper>
              );
            })
          )}
        </Box>

        <Box sx={{
          p: 2, borderTop: "2px solid", borderColor: "divider",
          background: "rgba(255,107,53,0.02)",
        }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1.5 }}>
            <Typography sx={{ fontWeight: 700, color: "text.secondary" }}>
              {isRtl ? "جمع کل" : "Total"}
            </Typography>
            <Typography sx={{ fontWeight: 900, fontSize: 18, color: "#ff6b35" }}>
              {fmtPrice(cartTotal)}
            </Typography>
          </Box>
          <Button
            fullWidth variant="contained"
            disabled={cart.length === 0 || orderMutation.isPending}
            onClick={submitOrder}
            sx={{
              py: 1.5, fontSize: 15, fontWeight: 900, borderRadius: 3,
              background: "linear-gradient(135deg, #ff6b35, #f7931e)",
              boxShadow: "0 4px 14px rgba(255,107,53,0.3)",
              "&:hover": {
                transform: "translateY(-1px)",
                boxShadow: "0 6px 20px rgba(255,107,53,0.4)",
                background: "linear-gradient(135deg, #ff6b35, #f7931e)",
              },
            }}
          >
            {orderMutation.isPending
              ? <CircularProgress size={22} sx={{ color: "#fff" }} />
              : isRtl ? "ثبت سفارش" : "Submit Order"}
          </Button>
        </Box>
      </Box>

      {/* دیالوگ رسید */}
      <Dialog
        open={showReceipt}
        onClose={() => setShowReceipt(false)}
        maxWidth="sm" fullWidth
      >
        <DialogTitle sx={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontWeight: 900,
        }}>
          {isRtl ? "سفارش ثبت شد" : "Order Submitted"}
          <IconButton onClick={() => setShowReceipt(false)} size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {lastOrder && (
            <Box>
              <Typography sx={{ mb: 1, fontWeight: 700 }}>
                {isRtl ? "شماره سفارش" : "Order"}: #{toFa(lastOrder.id || lastOrder.order_id)}
              </Typography>
              {lastOrder.items && lastOrder.items.map((item, i) => (
                <Box key={i} sx={{
                  display: "flex", justifyContent: "space-between", py: 0.5,
                  borderBottom: "1px dashed", borderColor: "divider",
                }}>
                  <Typography sx={{ fontSize: 13 }}>
                    {item.food_name || item.name} × {toFa(item.quantity)}
                  </Typography>
                  <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
                    {fmtPrice(item.total_price || item.price)}
                  </Typography>
                </Box>
              ))}
              <Divider sx={{ my: 1.5 }} />
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography sx={{ fontWeight: 900, fontSize: 16 }}>
                  {isRtl ? "جمع کل" : "Total"}
                </Typography>
                <Typography sx={{ fontWeight: 900, fontSize: 18, color: "#ff6b35" }}>
                  {fmtPrice(lastOrder.total || lastOrder.total_price || cartTotal)}
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setShowReceipt(false)} variant="outlined" sx={{ borderRadius: 2 }}>
            {isRtl ? "بستن" : "Close"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}