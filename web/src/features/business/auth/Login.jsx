import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Box, TextField, Button, Alert, CircularProgress } from "@mui/material";
import { authApi } from "@business/api/auth";
import useShortcuts from "@shared/common/useShortcuts";
import { purgeSyncedDatabases } from "@shared/sync";
import AuthShell, { PasswordField } from "@shared/ui/AuthShell";

/** Business sign-in. The layout lives in AuthShell; this file only holds the login flow. */
export default function Login() {
  const { t, i18n } = useTranslation();
  const te = (k) => i18n.exists(k);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { slug } = useParams(); // tenant slug from the address (e.g. /cafe/bizsuite_dashboard/login)

  // a signed-out browser keeps no local business data (copies that still hold unsent orders are kept for their owner)
  useEffect(() => { purgeSyncedDatabases().catch(() => {}); }, []);

  // While the person types, fetch the dashboard shell in the background so it is already here after sign-in
  useEffect(() => {
    const warm = () => { import("@business/layout/BusinessLayout").catch(() => {}); import("@business/dashboard/dashboard").catch(() => {}); };
    const id = window.requestIdleCallback ? window.requestIdleCallback(warm, { timeout: 3000 }) : setTimeout(warm, 1500);
    return () => (window.cancelIdleCallback ? window.cancelIdleCallback(id) : clearTimeout(id));
  }, []);

  const [username, setUsername] = useState(() => searchParams.get("username") || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
    try {
      const id = { username: username.trim() };
      if (slug) id.slug = slug; // lets the server apply that business's username prefix
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

      // the login response already opened the server session (cookie): no second round trip is needed
      // ★ مسیر بر اساس نقش
      const bslug = data.user.business_slug || slug || "";
      const base = bslug ? `/${bslug}/bizsuite_dashboard/app` : "/bizsuite_dashboard/app";
      const routes = {
        owner: base,
        manager: base,
        cashier: `${base}/pos`,
        kitchen: base,
        warehouse: base,
        waiter: `${base}/pos`,
        customer: base,
        driver: bslug ? `/${bslug}/bizsuite_driver` : "/bizsuite_driver",
        transport: bslug ? `/${bslug}/bizsuite_driver` : "/bizsuite_driver",
      };
      if (data.user.is_superuser) navigate("/bizsuite_admin/app");
      else if (!bslug) { // nowhere to go: say so instead of bouncing back to this page
        sessionStorage.clear();
        setError(t("ui_a.login.errors.no_slug"));
      } else navigate(routes[data.user.role] || base);
    } catch (err) {
      const code = err.response?.data?.code;
      if (code && code !== "invalid_credentials" && te(`ui_a.login.errors.${code}`)) {
        setError(t(`ui_a.login.errors.${code}`));
      } else if (err.response?.status === 400 || err.response?.status === 401) {
        setError(t("ui_a.login.invalid_credentials"));
      } else if (err.response?.status === 429) {
        setError(t("ui_a.login.errors.rate_limited"));
      } else {
        setError(t("login.errorServer"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <Box component="form" onSubmit={handleSubmit} noValidate sx={{ display: "grid", gap: 2 }}>
        {error && <Alert severity="error" role="alert">{error}</Alert>}

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
