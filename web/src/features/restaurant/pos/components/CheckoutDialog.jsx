import { useState } from "react";
import {
  Dialog, Box, Typography, Button, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, Fade, Chip,
} from "@mui/material";
import {
  Payments, AccountBalance, Wifi, Close,
  Receipt, ShoppingCart,
} from "@mui/icons-material";

const METHODS = [
  { key: "cash", icon: Payments, labelFa: "نقدی", labelEn: "Cash", color: "#6B9B6E" },
  { key: "card", icon: AccountBalance, labelFa: "کارتخوان", labelEn: "Card", color: "#D4B76A" },
  { key: "online", icon: Wifi, labelFa: "آنلاین", labelEn: "Online", color: "#7B9EC8" },
];

export default function CheckoutDialog({
  open, onClose,
  cart, cartTotal, onSubmit, submitting, error,
  C, isRtl,
}) {
  const [hoveredMethod, setHoveredMethod] = useState(null);

  const itemCount = (cart || []).reduce((s, i) => s + (i.qty || 0), 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      TransitionComponent={Fade}
      TransitionProps={{ timeout: 300 }}
      PaperProps={{
        sx: {
          bgcolor: C.glass,
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
          border: `1px solid ${C.glassBorder}`,
          borderRadius: "24px",
          boxShadow: C.cardShadow,
          overflow: "hidden",
          direction: isRtl ? "rtl" : "ltr",
        },
      }}
    >
      {/* ─── هدر ─── */}
      <Box sx={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        px: 3, py: 2,
        borderBottom: `1px solid ${C.glassBorder}`,
        bgcolor: `${C.olive}08`,
      }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box sx={{
            width: 40, height: 40, borderRadius: "12px",
            bgcolor: `${C.olive}15`, display: "flex",
            alignItems: "center", justifyContent: "center",
          }}>
            <Receipt sx={{ fontSize: 20, color: C.olive }} />
          </Box>
          <Box>
            <Typography sx={{
              fontWeight: 800, fontSize: 16, color: C.text,
              fontFamily: "'Vazirmatn', sans-serif",
            }}>
              {isRtl ? "تأیید پرداخت" : "Confirm Payment"}
            </Typography>
            <Typography sx={{
              fontSize: 11, color: C.muted,
              fontFamily: "'Vazirmatn', sans-serif",
            }}>
              {itemCount} {isRtl ? "قلم کالا" : "items"}
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{
          color: C.muted, "&:hover": { bgcolor: `${C.danger}12`, color: C.danger },
        }}>
          <Close sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      <Box sx={{ p: 3 }}>
        {/* ─── جدول اقلام ─── */}
        <TableContainer sx={{
          borderRadius: "14px",
          border: `1px solid ${C.glassBorder}`,
          mb: 2.5, overflow: "hidden",
        }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{
                  fontWeight: 800, fontSize: 12, py: 1.2,
                  fontFamily: "'Vazirmatn', sans-serif",
                  bgcolor: `${C.olive}0A`, color: C.text,
                  borderBottom: `1px solid ${C.glassBorder}`,
                  width: "5%",
                }}>#</TableCell>
                <TableCell sx={{
                  fontWeight: 800, fontSize: 12, py: 1.2,
                  fontFamily: "'Vazirmatn', sans-serif",
                  bgcolor: `${C.olive}0A`, color: C.text,
                  borderBottom: `1px solid ${C.glassBorder}`,
                }}>{isRtl ? "نام کالا" : "Item"}</TableCell>
                <TableCell align="center" sx={{
                  fontWeight: 800, fontSize: 12, py: 1.2,
                  fontFamily: "'Vazirmatn', sans-serif",
                  bgcolor: `${C.olive}0A`, color: C.text,
                  borderBottom: `1px solid ${C.glassBorder}`,
                  width: "15%",
                }}>{isRtl ? "تعداد" : "Qty"}</TableCell>
                <TableCell align="center" sx={{
                  fontWeight: 800, fontSize: 12, py: 1.2,
                  fontFamily: "'Vazirmatn', sans-serif",
                  bgcolor: `${C.olive}0A`, color: C.text,
                  borderBottom: `1px solid ${C.glassBorder}`,
                  width: "20%",
                }}>{isRtl ? "قیمت" : "Price"}</TableCell>
                <TableCell align="center" sx={{
                  fontWeight: 800, fontSize: 12, py: 1.2,
                  fontFamily: "'Vazirmatn', sans-serif",
                  bgcolor: `${C.olive}0A`, color: C.text,
                  borderBottom: `1px solid ${C.glassBorder}`,
                  width: "20%",
                }}>{isRtl ? "جمع" : "Total"}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(cart || []).map((item, idx) => (
                <TableRow key={idx} sx={{
                  "&:hover": { bgcolor: `${C.olive}05` },
                  transition: "all 0.15s ease",
                }}>
                  <TableCell sx={{
                    fontSize: 12, fontWeight: 700, color: C.muted,
                    fontFamily: "'Vazirmatn', sans-serif",
                    borderBottom: idx < cart.length - 1 ? `1px solid ${C.glassBorder}` : "none",
                    py: 1,
                  }}>{idx + 1}</TableCell>
                  <TableCell sx={{
                    fontSize: 13, fontWeight: 600, color: C.text,
                    fontFamily: "'Vazirmatn', sans-serif",
                    borderBottom: idx < cart.length - 1 ? `1px solid ${C.glassBorder}` : "none",
                    py: 1,
                  }}>{item.name}</TableCell>
                  <TableCell align="center" sx={{
                    borderBottom: idx < cart.length - 1 ? `1px solid ${C.glassBorder}` : "none",
                    py: 1,
                  }}>
                    <Chip label={item.qty || 0} size="small" sx={{
                      fontSize: 12, fontWeight: 700, height: 24, minWidth: 32,
                      bgcolor: `${C.olive}12`, color: C.olive,
                      borderRadius: "8px",
                      fontFamily: "'Vazirmatn', sans-serif",
                    }} />
                  </TableCell>
                  <TableCell align="center" sx={{
                    fontSize: 12, color: C.sub,
                    fontFamily: "'Vazirmatn', sans-serif",
                    borderBottom: idx < cart.length - 1 ? `1px solid ${C.glassBorder}` : "none",
                    py: 1,
                  }}>{(item.effective_price || item.price || 0).toLocaleString()}</TableCell>
                  <TableCell align="center" sx={{
                    fontSize: 13, fontWeight: 800, color: C.text,
                    fontFamily: "'Vazirmatn', sans-serif",
                    borderBottom: idx < cart.length - 1 ? `1px solid ${C.glassBorder}` : "none",
                    py: 1,
                  }}>{((item.effective_price || item.price || 0) * (item.qty || 0)).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* ─── جمع کل ─── */}
        <Box sx={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          p: 2, borderRadius: "14px",
          bgcolor: `${C.olive}0C`,
          border: `1px solid ${C.olive}20`,
          mb: 3,
        }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <ShoppingCart sx={{ fontSize: 18, color: C.olive }} />
            <Typography sx={{
              fontWeight: 700, fontSize: 14, color: C.text,
              fontFamily: "'Vazirmatn', sans-serif",
            }}>
              {isRtl ? "مبلغ قابل پرداخت" : "Total Due"}
            </Typography>
          </Box>
          <Box sx={{ textAlign: isRtl ? "left" : "right" }}>
            <Typography sx={{
              fontWeight: 900, fontSize: 22, color: C.olive,
              fontFamily: "'Vazirmatn', sans-serif", lineHeight: 1,
            }}>
              {cartTotal.toLocaleString()}
            </Typography>
            <Typography sx={{
              fontSize: 10, color: C.muted, fontWeight: 600,
              fontFamily: "'Vazirmatn', sans-serif",
            }}>
              {isRtl ? "تومان" : "Toman"}
            </Typography>
          </Box>
        </Box>

        {/* ─── خطا ─── */}
        {error && (
          <Box sx={{
            p: 1.5, mb: 2.5, borderRadius: "12px",
            bgcolor: C.dangerBg,
            border: `1px solid ${C.danger}22`,
            display: "flex", alignItems: "center", gap: 1,
          }}>
            <Box sx={{
              width: 6, height: 6, borderRadius: "50%",
              bgcolor: C.danger, flexShrink: 0,
            }} />
            <Typography sx={{
              color: C.danger, fontSize: 12, fontWeight: 600,
              fontFamily: "'Vazirmatn', sans-serif",
            }}>
              {error}
            </Typography>
          </Box>
        )}

        {/* ─── روش پرداخت ─── */}
        <Typography sx={{
          fontSize: 12, fontWeight: 700, color: C.muted, mb: 1.5,
          fontFamily: "'Vazirmatn', sans-serif",
          textTransform: "uppercase", letterSpacing: "0.5px",
        }}>
          {isRtl ? "انتخاب روش پرداخت" : "SELECT PAYMENT METHOD"}
        </Typography>

        <Box sx={{ display: "flex", gap: 1.5, mb: 2 }}>
          {METHODS.map(m => {
            const Icon = m.icon;
            const isHovered = hoveredMethod === m.key;
            return (
              <Box
                key={m.key}
                onMouseEnter={() => setHoveredMethod(m.key)}
                onMouseLeave={() => setHoveredMethod(null)}
                onClick={() => !submitting && onSubmit(m.key)}
                sx={{
                  flex: 1, p: 2, cursor: submitting ? "wait" : "pointer",
                  borderRadius: "14px",
                  border: `1.5px solid ${isHovered ? m.color : C.glassBorder}`,
                  bgcolor: isHovered ? `${m.color}10` : C.inputBg,
                  display: "flex", flexDirection: "column",
                  alignItems: "center", gap: 1,
                  transition: "all 0.2s ease",
                  transform: isHovered ? "translateY(-3px)" : "none",
                  boxShadow: isHovered ? `0 8px 24px ${m.color}20` : "none",
                  "&:active": { transform: "scale(0.97)" },
                }}
              >
                {submitting ? (
                  <CircularProgress size={22} sx={{ color: m.color }} />
                ) : (
                  <>
                    <Box sx={{
                      width: 44, height: 44, borderRadius: "12px",
                      bgcolor: `${m.color}15`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.2s ease",
                      transform: isHovered ? "scale(1.1)" : "none",
                    }}>
                      <Icon sx={{ fontSize: 22, color: m.color }} />
                    </Box>
                    <Typography sx={{
                      fontSize: 12, fontWeight: 700, color: C.text,
                      fontFamily: "'Vazirmatn', sans-serif",
                    }}>
                      {isRtl ? m.labelFa : m.labelEn}
                    </Typography>
                  </>
                )}
              </Box>
            );
          })}
        </Box>
      </Box>
    </Dialog>
  );
}