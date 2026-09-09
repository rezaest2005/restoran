import { Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LangProvider } from "./contexts/LangContext";
import Login from "./pages/Login";
import SuperLogin from "./pages/SuperLogin";
import SuperAdmin from "./pages/super_admin";
import SuperProtectedRoute from "./components/SuperProtectedRoute";
import ProtectedRoute from "./components/ProtectedRoute";
import RestaurantLayout from "./pages/RestaurantLayout";
import Dashboard from "./pages/Dashboard";

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

          {/* ★ با slug — child routes */}
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

          {/* ★ بدون slug — child routes */}
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