import { Dialog, Box, Typography, Button, Grid, CircularProgress } from "@mui/material";
import { CreditCard, Payments, AccountBalance, PersonAdd, Close } from "@mui/icons-material";

const METHODS = [
  { key: "cash", icon: Payments, labelFa: "نقدی", labelEn: "Cash" },
  { key: "card", icon: AccountBalance, labelFa: "کارتخوان", labelEn: "Card" },
  { key: "online", icon: PersonAdd, labelFa: "آنلاین", labelEn: "Online" },
];

export default function CheckoutDialog({
  open, onClose,
  cartTotal, onSubmit, submitting, error,
  C, isRtl,
}) {
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
        {/* هدر */}
        <Typography variant="h6" sx={{
          fontWeight: 800, mb: 2,
          color: C.text,
          display: "flex", alignItems: "center", gap: 1,
          fontFamily: "'Vazirmatn', sans-serif",
        }}>
          <CreditCard sx={{ color: C.olive }} />
          {isRtl ? "پرداخت" : "Payment"}
        </Typography>

        {/* مبلغ */}
        <Box sx={{
          p: 2, borderRadius: "12px",
          bgcolor: C.oliveSubtle,
          textAlign: "center", mb: 3,
        }}>
          <Typography sx={{ fontSize: 11, color: C.muted, fontFamily: "'Vazirmatn', sans-serif" }}>
            {isRtl ? "مبلغ قابل پرداخت" : "Amount due"}
          </Typography>
          <Typography variant="h5" sx={{
            fontWeight: 800, color: C.olive,
            fontFamily: "'Vazirmatn', sans-serif",
          }}>
            {cartTotal.toLocaleString()}
            <Typography component="span" sx={{ fontSize: 12, ml: 0.5 }}>
              {isRtl ? "تومان" : "T"}
            </Typography>
          </Typography>
        </Box>

        {/* خطا */}
        {error && (
          <Box sx={{
            p: 1.5, mb: 2, borderRadius: "10px",
            bgcolor: C.dangerBg,
            border: `1px solid ${C.danger}33`,
          }}>
            <Typography sx={{ color: C.danger, fontSize: 12, fontFamily: "'Vazirmatn', sans-serif" }}>
              {error}
            </Typography>
          </Box>
        )}

        {/* روش پرداخت */}
        <Typography sx={{
          fontSize: 13, fontWeight: 600, color: C.sub, mb: 1.5,
          fontFamily: "'Vazirmatn', sans-serif",
        }}>
          {isRtl ? "روش پرداخت:" : "Payment method:"}
        </Typography>

        <Grid container spacing={1.5}>
          {METHODS.map(m => {
            const Icon = m.icon;
            return (
              <Grid item xs={4} key={m.key}>
                <Button
                  onClick={() => onSubmit(m.key)}
                  disabled={submitting}
                  sx={{
                    p: 2,
                    borderRadius: "12px",
                    border: `1px solid ${C.glassBorder}`,
                    bgcolor: C.inputBg,
                    color: C.text,
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                    width: "100%",
                    "&:hover": {
                      borderColor: C.olive,
                      bgcolor: C.oliveSubtle,
                    },
                  }}
                >
                  {submitting ? (
                    <CircularProgress size={24} sx={{ color: C.olive }} />
                  ) : (
                    <>
                      <Icon sx={{ color: C.olive }} />
                      <Typography sx={{
                        fontSize: 11, fontWeight: 600,
                        fontFamily: "'Vazirmatn', sans-serif",
                      }}>
                        {isRtl ? m.labelFa : m.labelEn}
                      </Typography>
                    </>
                  )}
                </Button>
              </Grid>
            );
          })}
        </Grid>

        {/* لغو */}
        <Button
          onClick={onClose}
          disabled={submitting}
          sx={{
            mt: 3, width: "100%",
            color: C.sub,
            fontFamily: "'Vazirmatn', sans-serif",
            fontSize: 13,
          }}
          startIcon={<Close />}
        >
          {isRtl ? "لغو" : "Cancel"}
        </Button>
      </Box>
    </Dialog>
  );
}