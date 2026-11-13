import { Routes, Route, Navigate, useParams } from "react-router-dom";
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
import DispatchPage from "@business/delivery/DispatchPage";
import DriverPage from "@business/delivery/DriverPage";
import TrackingPage from "@business/delivery/TrackingPage";
import QrMenu from "../features/public/QrMenu";
import FeedbackPublicPage from "../features/public/feedback/FeedbackPublicPage";
import StorefrontPage from "../features/public/storefront/StorefrontPage";

function SlugEntry() {
  const { slug } = useParams();
  return <Navigate to={`/${slug}/dashboard/login`} replace />;
}

function App() {
  return (
    <ThemeProvider>
      <LangProvider>
        <Routes>
          <Route path="/" element={<StorefrontPage byHost />} />
          <Route path="/s/:slug" element={<StorefrontPage />} />
          <Route path="/f/:slug" element={<FeedbackPublicPage />} />
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
            <Route path="users" element={<Navigate to="../dictionary?tab=users" replace />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="production" element={<ProductionPage />} />
            <Route path="accounting" element={<Navigate to="../dashboard?tab=accounting" replace />} />
            <Route path="delivery" element={<DispatchPage />} />
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
            <Route path="users" element={<Navigate to="../dictionary?tab=users" replace />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="production" element={<ProductionPage />} />
            <Route path="accounting" element={<Navigate to="../dashboard?tab=accounting" replace />} />
            <Route path="delivery" element={<DispatchPage />} />
          </Route>

          {/* super admin panel: https://domain/admin/login (the old /super/... addresses still work) */}
          <Route path="/admin/login" element={<SuperLogin />} />
          <Route
            path="/admin"
            element={
              <SuperProtectedRoute>
                <Navigate to="/admin/app" replace />
              </SuperProtectedRoute>
            }
          />
          <Route
            path="/admin/app"
            element={
              <SuperProtectedRoute>
                <SuperAdmin />
              </SuperProtectedRoute>
            }
          />
          <Route path="/super/login" element={<Navigate to="/admin/login" replace />} />
          <Route path="/super" element={<Navigate to="/admin" replace />} />
          <Route path="/super/app" element={<Navigate to="/admin/app" replace />} />

          <Route path="/m/:slug" element={<QrMenu />} />
          <Route path="/t/:token" element={<TrackingPage />} />
          <Route path="/driver" element={<ProtectedRoute><DriverPage /></ProtectedRoute>} />
          <Route path="/:slug/driver" element={<ProtectedRoute><DriverPage /></ProtectedRoute>} />
          {/* each courier has a numbered address: /<slug>/driver/1, /<slug>/driver/2 ... */}
          <Route path="/:slug/driver/:number" element={<ProtectedRoute><DriverPage /></ProtectedRoute>} />
          {/* https://domain/<slug> opens that business's sign-in */}
          <Route path="/:slug" element={<SlugEntry />} />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </LangProvider>
    </ThemeProvider>
  );
}

export default App;