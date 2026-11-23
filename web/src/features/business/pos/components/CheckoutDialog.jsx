import { blurFocused } from "../common/focus";
import { ResponsiveDialog } from "@shared/responsive";
import { appUrl } from "@shared/basePath";
import { useEffect, useRef, useState } from "react";
import {
  Box, Typography, Button, CircularProgress,
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
  PointOfSale,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { appName } from "@shared/branding";
import { buildTicketHtml, buildLabels, readBusinessName } from "../services/printService";
import useShortcuts from "@shared/common/useShortcuts";
import { KbdHint, formatMoney } from "../common";
import usePosAccess, { canUseMethod } from "../hooks/usePosAccess";
import useCardTerminal from "../hooks/useCardTerminal";
import { useSync } from "@shared/sync";
import CardTerminalPanel from "./CardTerminalPanel";
import { settleOrder, cancelUnpaidOrder } from "../services/cardTerminal";

export default function CheckoutDialog({
  open,
  onClose,
  C,
  isRtl,
  lastOrder,
  pendingOrder,
  cardSettings,
  onPaid,
  onOrderCancelled,
  defaultMethod,
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
  const { t, i18n } = useTranslation();
  const posAccess = usePosAccess();
  const [sel, setSel] = useState(null); // روش انتخاب‌شده با کیبورد؛ null = پیش‌فرض
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) setSel(null);
  }
  const cardEnabled = !!cardSettings?.enabled;
  const sync = useSync();
  const terminalOffline = cardEnabled && sync.active && !sync.online;   // the card terminal needs the server
  const [working, setWorking] = useState(false);
  const [panelError, setPanelError] = useState(null);
  const terminal = useCardTerminal({ settings: cardSettings, onPaid: (order) => onPaid?.(order) });
  const locked = !!pendingOrder && !isPaid;   // an unpaid order is being charged: the dialog cannot be dismissed by accident

  const allMethods = [
    ...(cardEnabled ? [{ key: "terminal", icon: PointOfSale, labelFa: t("ui_card.checkout.action"), labelEn: t("ui_card.checkout.action"), hint: t("ui_card.checkout.hint") }] : []),
    { key: "cash", icon: Payments, labelFa: "پرداخت نقدی", labelEn: "Cash" },
    { key: "card", icon: CreditCard, labelFa: "کارت (ثبت دستی)", labelEn: "Card (recorded manually)" },
    {
      key: "online",
      icon: Language,
      labelFa: "آنلاین / انتقال (ثبت دستی)",
      labelEn: "Online / transfer (recorded manually)",
    },
  ];
  const paymentMethods = allMethods.filter((m) => canUseMethod(posAccess, m.key)); // only what this user may take
  // default choice: the terminal when it is set up, else the cashier's usual method, always among what this user may take
  const preferred = cardEnabled ? "terminal" : (defaultMethod || "cash");
  const selKey = sel ?? (paymentMethods.find((m) => m.key === preferred)?.key ?? paymentMethods[0]?.key ?? preferred);

  const handlePayment = async (method) => {
    setLocalError(null);
    setLocalSubmitting(true);
    try {
      const res = onSubmit ? await onSubmit(method) : null;
      if (method === "terminal" && res?.awaiting_payment) terminal.start(res);
    } catch (err) {
      setLocalError(err.message || "خطا در پرداخت");
    } finally {
      setLocalSubmitting(false);
    }
  };

  const settleOther = async (method) => {
    if (!pendingOrder) return;
    setWorking(true);
    setPanelError(null);
    try {
      const order = await settleOrder(pendingOrder.order_id, method, pendingOrder.driver_id);
      terminal.reset();
      onPaid?.(order);
    } catch (err) {
      setPanelError(err?.response?.data?.error || err.message);
    } finally { setWorking(false); }
  };

  const cancelPending = async () => {
    if (!pendingOrder) return;
    setWorking(true);
    setPanelError(null);
    try {
      await cancelUnpaidOrder(pendingOrder.order_id);
      terminal.reset();
      onOrderCancelled?.(pendingOrder);
      onClose();
    } catch (err) {
      setPanelError(err?.response?.data?.error || err.message);
    } finally { setWorking(false); }
  };

  const leavePending = () => { terminal.reset(); onClose(); };

  const moveMethod = (dir) => {
    if (!paymentMethods.length) return;
    const i = paymentMethods.findIndex((m) => m.key === selKey);
    const n = (Math.max(i, 0) + dir + paymentMethods.length) % paymentMethods.length;
    setSel(paymentMethods[n].key);
  };

  const confirmDialog = (e) => {
    if (e?.target?.tagName === "BUTTON") return false; // Enter روی دکمه‌ی فوکوس‌شده کار خودش را بکند
    if (isPaid) handlePrint();
    else if (!busy) handlePayment(selKey);
    return true;
  };

  useShortcuts(
    locked ? [] : isPaid
      ? [
        { combo: "Ctrl+D", label: t("ui_g.pos.print_receipt"), scope: "dialog", handler: () => handlePrint() },
        { combo: "Enter", label: t("shortcuts.confirm"), scope: "dialog", handler: confirmDialog },
        { combo: "Escape", label: t("shortcuts.close_dialog"), scope: "dialog", handler: () => onClose() },
      ]
      : [
        { combo: "Ctrl+D", label: t("ui_g.pos.pay_selected"), scope: "dialog", handler: () => { if (!busy) handlePayment(selKey); } },
        { combo: "Enter", label: t("shortcuts.confirm"), scope: "dialog", handler: confirmDialog },
        { combo: "Ctrl+A", label: t("ui_g.pos.next_method"), scope: "dialog", handler: () => moveMethod(1) },
        { combo: "Ctrl+Z", label: t("ui_g.pos.prev_method"), scope: "dialog", handler: () => moveMethod(-1) },
      ],
    { enabled: open },
  );

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

  // رسید با همان قالب ۸۰ میلی‌متری سرویس چاپ (نام کسب‌وکار، روش پرداخت، آدرس تحویل)
  const handlePrint = () => {
    if (!lastOrder) return;
    const lang = String(i18n.language || "fa").startsWith("en") ? "en" : "fa";
    let when = lastOrder.created_at;
    try {
      if (lastOrder.created_at_iso) {
        when = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "fa-IR-u-ca-persian-nu-latn", {
          year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
        }).format(new Date(lastOrder.created_at_iso)).replace(",", "");
      }
    } catch { /* keep server text */ }
    const order = {
      id: lastOrder.order_id,
      created_at: when,
      customer_name: lastOrder.customer_name,
      phone: lastOrder.phone,
      total_price: lastOrder.total_price,
      payment_status: lastOrder.payment_status || "paid",
      payment_method: lastOrder.payment_method,
      terminal: lastOrder.terminal || null,
      delivery_address: lastOrder.delivery_address,
      tracking_url: lastOrder.dispatch?.tracking_token ? appUrl("/t/" + lastOrder.dispatch.tracking_token) : "",
      items: (lastOrder.items || []).map((it) => ({
        food_name: it.name, name_en: it.name_en, quantity: it.quantity, price: it.price,
      })),
    };
    const html = buildTicketHtml(order, "receipt", buildLabels(t), {
      lang, isRtl, businessName: lastOrder.business_name || readBusinessName() || appName(lang),
    });

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

  // paid on the card terminal: the customer's receipt prints by itself
  const autoPrinted = useRef(null);
  useEffect(() => {
    if (open && lastOrder?.terminal && autoPrinted.current !== lastOrder.order_id) {
      autoPrinted.current = lastOrder.order_id;
      handlePrint();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lastOrder]);

  return (
    <ResponsiveDialog
      open={open}
      onClose={isPaid || locked ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{
        transition: { onExit: blurFocused }, paper: {
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

          {!isPaid && !locked && (
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
          {/* ══════════ کارتخوان: سفارش ثبت شده و پرداخت‌نشده ══════════ */}
          {locked && (
            <CardTerminalPanel
              order={pendingOrder} terminal={terminal} working={working} error={panelError}
              onSettle={settleOther} onCancelOrder={cancelPending} onLeave={leavePending}
              C={C} isRtl={isRtl}
            />
          )}

          {/* ══════════ حالت ۱: منتظر پرداخت ══════════ */}
          {!isPaid && !locked && (
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
                      {formatMoney(cartTotal)}
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
              <Typography
                sx={{ fontSize: 11, color: C.sub, mb: 1, fontFamily: "'Vazirmatn', sans-serif" }}
              >
                {t("ui_pos2.checkout.manual_note")}
              </Typography>

              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {terminalOffline && (
                  <Typography data-testid="terminal-offline-note" sx={{ fontSize: 12, color: "warning.main", fontWeight: 700, mb: 0.5 }}>
                    {t("sync.offline_terminal")}
                  </Typography>
                )}
                {paymentMethods.map(({ key, icon: Icon, labelFa, labelEn, hint }) => (
                  <Button
                    key={key}
                    data-testid={`pay-${key}`}
                    onClick={() => handlePayment(key)}
                    disabled={busy || (key === "terminal" && terminalOffline)}
                    sx={{
                      bgcolor: selKey === key ? `${C.olive}15` : `${C.olive}08`,
                      color: C.text,
                      borderRadius: "12px",
                      py: 1.5,
                      px: 2,
                      fontSize: 14,
                      fontWeight: 700,
                      border: `1.5px solid ${selKey === key ? C.olive : `${C.olive}30`}`,
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
                    <Box component="span" sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start", textAlign: "start" }}>
                      {isRtl ? labelFa : labelEn}
                      {hint && (
                        <Typography component="span" sx={{ fontSize: 11, fontWeight: 500, color: C.sub, fontFamily: "'Vazirmatn', sans-serif" }}>
                          {hint}
                        </Typography>
                      )}
                    </Box>
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
                  {lastOrder.payment_method && (
                    <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.8, fontFamily: "'Vazirmatn', sans-serif" }}>
                      {t("ui_f.print.method")}: {t(`ui_f.print.method_${lastOrder.payment_method}`, { defaultValue: lastOrder.payment_method })}
                    </Typography>
                  )}
                  {lastOrder.terminal && (
                    <Box sx={{ mt: 0.8 }} data-testid="terminal-receipt-info">
                      <Typography sx={{ fontSize: 12, color: C.olive, fontWeight: 800, fontFamily: "'Vazirmatn', sans-serif" }}>
                        {t("ui_card.checkout.paid")}
                      </Typography>
                      {lastOrder.terminal.trace_number && (
                        <Typography sx={{ fontSize: 12, color: C.sub, fontFamily: "'Vazirmatn', sans-serif" }}>
                          {t("ui_card.print.trace")}: <span dir="ltr">{lastOrder.terminal.trace_number}</span>
                        </Typography>
                      )}
                      {lastOrder.terminal.ref_number && (
                        <Typography sx={{ fontSize: 12, color: C.sub, fontFamily: "'Vazirmatn', sans-serif" }}>
                          {t("ui_card.print.ref")}: <span dir="ltr">{lastOrder.terminal.ref_number}</span>
                        </Typography>
                      )}
                      {lastOrder.terminal.card_masked && (
                        <Typography sx={{ fontSize: 12, color: C.sub, fontFamily: "'Vazirmatn', sans-serif" }}>
                          {t("ui_card.print.card")}: <span dir="ltr">{lastOrder.terminal.card_masked}</span>
                        </Typography>
                      )}
                    </Box>
                  )}
                  {lastOrder.delivery_address && (
                    <Typography sx={{ fontSize: 12, color: C.sub, mt: 0.8, fontFamily: "'Vazirmatn', sans-serif", overflowWrap: "anywhere" }}>
                      {t("ui_f.print.address")}: {lastOrder.delivery_address}
                    </Typography>
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
                  color: "var(--on-primary)",
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
                <KbdHint>Ctrl+D</KbdHint>
              </Button>
            </>
          )}
        </Box>
      </Box>
    </ResponsiveDialog>
  );
}
