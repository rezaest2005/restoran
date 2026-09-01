
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Box, TextField, Button, Typography, IconButton,
  InputAdornment, Alert, CircularProgress, Divider, Chip,
} from "@mui/material";
import {
  Visibility, VisibilityOff, Person, Lock, Language,
  DarkMode, LightMode,
} from "@mui/icons-material";
import { useThemeMode } from "../contexts/ThemeContext";
import { useLang } from "../contexts/LangContext";
import { authApi } from "../api/auth";

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mode, toggleTheme } = useThemeMode();
  const { toggleLang, isRtl } = useLang();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
      const id = /^09\d{9}$/.test(username.trim())
        ? { phone_number: username.trim() }
        : { username: username.trim() };
      const { data } = await authApi.login({ ...id, password });
      localStorage.setItem("access_token", data.access);
      localStorage.setItem("refresh_token", data.refresh);
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("db_auth", "1");
      await authApi.setSession({
        access_token: data.access,
        user_id: data.user.id,
      });
      setSuccess(t("login.success"));
      const routes = {
        owner: "/dashboard", manager: "/dashboard",
        cashier: "/pos", kitchen: "/kitchen",
        warehouse: "/raw-materials", customer: "/dashboard",
      };
      setTimeout(() => {
        if (data.user.is_superuser) navigate("/super");
        else navigate(routes[data.user.role] || "/dashboard");
      }, 500);
    } catch (err) {
      setError(err.response?.data?.detail || t("login.errorServer"));
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: "📦", text: t("login.feat1") },
    { icon: "🏪", text: t("login.feat2") },
    { icon: "🏆", text: t("login.feat3") },
    { icon: "📈", text: t("login.feat4") },
  ];

  // ★ تشخیص جهت
  const mainDir = isRtl ? "row-reverse" : "row";
  const togglePos = isRtl ? { left: 16 } : { right: 16 };

  return (
    <Box sx={{
      display: "flex",
      minHeight: "100vh",
      flexDirection: { xs: "column", md: mainDir },
    }}>

      {/* ═══ پنل برند ═══ */}
      <Box sx={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", p: 4,
        background: "linear-gradient(135deg, #0f0f23 0%, #1a1a3e 30%, #16213e 60%, #0f3460 100%)",
        position: "relative", overflow: "hidden",
        minHeight: { xs: 300, md: "100vh" },
      }}>
        <Box sx={{
          position: "absolute", top: -200, left: -200, width: 600, height: 600,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,107,53,0.15) 0%, transparent 70%)",
        }} />
        <Box sx={{ position: "relative", zIndex: 1, textAlign: "center" }}>
          <Box sx={{
            width: 100, height: 100, mx: "auto", mb: 4, borderRadius: "30px",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 48, background: "rgba(255,255,255,0.05)",
            border: "2px solid rgba(255,255,255,0.1)",
          }}>🍔</Box>
          <Typography variant="h3" sx={{ color: "#fff", fontWeight: 900, mb: 1.5 }}>
            {t("login.brandTitle")}{" "}
            <Box component="span" sx={{
              background: "linear-gradient(135deg, #ff6b35, #f7931e)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>{t("login.brandHighlight")}</Box>
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>
            {t("login.brandDesc")}
          </Typography>
          <Box sx={{ mt: 6, display: "flex", flexDirection: "column", gap: 2.5 }}>
            {features.map((f, i) => (
              <Box key={i} sx={{
                display: "flex", alignItems: "center", gap: 1.5,
                color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 500,
              }}>
                <Box sx={{
                  width: 40, height: 40, borderRadius: 3, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}>{f.icon}</Box>
                {f.text}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {/* ═══ پنل فرم ═══ */}
      <Box sx={{
        width: { xs: "100%", md: 520 },
        display: "flex", alignItems: "center", justifyContent: "center",
        bgcolor: "background.default", position: "relative",
      }}>

        {/* ★ دکمه‌های تغییر */}
        <Box sx={{
          position: "absolute", top: 16, ...togglePos,
          display: "flex", gap: 1, zIndex: 10,
        }}>
          <IconButton onClick={toggleTheme} size="small"
            sx={{ border: "1px solid", borderColor: "divider" }}>
            {mode === "dark" ? <LightMode fontSize="small" /> : <DarkMode fontSize="small" />}
          </IconButton>
          <IconButton onClick={toggleLang} size="small"
            sx={{ border: "1px solid", borderColor: "divider" }}>
            <Language fontSize="small" />
          </IconButton>
        </Box>

        <Box sx={{ width: "100%", maxWidth: 420, p: 5 }}>
          <Box sx={{ mb: 4.5 }}>
            <Typography variant="h4" sx={{ fontWeight: 900, mb: 1, color: "text.primary" }}>
              {t("login.title")}
            </Typography>
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
              {t("login.subtitle")}
            </Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 3 }}>{success}</Alert>}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField fullWidth label={t("login.username")}
              placeholder={t("login.usernamePlaceholder")}
              value={username} onChange={(e) => setUsername(e.target.value)}
              sx={{ mb: 2.5 }}
              slotProps={{ input: {
                startAdornment: <InputAdornment position="start"><Person sx={{ opacity: 0.4 }} /></InputAdornment>,
              }}} />

            <TextField fullWidth type={showPass ? "text" : "password"}
              label={t("login.password")}
              placeholder={t("login.passwordPlaceholder")}
              value={password} onChange={(e) => setPassword(e.target.value)}
              sx={{ mb: 3 }}
              slotProps={{ input: {
                startAdornment: <InputAdornment position="start"><Lock sx={{ opacity: 0.4 }} /></InputAdornment>,
                endAdornment: <InputAdornment position="end">
                  <IconButton onClick={() => setShowPass(!showPass)} edge="end" size="small">
                    {showPass ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>,
              }}} />

            <Button type="submit" fullWidth variant="contained" disabled={loading}
              sx={{
                py: 1.8, fontSize: 15, fontWeight: 800, borderRadius: 3.5,
                background: "linear-gradient(135deg, #ff6b35, #f7931e)",
                boxShadow: "0 4px 14px rgba(255,107,53,0.3)",
                "&:hover": {
                  transform: "translateY(-2px)",
                  boxShadow: "0 8px 24px rgba(255,107,53,0.4)",
                  background: "linear-gradient(135deg, #ff6b35, #f7931e)",
                },
              }}>
              {loading ? <CircularProgress size={22} sx={{ color: "#fff" }} /> : t("login.submit")}
            </Button>
          </Box>

          <Divider sx={{ my: 3 }}>
            <Chip label={t("login.or")} size="small" sx={{ fontSize: 11 }} />
          </Divider>

          <Typography sx={{ textAlign: "center", fontSize: 13, color: "text.secondary" }}>
            {t("login.noAccount")}{" "}
            <Box component="a" href="#"
              sx={{ color: "primary.main", fontWeight: 700, textDecoration: "none",
                "&:hover": { textDecoration: "underline" } }}>
              {t("login.register")}
            </Box>
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
