import { useState } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Box, TextField, Button, Alert, CircularProgress } from "@mui/material";
import { authApi } from "@business/api/auth";
import useShortcuts from "@shared/common/useShortcuts";
import AuthShell, { PasswordField } from "@shared/ui/AuthShell";

/** Business sign-in. The layout lives in AuthShell; this file only holds the login flow. */
export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { slug } = useParams(); // tenant slug from the address (e.g. /cafe/dashboard/login)

  const [username, setUsername] = useState(() => searchParams.get("username") || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Enter submits the form; Ctrl+D submits from any field
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
      const bslug = data.user.business_slug || slug || "";
      const base = bslug ? `/${bslug}/dashboard/app` : "/dashboard/app";
      const routes = {
        owner: base,
        manager: base,
        cashier: `${base}/pos`,
        kitchen: base,
        warehouse: base,
        waiter: `${base}/pos`,
        customer: base,
        driver: bslug ? `/${bslug}/driver` : "/driver",
      };
      setTimeout(() => {
        if (data.user.is_superuser) navigate("/admin/app");
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

  return (
    <AuthShell title={t("login.welcomeTitle")} subtitle={t("login.welcomeSub")} footer={t("login.tagline")}>
      <Box component="form" onSubmit={handleSubmit} noValidate sx={{ display: "grid", gap: 2 }}>
        {error && <Alert severity="error" role="alert">{error}</Alert>}
        {success && <Alert severity="success">{success}</Alert>}

        <TextField
          fullWidth autoFocus label={t("login.username")}
          value={username} onChange={(e) => setUsername(e.target.value)} disabled={loading}
          autoComplete="username" slotProps={{ htmlInput: { dir: "ltr", style: { textAlign: "start" } } }}
        />
        <PasswordField
          label={t("login.password")}
          value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading}
        />

        <Button type="submit" variant="contained" size="large" fullWidth disabled={loading} sx={{ mt: 0.5 }}>
          {loading ? <CircularProgress size={22} color="inherit" /> : t("login.submit")}
        </Button>
      </Box>
    </AuthShell>
  );
}
