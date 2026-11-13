import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Box, TextField, Button, Alert, CircularProgress } from "@mui/material";
import superClient from "@super/api/super_client";
import { useRegisteredShortcuts } from "@shared/common/shortcutKit";
import AuthShell, { PasswordField } from "@shared/ui/AuthShell";

/** Turns any kind of error payload into plain text (an object must never be rendered). */
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

/** Super admin sign-in. The layout lives in AuthShell; this file only holds the login flow. */
export default function SuperLogin() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = sessionStorage.getItem("super_token");
    if (token) navigate("/bizsuite_admin/app", { replace: true });
  }, [navigate]);

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
        navigate("/bizsuite_admin/app", { replace: true });
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

  // Enter submits natively (the fields live in a <form>); Ctrl+D submits too.
  useRegisteredShortcuts([
    {
      combo: "Ctrl+D", label: t("ui_l.super.login_submit"),
      handler: () => { if (!loading) handleLogin({ preventDefault() {}, stopPropagation() {} }); },
    },
  ]);

  return (
    <AuthShell title={t("superLogin.title")} subtitle={t("superLogin.subtitle")} footer={t("superLogin.secure_connection")}>
      <Box component="form" onSubmit={handleLogin} noValidate sx={{ display: "grid", gap: 2 }}>
        {error && <Alert severity="error" role="alert">{error}</Alert>}

        <TextField
          fullWidth autoFocus label={t("superLogin.username")}
          value={username} onChange={(e) => setUsername(e.target.value)} disabled={loading}
          autoComplete="username" slotProps={{ htmlInput: { dir: "ltr", style: { textAlign: "start" } } }}
        />
        <PasswordField
          label={t("superLogin.password")}
          value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading}
        />

        <Button type="submit" variant="contained" size="large" fullWidth disabled={loading} sx={{ mt: 0.5 }}>
          {loading ? <CircularProgress size={22} color="inherit" /> : t("superLogin.submit")}
        </Button>
      </Box>
    </AuthShell>
  );
}
