import { Navigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";

function isTokenExpired(token) {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

function tryRefreshToken() {
  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) return Promise.resolve(false);

  return fetch("http://127.0.0.1:8000/api/auth/refresh/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: refreshToken }),
  })
    .then(res => {
      if (!res.ok) return false;
      return res.json();
    })
    .then(data => {
      if (data?.access) {
        localStorage.setItem("access_token", data.access);
        if (data.refresh) localStorage.setItem("refresh_token", data.refresh);
        return true;
      }
      return false;
    })
    .catch(() => false);
}

export default function ProtectedRoute({ children }) {
  const location = useLocation();
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const sessionAlive = sessionStorage.getItem("session_alive");

    // مرورگر بسته شده → sessionStorage پاک شده → اجبار لاگین
    if (!sessionAlive) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      setStatus("no_session");
      return;
    }

    if (!token) {
      setStatus("no_token");
      return;
    }

    if (isTokenExpired(token)) {
      tryRefreshToken().then(success => {
        setStatus(success ? "ok" : "expired");
      });
    } else {
      setStatus("ok");
    }
  }, []);

  if (status === "checking") {
    return (
      <div style={{
        display: "flex", justifyContent: "center", alignItems: "center",
        height: "100vh", fontFamily: "'Vazirmatn', sans-serif", color: "#6b8e23"
      }}>
        <div>...در حال بررسی</div>
      </div>
    );
  }

  if (status !== "ok") {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    return <Navigate to="/dashboard/login" state={{ from: location }} replace />;
  }

  return children;
}
