import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Alert, Box, Button, Chip, CircularProgress, IconButton, Tab, Tabs, TextField, Typography } from "@mui/material";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import { buildColors } from "@shared/palette";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";

const fmt = (v, lang) => Number(v || 0).toLocaleString(lang === "fa" ? "fa-IR" : "en-US");

async function post(url, body) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: j.data, message: j.message || j.error };
}

/** Public member page for one business: /club/:slug — check points with phone + member code, or join. */
export default function ClubPublicPage() {
  const { slug } = useParams();
  const { t } = useTranslation();
  const { mode, toggleTheme } = useThemeMode();
  const { lang, isRtl, toggleLang } = useLang();
  const C = useMemo(() => buildColors(mode === "dark"), [mode]);
  const [info, setInfo] = useState(undefined);
  const [tab, setTab] = useState("check");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [ref, setRef] = useState(() => new URLSearchParams(window.location.search).get("ref") || "");
  const [website, setWebsite] = useState("");
  const [me, setMe] = useState(null);
  const [msg, setMsg] = useState({ sev: "", text: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/public/club/${encodeURIComponent(slug)}/`).then((r) => (r.ok ? r.json() : null))
      .then((j) => { setInfo(j?.data || null); if (j?.data?.business) document.title = j.data.business; })
      .catch(() => setInfo(null));
  }, [slug]);

  const errText = (r) => (r.status === 429 ? t("ui_club2.pub.err_rate") : r.message || t("ui_club2.pub.err_generic"));

  const check = async (e) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true); setMsg({ sev: "", text: "" }); setMe(null);
    try {
      const r = await post(`/api/public/club/${encodeURIComponent(slug)}/lookup/`, { phone: phone.trim(), code: code.trim() });
      if (r.ok) setMe(r.data); else setMsg({ sev: "error", text: errText(r) });
    } catch { setMsg({ sev: "error", text: t("ui_club2.pub.err_generic") }); } finally { setBusy(false); }
  };
  const join = async (e) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true); setMsg({ sev: "", text: "" });
    try {
      const r = await post(`/api/public/club/${encodeURIComponent(slug)}/join/`,
        { name: name.trim(), phone: phone.trim(), referral_code: ref.trim(), website });
      setMsg(r.ok ? { sev: "success", text: t("ui_club2.pub.joined") } : { sev: "error", text: errText(r) });
    } catch { setMsg({ sev: "error", text: t("ui_club2.pub.err_generic") }); } finally { setBusy(false); }
  };

  const field = {
    "& .MuiOutlinedInput-root": { background: C.inputBg, borderRadius: 2, color: C.text },
    "& .MuiOutlinedInput-notchedOutline": { borderColor: C.glassBorder },
    "& .MuiInputLabel-root": { color: C.sub },
  };
  const iconBtn = { width: 40, height: 40, color: C.text, border: `1px solid ${C.glassBorder}`, borderRadius: 2 };
  const btn = { background: C.btnGrad, color: C.onPrimary, fontWeight: 700, borderRadius: 2, textTransform: "none", minHeight: 44 };
  const card = { bgcolor: C.glass, border: `1px solid ${C.glassBorder}`, borderRadius: 3, p: { xs: 2, sm: 3 }, boxShadow: C.cardShadow };

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ minHeight: "100vh", bgcolor: C.bg, color: C.text, px: 2, py: 3 }}>
      <Box sx={{ maxWidth: 520, mx: "auto" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 20, flex: 1, minWidth: 0 }} noWrap>
            {info?.business || t("ui_club2.pub.title")}
          </Typography>
          <Button onClick={toggleLang} sx={{ ...iconBtn, minWidth: 40, textTransform: "none" }}>{lang === "fa" ? "EN" : "فا"}</Button>
          <IconButton onClick={toggleTheme} sx={iconBtn} aria-label="theme">
            {mode === "dark" ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
          </IconButton>
        </Box>

        {info === undefined && <Box sx={{ textAlign: "center", py: 6 }}><CircularProgress /></Box>}
        {info === null && <Alert severity="warning">{t("ui_club2.pub.not_found")}</Alert>}
        {info && (
          <>
            <Box sx={{ ...card, mb: 2 }}>
              <Typography sx={{ color: C.sub, fontSize: 14 }}>
                {t("ui_club2.pub.how", { amount: fmt(info.earn_amount, lang), value: fmt(info.redeem_value, lang) })}
              </Typography>
              {info.welcome_points > 0 && <Typography sx={{ color: C.sub, fontSize: 14 }}>{t("ui_club2.pub.welcome", { n: fmt(info.welcome_points, lang) })}</Typography>}
              {info.tiers.length > 0 && (
                <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mt: 1 }}>
                  {info.tiers.map((x) => <Chip key={x.name} size="small" label={x.name}
                    sx={{ color: x.color || C.primary, border: `1px solid ${x.color || C.primary}`, bgcolor: "transparent" }} />)}
                </Box>
              )}
            </Box>

            <Box sx={card}>
              <Tabs value={tab} onChange={(_, v) => { setTab(v); setMsg({ sev: "", text: "" }); }} variant="fullWidth"
                sx={{ mb: 2, "& .MuiTab-root": { color: C.sub, textTransform: "none", fontWeight: 700 }, "& .Mui-selected": { color: `${C.primary} !important` } }}>
                <Tab value="check" label={t("ui_club2.pub.tab_check")} />
                <Tab value="join" label={t("ui_club2.pub.tab_join")} />
              </Tabs>
              <Box component="form" onSubmit={tab === "check" ? check : join} sx={{ display: "grid", gap: 2 }}>
                {tab === "join" && <TextField label={t("ui_club.member.name")} value={name} onChange={(e) => setName(e.target.value)} sx={field} required />}
                <TextField label={t("ui_club.member.phone")} value={phone} onChange={(e) => setPhone(e.target.value)} sx={field} required
                  slotProps={{ htmlInput: { dir: "ltr", inputMode: "tel", autoComplete: "tel" } }} />
                {tab === "check" && <TextField label={t("ui_club2.md.code")} value={code} onChange={(e) => setCode(e.target.value)} sx={field} required slotProps={{ htmlInput: { dir: "ltr", autoCapitalize: "characters" } }} />}
                {tab === "join" && <TextField label={t("ui_club2.md.referral_code")} value={ref} onChange={(e) => setRef(e.target.value)} sx={field}
                  slotProps={{ htmlInput: { dir: "ltr" } }} />}
                <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)}
                  style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} aria-hidden="true" />
                <Button type="submit" sx={btn} disabled={busy}>
                  {busy ? <CircularProgress size={20} color="inherit" /> : tab === "check" ? t("ui_club2.pub.check") : t("ui_club2.pub.join")}
                </Button>
                {msg.text && <Alert severity={msg.sev}>{msg.text}</Alert>}
              </Box>

              {me && tab === "check" && (
                <Box sx={{ mt: 2.5, p: 2, borderRadius: 2, bgcolor: C.inputBg, border: `1px solid ${C.glassBorder}` }}>
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                    <Typography sx={{ fontWeight: 800 }}>{me.name || "—"}</Typography>
                    {me.tier && <Chip size="small" label={me.tier.name} sx={{ color: me.tier.color || C.primary, border: `1px solid ${me.tier.color || C.primary}`, bgcolor: "transparent" }} />}
                  </Box>
                  <Typography sx={{ fontSize: 36, fontWeight: 900, color: C.primary, lineHeight: 1.3 }}>{fmt(me.points, lang)}</Typography>
                  <Typography sx={{ color: C.sub }}>{t("ui_club2.pub.points_worth", { v: fmt(me.value, lang) })}</Typography>
                  {me.wallet != null && <Typography sx={{ color: C.sub }}>{t("ui_club2.wallet")}: {fmt(me.wallet, lang)}</Typography>}
                  {me.next_tier && <Typography sx={{ color: C.sub, fontSize: 13 }}>{t("ui_club2.pub.next_tier", { name: me.next_tier.name, n: fmt(me.next_tier.min_value, lang) })}</Typography>}
                  {me.expiring_30d > 0 && <Alert severity="warning" sx={{ mt: 1 }}>{t("ui_club2.md.expiring", { n: fmt(me.expiring_30d, lang) })}</Alert>}
                  {me.coupons.length > 0 && (
                    <Box sx={{ mt: 1.5 }}>
                      <Typography sx={{ fontWeight: 700, mb: 0.5 }}>{t("ui_club2.pub.your_coupons")}</Typography>
                      {me.coupons.map((c) => (
                        <Typography key={c.code} sx={{ color: C.sub, fontSize: 14 }}><b dir="ltr">{c.code}</b> — {c.title}</Typography>
                      ))}
                    </Box>
                  )}
                  <Typography sx={{ color: C.sub, fontSize: 13, mt: 1.5 }}>
                    {t("ui_club2.pub.invite", { code: me.referral_code })}
                    {info.referrer_points > 0 ? ` ${t("ui_club2.pub.invite_bonus", { n: fmt(info.referrer_points, lang) })}` : ""}
                  </Typography>
                </Box>
              )}
            </Box>

            {info.rewards.length > 0 && (
              <Box sx={{ ...card, mt: 2 }}>
                <Typography sx={{ fontWeight: 800, mb: 1 }}>{t("ui_club2.reward.title")}</Typography>
                {info.rewards.map((r) => (
                  <Box key={r.id} sx={{ display: "flex", justifyContent: "space-between", gap: 1, py: 0.75, borderBottom: `1px solid ${C.divider}` }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600 }}>{r.name}</Typography>
                      {r.description && <Typography sx={{ color: C.muted, fontSize: 12 }}>{r.description}</Typography>}
                    </Box>
                    <Typography sx={{ color: C.primary, fontWeight: 800, whiteSpace: "nowrap" }}>{fmt(r.points_cost, lang)}</Typography>
                  </Box>
                ))}
              </Box>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
