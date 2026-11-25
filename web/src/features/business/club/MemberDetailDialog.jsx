import { useCallback, useEffect, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  Stack, Switch, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography,
} from "@mui/material";
import { useRegisteredShortcuts, dialogBindings } from "@shared/common/shortcutKit";
import { TableWrap, fmtInt, fmtDate } from "../accounting/common";
import {
  fetchMember, adjustMember, updateMember, walletMember, redeemReward, voidPurchase, crud, errMsg,
} from "./api";
import TierBadge from "./TierBadge";

function Rows({ C, S, cols, rows, empty, t }) {
  if (!rows.length) return <Typography sx={{ color: C.muted, py: 1 }}>{t(empty)}</Typography>;
  return (
    <TableWrap C={C}>
      <Table size="small" sx={{ minWidth: 420 }}>
        <TableHead><TableRow>
          {cols.map((c) => <TableCell key={c.k} sx={c.num ? S.thNum : S.th}>{t(c.label)}</TableCell>)}
        </TableRow></TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} sx={{ opacity: r.is_void ? 0.5 : 1 }}>
              {cols.map((c) => <TableCell key={c.k} sx={c.num ? S.tdNum : S.td}>{c.render(r)}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableWrap>
  );
}

/** Member file: balances, profile, points adjustment, wallet, rewards, purchases, coupons and history. */
export default function MemberDetailDialog({ ctx, id, onClose, onChanged }) {
  const { t, C, S, lang, fullScreen, notify } = ctx;
  const [m, setM] = useState(null);
  const [tab, setTab] = useState("points");
  const [points, setPoints] = useState("");
  const [note, setNote] = useState("");
  const [wallet, setWallet] = useState("");
  const [profile, setProfile] = useState(null);
  const [rewards, setRewards] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const n = (v) => fmtInt(v, lang);

  const load = useCallback(() => {
    fetchMember(id).then((d) => {
      setM(d);
      setProfile({ name: d.name, phone: d.phone, email: d.email, birth_date: d.birth_date || "",
        anniversary_date: d.anniversary_date || "", note: d.note, tags: (d.tags || []).join(", "),
        sms_opt_in: d.sms_opt_in, is_active: d.is_active });
    }).catch((e) => setLoadError(errMsg(e, t("ui_club.err.generic"))));
  }, [id, t]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { crud("rewards").list().then((d) => setRewards((d || []).filter((r) => r.is_active))).catch(() => {}); }, []);

  const act = async (fn, okMsg) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fn();
      if (okMsg) notify(typeof okMsg === "function" ? okMsg(r) : okMsg);
      load();
      onChanged();
    } catch (e) {
      setError(errMsg(e, t("ui_club.err.generic")));
    } finally {
      setBusy(false);
    }
  };

  const adjust = () => {
    const delta = parseInt(String(points).replace(/[+\s]/g, ""), 10);
    if (!Number.isFinite(delta) || delta === 0) { setError(t("ui_club.err.points_invalid")); return; }
    act(() => adjustMember(id, delta, note.trim()).then(() => { setPoints(""); setNote(""); }), t("ui_club2.saved"));
  };
  const topup = () => {
    const amount = parseInt(String(wallet).replace(/[,\s]/g, ""), 10);
    if (!Number.isFinite(amount) || amount === 0) { setError(t("ui_club2.md.amount_invalid")); return; }
    act(() => walletMember(id, amount, note.trim(), amount > 0 ? "topup" : "adjust").then(() => setWallet("")), t("ui_club2.saved"));
  };
  const saveProfile = () => act(() => updateMember(id, {
    ...profile, birth_date: profile.birth_date || null, anniversary_date: profile.anniversary_date || null,
    tags: profile.tags.split(",").map((s) => s.trim()).filter(Boolean),
  }), t("ui_club2.saved"));

  const confirm = () => {
    if (tab === "points") adjust();
    else if (tab === "wallet") topup();
    else if (tab === "profile") saveProfile();
  };
  useRegisteredShortcuts(
    dialogBindings(t, { onConfirm: confirm, onClose: () => !busy && onClose(), confirmLabel: t("ui_club2.save") }),
    { enabled: true },
  );

  const setP = (k) => (e) => setProfile((p) => ({ ...p, [k]: e.target.value }));
  const tabs = ["points", "rewards", "purchases", "wallet", "coupons", "profile"];

  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} maxWidth="md" fullWidth slotProps={{ paper: { sx: S.dialogPaper } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{t("ui_club.member.detail")}</DialogTitle>
      <DialogContent>
        {loadError && <Alert severity="error">{loadError}</Alert>}
        {!m && !loadError && <Box sx={{ textAlign: "center", py: 3 }}><CircularProgress size={26} /></Box>}
        {m && (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
              <Typography sx={{ fontWeight: 800, color: C.text }}>{m.name || "—"}</Typography>
              <Typography dir="ltr" sx={{ color: C.sub }}>{m.phone}</Typography>
              <TierBadge tier={m.tier} C={C} />
              <Chip size="small" variant="outlined" sx={{ color: C.sub }} label={t(`ui_club2.seg.${m.segment}`)} />
              {m.rfm && <Chip size="small" variant="outlined" sx={{ color: C.sub }} dir="ltr"
                label={`RFM ${m.rfm.score} · ${t(`ui_club2.rfm.${m.rfm.segment}`)}`} />}
              <Chip size="small" sx={{ fontWeight: 700 }} dir="ltr" label={`${t("ui_club2.md.code")}: ${m.code}`} />
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(5, 1fr)" }, gap: 1.5 }}>
              {[["ui_club.member.points", m.points_balance], ["ui_club.member.lifetime", m.lifetime_points],
                ["ui_club2.wallet", m.wallet_balance], ["ui_club2.md.spent", m.total_spent], ["ui_club2.visits", m.visits]].map(([k, v]) => (
                <Box key={k}>
                  <Typography sx={{ color: C.muted, fontSize: 12 }}>{t(k)}</Typography>
                  <Typography sx={{ color: C.text, fontWeight: 800, fontSize: 18 }}>{n(v)}</Typography>
                </Box>
              ))}
            </Box>
            {m.expiring_30d > 0 && <Alert severity="warning">{t("ui_club2.md.expiring", { n: n(m.expiring_30d) })}</Alert>}
            {m.referred_by && <Typography sx={{ color: C.sub, fontSize: 13 }}>
              {t("ui_club2.md.referred_by", { name: m.referred_by.name || m.referred_by.code })}</Typography>}
            {m.referrals > 0 && <Typography sx={{ color: C.sub, fontSize: 13 }}>{t("ui_club2.md.referrals", { n: n(m.referrals) })}</Typography>}

            <Tabs value={tab} onChange={(_, v) => { setTab(v); setError(""); }} variant="scrollable" scrollButtons="auto"
              sx={{ minHeight: 36, "& .MuiTab-root": { textTransform: "none", minHeight: 36, color: C.sub }, "& .Mui-selected": { color: `${C.primary} !important` } }}>
              {tabs.map((k) => <Tab key={k} value={k} label={t(`ui_club2.md.tab_${k}`)} />)}
            </Tabs>
            {error && <Alert severity="error">{error}</Alert>}

            {tab === "points" && (
              <>
                <Box sx={{ ...S.card, p: 1.5 }}>
                  <Typography sx={{ color: C.text, fontWeight: 700, mb: 1 }}>{t("ui_club.adjust.title")}</Typography>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                    <TextField size="small" label={t("ui_club.adjust.points")} value={points} sx={{ ...S.field, width: { sm: 160 } }} onChange={(e) => setPoints(e.target.value)}
                      slotProps={{ htmlInput: { dir: "ltr", inputMode: "numeric" } }} />
                    <TextField size="small" label={t("ui_club.adjust.note")} value={note} sx={{ ...S.field, flex: 1 }}
                      onChange={(e) => setNote(e.target.value)} />
                  </Stack>
                  <Button sx={{ ...S.btn, mt: 1.5 }} onClick={adjust} disabled={busy}>
                    {t("ui_club.adjust.apply")}
                  </Button>
                </Box>
                <Rows C={C} S={S} t={t} rows={m.transactions} empty="ui_club.history.empty" cols={[
                  { k: "d", label: "ui_club.history.date", render: (x) => fmtDate(x.created_at, lang) },
                  { k: "k", label: "ui_club.history.kind", render: (x) => x.kind_display || x.kind },
                  { k: "p", label: "ui_club.history.points", num: true, render: (x) => (
                    <span dir="ltr" style={{ color: x.points < 0 ? C.danger : C.success, fontWeight: 700 }}>
                      {x.points > 0 ? "+" : ""}{n(x.points)}</span>) },
                  { k: "e", label: "ui_club2.md.expires", render: (x) => (x.expires_at ? fmtDate(x.expires_at, lang) : "—") },
                  { k: "n", label: "ui_club.history.note", render: (x) => x.note || "—" },
                ]} />
              </>
            )}

            {tab === "rewards" && (
              rewards.length === 0 ? <Typography sx={{ color: C.muted }}>{t("ui_club2.md.no_rewards")}</Typography> : (
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
                  {rewards.map((r) => (
                    <Box key={r.id} sx={{ ...S.card, p: 1.5 }}>
                      <Typography sx={{ color: C.text, fontWeight: 700 }}>{r.name}</Typography>
                      <Typography sx={{ color: C.muted, fontSize: 12, minHeight: 18 }}>{r.description}</Typography>
                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 1 }}>
                        <Typography sx={{ color: C.primary, fontWeight: 800 }}>{n(r.points_cost)} {t("ui_club2.points")}</Typography>
                        <Button size="small" sx={S.btn} disabled={busy || m.points_balance < r.points_cost}
                          onClick={() => act(() => redeemReward(id, r.id), (c) => t("ui_club2.md.reward_code", { code: c.code }))}>
                          {t("ui_club2.md.redeem")}
                        </Button>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )
            )}

            {tab === "purchases" && (
              <Rows C={C} S={S} t={t} rows={m.purchases} empty="ui_club2.none" cols={[
                { k: "d", label: "ui_club.history.date", render: (x) => fmtDate(x.created_at, lang) },
                { k: "c", label: "ui_club2.md.channel", render: (x) => x.channel_display },
                { k: "a", label: "ui_club2.co.amount", num: true, render: (x) => n(x.amount) },
                { k: "net", label: "ui_club2.md.net", num: true, render: (x) => n(x.net_amount) },
                { k: "p", label: "ui_club.history.points", num: true, render: (x) => `+${n(x.points_earned)}${x.points_redeemed ? ` / -${n(x.points_redeemed)}` : ""}` },
                { k: "v", label: "", render: (x) => (x.is_void ? t("ui_club2.md.void") : (
                  <Button size="small" sx={{ ...S.link, color: C.danger }} disabled={busy}
                    onClick={() => window.confirm(t("ui_club2.md.void_confirm")) && act(() => voidPurchase(x.id), t("ui_club2.md.voided"))}>
                    {t("ui_club2.md.void_btn")}</Button>)) },
              ]} />
            )}

            {tab === "wallet" && (
              <>
                <Box sx={{ ...S.card, p: 1.5 }}>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                    <TextField size="small" label={t("ui_club2.md.wallet_amount")} value={wallet} sx={{ ...S.field, width: { sm: 180 } }} onChange={(e) => setWallet(e.target.value)}
                      slotProps={{ htmlInput: { dir: "ltr", inputMode: "numeric" } }} />
                    <TextField size="small" label={t("ui_club.adjust.note")} value={note} sx={{ ...S.field, flex: 1 }}
                      onChange={(e) => setNote(e.target.value)} />
                  </Stack>
                  <Button sx={{ ...S.btn, mt: 1.5 }} onClick={topup} disabled={busy}>{t("ui_club2.md.wallet_apply")}</Button>
                </Box>
                <Rows C={C} S={S} t={t} rows={m.wallet} empty="ui_club2.none" cols={[
                  { k: "d", label: "ui_club.history.date", render: (x) => fmtDate(x.created_at, lang) },
                  { k: "k", label: "ui_club.history.kind", render: (x) => x.kind_display },
                  { k: "a", label: "ui_club2.co.amount", num: true, render: (x) => <span dir="ltr">{n(x.amount)}</span> },
                  { k: "b", label: "ui_club2.md.balance", num: true, render: (x) => n(x.balance_after) },
                ]} />
              </>
            )}

            {tab === "coupons" && (
              <Rows C={C} S={S} t={t} rows={m.coupons} empty="ui_club2.none" cols={[
                { k: "c", label: "ui_club2.coupon.code", render: (x) => <span dir="ltr" style={{ fontWeight: 700 }}>{x.code}</span> },
                { k: "t", label: "ui_club2.coupon.title", render: (x) => x.title || t(`ui_club2.kind.${x.kind}`) },
                { k: "u", label: "ui_club2.coupon.used", num: true, render: (x) => `${x.used_count}/${x.usage_limit ?? "∞"}` },
                { k: "e", label: "ui_club2.coupon.ends_at", render: (x) => (x.ends_at ? fmtDate(x.ends_at, lang) : "—") },
              ]} />
            )}

            {tab === "profile" && profile && (
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
                <TextField size="small" label={t("ui_club.member.name")} value={profile.name} onChange={setP("name")} sx={S.field} />
                <TextField size="small" label={t("ui_club.member.phone")} value={profile.phone} onChange={setP("phone")} sx={S.field}
                  slotProps={{ htmlInput: { dir: "ltr" } }} />
                <TextField size="small" label={t("ui_club2.md.email")} value={profile.email} onChange={setP("email")} sx={S.field}
                  slotProps={{ htmlInput: { dir: "ltr" } }} />
                <TextField size="small" label={t("ui_club2.md.tags")} value={profile.tags} onChange={setP("tags")} sx={S.field} />
                <TextField size="small" type="date" label={t("ui_club2.md.birth_date")} value={profile.birth_date}
                  onChange={setP("birth_date")} sx={S.field} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField size="small" type="date" label={t("ui_club2.md.anniversary_date")} value={profile.anniversary_date}
                  onChange={setP("anniversary_date")} sx={S.field} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField size="small" label={t("ui_club.adjust.note")} value={profile.note} onChange={setP("note")} sx={{ ...S.field, gridColumn: { sm: "1 / -1" } }} multiline minRows={2} />
                <FormControlLabel control={<Switch checked={!!profile.sms_opt_in} onChange={(e) => setProfile((p) => ({ ...p, sms_opt_in: e.target.checked }))} />}
                  label={<Typography sx={{ color: C.text }}>{t("ui_club2.md.sms_opt_in")}</Typography>} />
                <FormControlLabel control={<Switch checked={!!profile.is_active} onChange={(e) => setProfile((p) => ({ ...p, is_active: e.target.checked }))} />}
                  label={<Typography sx={{ color: C.text }}>{t("ui_club2.active")}</Typography>} />
                <Box><Button sx={S.btn} onClick={saveProfile} disabled={busy}>{t("ui_club2.save")}</Button></Box>
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="outlined" sx={S.ghost} onClick={onClose}>{t("ui_club.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}
