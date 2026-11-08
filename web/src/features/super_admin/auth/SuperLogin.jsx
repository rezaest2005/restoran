import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  Alert,
  InputAdornment,
  CircularProgress,
  Divider,
} from "@mui/material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import superClient from "@super/api/super_client";
import { buildColors } from "@shared/palette";
import { appName } from "@shared/branding";
import { BrandSquare } from "@shared/ui/BrandMark";
import { useRegisteredShortcuts } from "@shared/common/shortcutKit";
import KbdHint from "@business/pos/common/KbdHint";

const animations = `
  @keyframes orb1 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    25% { transform: translate(60px, -80px) scale(1.1); }
    50% { transform: translate(-20px, -40px) scale(0.95); }
    75% { transform: translate(-50px, 50px) scale(1.05); }
  }
  @keyframes orb2 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33% { transform: translate(-70px, 60px) scale(0.92); }
    66% { transform: translate(50px, -70px) scale(1.12); }
  }
  @keyframes orb3 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(40px, -50px) scale(1.06); }
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(30px) scale(0.96); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes shimmer {
    0% { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-8px); }
  }
  @keyframes pulseRing {
    0% { transform: scale(1); opacity: 0.4; }
    50% { transform: scale(1.15); opacity: 0.15; }
    100% { transform: scale(1); opacity: 0.4; }
  }
  @keyframes dotPulse {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 1; }
  }
`;

/* ═══════════════════════════════════════════
   تابع کمکی: تبدیل هر نوع خطا به متن ساده
   ═══════════════════════════════════════════ */
function extractError(data, t) {
  if (!data) return t("ui_c.super.login.unknown_error");
  let msg =
    data.error ||
    data.detail ||
    data.message ||
    data.msg ||
    t("ui_c.super.login.bad_credentials");

  if (typeof msg !== "string") {
    try {
      msg = Object.values(msg)
        .flat()
        .map((v) => {
          if (typeof v === "string") return v;
          return v?.string || v?.message || String(v);
        })
        .join(" - ");
    } catch {
      msg = t("ui_c.super.login.bad_credentials");
    }
  }
  return String(msg);
}

export default function SuperLogin() {
  const { mode } = useThemeMode();
  const { isRtl, toggleLang, lang } = useLang();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const isDark = mode === "dark";

  const [mounted, setMounted] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focusedField, setFocusedField] = useState(null);

  useEffect(() => {
    const tk = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(tk);
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem("super_token");
    if (token) navigate("/super/app", { replace: true });
  }, [navigate]);

  const C = useMemo(() => buildColors(isDark), [isDark]);

  const inputSx = (field) => ({
    "& .MuiOutlinedInput-root": {
      borderRadius: "14px",
      fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
      bgcolor: C.inputBg,
      fontSize: "14px",
      transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
      "& fieldset": {
        borderColor: focusedField === field ? C.olive : C.glassBorder,
        borderWidth: focusedField === field ? 1.5 : 1,
        transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
      },
      "&:hover fieldset": {
        borderColor: isDark ? "color-mix(in srgb, var(--success) 30%, transparent)" : "color-mix(in srgb, var(--info) 30%, transparent)",
      },
      "&.Mui-focused fieldset": { borderColor: C.olive, borderWidth: 1.5 },
      "&.Mui-focused": {
        bgcolor: isDark ? "color-mix(in srgb, var(--ink) 70%, transparent)" : "var(--surface)",
        boxShadow: C.inputFocusGlow,
      },
    },
    "& .MuiInputLabel-root": {
      fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
      fontSize: "13px",
      fontWeight: 600,
      color: C.sub,
      "&.Mui-focused": { color: C.olive },
    },
    "& .MuiInputBase-input": {
      fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
      fontSize: "14px",
    },
  });

  /* ═══════════════════════════════════════════
     لاگین — نسخه اصلاح شده
     ═══════════════════════════════════════════ */
  const handleLogin = async (e) => {
    // ★ جلوگیری از refresh شدن صفحه
    e.preventDefault();
    e.stopPropagation();

    if (!username.trim() || !password.trim()) {
      setError(t("ui_c.super.login.enter_credentials"));
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data } = await superClient.post("/api/super/login/", {
        username: username.trim(),
        password: password.trim(),
      });

      if (data && data.ok && data.token) {
        sessionStorage.setItem("super_token", data.token);
        if (data.user) {
          sessionStorage.setItem("super_user", JSON.stringify(data.user));
        }
        navigate("/super/app", { replace: true });
      } else {
        // ★ تبدیل خطا به متن ساده
        setError(extractError(data, t));
      }
    } catch (err) {
      // ★ تبدیل خطا به متن ساده — هیچوقت آبجکت رندر نمیشه
      const errMsg = extractError(err?.response?.data, t);
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  // Enter submits natively (the fields live in a <form>); Ctrl+D submits too.
  useRegisteredShortcuts([
    {
      combo: "Ctrl+D", label: t("ui_l.super.login_submit"),
      handler: () => { if (!loading) handleLogin({ preventDefault() {}, stopPropagation() {} }); },
    },
  ]);

  return (
    <>
      <style>{animations}</style>

      <Box
        sx={{
          minHeight: "100vh",
          bgcolor: C.bg,
          position: "relative",
          overflow: "hidden",
          fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
          direction: isRtl ? "rtl" : "ltr",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── Background ── */}
        <Box
          sx={{
            position: "fixed",
            inset: 0,
            zIndex: 0,
            background: C.bgWarm,
            pointerEvents: "none",
          }}
        />
        <Box
          sx={{
            position: "fixed",
            inset: 0,
            zIndex: 0,
            backgroundImage: `radial-gradient(circle, ${isDark ? "color-mix(in srgb, var(--success) 6%, transparent)" : "color-mix(in srgb, var(--success) 6%, transparent)"} 1px, transparent 1px)`,
            backgroundSize: "36px 36px",
            pointerEvents: "none",
          }}
        />
        <Box
          sx={{
            position: "fixed",
            inset: 0,
            zIndex: 1,
            opacity: 0.025,
            mixBlendMode: "overlay",
            pointerEvents: "none",
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundRepeat: "repeat",
            backgroundSize: "256px 256px",
          }}
        />

        {/* Orbs */}
        {[
          {
            size: { xs: 400, md: 600 },
            pos: { top: "5%", left: "10%" },
            bg: C.orb1,
            anim: "orb1 24s ease-in-out infinite",
          },
          {
            size: { xs: 350, md: 500 },
            pos: { bottom: "10%", right: "5%" },
            bg: C.orb2,
            anim: "orb2 28s ease-in-out infinite",
          },
          {
            size: { xs: 250, md: 400 },
            pos: { top: "40%", left: "50%" },
            bg: C.orb3,
            anim: "orb3 32s ease-in-out infinite",
          },
        ].map((orb, i) => (
          <Box
            key={i}
            sx={{
              position: "fixed",
              width: orb.size,
              height: orb.size,
              ...orb.pos,
              borderRadius: "50%",
              background: orb.bg,
              animation: orb.anim,
              pointerEvents: "none",
              zIndex: 0,
            }}
          />
        ))}

        {/* ═══════════════════════════════════════
            HEADER
        ════════════════════════════════════════ */}
        <Box
          sx={{
            position: "sticky",
            top: 0,
            zIndex: 50,
            bgcolor: C.headerBg,
            borderBottom: `1px solid ${C.headerBorder}`,
            px: { xs: 2, md: 3 },
            py: 1.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(-20px)",
            transition: "all 0.5s cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <BrandSquare />
            <Box>
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: 15,
                  color: C.text,
                  fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                  letterSpacing: "-0.01em",
                }}
              >
                {appName(i18n.language)}
              </Typography>
              <Typography
                sx={{
                  fontSize: 9,
                  color: C.muted,
                  fontWeight: 600,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                }}
              >
                SaaS Management
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            {["fa", "en"].map((lng) => (
              <Button
                key={lng}
                onClick={() => {
                  if (lang !== lng) toggleLang();
                }}
                sx={{
                  minWidth: "auto",
                  px: 1.5,
                  py: 0.5,
                  borderRadius: "10px",
                  fontSize: 11,
                  fontWeight: lang === lng ? 700 : 500,
                  textTransform: "none",
                  color: lang === lng ? C.olive : C.sub,
                  bgcolor: lang === lng ? C.oliveSubtle : "transparent",
                  border:
                    lang === lng
                      ? `1px solid ${C.olive}33`
                      : `1px solid transparent`,
                  fontFamily:
                    lng === "fa"
                      ? "'Vazirmatn', sans-serif"
                      : "'Plus Jakarta Sans', sans-serif",
                  "&:hover": { bgcolor: C.oliveSubtle },
                  transition: "all 0.2s ease",
                }}
              >
                {lng === "fa" ? "فارسی" : "English"}
              </Button>
            ))}
          </Box>
        </Box>

        {/* ═══════════════════════════════════════
            MAIN CONTENT
        ════════════════════════════════════════ */}
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            zIndex: 2,
            px: 2,
            py: 4,
          }}
        >
          <Box
            sx={{
              width: "100%",
              maxWidth: 460,
              opacity: mounted ? 1 : 0,
              transform: mounted
                ? "translateY(0) scale(1)"
                : "translateY(40px) scale(0.94)",
              transition: "all 0.8s cubic-bezier(0.16,1,0.3,1) 0.15s",
            }}
          >
            <Box
              sx={{
                bgcolor: C.glass,
                border: `1px solid ${C.glassBorder}`,
                borderRadius: "28px",
                boxShadow: C.cardShadow,
                position: "relative",
                overflow: "hidden",
                "&::after": {
                  content: '""',
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: C.glassShimmer,
                  backgroundSize: "200% 100%",
                  animation: "shimmer 10s linear infinite",
                  pointerEvents: "none",
                  borderRadius: "28px",
                },
              }}
            >
              <Box
                sx={{ p: { xs: 3, md: 4 }, position: "relative", zIndex: 1 }}
              >
                {/* ── Icon + Title ── */}
                <Box sx={{ textAlign: "center", mb: 3.5 }}>
                  <Box
                    sx={{
                      position: "relative",
                      display: "inline-block",
                      mb: 2,
                    }}
                  >
                    <Box
                      sx={{
                        position: "absolute",
                        inset: -12,
                        borderRadius: "24px",
                        border: `2px solid ${C.olive}`,
                        animation: "pulseRing 3s ease-in-out infinite",
                        pointerEvents: "none",
                      }}
                    />
                    <Box
                      sx={{
                        width: 72,
                        height: 72,
                        borderRadius: "22px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 36,
                        background: C.iconBg,
                        border: `1px solid ${C.glassBorder}`,
                        animation: "float 5s ease-in-out infinite",
                        position: "relative",
                      }}
                    >
                      🔐
                    </Box>
                  </Box>

                  <Typography
                    sx={{
                      fontSize: 26,
                      fontWeight: 800,
                      color: C.text,
                      letterSpacing: "-0.02em",
                      mb: 0.5,
                      fontFamily:
                        "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                    }}
                  >
                    {t("superLogin.title")}
                  </Typography>

                  <Typography
                    sx={{
                      fontSize: 13,
                      color: C.sub,
                      lineHeight: 1.7,
                      fontFamily:
                        "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                    }}
                  >
                    {t("superLogin.subtitle")}
                  </Typography>

                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 0.8,
                      mt: 1.5,
                    }}
                  >
                    <Box
                      sx={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        bgcolor: C.olive,
                        animation: "dotPulse 2s ease-in-out infinite",
                      }}
                    />
                    <Typography
                      sx={{
                        fontSize: 10,
                        color: C.muted,
                        fontWeight: 600,
                        fontFamily:
                          "'Plus Jakarta Sans', 'Vazirmatn', sans-serif",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {t("superLogin.secure_connection")}
                    </Typography>
                  </Box>
                </Box>

                <Divider sx={{ borderColor: C.glassBorder, mb: 3 }} />

                {/* ── Error ── */}
                {error && (
                  <Alert
                    severity="error"
                    onClose={() => setError("")}
                    sx={{
                      mb: 2.5,
                      borderRadius: "14px",
                      fontSize: 13,
                      fontWeight: 600,
                      bgcolor: C.dangerBg,
                      color: C.danger,
                      border: `1px solid ${C.danger}`,
                      fontFamily:
                        "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                      "& .MuiAlert-icon": { color: C.danger },
                    }}
                  >
                    {String(error)}
                  </Alert>
                )}

                {/* ── Form ── */}
                <Box
                  component="form"
                  onSubmit={handleLogin}
                  noValidate
                  sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}
                >
                  <TextField
                    label={t("superLogin.username")}
                    placeholder={t("superLogin.username_placeholder")}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onFocus={() => setFocusedField("username")}
                    onBlur={() => setFocusedField(null)}
                    fullWidth
                    autoFocus
                    autoComplete="username"
                    sx={inputSx("username")}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <Typography
                              sx={{
                                fontSize: 18,
                                lineHeight: 1,
                                opacity: focusedField === "username" ? 1 : 0.4,
                                transition: "opacity 0.3s ease",
                              }}
                            >
                              👤
                            </Typography>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />

                  <TextField
                    label={t("superLogin.password")}
                    placeholder={t("superLogin.password_placeholder")}
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocusedField("password")}
                    onBlur={() => setFocusedField(null)}
                    fullWidth
                    autoComplete="current-password"
                    sx={inputSx("password")}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <Typography
                              sx={{
                                fontSize: 18,
                                lineHeight: 1,
                                opacity: focusedField === "password" ? 1 : 0.4,
                                transition: "opacity 0.3s ease",
                              }}
                            >
                              🔒
                            </Typography>
                          </InputAdornment>
                        ),
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={() => setShowPass(!showPass)}
                              sx={{ color: C.sub, p: 0.5 }}
                            >
                              <Typography sx={{ fontSize: 16, lineHeight: 1 }}>
                                {showPass ? "🙈" : "👁️"}
                              </Typography>
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />

                  <Button
                    type="submit"
                    disabled={loading}
                    fullWidth
                    sx={{
                      background: C.btnGrad,
                      color: "var(--on-primary)",
                      fontSize: 14,
                      fontWeight: 700,
                      textTransform: "none",
                      borderRadius: "14px",
                      py: 1.5,
                      mt: 1,
                      boxShadow: C.btnShadow,
                      whiteSpace: "nowrap",
                      fontFamily:
                        "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                      position: "relative",
                      overflow: "hidden",
                      "&::before": {
                        content: '""',
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 1,
                        background:
                          "linear-gradient(90deg, transparent, var(--surface-sunken), transparent)",
                      },
                      "&::after": {
                        content: '""',
                        position: "absolute",
                        top: 0,
                        left: "-100%",
                        width: "60%",
                        height: "100%",
                        background:
                          "linear-gradient(90deg, transparent, var(--surface-sunken), transparent)",
                        transition: "left 0.5s ease",
                      },
                      "&:hover": {
                        background: C.btnHover,
                        transform: "translateY(-2px)",
                        boxShadow: C.btnShadowHover,
                        "&::after": { left: "120%" },
                      },
                      "&:active": { transform: "scale(0.985)" },
                      "&.Mui-disabled": { opacity: 0.6, color: "var(--on-primary)" },
                      transition: "all 0.3s cubic-bezier(0.16,1,0.3,1)",
                    }}
                  >
                    {loading ? (
                      <CircularProgress size={22} sx={{ color: "var(--on-primary)" }} />
                    ) : (
                      <>
                        {t("superLogin.submit")}
                        <KbdHint sx={{ mx: 1 }}>Ctrl+D</KbdHint>
                      </>
                    )}
                  </Button>
                </Box>

                {/* ── Footer ── */}
                <Box
                  sx={{
                    textAlign: "center",
                    mt: 3,
                    pt: 2,
                    borderTop: `1px solid ${C.glassBorder}`,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 10,
                      color: C.muted,
                      fontFamily:
                        "'Plus Jakarta Sans', 'Vazirmatn', sans-serif",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    Servo SaaS · Admin Panel v1.0
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </>
  );
}
