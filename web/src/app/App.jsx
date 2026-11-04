import { Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@shared/contexts/ThemeContext";
import { LangProvider } from "@shared/contexts/LangContext";
import Login from "@business/auth/Login";
import SuperLogin from "@super/auth/SuperLogin";
import SuperAdmin from "@super/layout/SuperAdminLayout";
import SuperProtectedRoute from "@super/auth/SuperProtectedRoute";
import ProtectedRoute from "@business/auth/ProtectedRoute";
import BusinessLayout from "@business/layout/BusinessLayout";
import Dashboard from "@business/dashboard/dashboard";
import Pos from "@business/pos/Pos";
import Dictionary from "@business/dictionary/Dictionary";
import InventoryPage from "@business/inventory/InventoryPage";
import ProductionPage from "@business/production/ProductionPage";
import AccountingPage from "@business/accounting/AccountingPage";
import QrMenu from "../features/public/QrMenu";
import StorefrontPage from "../features/public/storefront/StorefrontPage";
import StorefrontEditor from "@business/storefront/StorefrontEditor";

function App() {
  return (
    <ThemeProvider>
      <LangProvider>
        <Routes>
          <Route path="/" element={<StorefrontPage byHost />} />
          <Route path="/s/:slug" element={<StorefrontPage />} />
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
                <BusinessLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="pos" element={<Pos />} />
            <Route path="dictionary" element={<Dictionary />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="production" element={<ProductionPage />} />
            <Route path="accounting" element={<AccountingPage />} />
            <Route path="storefront" element={<StorefrontEditor />} />
          </Route>

          {/* بدون slug */}
          <Route
            path="/dashboard/app"
            element={
              <ProtectedRoute>
                <BusinessLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="pos" element={<Pos />} />
            <Route path="dictionary" element={<Dictionary />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="production" element={<ProductionPage />} />
            <Route path="accounting" element={<AccountingPage />} />
            <Route path="storefront" element={<StorefrontEditor />} />
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

          <Route path="/m/:slug" element={<QrMenu />} />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </LangProvider>
    </ThemeProvider>
  );
}

export default App;