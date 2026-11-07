import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Alert, Box, Button, CircularProgress, IconButton, MenuItem, TextField, Typography,
} from "@mui/material";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import { buildColors } from "@shared/palette";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import { appName } from "@shared/branding";

const MAX = 2000;
const CATS = ["complaint", "bug", "suggestion", "other"];

/** Public feedback form for one business: /f/:slug (no sign-in, no internal data). */
export default function FeedbackPublicPage() {
  const { slug } = useParams();
  const { t } = useTranslation();
  const { mode, toggleTheme } = useThemeMode();
  const { lang, isRtl, toggleLang } = useLang();
  const isDark = mode === "dark";
  const C = useMemo(() => buildColors(isDark), [isDark]);

  const [category, setCategory] = useState("complaint");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot, hidden from people
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => { document.title = appName(lang); }, [lang]);

  const submit = async (e) => {
    e?.preventDefault();
    if (busy) return;
    const text = message.trim();
    if (!text) { setError(t("ui_fb.pub.err_empty")); return; }
    if (text.length > MAX) { setError(t("ui_fb.pub.err_long")); return; }
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/feedback/submit/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_slug: slug, category, name: name.trim(), phone: phone.trim(), message: text, website,
        }),
      });
      if (r.ok) { setDone(true); setMessage(""); return; }
      if (r.status === 429) setError(t("ui_fb.pub.err_rate"));
      else if (r.status === 404) setError(t("ui_fb.pub.err_notfound"));
      else setError(t("ui_fb.pub.err_generic"));
    } catch {
      setError(t("ui_fb.pub.err_generic"));
    } finally {
      setBusy(false);
    }
  };

  const field = {
    "& .MuiOutlinedInput-root": { background: C.inputBg, borderRadius: 2, color: C.text },
    "& .MuiOutlinedInput-notchedOutline": { borderColor: C.glassBorder },
    "& .MuiInputLabel-root": { color: C.sub },
  };
  const iconBtn = { width: 40, height: 40, color: C.text, border: `1px solid ${C.glassBorder}`, borderRadius: 2 };

  return (
    <Box dir={isRtl ? "rtl" : "ltr"} sx={{ minHeight: "100vh", background: C.bg, backgroundImage: C.bgWarm, color: C.text, px: 2, py: 2 }}>
      <Box sx={{ maxWidth: 520, mx: "auto" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <Typography noWrap sx={{ flex: 1, fontWeight: 800, fontSize: 16, color: C.sub }}>{appName(lang)}</Typography>
          <Button aria-label={t("ui_fb.pub.toggle_lang")} onClick={toggleLang} sx={{ ...iconBtn, minWidth: 40, fontWeight: 700 }}>
            {isRtl ? "EN" : "فا"}
          </Button>
          <IconButton aria-label={t("ui_fb.pub.toggle_theme")} onClick={toggleTheme} sx={iconBtn}>
            {isDark ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
          </IconButton>
        </Box>

        <Box sx={{ bgcolor: C.glass, border: `1px solid ${C.glassBorder}`, borderRadius: 3, boxShadow: C.cardShadow, p: { xs: 2, sm: 3 } }}>
          {done ? (
            <Box sx={{ textAlign: "center", py: 3 }}>
              <CheckCircleOutlineIcon sx={{ fontSize: 56, color: C.success }} />
              <Typography sx={{ fontWeight: 800, fontSize: 20, mt: 1 }}>{t("ui_fb.pub.ok_title")}</Typography>
              <Typography sx={{ color: C.sub, mt: 1, mb: 3 }}>{t("ui_fb.pub.ok_text")}</Typography>
              <Button onClick={() => setDone(false)}
                sx={{ background: C.btnGrad, color: C.onPrimary, fontWeight: 700, borderRadius: 2, textTransform: "none", minHeight: 44, px: 3 }}>
                {t("ui_fb.pub.again")}
              </Button>
            </Box>
          ) : (
            <Box component="form" onSubmit={submit} noValidate sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: 20 }}>{t("ui_fb.pub.title")}</Typography>
                <Typography sx={{ color: C.sub, fontSize: 14, mt: 0.5 }}>{t("ui_fb.pub.subtitle")}</Typography>
              </Box>
              <TextField select fullWidth size="small" label={t("ui_fb.pub.category")} value={category}
                onChange={(e) => setCategory(e.target.value)} sx={field}>
                {CATS.map((c) => <MenuItem key={c} value={c}>{t(`ui_fb.cat.${c}`)}</MenuItem>)}
              </TextField>
              <TextField fullWidth size="small" label={t("ui_fb.pub.name")} value={name}
                onChange={(e) => setName(e.target.value)} sx={field} slotProps={{ htmlInput: { maxLength: 100, autoComplete: "name" } }} />
              <TextField fullWidth size="small" label={t("ui_fb.pub.phone")} value={phone}
                onChange={(e) => setPhone(e.target.value)} sx={field}
                slotProps={{ htmlInput: { maxLength: 20, dir: "ltr", inputMode: "tel", autoComplete: "tel" } }} />
              <TextField fullWidth multiline minRows={4} maxRows={10} label={t("ui_fb.pub.message")} value={message}
                onChange={(e) => setMessage(e.target.value)} sx={field}
                helperText={`${message.length} / ${MAX}`}
                slotProps={{ htmlInput: { maxLength: MAX }, formHelperText: { sx: { color: C.muted, textAlign: "end" } } }} />
              {/* honeypot: off-screen, not focusable, ignored by assistive tech */}
              <Box aria-hidden="true" sx={{ position: "absolute", insetInlineStart: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
                <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website}
                  onChange={(e) => setWebsite(e.target.value)} />
              </Box>
              {error && <Alert severity="error">{error}</Alert>}
              <Button type="submit" disabled={busy}
                sx={{ background: C.btnGrad, color: C.onPrimary, fontWeight: 700, borderRadius: 2, textTransform: "none", minHeight: 48,
                  "&:hover": { background: C.btnGrad, opacity: 0.92 }, "&.Mui-disabled": { opacity: 0.5, color: C.onPrimary } }}>
                {busy ? <CircularProgress size={20} color="inherit" /> : t("ui_fb.pub.send")}
              </Button>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
