import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Box,
  TextField,
  Button,
  Typography,
  IconButton,
  InputAdornment,
  Alert,
  CircularProgress,
} from "@mui/material";
import {
  Visibility,
  VisibilityOff,
  Person,
  Lock,
  Language,
  DarkMode,
  LightMode,
} from "@mui/icons-material";
import { useThemeMode } from "@shared/contexts/ThemeContext";
import { useLang } from "@shared/contexts/LangContext";
import { authApi } from "@business/api/auth";
import useShortcuts from "@shared/common/useShortcuts";
import KbdHint from "@business/pos/common/KbdHint";
import { buildColors } from "@shared/palette";
import { appName } from "@shared/branding";

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
  @keyframes float {
    0%, 100% { transform: translateY(0px) rotate(0deg); }
    50% { transform: translateY(-10px) rotate(1deg); }
  }
  @keyframes shimmer {
    0% { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
  @keyframes pulseRing {
    0% { opacity: 0.5; transform: scale(1); }
    50% { opacity: 0; transform: scale(1.4); }
    100% { opacity: 0; transform: scale(1.4); }
  }
  @keyframes breathe {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 0.6; }
  }
`;

export default function Login() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { slug } = useParams(); // ★ استخراج slug از آدرس (مثل test6)
  const { mode, toggleTheme } = useThemeMode();
  const { toggleLang, isRtl } = useLang();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [mounted, setMounted] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const u = searchParams.get("username");
    if (u) setUsername(u);
  }, [searchParams]);

  // Enter داخل فرم ارسال می‌کند؛ Ctrl+D هم از هر فیلدی ورود را اجرا می‌کند
  useShortcuts([
    { combo: "Ctrl+D", label: t("ui_g.auth.submit"), handler: () => { if (!loading) handleSubmit({ preventDefault() {} }); } },
  ]);

      const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError(t("login.errorEmpty"));
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const id = { username: username.trim() };
      const { data } = await authApi.login({ ...id, password });

      // ★ ذخیره توکن‌ها
      sessionStorage.setItem("access_token", data.access);
      sessionStorage.setItem("refresh_token", data.refresh);

      // ★ ذخیره user — اگه tabs نبود از API بگیر
      const userData = { ...data.user };
      if (!userData.tabs) {
        try {
          const tabsRes = await fetch("/api/users/tabs/", {
            headers: {
              "Authorization": `Bearer ${data.access}`,
              "Content-Type": "application/json",
            },
          });
          if (tabsRes.ok) {
            const tabsData = await tabsRes.json();
            userData.tabs = tabsData.tabs || {};
          }
        } catch (e) {
          console.warn("Failed to fetch user tabs:", e);
        }
      }
      sessionStorage.setItem("user", JSON.stringify(userData));

      sessionStorage.setItem("demo_logins_remaining", data.user.demo_logins_remaining || 0);
      sessionStorage.setItem("session_alive", "1");

      await authApi.setSession({
        access_token: data.access,
        user_id: data.user.id,
      });
      setSuccess(t("login.success"));

      // ★ مسیر بر اساس نقش
      const base = slug ? `/${slug}/dashboard/app` : "/dashboard/app";
      const routes = {
        owner: base,
        manager: base,
        cashier: `${base}/pos`,
        kitchen: base,
        warehouse: base,
        waiter: `${base}/pos`,
        customer: base,
        driver: slug ? `/${slug}/driver` : "/driver",
      };
      setTimeout(() => {
        if (data.user.is_superuser) navigate("/super/app");
        else navigate(routes[data.user.role] || base);
      }, 500);
    } catch (err) {
      if (err.response?.status === 400 || err.response?.status === 401) {
        setError(
          t("ui_a.login.invalid_credentials"),
        );
      } else {
        setError(t("login.errorServer"));
      }
    } finally {
      setLoading(false);
    }
  };

  const isDark = mode === "dark";

  const C = buildColors(isDark);

  const inputSx = (field) => ({
    "& .MuiOutlinedInput-root": {
      borderRadius: "12px",
      fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
      bgcolor: C.inputBg,
      backdropFilter: "blur(8px)",
      transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
      "& fieldset": {
        borderColor: focusedField === field ? C.olive : C.glassBorder,
        borderWidth: focusedField === field ? 1.5 : 1,
        transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
      },
      "&:hover fieldset": {
        borderColor: isDark ? "rgba(107,155,110,0.3)" : "rgba(74,106,148,0.3)",
      },
      "&.Mui-focused fieldset": {
        borderColor: C.olive,
        borderWidth: 1.5,
      },
      "&.Mui-focused": {
        bgcolor: isDark ? "rgba(11,10,11,0.7)" : "rgba(240,244,252,0.95)",
        boxShadow: C.inputFocusGlow,
      },
    },
    "& .MuiInputLabel-root": {
      fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
      fontSize: 13.5,
      "&.Mui-focused": { color: C.olive },
    },
    "& .MuiInputBase-input": {
      fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
      fontSize: 14,
      py: 1.6,
    },
  });

  const orbs = [
    {
      w: { xs: 450, md: 650 },
      pos: { top: "-20%", left: "-15%" },
      bg: isDark ? "rgba(107,155,110,0.09)" : "rgba(74,106,148,0.12)",
      anim: "orb1 22s ease-in-out infinite",
    },
    {
      w: { xs: 380, md: 560 },
      pos: { bottom: "-18%", right: "-12%" },
      bg: isDark ? "rgba(168,64,96,0.07)" : "rgba(122,40,69,0.1)",
      anim: "orb2 28s ease-in-out infinite",
    },
    {
      w: { xs: 220, md: 400 },
      pos: { top: "20%", right: "8%" },
      bg: isDark ? "rgba(212,183,106,0.06)" : "rgba(160,128,64,0.09)",
      anim: "orb3 18s ease-in-out infinite",
    },
    {
      w: { xs: 200, md: 350 },
      pos: { bottom: "12%", left: "5%" },
      bg: isDark ? "rgba(107,155,110,0.06)" : "rgba(46,77,48,0.08)",
      anim: "orb1 26s ease-in-out infinite reverse",
    },
    {
      w: { xs: 160, md: 300 },
      pos: { top: "50%", left: "40%" },
      bg: isDark ? "rgba(168,64,96,0.05)" : "rgba(74,106,148,0.07)",
      anim: "orb2 32s ease-in-out infinite",
    },
  ];

  return (
    <>
      <style>{animations}</style>

      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          bgcolor: C.bg,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* ═══ هدر ═══ */}
        <Box
          sx={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            bgcolor: C.headerBg,
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderBottom: `1px solid ${C.headerBorder}`,
            boxShadow: C.headerShadow,
            px: { xs: 2, md: 4 },
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(-100%)",
            transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.05s",
          }}
        >
          <Box
            sx={{
              maxWidth: 1200,
              mx: "auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              height: 56,
            }}
          >
            {/* لوگو */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  background: C.iconBg,
                  border: `1px solid ${C.iconBorder}`,
                }}
              >
                🍷
              </Box>
              <Box>
                <Typography
                  sx={{
                    fontWeight: 800,
                    fontSize: 16,
                    color: C.text,
                    fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                    letterSpacing: "-0.02em",
                    lineHeight: 1.2,
                  }}
                >
                  {appName(i18n.language)}
                </Typography>
                <Typography
                  sx={{
                    display: { xs: "none", sm: "block" },
                    fontSize: 9,
                    color: C.muted,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                  }}
                >
                  Management System
                </Typography>
              </Box>
            </Box>

            {/* دکمه‌ها */}
            <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 0.4,
                }}
              >
                <IconButton
                  onClick={toggleTheme}
                  size="small"
                  sx={{
                    width: 34,
                    height: 34,
                    border: `1px solid ${C.glassBorder}`,
                    color: C.olive,
                    bgcolor: C.oliveSubtle,
                    borderRadius: "10px",
                    "&:hover": {
                      bgcolor: isDark
                        ? "rgba(107,155,110,0.15)"
                        : "rgba(46,77,48,0.12)",
                    },
                    transition: "all 0.2s ease",
                  }}
                >
                  {mode === "dark" ? (
                    <LightMode fontSize="small" />
                  ) : (
                    <DarkMode fontSize="small" />
                  )}
                </IconButton>
                <Typography
                  sx={{
                    display: { xs: "none", sm: "block" },
                    fontSize: 9,
                    color: C.muted,
                    fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                    lineHeight: 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  {mode === "dark" ? t("login.lightMode") : t("login.darkMode")}
                </Typography>
              </Box>

              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 0.4,
                }}
              >
                <IconButton
                  onClick={toggleLang}
                  size="small"
                  sx={{
                    width: 34,
                    height: 34,
                    border: `1px solid ${C.glassBorder}`,
                    color: C.olive,
                    bgcolor: C.oliveSubtle,
                    borderRadius: "10px",
                    "&:hover": {
                      bgcolor: isDark
                        ? "rgba(107,155,110,0.15)"
                        : "rgba(46,77,48,0.12)",
                    },
                    transition: "all 0.2s ease",
                  }}
                >
                  <Language fontSize="small" />
                </IconButton>
                <Typography
                  sx={{
                    display: { xs: "none", sm: "block" },
                    fontSize: 9,
                    color: C.muted,
                    fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                    lineHeight: 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  {t("ui_a.login.switch_lang")}
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* ═══ بدنه ═══ */}
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            p: 2,
            maxWidth: 1200,
            mx: "auto",
            width: "100%",
          }}
        >
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              background: C.bgWarm,
              pointerEvents: "none",
            }}
          />

          <Box
            sx={{
              position: "absolute",
              inset: 0,
              backgroundImage: `radial-gradient(circle, ${C.bgGrid} 1px, transparent 1px)`,
              backgroundSize: "36px 36px",
              pointerEvents: "none",
            }}
          />

          <Box
            sx={{
              position: "absolute",
              inset: 0,
              opacity: C.noise,
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
              backgroundRepeat: "repeat",
              backgroundSize: "128px 128px",
              pointerEvents: "none",
              mixBlendMode: "overlay",
            }}
          />

          {orbs.map((orb, i) => (
            <Box
              key={i}
              sx={{
                position: "absolute",
                width: orb.w,
                height: orb.w,
                borderRadius: "50%",
                ...orb.pos,
                background: `radial-gradient(circle, ${orb.bg} 0%, transparent 55%)`,
                animation: orb.anim,
                pointerEvents: "none",
                willChange: "transform",
              }}
            />
          ))}

          {[{ left: { xs: 16, md: 48 } }, { right: { xs: 16, md: 48 } }].map(
            (pos, i) => (
              <Box
                key={i}
                sx={{
                  position: "absolute",
                  top: "8%",
                  ...pos,
                  width: 1,
                  height: "84%",
                  background: `linear-gradient(to bottom, transparent 0%, ${C.divider} 30%, ${C.divider} 70%, transparent 100%)`,
                  display: { xs: "none", lg: "block" },
                  pointerEvents: "none",
                }}
              />
            ),
          )}

          {/* ═══ کارت شیشه‌ای ═══ */}
          <Box
            sx={{
              width: "100%",
              maxWidth: 440,
              position: "relative",
              zIndex: 5,
              opacity: mounted ? 1 : 0,
              transform: mounted
                ? "translateY(0) scale(1)"
                : "translateY(50px) scale(0.96)",
              transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1) 0.25s",
            }}
          >
            <Box
              sx={{
                position: "absolute",
                top: "5%",
                left: "-15%",
                right: "-15%",
                bottom: "-15%",
                borderRadius: "36px",
                background: isDark
                  ? `radial-gradient(ellipse at 30% 30%, rgba(107,155,110,0.06) 0%, transparent 50%),
                   radial-gradient(ellipse at 70% 70%, rgba(168,64,96,0.05) 0%, transparent 50%)`
                  : `radial-gradient(ellipse at 30% 30%, rgba(74,106,148,0.08) 0%, transparent 50%),
                   radial-gradient(ellipse at 70% 70%, rgba(122,40,69,0.06) 0%, transparent 50%)`,
                filter: "blur(50px)",
                pointerEvents: "none",
                animation: "breathe 6s ease-in-out infinite",
              }}
            />

            <Box
              sx={{
                background: C.glass,
                backdropFilter: "blur(28px)",
                WebkitBackdropFilter: "blur(28px)",
                border: `1px solid ${C.glassBorder}`,
                borderRadius: "24px",
                p: { xs: 3.5, sm: 4.5, md: 5 },
                position: "relative",
                overflow: "hidden",
                boxShadow: C.cardShadow,
                direction: isRtl ? "rtl" : "ltr",
              }}
            >
              <Box
                sx={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 1,
                  background: C.glassShimmer,
                  backgroundSize: "200% 100%",
                  animation: "shimmer 10s linear infinite",
                  borderRadius: "24px 24px 0 0",
                  pointerEvents: "none",
                }}
              />

              <Box
                sx={{
                  width: 68,
                  height: 68,
                  borderRadius: "22px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 32,
                  mx: "auto",
                  mb: 3,
                  background: C.iconBg,
                  border: `1px solid ${C.iconBorder}`,
                  boxShadow: C.iconGlow,
                  animation: "float 5s ease-in-out infinite",
                  position: "relative",
                }}
              >
                🔐
                {[0, 1].map((i) => (
                  <Box
                    key={i}
                    sx={{
                      position: "absolute",
                      inset: -8 - i * 6,
                      borderRadius: `${28 + i * 6}px`,
                      border: `1px solid ${isDark ? "rgba(107,155,110,0.08)" : "rgba(74,106,148,0.08)"}`,
                      animation: `pulseRing 3s ease-in-out ${i * 0.5}s infinite`,
                      pointerEvents: "none",
                    }}
                  />
                ))}
              </Box>

              <Typography
                variant="h5"
                sx={{
                  fontWeight: 800,
                  textAlign: "center",
                  mb: 0.8,
                  color: C.text,
                  fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                  letterSpacing: "-0.01em",
                }}
              >
                {t("login.welcomeTitle")}
              </Typography>

              <Typography
                sx={{
                  textAlign: "center",
                  fontSize: 13.5,
                  color: C.sub,
                  mb: 4,
                  fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                  lineHeight: 1.8,
                  maxWidth: 300,
                  mx: "auto",
                }}
              >
                {t("login.welcomeSub")}
              </Typography>

              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 1,
                  mb: 4,
                }}
              >
                <Box
                  sx={{
                    width: 28,
                    height: 2,
                    borderRadius: 1,
                    bgcolor: C.olive,
                    opacity: 0.5,
                  }}
                />
                <Box
                  sx={{
                    width: 8,
                    height: 2,
                    borderRadius: 1,
                    bgcolor: C.gold,
                    opacity: 0.5,
                  }}
                />
                <Box
                  sx={{
                    width: 28,
                    height: 2,
                    borderRadius: 1,
                    bgcolor: C.burgundy,
                    opacity: 0.5,
                  }}
                />
              </Box>

              {error && (
                <Alert
                  severity="error"
                  sx={{
                    mb: 2.5,
                    borderRadius: "12px",
                    fontSize: 13,
                    fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                    bgcolor: isDark
                      ? "rgba(198,40,40,0.08)"
                      : "rgba(198,40,40,0.06)",
                    border: `1px solid ${isDark ? "rgba(198,40,40,0.15)" : "rgba(198,40,40,0.12)"}`,
                    "& .MuiAlert-icon": { fontSize: 20 },
                  }}
                >
                  {error}
                </Alert>
              )}
              {success && (
                <Alert
                  severity="success"
                  sx={{
                    mb: 2.5,
                    borderRadius: "12px",
                    fontSize: 13,
                    fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                    bgcolor: isDark
                      ? "rgba(46,125,50,0.08)"
                      : "rgba(46,125,50,0.06)",
                    border: `1px solid ${isDark ? "rgba(46,125,50,0.15)" : "rgba(46,125,50,0.12)"}`,
                    "& .MuiAlert-icon": { fontSize: 20 },
                  }}
                >
                  {success}
                </Alert>
              )}

              <Box component="form" onSubmit={handleSubmit}>
                <Box sx={{ mb: 2 }}>
                  <Typography
                    sx={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: focusedField === "user" ? C.olive : C.sub,
                      mb: 0.8,
                      fontFamily:
                        "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                      letterSpacing: "0.02em",
                      transition: "color 0.3s ease",
                    }}
                  >
                    {t("login.username")}
                  </Typography>
                  <TextField
                    fullWidth
                    placeholder={t("login.usernamePlaceholder")}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onFocus={() => setFocusedField("user")}
                    onBlur={() => setFocusedField(null)}
                    sx={inputSx("user")}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <Person
                              sx={{
                                opacity: focusedField === "user" ? 0.7 : 0.25,
                                fontSize: 19,
                                color: C.olive,
                                transition: "opacity 0.3s ease",
                              }}
                            />
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                </Box>

                <Box sx={{ mb: 3.5 }}>
                  <Typography
                    sx={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: focusedField === "pass" ? C.olive : C.sub,
                      mb: 0.8,
                      fontFamily:
                        "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                      letterSpacing: "0.02em",
                      transition: "color 0.3s ease",
                    }}
                  >
                    {t("login.password")}
                  </Typography>
                  <TextField
                    fullWidth
                    type={showPass ? "text" : "password"}
                    placeholder={t("login.passwordPlaceholder")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocusedField("pass")}
                    onBlur={() => setFocusedField(null)}
                    sx={inputSx("pass")}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <Lock
                              sx={{
                                opacity: focusedField === "pass" ? 0.7 : 0.25,
                                fontSize: 19,
                                color: C.olive,
                                transition: "opacity 0.3s ease",
                              }}
                            />
                          </InputAdornment>
                        ),
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={() => setShowPass(!showPass)}
                              edge="end"
                              size="small"
                              sx={{
                                color: C.sub,
                                "&:hover": { color: C.olive },
                                transition: "color 0.2s",
                              }}
                            >
                              {showPass ? (
                                <VisibilityOff fontSize="small" />
                              ) : (
                                <Visibility fontSize="small" />
                              )}
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                </Box>

                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  disabled={loading}
                  sx={{
                    py: 1.8,
                    fontSize: 15,
                    fontWeight: 800,
                    borderRadius: "14px",
                    fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                    textTransform: "none",
                    background: C.btnGrad,
                    boxShadow: C.btnShadow,
                    position: "relative",
                    overflow: "hidden",
                    "&::before": {
                      content: '""',
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background:
                        "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 50%)",
                      borderRadius: "14px",
                      pointerEvents: "none",
                    },
                    "&::after": {
                      content: '""',
                      position: "absolute",
                      top: 0,
                      left: "-100%",
                      width: "100%",
                      height: "100%",
                      background:
                        "linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)",
                      transition: "left 0.6s ease",
                    },
                    "&:hover": {
                      transform: "translateY(-2px)",
                      boxShadow: C.btnShadowHover,
                      background: C.btnHover,
                      "&::after": { left: "100%" },
                    },
                    "&:active": {
                      transform: "translateY(0) scale(0.985)",
                    },
                    transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
                  }}
                >
                  {loading ? (
                    <CircularProgress
                      size={22}
                      sx={{ color: "rgba(255,255,255,0.85)" }}
                    />
                  ) : (
                    <>
                      {t("login.submit")}
                      <KbdHint>Ctrl+D</KbdHint>
                    </>
                  )}
                </Button>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* ═══ شعار پایین ═══ */}
        <Box
          sx={{
            textAlign: "center",
            py: 2.5,
            opacity: mounted ? 1 : 0,
            transition: "opacity 1s ease 1.4s",
          }}
        >
          <Typography
            sx={{
              fontSize: 11,
              color: isDark ? "rgba(240,236,232,0.1)" : "rgba(26,26,36,0.14)",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            {t("login.tagline")}
          </Typography>
        </Box>
      </Box>
    </>
  );
}
