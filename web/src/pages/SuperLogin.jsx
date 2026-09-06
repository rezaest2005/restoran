import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Box, Typography, TextField, Button, IconButton, Alert,
  InputAdornment, CircularProgress, Divider,
} from "@mui/material";
import { useThemeMode } from "../contexts/ThemeContext";
import { useLang } from "../contexts/LangContext";
import superClient from "../api/super_client";

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

export default function SuperLogin() {
  const { mode } = useThemeMode();
  const { isRtl, toggleLang, lang } = useLang();
  const { t } = useTranslation();
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
    const token = localStorage.getItem("super_token");
    if (token) navigate("/super/app", { replace: true });
  }, [navigate]);

  const C = useMemo(() => ({
    bg: isDark ? "#0B0A0B" : "#E4E8F0",
    bgWarm: isDark
      ? "radial-gradient(ellipse at 20% 10%, rgba(61,90,62,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 90%, rgba(120,30,58,0.06) 0%, transparent 50%), radial-gradient(ellipse at 50% 50%, rgba(196,162,101,0.04) 0%, transparent 60%)"
      : "radial-gradient(ellipse at 10% 5%, rgba(80,100,160,0.12) 0%, transparent 45%), radial-gradient(ellipse at 90% 90%, rgba(120,40,70,0.08) 0%, transparent 40%), radial-gradient(ellipse at 50% 40%, rgba(61,90,62,0.07) 0%, transparent 50%)",
    glass: isDark ? "rgba(16,18,16,0.6)" : "rgba(240,244,252,0.7)",
    glassBorder: isDark ? "rgba(107,155,110,0.1)" : "rgba(80,100,140,0.15)",
    glassShimmer: isDark
      ? "linear-gradient(90deg, transparent 0%, rgba(107,155,110,0.05) 20%, rgba(168,64,96,0.06) 40%, rgba(212,183,106,0.07) 60%, rgba(107,155,110,0.04) 80%, transparent 100%)"
      : "linear-gradient(90deg, transparent 0%, rgba(80,100,160,0.06) 20%, rgba(120,40,70,0.05) 40%, rgba(196,162,101,0.06) 60%, rgba(61,90,62,0.04) 80%, transparent 100%)",
    olive: isDark ? "#6B9B6E" : "#2E4D30",
    oliveLight: isDark ? "#8BB88E" : "#3D5A3E",
    oliveSubtle: isDark ? "rgba(107,155,110,0.08)" : "rgba(46,77,48,0.08)",
    burgundy: isDark ? "#A84060" : "#7A2845",
    gold: isDark ? "#D4B76A" : "#A08040",
    text: isDark ? "#F0ECE8" : "#1A1A24",
    sub: isDark ? "#8A8588" : "#555568",
    muted: isDark ? "#4A4548" : "#8A8A9E",
    inputBg: isDark ? "rgba(11,10,11,0.5)" : "rgba(240,244,252,0.85)",
    inputFocusGlow: isDark
      ? "0 0 0 3px rgba(107,155,110,0.12), 0 0 24px rgba(107,155,110,0.06)"
      : "0 0 0 3px rgba(46,77,48,0.1), 0 0 24px rgba(74,106,148,0.08)",
    btnGrad: isDark
      ? "linear-gradient(135deg, #3D6B40 0%, #5A8A5D 35%, #6B9B6E 70%, #4A7A4D 100%)"
      : "linear-gradient(135deg, #1E3A20 0%, #2E4D30 35%, #3D5A3E 70%, #2E4D30 100%)",
    btnHover: isDark
      ? "linear-gradient(135deg, #4A7A4D 0%, #6B9B6E 35%, #7BAB7E 70%, #5A8A5D 100%)"
      : "linear-gradient(135deg, #2E4D30 0%, #3D5A3E 35%, #4A6B4B 70%, #3D5A3E 100%)",
    btnShadow: isDark
      ? "0 4px 28px rgba(107,155,110,0.25), 0 1px 4px rgba(0,0,0,0.3)"
      : "0 4px 28px rgba(46,77,48,0.3), 0 2px 6px rgba(0,0,0,0.1)",
    btnShadowHover: isDark
      ? "0 8px 40px rgba(107,155,110,0.4), 0 2px 8px rgba(0,0,0,0.3)"
      : "0 8px 40px rgba(46,77,48,0.4), 0 2px 8px rgba(0,0,0,0.12)",
    cardShadow: isDark
      ? "0 8px 60px rgba(0,0,0,0.5), 0 0 80px rgba(107,155,110,0.04), 0 0 120px rgba(168,64,96,0.03)"
      : "0 8px 60px rgba(0,0,0,0.1), 0 0 60px rgba(74,106,148,0.08), 0 0 100px rgba(46,77,48,0.04)",
    danger: isDark ? "#E84057" : "#C83048",
    dangerBg: isDark ? "rgba(232,64,87,0.12)" : "rgba(200,48,72,0.1)",
    headerBg: isDark ? "rgba(16,18,16,0.85)" : "rgba(228,232,240,0.9)",
    headerBorder: isDark ? "rgba(107,155,110,0.08)" : "rgba(80,100,140,0.1)",
    orb1: isDark ? "rgba(107,155,110,0.09)" : "rgba(74,106,148,0.12)",
    orb2: isDark ? "rgba(168,64,96,0.07)" : "rgba(122,40,69,0.1)",
    orb3: isDark ? "rgba(212,183,106,0.06)" : "rgba(160,128,64,0.09)",
    iconBg: isDark
      ? "linear-gradient(135deg, rgba(107,155,110,0.08), rgba(168,64,96,0.06))"
      : "linear-gradient(135deg, rgba(74,106,148,0.1), rgba(46,77,48,0.06))",
  }), [isDark]);

  const inputSx = (field) => ({
    "& .MuiOutlinedInput-root": {
      borderRadius: "14px",
      fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
      bgcolor: C.inputBg,
      backdropFilter: "blur(8px)",
      fontSize: "14px",
      transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
      "& fieldset": {
        borderColor: focusedField === field ? C.olive : C.glassBorder,
        borderWidth: focusedField === field ? 1.5 : 1,
        transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
      },
      "&:hover fieldset": { borderColor: isDark ? "rgba(107,155,110,0.3)" : "rgba(74,106,148,0.3)" },
      "&.Mui-focused fieldset": { borderColor: C.olive, borderWidth: 1.5 },
      "&.Mui-focused": {
        bgcolor: isDark ? "rgba(11,10,11,0.7)" : "rgba(240,244,252,0.95)",
        boxShadow: C.inputFocusGlow,
      },
    },
    "& .MuiInputLabel-root": {
      fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
      fontSize: "13px", fontWeight: 600, color: C.sub,
      "&.Mui-focused": { color: C.olive },
    },
    "& .MuiInputBase-input": {
      fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
      fontSize: "14px",
    },
  });

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError(t("superLogin.error_empty"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data } = await superClient.post("/api/super/login/", { username, password });
      console.log("LOGIN RESPONSE:", data);
      if (data.ok && data.token) {
        localStorage.setItem("super_token", data.token);
        if (data.user) localStorage.setItem("super_user", JSON.stringify(data.user));
        navigate("/super/app", { replace: true });
      } else {
        setError(data.error || data.detail || t("superLogin.error_invalid"));
      }
    } catch (err) {
      console.log("LOGIN ERROR:", err.response?.data || err.message);
      if (err.response?.data?.error || err.response?.data?.detail) {
        setError(err.response.data.error || err.response.data.detail);
      } else {
        setError(t("superLogin.error_server"));
      }
    } finally {
      setLoading(false);
    }
  };


  return (
    <>
      <style>{animations}</style>

      <Box sx={{
        minHeight: "100vh", bgcolor: C.bg, position: "relative", overflow: "hidden",
        fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
        direction: isRtl ? "rtl" : "ltr",
        display: "flex", flexDirection: "column",
      }}>

        {/* ── Background ── */}
        <Box sx={{ position: "fixed", inset: 0, zIndex: 0, background: C.bgWarm, pointerEvents: "none" }} />
        <Box sx={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: `radial-gradient(circle, ${isDark ? "rgba(107,155,110,0.06)" : "rgba(46,77,48,0.06)"} 1px, transparent 1px)`, backgroundSize: "36px 36px", pointerEvents: "none" }} />
        <Box sx={{ position: "fixed", inset: 0, zIndex: 1, opacity: 0.025, mixBlendMode: "overlay", pointerEvents: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`, backgroundRepeat: "repeat", backgroundSize: "256px 256px" }} />

        {/* Orbs */}
        {[
          { size: { xs: 400, md: 600 }, pos: { top: "5%", left: "10%" }, bg: C.orb1, anim: "orb1 24s ease-in-out infinite" },
          { size: { xs: 350, md: 500 }, pos: { bottom: "10%", right: "5%" }, bg: C.orb2, anim: "orb2 28s ease-in-out infinite" },
          { size: { xs: 250, md: 400 }, pos: { top: "40%", left: "50%" }, bg: C.orb3, anim: "orb3 32s ease-in-out infinite" },
        ].map((orb, i) => (
          <Box key={i} sx={{ position: "fixed", width: orb.size, height: orb.size, ...orb.pos, borderRadius: "50%", background: orb.bg, filter: "blur(80px)", animation: orb.anim, pointerEvents: "none", zIndex: 0 }} />
        ))}

        {/* ═══════════════════════════════════════
            HEADER
        ════════════════════════════════════════ */}
        <Box sx={{
          position: "sticky", top: 0, zIndex: 50,
          bgcolor: C.headerBg, backdropFilter: "blur(16px)",
          borderBottom: `1px solid ${C.headerBorder}`,
          px: { xs: 2, md: 3 }, py: 1.5,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0)" : "translateY(-20px)",
          transition: "all 0.5s cubic-bezier(0.16,1,0.3,1)",
        }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box sx={{
              width: 38, height: 38, borderRadius: "12px",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
              background: C.iconBg, border: `1px solid ${C.glassBorder}`,
            }}>🛡️</Box>
            <Box>
              <Typography sx={{
                fontWeight: 800, fontSize: 15, color: C.text,
                fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                letterSpacing: "-0.01em",
              }}>{t("superLogin.header_title")}</Typography>
              <Typography sx={{
                fontSize: 9, color: C.muted, fontWeight: 600,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                letterSpacing: "0.15em", textTransform: "uppercase",
              }}>SaaS Management</Typography>
            </Box>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            {["fa", "en"].map((lng) => (
              <Button key={lng} onClick={() => { if (lang !== lng) toggleLang(); }} sx={{
                minWidth: "auto", px: 1.5, py: 0.5, borderRadius: "10px",
                fontSize: 11, fontWeight: lang === lng ? 700 : 500,
                textTransform: "none",
                color: lang === lng ? C.olive : C.sub,
                bgcolor: lang === lng ? C.oliveSubtle : "transparent",
                border: lang === lng ? `1px solid ${C.olive}33` : `1px solid transparent`,
                fontFamily: lng === "fa" ? "'Vazirmatn', sans-serif" : "'Plus Jakarta Sans', sans-serif",
                "&:hover": { bgcolor: C.oliveSubtle },
                transition: "all 0.2s ease",
              }}>
                {lng === "fa" ? "فارسی" : "English"}
              </Button>
            ))}
          </Box>
        </Box>

        {/* ═══════════════════════════════════════
            MAIN CONTENT
        ════════════════════════════════════════ */}
        <Box sx={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative", zIndex: 2, px: 2, py: 4,
        }}>
          <Box sx={{
            width: "100%", maxWidth: 460,
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0) scale(1)" : "translateY(40px) scale(0.94)",
            transition: "all 0.8s cubic-bezier(0.16,1,0.3,1) 0.15s",
          }}>
            <Box sx={{
              bgcolor: C.glass, backdropFilter: "blur(28px)",
              border: `1px solid ${C.glassBorder}`, borderRadius: "28px",
              boxShadow: C.cardShadow, position: "relative", overflow: "hidden",
              "&::after": {
                content: '""', position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                background: C.glassShimmer, backgroundSize: "200% 100%",
                animation: "shimmer 10s linear infinite", pointerEvents: "none", borderRadius: "28px",
              },
            }}>
              <Box sx={{ p: { xs: 3, md: 4 }, position: "relative", zIndex: 1 }}>

                {/* ── Icon + Title ── */}
                <Box sx={{ textAlign: "center", mb: 3.5 }}>
                  <Box sx={{ position: "relative", display: "inline-block", mb: 2 }}>
                    <Box sx={{
                      position: "absolute", inset: -12, borderRadius: "24px",
                      border: `2px solid ${C.olive}`,
                      animation: "pulseRing 3s ease-in-out infinite",
                      pointerEvents: "none",
                    }} />
                    <Box sx={{
                      width: 72, height: 72, borderRadius: "22px",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36,
                      background: C.iconBg,
                      border: `1px solid ${C.glassBorder}`,
                      animation: "float 5s ease-in-out infinite",
                      position: "relative",
                    }}>🔐</Box>
                  </Box>

                  <Typography sx={{
                    fontSize: 26, fontWeight: 800, color: C.text,
                    letterSpacing: "-0.02em", mb: 0.5,
                    fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                  }}>{t("superLogin.title")}</Typography>

                  <Typography sx={{
                    fontSize: 13, color: C.sub, lineHeight: 1.7,
                    fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                  }}>{t("superLogin.subtitle")}</Typography>

                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.8, mt: 1.5 }}>
                    <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: C.olive, animation: "dotPulse 2s ease-in-out infinite" }} />
                    <Typography sx={{ fontSize: 10, color: C.muted, fontWeight: 600, fontFamily: "'Plus Jakarta Sans', 'Vazirmatn', sans-serif", letterSpacing: "0.05em" }}>
                      {t("superLogin.secure_connection")}
                    </Typography>
                  </Box>
                </Box>

                <Divider sx={{ borderColor: C.glassBorder, mb: 3 }} />

                {/* ── Error ── */}
                {error && (
                  <Alert severity="error" sx={{
                    mb: 2.5, borderRadius: "14px", fontSize: 13, fontWeight: 600,
                    bgcolor: C.dangerBg, color: C.danger, border: `1px solid ${C.danger}`,
                    fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                    "& .MuiAlert-icon": { color: C.danger },
                  }}>{error}</Alert>
                )}

                {/* ── Form ── */}
                <Box component="form" onSubmit={handleLogin} sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
                  <TextField
                    label={t("superLogin.username")}
                    placeholder={t("superLogin.username_placeholder")}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onFocus={() => setFocusedField("username")}
                    onBlur={() => setFocusedField(null)}
                    fullWidth
                    autoFocus
                    sx={inputSx("username")}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <Typography sx={{
                              fontSize: 18, lineHeight: 1,
                              opacity: focusedField === "username" ? 1 : 0.4,
                              transition: "opacity 0.3s ease",
                            }}>👤</Typography>
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
                    sx={inputSx("password")}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <Typography sx={{
                              fontSize: 18, lineHeight: 1,
                              opacity: focusedField === "password" ? 1 : 0.4,
                              transition: "opacity 0.3s ease",
                            }}>🔒</Typography>
                          </InputAdornment>
                        ),
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton onClick={() => setShowPass(!showPass)} sx={{ color: C.sub, p: 0.5 }}>
                              <Typography sx={{ fontSize: 16, lineHeight: 1 }}>{showPass ? "🙈" : "👁️"}</Typography>
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />

                  <Button type="submit" disabled={loading} fullWidth sx={{
                    background: C.btnGrad, color: "#fff",
                    fontSize: 14, fontWeight: 700, textTransform: "none", borderRadius: "14px",
                    py: 1.5, mt: 1, boxShadow: C.btnShadow, whiteSpace: "nowrap",
                    fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
                    position: "relative", overflow: "hidden",
                    "&::before": {
                      content: '""', position: "absolute", top: 0, left: 0, right: 0, height: 1,
                      background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)",
                    },
                    "&::after": {
                      content: '""', position: "absolute", top: 0, left: "-100%", width: "60%", height: "100%",
                      background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)",
                      transition: "left 0.5s ease",
                    },
                    "&:hover": {
                      background: C.btnHover, transform: "translateY(-2px)", boxShadow: C.btnShadowHover,
                      "&::after": { left: "120%" },
                    },
                    "&:active": { transform: "scale(0.985)" },
                    "&.Mui-disabled": { opacity: 0.6, color: "#fff" },
                    transition: "all 0.3s cubic-bezier(0.16,1,0.3,1)",
                  }}>
                    {loading ? <CircularProgress size={22} sx={{ color: "#fff" }} /> : t("superLogin.submit")}
                  </Button>
                </Box>

                {/* ── Footer ── */}
                <Box sx={{ textAlign: "center", mt: 3, pt: 2, borderTop: `1px solid ${C.glassBorder}` }}>
                  <Typography sx={{
                    fontSize: 10, color: C.muted,
                    fontFamily: "'Plus Jakarta Sans', 'Vazirmatn', sans-serif",
                    letterSpacing: "0.1em", textTransform: "uppercase",
                  }}>
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