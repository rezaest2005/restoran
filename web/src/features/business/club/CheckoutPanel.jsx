import { useEffect, useRef, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Divider, Stack, TextField, Typography,
} from "@mui/material";
import { useRegisteredShortcuts } from "@shared/common/shortcutKit";
import KbdHint from "@shared/common/KbdHint";
import { fmtInt } from "../accounting/common";
import { lookupMember, quotePurchase, createPurchase, errMsg } from "./api";
import TierBadge from "./TierBadge";

const EMPTY = { amount: "", redeem_points: "", coupon_code: "", wallet_amount: "", reference: "", note: "" };

/**
 * Record a purchase for a member — works with no POS (club-only businesses), also for B2B sales.
 * Find by phone or member code; new phones become members. Preview shows discounts and points.
 * Keys: F4 find, Ctrl+D save.
 */
export default function CheckoutPanel({ ctx, onDone }) {
  const { t, C, S, lang, notify } = ctx;
  const [who, setWho] = useState("");
  const [name, setName] = useState("");
  const [member, setMember] = useState(undefined); // undefined = not searched, null = not found
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [rawQuote, setQuote] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);
  const whoRef = useRef(null);
  const n = (v) => fmtInt(v, lang);

  const isCode = /[a-z]/i.test(who.trim());
  const ident = () => (member ? { member_id: member.id } : isCode ? { code: who.trim() } : { phone: who.trim(), name: name.trim() });

  const find = async () => {
    if (!who.trim()) return;
    setError("");
    try {
      const d = await lookupMember(isCode ? { code: who.trim() } : { phone: who.trim() });
      setMember(d.member);
      setCfg(d.settings);
    } catch (e) {
      setError(errMsg(e, t("ui_club.err.generic")));
    }
  };

  // live preview (debounced)
  useEffect(() => {
    if (!form.amount || member === undefined) return undefined;
    const id = setTimeout(() => {
      quotePurchase({ ...ident(), amount: form.amount, redeem_points: form.redeem_points || 0,
        coupon_code: form.coupon_code, wallet_amount: form.wallet_amount || 0 })
        .then((q) => { setQuote(q); setError(""); })
        .catch((e) => { setQuote(null); setError(errMsg(e, t("ui_club.err.generic"))); });
    }, 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.amount, form.redeem_points, form.coupon_code, form.wallet_amount, member]);

  const quote = form.amount && member !== undefined ? rawQuote : null;

  const reset = () => {
    setWho(""); setName(""); setMember(undefined); setForm(EMPTY); setQuote(null); setError("");
    whoRef.current?.focus();
  };

  const save = async () => {
    if (busy || !form.amount || member === undefined) return;
    setBusy(true);
    setError("");
    try {
      const p = await createPurchase({ ...ident(), ...form, redeem_points: form.redeem_points || 0,
        wallet_amount: form.wallet_amount || 0 });
      setLast(p);
      notify(t("ui_club2.co.saved", { points: p.points_earned }));
      reset();
      onDone?.();
    } catch (e) {
      setError(errMsg(e, t("ui_club.err.generic")));
    } finally {
      setBusy(false);
    }
  };

  useRegisteredShortcuts([
    { combo: "F4", label: t("ui_club2.co.find"), handler: () => whoRef.current?.focus() },
    { combo: "Ctrl+D", label: t("ui_club2.co.save"), handler: save },
  ]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const num = { htmlInput: { dir: "ltr", inputMode: "numeric" } };

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0, 3fr) minmax(0, 2fr)" }, gap: 2 }}>
      <Box sx={S.card}>
        <Typography sx={{ color: C.text, fontWeight: 800, mb: 0.5 }}>{t("ui_club2.co.title")}</Typography>
        <Typography sx={{ color: C.muted, fontSize: 12, mb: 1.5 }}>{t("ui_club2.co.hint")}</Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <TextField inputRef={whoRef} autoFocus size="small" label={t("ui_club2.co.who")} value={who} sx={{ ...S.field, flex: 1 }}
            onChange={(e) => { setWho(e.target.value); setMember(undefined); setQuote(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); find(); } }}
            slotProps={{ htmlInput: { dir: "ltr" } }} />
          <Button variant="outlined" sx={S.ghost} onClick={find}>{t("ui_club2.co.find")}<KbdHint>F4</KbdHint></Button>
        </Stack>

        {member === null && (
          <Box sx={{ mt: 1.5 }}>
            {isCode ? <Alert severity="warning">{t("ui_club2.co.not_found_code")}</Alert> : (
              <>
                <Alert severity="info" sx={{ mb: 1.5 }}>{t("ui_club2.co.not_found")}</Alert>
                <TextField size="small" label={t("ui_club.member.name")} value={name} sx={{ ...S.field, width: "100%" }}
                  onChange={(e) => setName(e.target.value)} />
              </>
            )}
          </Box>
        )}
        {member && (
          <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 2, border: `1px solid ${C.glassBorder}`, bgcolor: C.inputBg }}>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
              <Typography sx={{ color: C.text, fontWeight: 800 }}>{member.name || "—"}</Typography>
              <TierBadge tier={member.tier} C={C} />
              <Chip size="small" label={t(`ui_club2.seg.${member.segment}`)} variant="outlined" sx={{ color: C.sub }} />
            </Box>
            <Typography sx={{ color: C.sub, fontSize: 13, mt: 0.5 }}>
              {t("ui_club2.points")}: <b>{n(member.points_balance)}</b> ({t("ui_club2.co.worth")} {n(member.max_discount)})
              {cfg?.wallet_enabled && <> · {t("ui_club2.wallet")}: <b>{n(member.wallet_balance)}</b></>}
            </Typography>
            {member.coupons?.length > 0 && (
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 1 }}>
                {member.coupons.map((c) => (
                  <Chip key={c.id} size="small" clickable label={`${c.code} — ${c.title || c.value}`} dir="ltr"
                    onClick={() => setForm((f) => ({ ...f, coupon_code: c.code }))} />
                ))}
              </Box>
            )}
          </Box>
        )}

        {member !== undefined && !(member === null && isCode) && (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5, mt: 2 }}>
            <TextField size="small" label={t("ui_club2.co.amount")} value={form.amount} onChange={set("amount")} sx={S.field} slotProps={num} />
            <TextField size="small" label={t("ui_club2.co.coupon")} value={form.coupon_code} onChange={set("coupon_code")} sx={S.field}
              slotProps={{ htmlInput: { dir: "ltr" } }} />
            {member && (
              <TextField size="small" label={t("ui_club2.co.redeem")} value={form.redeem_points} onChange={set("redeem_points")}
                sx={S.field} slotProps={num}
                helperText={cfg ? t("ui_club2.co.redeem_hint", { min: n(cfg.min_redeem_points), pct: n(cfg.redeem_max_percent) }) : ""} />
            )}
            {member && cfg?.wallet_enabled && (
              <TextField size="small" label={t("ui_club2.co.wallet")} value={form.wallet_amount} onChange={set("wallet_amount")}
                sx={S.field} slotProps={num} />
            )}
            <TextField size="small" label={t("ui_club2.co.reference")} value={form.reference} onChange={set("reference")} sx={S.field} />
            <TextField size="small" label={t("ui_club.adjust.note")} value={form.note} onChange={set("note")} sx={S.field} />
          </Box>
        )}
        {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
      </Box>

      <Box sx={S.card}>
        <Typography sx={{ color: C.text, fontWeight: 800, mb: 1 }}>{t("ui_club2.co.summary")}</Typography>
        {!quote ? <Typography sx={{ color: C.muted }}>{t("ui_club2.co.summary_empty")}</Typography> : (
          <Stack spacing={0.75}>
            {[["amount", quote.amount], ["coupon_discount", -quote.coupon_discount], ["points_discount", -quote.points_discount],
              ["wallet_used", -quote.wallet_used]].filter(([, v]) => v).map(([k, v]) => (
              <Box key={k} sx={{ display: "flex", justifyContent: "space-between", color: C.sub }}>
                <span>{t(`ui_club2.co.${k}`)}</span><span dir="ltr">{n(v)}</span>
              </Box>
            ))}
            <Divider />
            <Box sx={{ display: "flex", justifyContent: "space-between", color: C.text, fontWeight: 800, fontSize: 18 }}>
              <span>{t("ui_club2.co.to_pay")}</span><span>{n(quote.to_pay)}</span>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", color: C.success, fontWeight: 700 }}>
              <span>{t("ui_club2.co.earn")}</span><span>+{n(quote.points_earned)}</span>
            </Box>
            {quote.breakdown.length > 1 && (
              <Typography sx={{ color: C.muted, fontSize: 12 }}>
                {quote.breakdown.map((b) => `${["base", "visit", "tier"].includes(b.label) ? t(`ui_club2.co.b_${b.label}`) : b.label} +${n(b.points)}`).join(" · ")}
              </Typography>
            )}
          </Stack>
        )}
        <Box sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap" }}>
          <Button sx={S.btn} onClick={save} disabled={busy || !quote}>
            {busy ? <CircularProgress size={18} color="inherit" /> : <>{t("ui_club2.co.save")}<KbdHint>Ctrl+D</KbdHint></>}
          </Button>
          <Button variant="outlined" sx={S.ghost} onClick={reset}>{t("ui_club2.co.clear")}</Button>
        </Box>
        {last && (
          <Alert severity="success" sx={{ mt: 2 }}>
            {t("ui_club2.co.last", { name: last.member?.name || last.member?.phone, points: n(last.points_earned),
              balance: n(last.member?.points_balance), code: last.member?.code })}
          </Alert>
        )}
      </Box>
    </Box>
  );
}
