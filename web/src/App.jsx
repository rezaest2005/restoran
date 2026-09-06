import { Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LangProvider } from "./contexts/LangContext";
import Login from "./pages/Login";
import SuperLogin from "./pages/SuperLogin";
import SuperAdmin from "./pages/super_admin";
import SuperProtectedRoute from "./components/SuperProtectedRoute";
import ProtectedRoute from "./components/ProtectedRoute";
import RestaurantLayout from "./pages/RestaurantLayout";

function App() {
  return (
    <ThemeProvider>
      <LangProvider>
        <Routes>
          {/* مسیرهای اصلی و لاگین رستوران */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Login />} />

          {/* ✅ مسیر لاگین با slug داینامیک (مثل /test6/dashboard/login) */}
          <Route path="/:slug/dashboard/login" element={<Login />} />
          
          {/* مسیر پیش‌فرض لاگین (بدون slug) */}
          <Route path="/dashboard/login" element={<Login />} />

          {/* ✅ بررسی توکن داشبورد رستوران (بدون slug) */}
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

          {/* ✅ مسیر داشبورد رستوران با slug داینامیک (مثل /test6/dashboard/app) */}
          <Route 
            path="/:slug/dashboard/app/*" 
            element={
              <ProtectedRoute>
                <RestaurantLayout />
              </ProtectedRoute>
            } 
          />

          {/* مسیر پیش‌فرض داشبورد (بدون slug) */}
          <Route 
            path="/dashboard/app/*" 
            element={
              <ProtectedRoute>
                <RestaurantLayout />
              </ProtectedRoute>
            } 
          />

          {/* مسیرهای سوپرادمین */}
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
          
          {/* مسیر 404 (هر آدرس اشتباهی زده شد، به داشبورد برمی‌گرده) */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </LangProvider>
    </ThemeProvider>
  );
}

export default App;