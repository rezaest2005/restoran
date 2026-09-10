import { Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@shared/contexts/ThemeContext";
import { LangProvider } from "@shared/contexts/LangContext";
import Login from "@restaurant/auth/Login";
import SuperLogin from "@super/auth/SuperLogin";
import SuperAdmin from "@super/layout/SuperAdminLayout";
import SuperProtectedRoute from "@super/auth/SuperProtectedRoute";
import ProtectedRoute from "@restaurant/auth/ProtectedRoute";
import RestaurantLayout from "@restaurant/layout/RestaurantLayout";
import Dashboard from "@restaurant/dashboard";

function App() {
  return (
    <ThemeProvider>
      <LangProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/:slug/dashboard/login" element={<Login />} />
          <Route path="/dashboard/login" element={<Login />} />

          <Route
            path="/dashboard"
            element={
              localStorage.getItem("access_token") ? (
                <Navigate to="/dashboard/app" replace />
              ) : (
                <Navigate to="/dashboard/login" replace />
              )
            }
          />

          {/* ★ با slug */}
          <Route
            path="/:slug/dashboard/app"
            element={
              <ProtectedRoute>
                <RestaurantLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="kitchen" element={<div>آشپزخانه</div>} />
            <Route path="pos" element={<div>صندوق فروش</div>} />
            <Route path="orders" element={<div>سفارشات</div>} />
            <Route path="recipes" element={<div>دستور پخت</div>} />
            <Route path="raw-materials" element={<div>مواد اولیه</div>} />
            <Route path="ready-materials" element={<div>مواد آماده</div>} />
            <Route path="invoices" element={<div>فاکتورها</div>} />
            <Route path="usage-log" element={<div>مصرف</div>} />
            <Route path="dictionary" element={<div>دیکشنری</div>} />
            <Route path="users" element={<div>کاربران</div>} />
          </Route>

          {/* ★ بدون slug */}
          <Route
            path="/dashboard/app"
            element={
              <ProtectedRoute>
                <RestaurantLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="kitchen" element={<div>آشپزخانه</div>} />
            <Route path="pos" element={<div>صندوق فروش</div>} />
            <Route path="orders" element={<div>سفارشات</div>} />
            <Route path="recipes" element={<div>دستور پخت</div>} />
            <Route path="raw-materials" element={<div>مواد اولیه</div>} />
            <Route path="ready-materials" element={<div>مواد آماده</div>} />
            <Route path="invoices" element={<div>فاکتورها</div>} />
            <Route path="usage-log" element={<div>مصرف</div>} />
            <Route path="dictionary" element={<div>دیکشنری</div>} />
            <Route path="users" element={<div>کاربران</div>} />
          </Route>

          <Route path="/super/login" element={<SuperLogin />} />
          <Route
            path="/super"
            element={
              localStorage.getItem("super_token") ? (
                <Navigate to="/super/app" replace />
              ) : (
                <Navigate to="/super/login" replace />
              )
            }
          />
          <Route
            path="/super/app"
            element={
              <SuperProtectedRoute>
                <SuperAdmin />
              </SuperProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </LangProvider>
    </ThemeProvider>
  );
}

export default App;