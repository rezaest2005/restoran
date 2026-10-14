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
  // ★★★ تغییر به sessionStorage
  const refreshToken = sessionStorage.getItem("refresh_token");
  if (!refreshToken) return Promise.resolve(false);

  return fetch("/api/auth/refresh/", {
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
        // ★★★ تغییر به sessionStorage
        sessionStorage.setItem("access_token", data.access);
        if (data.refresh) sessionStorage.setItem("refresh_token", data.refresh);
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
    // ★★★ تغییر به sessionStorage
    const token = sessionStorage.getItem("access_token");

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
    // ★★★ تغییر به sessionStorage
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("refresh_token");
    return <Navigate to="/dashboard/login" state={{ from: location }} replace />;
  }

  return children;
}