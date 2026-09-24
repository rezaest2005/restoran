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
import Pos from "@restaurant/pos/Pos";
import Dictionary from "@restaurant/dictionary/Dictionary";

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
            element={<Navigate to="/dashboard/login" replace />}
          />

          {/* با slug */}
          <Route
            path="/:slug/dashboard/app"
            element={
              <ProtectedRoute>
                <RestaurantLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="pos" element={<Pos />} />
            <Route path="dictionary" element={<Dictionary />} />
          </Route>

          {/* بدون slug */}
          <Route
            path="/dashboard/app"
            element={
              <ProtectedRoute>
                <RestaurantLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="pos" element={<Pos />} />
            <Route path="dictionary" element={<Dictionary />} />
          </Route>

          <Route path="/super/login" element={<SuperLogin />} />
          <Route
            path="/super"
            element={
              <SuperProtectedRoute>
                <Navigate to="/super/app" replace />
              </SuperProtectedRoute>
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